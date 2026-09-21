import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne, tx } from '@/lib/db';
import type { Sport } from '@/lib/dd/presets';
import { checkPositionLimit, getPositionSummary } from '@/lib/dd/roster-enforcement';
import { awardXp } from '@/lib/dd/gamification';
import { loadDraftState, finalizeDraft } from '@/lib/dd/draft-state';

// ─── POST /api/dd/drafts/[id]/pick ── Make a draft pick ──────────────────────
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

  const state = await loadDraftState(draftId);
  if (!state) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  }
  const { draft, members, progress, onClockMemberId, onClockEntry } = state;

  if (draft.status !== 'in_progress') {
    return NextResponse.json({ error: `Draft is ${draft.status}, cannot make picks` }, { status: 409 });
  }

  const leagueId = BigInt(draft.leagueId);

  // If every roster is full (or the order is exhausted), the draft is over.
  if (progress.isComplete || !onClockEntry || !onClockMemberId) {
    await finalizeDraft(draftId, leagueId, draft.roundCount, draft.numTeams);
    return NextResponse.json({ error: 'Draft is complete' }, { status: 409 });
  }

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

  const isCommissioner = draft.commissionerId === String(userId) || member.is_commissioner;

  // It must be this user's turn (commissioner may pick on anyone's behalf).
  if (onClockMemberId !== member.id && !isCommissioner) {
    const onClockMember = members.find((m) => m.id === onClockMemberId);
    return NextResponse.json({
      error: `It's not your turn. On the clock: ${onClockMember?.displayName ?? onClockMember?.teamName ?? 'Another team'}`,
      onClockTeam: onClockMember?.teamName,
    }, { status: 409 });
  }

  const memberIdForPick = BigInt(onClockMemberId);

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
  {
    try {
      const leagueRow = await queryOne<{ roster_config: any; settings: any }>(
        `SELECT roster_config, settings FROM dd_leagues WHERE id = $1`,
        [leagueId]
      );
      const rc = leagueRow?.roster_config;
      const slots: { slot: string; label: string; count: number; eligible: string[]; isStarter: boolean }[] =
        rc && typeof rc === 'object' && Array.isArray(rc.slots) ? rc.slots : [];

      const settings = leagueRow?.settings;
      const enforceLimits = settings?.enforcePositionLimits !== false; // default true

      const taxiSlots =
        slots.find((s) => s.slot === 'TAXI')?.count ??
        settings?.dynastySettings?.taxiSquadSize ??
        0;

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

        const totalDraftedRes = await queryOne<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt FROM dd_draft_picks WHERE draft_id = $1 AND member_id = $2`,
          [draftId, memberIdForPick]
        );
        const totalDrafted = Number(totalDraftedRes?.cnt ?? '0');

        const totalRosterSize = slots.reduce((sum, s) => sum + s.count, 0);

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
          if (limitCheck.capacity > 0 && limitCheck.filled >= limitCheck.capacity) {
            positionWarning = `Note: You've reached the ${playerInfo.position} capacity (${limitCheck.filled}/${limitCheck.capacity}). This player will sit on your bench.`;
          }
        }
      }
    } catch {
      // Non-critical — if the check fails, allow the pick (fail-open)
    }
  }

  // Insert the pick, then recompute progress to decide whether the draft ends.
  const result = await tx(async (client) => {
    await client.query(
      `INSERT INTO dd_draft_picks
        (draft_id, round_num, pick_in_round, overall_pick, member_id,
         player_name, player_id, team, position, sport, auction_amount, is_auto_picked, picked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false, NOW())`,
      [
        draftId,
        onClockEntry.round,
        onClockEntry.pickInRound,
        onClockEntry.overallPick,
        memberIdForPick,
        playerName,
        playerInfo.player_id,
        playerInfo.team,
        playerInfo.position,
        playerInfo.poolSport ?? draft.sport,
        auctionAmount ?? null,
      ]
    );

    // Recompute progress with this pick included.
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

  const xpResult = await awardXp(session.user.id, 'make_draft_pick', {
    leagueId: draft.leagueId,
    metadata: { leagueName: draft.leagueName, playerName },
  }).catch(() => ({ awarded: false, newTotalXp: 0, newLevel: 1, newLevelTitle: 'Rookie', leveledUp: false, newBadges: [], streakUpdated: false }));

  const nextEntry = result.after?.onClockEntry ?? null;

  return NextResponse.json({
    success: true,
    pick: {
      overallPick: onClockEntry.overallPick,
      round: onClockEntry.round,
      pickInRound: onClockEntry.pickInRound,
      memberId: String(memberIdForPick),
      playerName,
      playerId: playerInfo.player_id,
      team: playerInfo.team,
      position: playerInfo.position,
      isAutoPicked: false,
    },
    isDraftComplete: result.isLastPick,
    positionWarning,
    positionLimits,
    nextTurn: result.isLastPick || !nextEntry
      ? null
      : {
          overallPick: nextEntry.overallPick,
          round: nextEntry.round,
          pickInRound: nextEntry.pickInRound,
          slot: nextEntry.slot,
        },
    xpAwarded: xpResult.awarded,
    leveledUp: xpResult.leveledUp,
    newLevel: xpResult.newLevel,
    newBadges: xpResult.newBadges,
  });
}
