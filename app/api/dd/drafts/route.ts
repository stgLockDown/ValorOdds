import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne, tx } from '@/lib/db';
import { generateDraftOrder, type Sport, type RosterConfig } from '@/lib/dd/presets';
import { awardXp } from '@/lib/dd/gamification';

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

// ─── GET /api/dd/drafts ── Get draft state (by draftId or leagueId) ───────────
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

  let draftRow: any;
  if (draftIdParam) {
    draftRow = await queryOne<any>(
      `SELECT d.id::text, d.league_id::text, d.draft_type, d.status, d.round_count,
              d.current_round, d.current_pick, d.pick_timer_seconds, d.is_mock,
              d.started_at, d.completed_at,
              l.name AS league_name, l.sport, l.num_teams, l.roster_config->>'name' AS roster_preset,
              l.roster_config, l.scoring_config,
              l.scoring_preset, l.commissioner_id::text AS commissioner_id
       FROM dd_drafts d
       JOIN dd_leagues l ON l.id = d.league_id
       WHERE d.id = $1`,
      [BigInt(draftIdParam)]
    );
  } else {
    draftRow = await queryOne<any>(
      `SELECT d.id::text, d.league_id::text, d.draft_type, d.status, d.round_count,
              d.current_round, d.current_pick, d.pick_timer_seconds, d.is_mock,
              d.started_at, d.completed_at,
              l.name AS league_name, l.sport, l.num_teams, l.roster_config->>'name' AS roster_preset,
              l.roster_config, l.scoring_config,
              l.scoring_preset, l.commissioner_id::text AS commissioner_id
       FROM dd_drafts d
       JOIN dd_leagues l ON l.id = d.league_id
       WHERE d.league_id = $1
       ORDER BY d.created_at DESC LIMIT 1`,
      [BigInt(leagueIdParam!)]
    );
  }

  if (!draftRow) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  }

  const draftId = BigInt(draftRow.id);
  const numTeams = draftRow.num_teams;
  const sport = draftRow.sport as Sport;
  // Use the roster_config stored on the league directly (already contains the
  // full preset including slots, totalRosterSize, totalStarters) instead of
  // re-deriving by key — the key is not persisted, only the full config is.
  const rosterConfig: RosterConfig =
    typeof draftRow.roster_config === 'string'
      ? JSON.parse(draftRow.roster_config)
      : draftRow.roster_config;
  const rounds = draftRow.round_count;

  // Generate the full draft order
  const fullOrder = generateDraftOrder(draftRow.draft_type, numTeams, rounds);

  // Get members mapped by draft position
  const membersRes = await query<{
    id: string; user_id: string; team_name: string; draft_position: number | null;
    display_name: string | null; is_bot: boolean;
  }>(
    `SELECT m.id::text, m.user_id::text, m.team_name, m.draft_position, u.display_name,
            (u.password_hash = 'bot_no_login') AS is_bot
     FROM dd_league_members m
     JOIN web_users u ON u.id = m.user_id
     WHERE m.league_id = $1
     ORDER BY m.draft_position NULLS LAST`,
    [BigInt(draftRow.league_id)]
  );

  const slotToMember = new Map<number, any>();
  for (const m of membersRes.rows) {
    if (m.draft_position != null) {
      slotToMember.set(m.draft_position - 1, m); // slot is 0-indexed
    }
  }

  // Get all picks made so far
  const picksRes = await query<{
    id: string; round_num: number; pick_in_round: number; overall_pick: number;
    member_id: string; player_name: string; player_id: string; team: string;
    position: string; is_auto_picked: boolean; picked_at: string;
    headshot: string | null;
  }>(
    `SELECT dp.id::text, dp.round_num, dp.pick_in_round, dp.overall_pick, dp.member_id::text,
            dp.player_name, dp.player_id, dp.team, dp.position, dp.is_auto_picked, dp.picked_at,
            pp.headshot_url AS headshot
     FROM dd_draft_picks dp
     LEFT JOIN dd_player_pool pp ON pp.id::text = dp.player_id
     WHERE dp.draft_id = $1
     ORDER BY dp.overall_pick`,
    [draftId]
  );

  const picksMade = picksRes.rows.length;
  const totalPicks = numTeams * rounds;

  // Determine whose turn it is
  const currentOverall = draftRow.current_round === 0 && draftRow.current_pick === 0
    ? picksMade + 1
    : (draftRow.current_round - 1) * numTeams + draftRow.current_pick;

  const currentSlotEntry = fullOrder.find((p) => p.overallPick === currentOverall);
  const currentSlot = currentSlotEntry?.slot ?? 0;
  const currentMember = slotToMember.get(currentSlot);

  // Build the full draft board with picks
  const draftBoard = fullOrder.map((order) => {
    const pick = picksRes.rows.find((p) => p.overall_pick === order.overallPick);
    const member = slotToMember.get(order.slot);
    return {
      round: order.round,
      pickInRound: order.pickInRound,
      overallPick: order.overallPick,
      slot: order.slot,
      memberId: member?.id,
      teamName: member?.team_name,
      displayName: member?.display_name ?? member?.team_name,
      pick: pick
        ? {
            id: pick.id,
            playerName: pick.player_name,
            playerId: pick.player_id,
            team: pick.team,
            position: pick.position,
            isAutoPicked: pick.is_auto_picked,
            pickedAt: pick.picked_at,
            headshot: pick.headshot ?? null,
          }
        : null,
    };
  });

  // Build per-team rosters (picks grouped by member)
  const teamRosters: Record<string, any[]> = {};
  for (const pick of picksRes.rows) {
    if (!teamRosters[pick.member_id]) teamRosters[pick.member_id] = [];
    teamRosters[pick.member_id].push({
      playerName: pick.player_name,
      playerId: pick.player_id,
      team: pick.team,
      position: pick.position,
      round: pick.round_num,
      overallPick: pick.overall_pick,
    });
  }

  const isComplete = draftRow.status === 'completed' || picksMade >= totalPicks;

  return NextResponse.json({
    draft: {
      id: draftRow.id,
      leagueId: draftRow.league_id,
      leagueName: draftRow.league_name,
      sport: draftRow.sport,
      draftType: draftRow.draft_type,
      status: draftRow.status,
      rounds,
      numTeams,
      currentRound: draftRow.current_round,
      currentPick: draftRow.current_pick,
      timerSeconds: draftRow.pick_timer_seconds,
      rosterPreset: draftRow.roster_preset,
      rosterConfig,
      isMock: draftRow.is_mock ?? false,
      startedAt: draftRow.started_at,
      completedAt: draftRow.completed_at,
      isComplete,
      picksMade,
      totalPicks,
    },
    currentTurn: isComplete
      ? null
      : {
          overallPick: currentOverall,
          round: currentSlotEntry?.round,
          pickInRound: currentSlotEntry?.pickInRound,
          slot: currentSlot,
          memberId: currentMember?.id,
          teamName: currentMember?.team_name,
          displayName: currentMember?.display_name ?? currentMember?.team_name,
        },
    members: membersRes.rows.map((m) => ({
      id: m.id,
      userId: m.user_id,
      teamName: m.team_name,
      draftPosition: m.draft_position,
      displayName: m.display_name ?? m.team_name,
      isBot: m.is_bot,
    })),
    draftBoard,
    teamRosters,
  });
}
