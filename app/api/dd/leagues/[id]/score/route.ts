import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { scoreWeek, scoreNextWeek } from '@/lib/dd/week-scoring';

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/dd/leagues/[id]/score
//
// Score a week of head-to-head matchups. Body:
//   { week?: number }   → score that week (defaults to the next unscored week)
//
// Any league member may trigger scoring; it is idempotent, so a double-click
// or a concurrent request cannot double-score a matchup.
// ──────────────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
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

  const body = await req.json().catch(() => ({}));
  const week = body?.week != null ? Number(body.week) : null;

  try {
    const result =
      week != null && Number.isFinite(week)
        ? await scoreWeek(leagueId, week)
        : await scoreNextWeek(leagueId);

    if (!result) {
      return NextResponse.json({ ok: true, message: 'Season is fully scored', scored: [] });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Failed to score week' },
      { status: 500 }
    );
  }
}
