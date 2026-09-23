import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import {
  listTrades,
  proposeTrade,
  TradeError,
  type TradeAssetInput,
} from '@/lib/dd/trades';

// ────────────────────────────────────────────────────────────────────────────
// /api/dd/leagues/[id]/trades
//
//   GET  → every trade in the league (assets, votes, analysis, my role).
//   POST → propose a trade.
//
// POST body:
//   { assets: [{ fromMemberId, toMemberId, assetType, assetRef }] }
//     assetType: 'player' | 'faab' | 'draft_pick'
// ────────────────────────────────────────────────────────────────────────────

async function resolveMembership(leagueId: bigint, userId: string) {
  return queryOne<{ id: string; is_commissioner: boolean }>(
    `SELECT id::text, is_commissioner FROM dd_league_members
     WHERE league_id = $1 AND user_id = $2`,
    [leagueId, BigInt(userId)]
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const leagueId = BigInt(params.id);
  const membership = await resolveMembership(leagueId, session.user.id);
  if (!membership) {
    return NextResponse.json({ error: 'You are not in this league' }, { status: 403 });
  }

  try {
    const trades = await listTrades(leagueId, membership.id);
    return NextResponse.json({ trades, currentMemberId: membership.id });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Failed to load trades' },
      { status: err instanceof TradeError ? err.status : 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const leagueId = BigInt(params.id);
  const membership = await resolveMembership(leagueId, session.user.id);
  if (!membership) {
    return NextResponse.json({ error: 'You are not in this league' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.assets)) {
    return NextResponse.json({ error: 'Invalid trade payload' }, { status: 400 });
  }

  const assets: TradeAssetInput[] = body.assets
    .map((a: any) => ({
      fromMemberId: String(a?.fromMemberId ?? ''),
      toMemberId: String(a?.toMemberId ?? ''),
      assetType: a?.assetType,
      assetRef: String(a?.assetRef ?? '').trim(),
    }))
    .filter(
      (a: TradeAssetInput) =>
        a.fromMemberId &&
        a.toMemberId &&
        a.assetRef &&
        ['player', 'faab', 'draft_pick'].includes(a.assetType)
    );

  if (!assets.length) {
    return NextResponse.json({ error: 'A trade needs at least one valid asset' }, { status: 400 });
  }

  try {
    const trade = await proposeTrade({
      leagueId,
      proposerMemberId: membership.id,
      assets,
    });
    return NextResponse.json({ trade });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Failed to propose trade' },
      { status: err instanceof TradeError ? err.status : 500 }
    );
  }
}
