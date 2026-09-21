import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { cancelClaim } from '@/lib/dd/waivers';

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /api/dd/leagues/[id]/waivers/[claimId]
//
// Cancel one of the caller's own pending waiver claims.
// ──────────────────────────────────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; claimId: string } }
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

  const ok = await cancelClaim(leagueId, BigInt(membership.id), BigInt(params.claimId));
  if (!ok) {
    return NextResponse.json(
      { error: 'Claim not found or already processed' },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true });
}
