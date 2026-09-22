import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { resetWeeks } from '@/lib/dd/reset';

// ───────────────────────────────────────────────────────────────────────────
// POST /api/dd/leagues/[id]/reset
//
// Commissioner-only. Un-finals scored matchups so a week can be re-scored from
// live game stats. Body:
//   { week?: number }   → reset that week (omit / null to reset the season)
//
// Reverses scores, winner, notifications, and gamification XP for the week.
// ───────────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const leagueId = BigInt(params.id);

  // Commissioner-only.
  const membership = await queryOne<{ id: string; is_commissioner: boolean }>(
    `SELECT id::text, is_commissioner FROM dd_league_members
     WHERE league_id = $1 AND user_id = $2`,
    [leagueId, BigInt(session.user.id)]
  );
  if (!membership) {
    return NextResponse.json({ error: 'You are not in this league' }, { status: 403 });
  }
  if (!membership.is_commissioner) {
    return NextResponse.json(
      { error: 'Only the commissioner can reset weeks' },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const week = body?.week != null ? Number(body.week) : null;
  if (week != null && !Number.isFinite(week)) {
    return NextResponse.json({ error: 'Invalid week' }, { status: 400 });
  }

  try {
    const result = await resetWeeks(leagueId, week);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Failed to reset' },
      { status: 500 }
    );
  }
}
