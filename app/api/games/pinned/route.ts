import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** List the signed-in user's pinned games. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await query(
    `SELECT game_id, espn_event_id, sport, home_team, away_team,
            home_abbrev, away_abbrev, game_date, notify_score, notify_big_plays, created_at
     FROM pinned_games
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [session.user.id],
  );

  return NextResponse.json({ data: result.rows });
}
