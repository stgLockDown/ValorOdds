import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { generateDraftOrder, type Sport, type RosterConfig } from '@/lib/dd/presets';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ── GET /api/dd/drafts/[id]/stream ── Server-Sent Events for live draft updates ──
// Sends draft state immediately on connect, then polls DB every 2s and pushes
// updates whenever the state changes (new pick, turn change, status change).
// This gives real-time sync without requiring a WebSocket server.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const draftId = params.id;
  let draftIdBigInt: bigint;
  try {
    draftIdBigInt = BigInt(draftId);
  } catch {
    return new Response('Invalid draft ID', { status: 400 });
  }

  // Verify the draft exists
  const draftCheck = await queryOne<{ id: string }>(
    `SELECT id::text FROM dd_drafts WHERE id = $1`,
    [draftIdBigInt]
  );
  if (!draftCheck) {
    return new Response('Draft not found', { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let lastStateHash = '';

      const sendEvent = (data: unknown) => {
        const json = JSON.stringify(data);
        controller.enqueue(encoder.encode(`data: ${json}\n\n`));
      };

      const sendHeartbeat = () => {
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));
      };

      const fetchAndPushState = async () => {
        try {
          const state = await buildDraftState(draftIdBigInt);
          if (!state) {
            // Draft may have been deleted
            sendEvent({ error: 'Draft not found' });
            controller.close();
            return;
          }

          // Hash the state to detect changes — only push when something changed
          const hash = JSON.stringify({
            s: state.draft.status,
            cr: state.draft.currentRound,
            cp: state.draft.currentPick,
            pm: state.draft.picksMade,
            ts: state.draft.timerSeconds,
          });

          if (hash !== lastStateHash) {
            lastStateHash = hash;
            sendEvent({ type: 'state', ...state });
          }
        } catch (err) {
          // Non-fatal — just skip this cycle
        }
      };

      // Send initial state immediately
      await fetchAndPushState();

      // Poll every 2 seconds
      const pollInterval = setInterval(fetchAndPushState, 2000);

      // Send heartbeat every 15 seconds to keep connection alive
      const heartbeatInterval = setInterval(sendHeartbeat, 15000);

      // Handle client disconnect
      const cleanup = () => {
        clearInterval(pollInterval);
        clearInterval(heartbeatInterval);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      // Listen for abort signal (client disconnect)
      req.signal.addEventListener('abort', cleanup);

      // Keep a reference for cleanup — store on the controller
      (controller as any)._cleanup = cleanup;
    },
    cancel(reason) {
      // Called when the consumer cancels the stream
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ── Build the draft state (same logic as GET /api/dd/drafts) ──
async function buildDraftState(draftId: bigint) {
  const draftRow = await queryOne<any>(
    `SELECT d.id::text, d.league_id::text, d.draft_type, d.status, d.round_count,
            d.current_round, d.current_pick, d.pick_timer_seconds, d.is_mock,
            d.started_at, d.completed_at,
            l.name AS league_name, l.sport, l.num_teams, l.roster_config->>'name' AS roster_preset,
            l.roster_config, l.scoring_config
     FROM dd_drafts d
     JOIN dd_leagues l ON l.id = d.league_id
     WHERE d.id = $1`,
    [draftId]
  );

  if (!draftRow) return null;

  const numTeams = draftRow.num_teams;
  const sport = draftRow.sport as Sport;
  const rosterConfig: RosterConfig =
    typeof draftRow.roster_config === 'string'
      ? JSON.parse(draftRow.roster_config)
      : draftRow.roster_config;
  const rounds = draftRow.round_count;

  const fullOrder = generateDraftOrder(draftRow.draft_type, numTeams, rounds);

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
      slotToMember.set(m.draft_position - 1, m);
    }
  }

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

  const currentOverall =
    draftRow.current_round === 0 && draftRow.current_pick === 0
      ? picksMade + 1
      : (draftRow.current_round - 1) * numTeams + draftRow.current_pick;

  const currentSlotEntry = fullOrder.find((p) => p.overallPick === currentOverall);
  const currentSlot = currentSlotEntry?.slot ?? 0;
  const currentMember = slotToMember.get(currentSlot);

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

  return {
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
  };
}
