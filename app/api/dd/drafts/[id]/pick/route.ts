import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne, tx } from '@/lib/db';
import { generateDraftOrder, type Sport } from '@/lib/dd/presets';
import { checkPositionLimit, getPositionSummary } from '@/lib/dd/roster-enforcement';
import { awardXp } from '@/lib/dd/gamification';

// ─── POST /api/dd/drafts/[id]/pick ── Make a draft pick ───────────────────────
// Body: { playerName, playerId?, team?, position?, auctionAmount? }
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
  const body = await req.json();

  const { playerName, playerId, team, position, auctionAmount } = body;
  if (!playerName) {
    return NextResponse.json({ error: 'playerName is required' }, { status: 400 });
  }

  const draft = await queryOne<{
    id: string; league_id: string; draft_type: string; status: string;
    round_count: number; current_round: number; current_pick: number;
    league_name: string; sport: Sport; num_teams: number;
    roster_preset: string; commissioner_id: string;
  }>(
    `SELECT d.id::text, d.league_id::text, d.draft_type, d.status, d.round_count,
            d.current_round, d.current_pick,
            l.name AS league_name, l.sport, l.num_teams, l.roster_config->>'name' AS roster_preset,
            l.commissioner_id::text
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
  // Effective team count for the draft order: the number of members who had
  // joined when the draft started. A league's declared num_teams can be larger
  // than the actual membership (e.g. a 12-team league where the commissioner
  // started the draft once 2 humans joined) — using the declared count would
  // misalign the snake order and block members whose slot never comes up.
  // Draft start uses the ACTUAL member count, so the order math here must too.
  const membersCountRes = await queryOne<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM dd_league_members WHERE league_id = $1`,
    [leagueId]
  );
  const memberCount = Number(membersCountRes?.cnt ?? '0');
  const numTeams = memberCount >= 2 ? memberCount : draft.num_teams;
  const rounds = draft.round_count;

  // Find the member record for this user
  const member = await queryOne<{ id: string; is_commissioner: boolean; draft_position: number }>(
    `SELECT id::text, is_commissioner, draft_position
     FROM dd_league_members
     WHERE league_id = $1 AND user_id = $2`,
    [leagueId, userId]
  );

  if (!member) {
    return NextResponse.json({ error: 'You are not a member of this league' }, { status: 403 });
  }

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

  // Check if it's this user's turn (commissioner can make picks for anyone — auto-draft/override)
  const isCommissioner = draft.commissioner_id === String(userId) || member.is_commissioner;
  const expectedSlot = currentOrderEntry.slot;
  const expectedDraftPosition = expectedSlot + 1;

  if (member.draft_position !== expectedDraftPosition && !isCommissioner) {
    // Get the name of whose turn it actually is
    const onClockMember = await queryOne<{ team_name: string; display_name: string | null }>(
      `SELECT m.team_name, u.display_name
       FROM dd_league_members m
       JOIN web_users u ON u.id = m.user_id
       WHERE m.league_id = $1 AND m.draft_position = $2`,
      [leagueId, expectedDraftPosition]
    );
    return NextResponse.json({
      error: `It's not your turn. On the clock: ${onClockMember?.display_name ?? onClockMember?.team_name ?? 'Another team'}`,
      onClockTeam: onClockMember?.team_name,
    }, { status: 409 });
  }

  // Find the member who should be making this pick (based on slot)
  const onClockMember = await queryOne<{ id: string; team_name: string }>(
    `SELECT id::text, team_name FROM dd_league_members
     WHERE league_id = $1 AND draft_position = $2`,
    [leagueId, expectedDraftPosition]
  );

  const memberIdForPick = BigInt(onClockMember?.id ?? member.id);

  // Check that this player hasn't been drafted already
  const alreadyDrafted = await queryOne<{ id: string }>(
    `SELECT id::text FROM dd_draft_picks
     WHERE draft_id = $1 AND player_name = $2`,
    [draftId, playerName]
  );
  if (alreadyDrafted) {
    return NextResponse.json({ error: `${playerName} has already been drafted` }, { status: 409 });
  }

  // Look up player from pool to get full info.
  // Dynasty leagues draft college (NCAAF) players into taxi slots, so the
  // lookup tries the LEAGUE sport pool first, then the NCAAF pool. The pick
  // row stores the player's ACTUAL pool sport so rosters render correctly
  // and taxi-squad enforcement can identify college players.
  //
  // The lookup ALWAYS runs (even when the client sent team/position) so the
  // player's true pool sport + pool id are resolved — the client values are
  // only fallbacks for names not found in either pool.
  let playerInfo: {
    team: string | null;
    position: string | null;
    player_id: string | null;
    poolSport: Sport | null;
  } = {
    team: team ?? null,
    position: position ?? null,
    player_id: playerId ?? null,
    poolSport: null,
  };

  {
    const poolSports: Sport[] = draft.sport === 'NCAAF'
      ? ['NCAAF', 'NFL']
      : [draft.sport, 'NCAAF'];
    const poolPlayer = await queryOne<{
      team: string | null; position: string | null; id: string; sport: Sport;
    }>(
      `SELECT team, position, id::text, sport FROM dd_player_pool
       WHERE season_year = (SELECT season_year FROM dd_leagues WHERE id = $1)
         AND sport = ANY($2) AND player_name = $3
       ORDER BY CASE WHEN sport = $4 THEN 0 ELSE 1 END
       LIMIT 1`,
      [leagueId, poolSports, playerName, draft.sport]
    );
    if (poolPlayer) {
      playerInfo = {
        // `||` (not `??`): an empty-string client playerId must not mask the
        // resolved pool id — the pool row is the source of truth for linkage.
        team: playerInfo.team || poolPlayer.team,
        position: playerInfo.position || poolPlayer.position,
        player_id: playerInfo.player_id || poolPlayer.id,
        poolSport: poolPlayer.sport,
      };
    }
  }

  const isCollegePick = playerInfo.poolSport === 'NCAAF';

  // Calculate next pick position
  const nextOverall = currentOverallPick + 1;
  const nextOrderEntry = fullOrder.find((p) => p.overallPick === nextOverall);
  const isLastPick = currentOverallPick >= numTeams * rounds;

  const nextRound = nextOrderEntry?.round ?? draft.round_count;
  const nextPickInRound = nextOrderEntry?.pickInRound ?? 1;

  // ── Position limit + taxi-squad enforcement (hard block) ──────────────────
  // If the league has enforcePositionLimits enabled (default true), block
  // picks that exceed the roster position capacity when other starter
  // positions still need filling. This prevents drafting an entire team
  // of QBs when the league limits are e.g. 1 QB.
  //
  // College (NCAAF) players are TAXI-ONLY in dynasty leagues: they may only
  // be drafted while taxi slots remain, and they never count against the
  // league-sport position limits (taxi slots have eligible ['*']).
  let positionWarning: string | null = null;
  let positionLimits: { position: string; filled: number; capacity: number }[] = [];
  if (memberIdForPick) {
    try {
      // Fetch roster config + settings for this league
      const leagueRow = await queryOne<{ roster_config: any; settings: any }>(
        `SELECT roster_config, settings FROM dd_leagues WHERE id = $1`,
        [leagueId]
      );
      const rc = leagueRow?.roster_config;
      const slots: { slot: string; label: string; count: number; eligible: string[]; isStarter: boolean }[] =
        rc && typeof rc === 'object' && Array.isArray(rc.slots) ? rc.slots : [];

      // Determine if enforcement is enabled (default true)
      const settings = leagueRow?.settings;
      const enforceLimits = settings?.enforcePositionLimits !== false; // default true

      // Taxi-squad capacity: prefer the roster config TAXI slot count, fall
      // back to dynastySettings.taxiSquadSize stored at league creation.
      const taxiSlots =
        slots.find((s) => s.slot === 'TAXI')?.count ??
        settings?.dynastySettings?.taxiSquadSize ??
        0;

      // Count college picks this member already owns (taxi occupancy).
      const collegeCountRes = await queryOne<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM dd_draft_picks
         WHERE draft_id = $1 AND member_id = $2 AND sport = 'NCAAF'`,
        [draftId, memberIdForPick]
      );
      const collegePicksOwned = Number(collegeCountRes?.cnt ?? '0');

      if (isCollegePick) {
        // ── College player: taxi-only enforcement ──
        if (taxiSlots <= 0) {
          return NextResponse.json(
            {
              error: `${playerName} is a college player. This league has no taxi squad slots, so college players can't be drafted.`,
            },
            { status: 409 }
          );
        }
        if (collegePicksOwned >= taxiSlots) {
          return NextResponse.json(
            {
              error: `Taxi squad full (${collegePicksOwned}/${taxiSlots}). ${playerName} is a college player and can only be drafted into taxi slots.`,
            },
            { status: 409 }
          );
        }
        positionWarning = `Taxi squad: ${collegePicksOwned + 1}/${taxiSlots} college players stashed.`;
      } else if (playerInfo.position && slots.length > 0) {
        // ── League-sport player: position limit enforcement ──
        // College picks (sport='NCAAF') are excluded from the filled counts —
        // they occupy taxi slots, not position slots.
        const positionCountsRes = await query<{ position: string; cnt: string }>(
          `SELECT position, COUNT(*)::text AS cnt
           FROM dd_draft_picks
           WHERE draft_id = $1 AND member_id = $2 AND position IS NOT NULL
             AND sport != 'NCAAF'
           GROUP BY position`,
          [draftId, memberIdForPick]
        );
        const filled: Record<string, number> = {};
        for (const row of positionCountsRes.rows) {
          filled[row.position] = Number(row.cnt);
        }

        // Total drafted by this member (all picks, incl. taxi stashes)
        const totalDraftedRes = await queryOne<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt FROM dd_draft_picks WHERE draft_id = $1 AND member_id = $2`,
          [draftId, memberIdForPick]
        );
        const totalDrafted = Number(totalDraftedRes?.cnt ?? '0');

        // Compute total roster size from slots
        const totalRosterSize = slots.reduce((sum, s) => sum + s.count, 0);

        // Build position summary for the response (UI uses this)
        positionLimits = getPositionSummary(slots, filled).map((p) => ({
          position: p.position,
          filled: p.filled,
          capacity: p.capacity,
        }));

        if (enforceLimits) {
          const limitCheck = checkPositionLimit(
            slots,
            playerInfo.position,
            filled,
            totalRosterSize,
            totalDrafted
          );
          if (!limitCheck.allowed) {
            return NextResponse.json(
              {
                error: limitCheck.reason,
                positionLimits,
              },
              { status: 409 }
            );
          }
          // If allowed but at capacity (depth pick), include advisory warning
          if (limitCheck.capacity > 0 && limitCheck.filled >= limitCheck.capacity) {
            positionWarning = `Note: You've reached the ${playerInfo.position} capacity (${limitCheck.filled}/${limitCheck.capacity}). This player will sit on your bench.`;
          }
        }
      }
    } catch (e) {
      // Non-critical — if the check fails, allow the pick (fail-open)
    }
  }

  const result = await tx(async (client) => {
    // Insert the pick
    await client.query(
      `INSERT INTO dd_draft_picks
        (draft_id, round_num, pick_in_round, overall_pick, member_id,
         player_name, player_id, team, position, sport, auction_amount, is_auto_picked, picked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false, NOW())`,
      [
        draftId,
        currentOrderEntry.round,
        currentOrderEntry.pickInRound,
        currentOverallPick,
        memberIdForPick,
        playerName,
        playerInfo.player_id,
        playerInfo.team,
        playerInfo.position,
        playerInfo.poolSport ?? draft.sport, // player's ACTUAL pool sport (NCAAF for college picks)
        auctionAmount ?? null,
      ]
    );

    // Update draft progress
    if (isLastPick) {
      // Draft complete!
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

  // Award XP for making a pick
  const xpResult = await awardXp(session.user.id, 'make_draft_pick', {
    leagueId: draft.league_id,
    metadata: { leagueName: draft.league_name, playerName },
  }).catch(() => ({ awarded: false, newTotalXp: 0, newLevel: 1, newLevelTitle: 'Rookie', leveledUp: false, newBadges: [], streakUpdated: false }));

  return NextResponse.json({
    success: true,
    pick: {
      overallPick: currentOverallPick,
      round: currentOrderEntry.round,
      pickInRound: currentOrderEntry.pickInRound,
      memberId: String(memberIdForPick),
      playerName,
      playerId: playerInfo.player_id,
      team: playerInfo.team,
      position: playerInfo.position,
      isAutoPicked: false,
    },
    isDraftComplete: isLastPick,
    positionWarning,
    positionLimits,
    nextTurn: isLastPick
      ? null
      : {
          overallPick: nextOverall,
          round: nextRound,
          pickInRound: nextPickInRound,
          slot: nextOrderEntry?.slot,
        },
    xpAwarded: xpResult.awarded,
    leveledUp: xpResult.leveledUp,
    newLevel: xpResult.newLevel,
    newBadges: xpResult.newBadges,
  });
}
