import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne, tx } from '@/lib/db';
import { generateDraftOrder, type Sport, type RosterConfig } from '@/lib/dd/presets';
import { awardXp } from '@/lib/dd/gamification';
import { loadDraftState } from '@/lib/dd/draft-state';

// ─── POST /api/dd/drafts ── Create / start a draft for a league ───────────────
// Body: { leagueId, pickTimerSeconds?, auctionBudget? }
// Creates draft, assigns draft order, transitions league → 'drafting'
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = BigInt(session.user.id);
  const body = await req.json();

  const { leagueId } = body;
  if (!leagueId) {
    return NextResponse.json({ error: 'leagueId is required' }, { status: 400 });
  }

  const league = await queryOne<{
    id: string; name: string; sport: Sport; commissioner_id: string;
    format: string; scoring_preset: string; roster_preset: string;
    num_teams: number; status: string; draft_type: string; season_year: number;
    roster_config: any;
  }>(
    `SELECT id::text, name, sport, commissioner_id::text, format, scoring_preset,
            roster_config->>'name' AS roster_preset,
            roster_config,
            num_teams, status, settings->>'draftType' AS draft_type, season_year
     FROM dd_leagues WHERE id = $1`,
    [BigInt(leagueId)]
  );

  if (!league) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 });
  }

  // Only commissioner can start draft
  const isComm =
    league.commissioner_id === String(userId) ||
    (await queryOne<{ id: string }>(
      `SELECT id::text FROM dd_league_members WHERE league_id = $1 AND user_id = $2 AND is_commissioner = true`,
      [BigInt(leagueId), userId]
    )) != null;

  if (!isComm) {
    return NextResponse.json({ error: 'Only the commissioner can start the draft' }, { status: 403 });
  }

  // Verify league is in pre_draft / recruiting
  if (league.status !== 'recruiting' && league.status !== 'pre_draft' && league.status !== 'setup' && league.status !== 'predraft') {
    return NextResponse.json({ error: 'League is not ready for draft (must be in recruiting/pre-draft status)' }, { status: 409 });
  }

  // Get members with draft positions
  const membersRes = await query<{
    id: string; user_id: string; team_name: string; draft_position: number;
  }>(
    `SELECT id::text, user_id::text, team_name, draft_position
     FROM dd_league_members
     WHERE league_id = $1
     ORDER BY draft_position NULLS LAST, joined_at`,
    [BigInt(leagueId)]
  );

  if (membersRes.rows.length < 2) {
    return NextResponse.json({ error: 'Need at least 2 members to draft' }, { status: 400 });
  }

  // Check if a draft already exists and is not completed
  const existingDraft = await queryOne<{ id: string; status: string }>(
    `SELECT id::text, status FROM dd_drafts WHERE league_id = $1 AND status IN ('scheduled','in_progress','paused') ORDER BY created_at DESC LIMIT 1`,
    [BigInt(leagueId)]
  );
  if (existingDraft) {
    return NextResponse.json({ error: 'An active draft already exists for this league', draftId: existingDraft.id }, { status: 409 });
  }

  // Compute rounds from roster preset (total roster size)
  // Use the roster_config stored on the league directly rather than re-deriving
  // by key (the key is not persisted — only the full config is).
  const rosterConfig: RosterConfig =
    typeof league.roster_config === 'string'
      ? JSON.parse(league.roster_config)
      : league.roster_config;
  const rounds = rosterConfig.totalRosterSize;
  const numTeams = membersRes.rows.length;
  const draftType = (league.draft_type as any) ?? 'snake';

  // Ensure all members have draft positions
  const membersWithPositions = membersRes.rows.map((m, i) => ({
    ...m,
    draft_position: m.draft_position ?? (i + 1),
  }));

  // Sort by draft position to build the slot → member map
  const sortedMembers = [...membersWithPositions].sort(
    (a, b) => a.draft_position - b.draft_position
  );

  const draftOrder = generateDraftOrder(draftType, numTeams, rounds);
  const timerSeconds = body.pickTimerSeconds ?? 90;

  const result = await tx(async (client) => {
    // Create the draft record
    const draftInsert = await client.query<{
      id: string;
    }>(
      `INSERT INTO dd_drafts (league_id, draft_type, status, round_count, current_round, current_pick, pick_timer_seconds, is_mock, started_at)
       VALUES ($1, $2, 'in_progress', $3, 1, 1, $4, false, NOW())
       RETURNING id::text`,
      [BigInt(leagueId), draftType, rounds, timerSeconds]
    );
    const draftId = draftInsert.rows[0].id;

    // Update league status → drafting and link draft_id
    await client.query(
      `UPDATE dd_leagues SET status = 'drafting', draft_id = $1, updated_at = NOW() WHERE id = $2`,
      [BigInt(draftId), BigInt(leagueId)]
    );

    // Assign draft positions to members that don't have one
    for (const m of membersWithPositions) {
      if (m.draft_position == null) {
        await client.query(
          `UPDATE dd_league_members SET draft_position = $1 WHERE id = $2`,
          [m.draft_position, BigInt(m.id)]
        );
      }
    }

    return { draftId };
  });

  // Award XP to commissioner for starting draft
  await awardXp(session.user.id, 'complete_draft', {
    leagueId: league.id,
    metadata: { leagueName: league.name },
  }).catch(() => null);

  return NextResponse.json({
    draftId: result.draftId,
    status: 'in_progress',
    rounds,
    numTeams,
    draftType,
    currentRound: 1,
    currentPick: 1,
    timerSeconds,
    draftOrder: draftOrder.slice(0, numTeams).map((p) => ({
      round: p.round,
      pickInRound: p.pickInRound,
      overallPick: p.overallPick,
      slot: p.slot,
      memberId: sortedMembers[p.slot]?.id,
      teamName: sortedMembers[p.slot]?.team_name,
    })),
  });
}

// ─── GET /api/dd/drafts ── Get draft state (by draftId or leagueId) ──────────
// ?leagueId= or ?draftId=
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const leagueIdParam = searchParams.get('leagueId');
  const draftIdParam = searchParams.get('draftId');

  if (!leagueIdParam && !draftIdParam) {
    return NextResponse.json({ error: 'leagueId or draftId is required' }, { status: 400 });
  }

  // Resolve the draft id (either directly or via the league's latest draft).
  let resolvedDraftId: bigint | null = null;
  if (draftIdParam) {
    resolvedDraftId = BigInt(draftIdParam);
  } else {
    const row = await queryOne<{ id: string }>(
      `SELECT id::text FROM dd_drafts WHERE league_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [BigInt(leagueIdParam!)]
    );
    if (row) resolvedDraftId = BigInt(row.id);
  }

  if (!resolvedDraftId) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  }

  const state = await loadDraftState(resolvedDraftId);
  if (!state) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  }

  const { draft, members, picks, progress, onClockEntry, onClockMemberId } = state;

  const slotToMember = new Map<number, (typeof members)[number]>();
  for (const m of members) {
    if (m.draftPosition != null) slotToMember.set(m.draftPosition - 1, m);
  }

  const picksMade = picks.length;
  const totalPicks = progress.effectiveTotalPicks;
  const isComplete = draft.status === 'completed' || progress.isComplete;

  const fullOrder = generateDraftOrder(draft.draftType as any, draft.numTeams, draft.roundCount);

  const draftBoard = fullOrder.map((order) => {
    const pick = picks.find((p) => p.overallPick === order.overallPick);
    const member = slotToMember.get(order.slot);
    return {
      round: order.round,
      pickInRound: order.pickInRound,
      overallPick: order.overallPick,
      slot: order.slot,
      memberId: member?.id,
      teamName: member?.teamName,
      displayName: member?.displayName ?? member?.teamName,
      pick: pick
        ? {
            id: pick.id,
            playerName: pick.playerName,
            playerId: pick.playerId,
            team: pick.team,
            position: pick.position,
            isAutoPicked: pick.isAutoPicked,
            pickedAt: pick.pickedAt,
            pickSport: pick.sport ?? draft.sport,
            headshot: pick.headshot ?? null,
          }
        : null,
    };
  });

  const teamRosters: Record<string, any[]> = {};
  for (const pick of picks) {
    if (!teamRosters[pick.memberId]) teamRosters[pick.memberId] = [];
    teamRosters[pick.memberId].push({
      playerName: pick.playerName,
      playerId: pick.playerId,
      team: pick.team,
      position: pick.position,
      pickSport: pick.sport ?? draft.sport,
      round: pick.roundNum,
      overallPick: pick.overallPick,
    });
  }

  const onClockMember = onClockMemberId
    ? members.find((m) => m.id === onClockMemberId)
    : null;

  return NextResponse.json({
    draft: {
      id: draft.id,
      leagueId: draft.leagueId,
      leagueName: draft.leagueName,
      sport: draft.sport,
      draftType: draft.draftType,
      status: draft.status,
      rounds: draft.roundCount,
      numTeams: draft.numTeams,
      currentRound: draft.currentRound,
      currentPick: draft.currentPick,
      timerSeconds: draft.timerSeconds,
      rosterPreset: draft.rosterConfig?.name,
      rosterConfig: draft.rosterConfig,
      isMock: draft.isMock,
      startedAt: draft.startedAt,
      completedAt: draft.completedAt,
      isComplete,
      picksMade,
      totalPicks,
    },
    currentTurn: isComplete || !onClockEntry
      ? null
      : {
          overallPick: onClockEntry.overallPick,
          round: onClockEntry.round,
          pickInRound: onClockEntry.pickInRound,
          slot: onClockEntry.slot,
          memberId: onClockMember?.id,
          teamName: onClockMember?.teamName,
          displayName: onClockMember?.displayName ?? onClockMember?.teamName,
        },
    members: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      teamName: m.teamName,
      draftPosition: m.draftPosition,
      displayName: m.displayName ?? m.teamName,
      isBot: m.isBot,
    })),
    draftBoard,
    teamRosters,
  });
}
