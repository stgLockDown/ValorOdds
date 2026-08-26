import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne, tx } from '@/lib/db';
import { generateDraftOrder, type Sport } from '@/lib/dd/presets';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/dd/drafts/[id]/auto-pick
// Auto-picks the best available player (by rank) for the current on-clock slot.
// Only works if the on-clock member is a bot (password_hash = 'bot_no_login'),
// OR if the authenticated user is the commissioner (manual auto-pick / override).
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = BigInt(session.user.id);
  const draftId = BigInt(params.id);

  // Fetch draft + league info
  const draft = await queryOne<{
    id: string; league_id: string; draft_type: string; status: string;
    round_count: number; current_round: number; current_pick: number;
    sport: Sport; num_teams: number; commissioner_id: string; season_year: number;
  }>(
    `SELECT d.id::text, d.league_id::text, d.draft_type, d.status, d.round_count,
            d.current_round, d.current_pick,
            l.sport, l.num_teams, l.commissioner_id::text, l.season_year
     FROM dd_drafts d
     JOIN dd_leagues l ON l.id = d.league_id
     WHERE d.id = $1`,
    [draftId]
  );

  if (!draft) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  }

  if (draft.status !== 'in_progress') {
    return NextResponse.json({ error: `Draft is ${draft.status}, cannot make picks` }, { status: 409 });
  }

  const leagueId = BigInt(draft.league_id);
  const numTeams = draft.num_teams;
  const rounds = draft.round_count;

  // Verify the caller is a member of this league (or commissioner)
  const callerMember = await queryOne<{ id: string; is_commissioner: boolean }>(
    `SELECT id::text, is_commissioner FROM dd_league_members
     WHERE league_id = $1 AND user_id = $2`,
    [leagueId, userId]
  );

  if (!callerMember) {
    return NextResponse.json({ error: 'You are not a member of this league' }, { status: 403 });
  }

  const isCommissioner = draft.commissioner_id === String(userId) || callerMember.is_commissioner;

  // Compute whose turn it is
  const fullOrder = generateDraftOrder(draft.draft_type as any, numTeams, rounds);
  const picksMade = await queryOne<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM dd_draft_picks WHERE draft_id = $1`,
    [draftId]
  );
  const currentOverallPick = Number(picksMade?.cnt ?? '0') + 1;
  const currentOrderEntry = fullOrder.find((p) => p.overallPick === currentOverallPick);

  if (!currentOrderEntry) {
    return NextResponse.json({ error: 'Draft is complete' }, { status: 409 });
  }

  const expectedSlot = currentOrderEntry.slot;
  const expectedDraftPosition = expectedSlot + 1;

  // Find the on-clock member
  const onClockMember = await queryOne<{
    id: string; team_name: string; user_id: string; is_bot: boolean;
  }>(
    `SELECT m.id::text, m.team_name, m.user_id::text,
            (u.password_hash = 'bot_no_login') AS is_bot
     FROM dd_league_members m
     JOIN web_users u ON u.id = m.user_id
     WHERE m.league_id = $1 AND m.draft_position = $2`,
    [leagueId, expectedDraftPosition]
  );

  if (!onClockMember) {
    return NextResponse.json({ error: 'Could not find the on-clock member' }, { status: 404 });
  }

  // Only auto-pick if the on-clock member is a bot, or caller is commissioner overriding
  if (!onClockMember.is_bot && !isCommissioner) {
    return NextResponse.json({
      error: 'Auto-pick is only available for bot-controlled teams',
      onClockMember: onClockMember.team_name,
    }, { status: 403 });
  }

  // Find the best available player by rank from the pool (not yet drafted)
  const bestPlayer = await queryOne<{
    id: string; player_name: string; team: string | null; position: string | null;
    rank: number | null;
  }>(
    `SELECT pp.id::text, pp.player_name, pp.team, pp.position, pp.rank
     FROM dd_player_pool pp
     WHERE pp.sport = $1
       AND pp.season_year = $2
       AND pp.id::text NOT IN (
         SELECT player_id FROM dd_draft_picks
         WHERE draft_id = $3 AND player_id IS NOT NULL
       )
       AND pp.player_name NOT IN (
         SELECT player_name FROM dd_draft_picks WHERE draft_id = $3
       )
     ORDER BY pp.rank NULLS LAST, pp.projected_points DESC NULLS LAST
     LIMIT 1`,
    [draft.sport, draft.season_year, draftId]
  );

  if (!bestPlayer) {
    return NextResponse.json({ error: 'No available players to draft' }, { status: 409 });
  }

  const memberIdForPick = BigInt(onClockMember.id);

  // Calculate next pick
  const nextOverall = currentOverallPick + 1;
  const nextOrderEntry = fullOrder.find((p) => p.overallPick === nextOverall);
  const isLastPick = currentOverallPick >= numTeams * rounds;
  const nextRound = nextOrderEntry?.round ?? draft.round_count;
  const nextPickInRound = nextOrderEntry?.pickInRound ?? 1;

  await tx(async (client) => {
    // Insert the auto-pick
    await client.query(
      `INSERT INTO dd_draft_picks
        (draft_id, round_num, pick_in_round, overall_pick, member_id,
         player_name, player_id, team, position, sport, is_auto_picked, picked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, NOW())`,
      [
        draftId,
        currentOrderEntry.round,
        currentOrderEntry.pickInRound,
        currentOverallPick,
        memberIdForPick,
        bestPlayer.player_name,
        bestPlayer.id,
        bestPlayer.team,
        bestPlayer.position,
        draft.sport,
      ]
    );

    // Update draft progress
    if (isLastPick) {
      await client.query(
        `UPDATE dd_drafts SET status = 'completed', current_round = $1, current_pick = $2, completed_at = NOW() WHERE id = $3`,
        [draft.round_count, numTeams, draftId]
      );
      await client.query(
        `UPDATE dd_leagues SET status = 'in_season', updated_at = NOW() WHERE id = $1`,
        [leagueId]
      );
    } else {
      await client.query(
        `UPDATE dd_drafts SET current_round = $1, current_pick = $2 WHERE id = $3`,
        [nextRound, nextPickInRound, draftId]
      );
    }
  });

  return NextResponse.json({
    success: true,
    autoPicked: true,
    pick: {
      overallPick: currentOverallPick,
      round: currentOrderEntry.round,
      pickInRound: currentOrderEntry.pickInRound,
      memberId: String(memberIdForPick),
      playerName: bestPlayer.player_name,
      playerId: bestPlayer.id,
      team: bestPlayer.team,
      position: bestPlayer.position,
      isAutoPicked: true,
    },
    isDraftComplete: isLastPick,
    nextTurn: isLastPick
      ? null
      : {
          overallPick: nextOverall,
          round: nextRound,
          pickInRound: nextPickInRound,
          slot: nextOrderEntry?.slot,
        },
  });
}
