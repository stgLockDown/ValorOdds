import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import {
  getWaiverBoard,
  submitClaim,
  processWaivers,
  HttpError,
} from '@/lib/dd/waivers';

// ──────────────────────────────────────────────────────────────────────────────
// /api/dd/leagues/[id]/waivers
//
//   GET  → the waiver board: free agents + the caller's claims + FAAB budget.
//   POST → submit a claim, or (commissioner only) process all pending claims.
//
// POST body:
//   { playerName, dropPlayerName?, bidAmount? }   → submit a claim
//   { action: 'process' }                          → run the waiver processor
// ──────────────────────────────────────────────────────────────────────────────

async function resolveMembership(leagueId: bigint, userId: string) {
  return queryOne<{ id: string; is_commissioner: boolean }>(
    `SELECT id::text, is_commissioner FROM dd_league_members
     WHERE league_id = $1 AND user_id = $2`,
    [leagueId, BigInt(userId)]
  );
}

export async function GET(
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

  const url = new URL(req.url);
  const search = url.searchParams.get('search') ?? undefined;
  const position = url.searchParams.get('position') ?? undefined;

  try {
    const board = await getWaiverBoard(leagueId, BigInt(membership.id), {
      search,
      position,
    });
    return NextResponse.json(board);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Failed to load waivers' },
      { status: err instanceof HttpError ? err.status : 500 }
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
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    if (body.action === 'process') {
      if (!membership.is_commissioner) {
        return NextResponse.json(
          { error: 'Only the commissioner can process waivers' },
          { status: 403 }
        );
      }
      const result = await processWaivers(leagueId);
      return NextResponse.json({ ok: true, ...result });
    }

    const claim = await submitClaim({
      leagueId,
      memberId: BigInt(membership.id),
      playerName: body.playerName,
      dropPlayerName: body.dropPlayerName ?? null,
      bidAmount: body.bidAmount ?? 0,
    });
    return NextResponse.json({ ok: true, claim });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Failed to submit claim' },
      { status: err instanceof HttpError ? err.status : 500 }
    );
  }
}
