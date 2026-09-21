import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne, tx } from '@/lib/db';
import { loadDraftState, finalizeDraft } from '@/lib/dd/draft-state';
import { checkPositionLimit } from '@/lib/dd/roster-enforcement';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/dd/drafts/[id]/auto-pick
// Auto-picks the best available player for the current on-clock slot.
// Only works if the on-clock member is a bot (password_hash = 'bot_no_login'),
// OR if the authenticated user is the commissioner (manual auto-pick / override).
//
// The pick respects position limits: it walks the pool in rank order and takes
// the first player the on-clock team is actually allowed to draft, so a bot
// never gets stuck when its remaining starter needs are limited.
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

  const state = await loadDraftState(draftId);
  if (!state) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  }
  const { draft, members, progress, onClockMemberId, onClockEntry } = state;

  if (draft.status !== 'in_progress') {
    return NextResponse.json({ error: `Draft is ${draft.status}, cannot make picks` }, { status: 409 });
  }

  const leagueId = BigInt(draft.leagueId);

  if (progress.isComplete || !onClockEntry || !onClockMemberId) {
    await finalizeDraft(draftId, leagueId, draft.roundCount, draft.numTeams);
    return NextResponse.json({ error: 'Draft is complete' }, { status: 409 });
  }

  // Verify the caller is a member of this league (or commissioner)
  const callerMember = await queryOne<{ id: string; is_commissioner: boolean }>(
    `SELECT id::text, is_commissioner FROM dd_league_members
     WHERE league_id = $1 AND user_id = $2`,
    [leagueId, userId]
  );
  if (!callerMember) {
    return NextResponse.json({ error: 'You are not a member of this league' }, { status: 403 });
  }

  const isCommissioner = draft.commissionerId === String(userId) || callerMember.is_commissioner;
  const onClockMember = members.find((m) => m.id === onClockMemberId);

  if (!onClockMember) {
    return NextResponse.json({ error: 'Could not find the on-clock member' }, { status: 404 });
  }

  // Only auto-pick if the on-clock member is a bot, or caller is commissioner overriding
  if (!onClockMember.isBot && !isCommissioner) {
    return NextResponse.json({
      error: 'Auto-pick is only available for bot-controlled teams',
      onClockMember: onClockMember.teamName,
    }, { status: 403 });
  }

  const memberIdForPick = BigInt(onClockMemberId);

  // ── Load roster config + this member's current roster for limit checks ──
  const leagueRow = await queryOne<{ roster_config: any; settings: any }>(
    `SELECT roster_config, settings FROM dd_leagues WHERE id = $1`,
    [leagueId]
  );
  const rc = leagueRow?.roster_config;
  const slots: { slot: string; label: string; count: number; eligible: string[]; isStarter: boolean }[] =
    rc && typeof rc === 'object' && Array.isArray(rc.slots) ? rc.slots : [];
  const enforceLimits = leagueRow?.settings?.enforcePositionLimits !== false;
  const totalRosterSize = slots.reduce((sum, s) => sum + s.count, 0);

  const positionCountsRes = await query<{ position: string; cnt: string }>(
    `SELECT position, COUNT(*)::text AS cnt
     FROM dd_draft_picks
     WHERE draft_id = $1 AND member_id = $2 AND position IS NOT NULL AND sport != 'NCAAF'
     GROUP BY position`,
    [draftId, memberIdForPick]
  );
  const filled: Record<string, number> = {};
  for (const row of positionCountsRes.rows) filled[row.position] = Number(row.cnt);

  const totalDraftedRes = await queryOne<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM dd_draft_picks WHERE draft_id = $1 AND member_id = $2`,
    [draftId, memberIdForPick]
  );
  const totalDrafted = Number(totalDraftedRes?.cnt ?? '0');

  // ── Walk the pool in rank order, taking the first legal player ──
  const candidates = await query<{
    id: string; player_name: string; team: string | null; position: string | null;
  }>(
    `SELECT pp.id::text, pp.player_name, pp.team, pp.position
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
     LIMIT 400`,
    [draft.sport, draft.seasonYear, draftId]
  );

  let bestPlayer: { id: string; player_name: string; team: string | null; position: string | null } | null = null;
  if (enforceLimits && slots.length > 0) {
    for (const c of candidates.rows) {
      if (!c.position) { bestPlayer = c; break; }
      const check = checkPositionLimit(slots, c.position, filled, totalRosterSize, totalDrafted);
      if (check.allowed) { bestPlayer = c; break; }
    }
  } else {
    bestPlayer = candidates.rows[0] ?? null;
  }

  // Fallback: if limits blocked everything, take the best available anyway so
  // the draft can never deadlock on a bot's turn.
  if (!bestPlayer) bestPlayer = candidates.rows[0] ?? null;

  if (!bestPlayer) {
    return NextResponse.json({ error: 'No available players to draft' }, { status: 409 });
  }

  const result = await tx(async (client) => {
    await client.query(
      `INSERT INTO dd_draft_picks
        (draft_id, round_num, pick_in_round, overall_pick, member_id,
         player_name, player_id, team, position, sport, is_auto_picked, picked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, NOW())`,
      [
        draftId,
        onClockEntry.round,
        onClockEntry.pickInRound,
        onClockEntry.overallPick,
        memberIdForPick,
        bestPlayer!.player_name,
        bestPlayer!.id,
        bestPlayer!.team,
        bestPlayer!.position,
        draft.sport,
      ]
    );

    const after = await loadDraftState(draftId);
    const isLastPick = !after || after.progress.isComplete;

    if (isLastPick) {
      await client.query(
        `UPDATE dd_drafts SET status = 'completed', current_round = $1, current_pick = $2, completed_at = NOW() WHERE id = $3`,
        [draft.roundCount, draft.numTeams, draftId]
      );
      await client.query(
        `UPDATE dd_leagues SET status = 'in_season', updated_at = NOW() WHERE id = $1`,
        [leagueId]
      );
    } else {
      const next = after!.onClockEntry!;
      await client.query(
        `UPDATE dd_drafts SET current_round = $1, current_pick = $2 WHERE id = $3`,
        [next.round, next.pickInRound, draftId]
      );
    }

    return { isLastPick, after };
  });

  const nextEntry = result.after?.onClockEntry ?? null;

  return NextResponse.json({
    success: true,
    autoPicked: true,
    pick: {
      overallPick: onClockEntry.overallPick,
      round: onClockEntry.round,
      pickInRound: onClockEntry.pickInRound,
      memberId: String(memberIdForPick),
      playerName: bestPlayer.player_name,
      playerId: bestPlayer.id,
      team: bestPlayer.team,
      position: bestPlayer.position,
      isAutoPicked: true,
    },
    isDraftComplete: result.isLastPick,
    nextTurn: result.isLastPick || !nextEntry
      ? null
      : {
          overallPick: nextEntry.overallPick,
          round: nextEntry.round,
          pickInRound: nextEntry.pickInRound,
          slot: nextEntry.slot,
        },
  });
}
