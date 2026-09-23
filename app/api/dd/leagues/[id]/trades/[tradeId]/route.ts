import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { respondToTrade, TradeError, type TradeAction } from '@/lib/dd/trades';

// ────────────────────────────────────────────────────────────────────────────
// /api/dd/leagues/[id]/trades/[tradeId]
//
//   PATCH → act on a trade.
//
// Body:
//   { action: 'accept' | 'reject' | 'cancel' | 'execute' | 'vote', vote? }
// ────────────────────────────────────────────────────────────────────────────

const ACTIONS: TradeAction[] = ['accept', 'reject', 'cancel', 'execute', 'vote'];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; tradeId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const leagueId = BigInt(params.id);
  const membership = await queryOne<{ id: string }>(
    `SELECT id::text FROM dd_league_members WHERE league_id = $1 AND user_id = $2`,
    [leagueId, BigInt(session.user.id)]
  );
  if (!membership) {
    return NextResponse.json({ error: 'You are not in this league' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const action = body?.action as TradeAction;
  if (!action || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
  if (action === 'vote' && !['approve', 'veto'].includes(body?.vote)) {
    return NextResponse.json({ error: 'A vote must be approve or veto' }, { status: 400 });
  }

  try {
    const trade = await respondToTrade({
      leagueId,
      tradeId: BigInt(params.tradeId),
      memberId: membership.id,
      action,
      vote: body?.vote,
    });
    return NextResponse.json({ trade });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Failed to update trade' },
      { status: err instanceof TradeError ? err.status : 500 }
    );
  }
}
