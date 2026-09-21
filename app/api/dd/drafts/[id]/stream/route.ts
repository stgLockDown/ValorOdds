import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { loadDraftState } from '@/lib/dd/draft-state';
import { generateDraftOrder } from '@/lib/dd/presets';

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
            sendEvent({ error: 'Draft not found' });
            controller.close();
            return;
          }

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
        } catch {
          // Non-fatal — just skip this cycle
        }
      };

      await fetchAndPushState();

      const pollInterval = setInterval(fetchAndPushState, 2000);
      const heartbeatInterval = setInterval(sendHeartbeat, 15000);

      const cleanup = () => {
        clearInterval(pollInterval);
        clearInterval(heartbeatInterval);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      req.signal.addEventListener('abort', cleanup);
      (controller as any)._cleanup = cleanup;
    },
    cancel() {
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

// ── Build the draft state (same shape as GET /api/dd/drafts) ──
async function buildDraftState(draftId: bigint) {
  const state = await loadDraftState(draftId);
  if (!state) return null;

  const { draft, members, picks, progress, onClockEntry, onClockMemberId } = state;

  const slotToMember = new Map<number, (typeof members)[number]>();
  for (const m of members) {
    if (m.draftPosition != null) slotToMember.set(m.draftPosition - 1, m);
  }

  const picksMade = picks.length;
  const totalPicks = progress.effectiveTotalPicks;
  const isComplete = draft.status === 'completed' || progress.isComplete;

  const draftBoard = (() => {
    // Rebuild the full order so every slot renders (picked or not).
    const order = generateDraftOrder(
      draft.draftType as any,
      draft.numTeams,
      draft.roundCount
    );
    return order.map((o) => {
      const pick = picks.find((p) => p.overallPick === o.overallPick);
      const member = slotToMember.get(o.slot);
      return {
        round: o.round,
        pickInRound: o.pickInRound,
        overallPick: o.overallPick,
        slot: o.slot,
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
              headshot: pick.headshot ?? null,
            }
          : null,
      };
    });
  })();

  const teamRosters: Record<string, any[]> = {};
  for (const pick of picks) {
    if (!teamRosters[pick.memberId]) teamRosters[pick.memberId] = [];
    teamRosters[pick.memberId].push({
      playerName: pick.playerName,
      playerId: pick.playerId,
      team: pick.team,
      position: pick.position,
      round: pick.roundNum,
      overallPick: pick.overallPick,
    });
  }

  const onClockMember = onClockMemberId
    ? members.find((m) => m.id === onClockMemberId)
    : null;

  return {
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
  };
}
