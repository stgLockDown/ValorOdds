import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboard/live-scores
 *
 * Dedicated live scores endpoint. Returns games grouped by status.
 *
 * Query params:
 *   - sport: optional filter (NFL/NBA/MLB/NHL/NCAAF/NCAAB/SOCCER)
 *
 * Response:
 *   {
 *     live:     [...]  // currently in-progress games
 *     upcoming: [...]  // starting in the next 24h
 *     final:    [...]  // finished games from today
 *   }
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sport = (searchParams.get('sport') || '').toUpperCase();

  const params: any[] = [];
  let sportClause = '';
  if (sport) {
    params.push(sport);
    sportClause = ` AND UPPER(sport) = $${params.length}`;
  }

  try {
    const res = await query(
      `SELECT game_id, sport, home_team, home_team_abbrev, away_team, away_team_abbrev,
              venue, game_date, status, status_detail,
              home_score, away_score, period, clock,
              is_live, is_final, home_record, away_record, updated_at
         FROM games
        WHERE (
              is_live = TRUE
           OR is_final = TRUE AND game_date::date = CURRENT_DATE
           OR (is_live = FALSE AND is_final = FALSE AND game_date > NOW() AND game_date < NOW() + INTERVAL '24 hours')
        )
        ${sportClause}
        ORDER BY is_live DESC, game_date ASC
        LIMIT 100`,
      params
    );

    const live:     any[] = [];
    const upcoming: any[] = [];
    const final:    any[] = [];

    for (const g of res.rows) {
      if (g.is_live) live.push(g);
      else if (g.is_final) final.push(g);
      else upcoming.push(g);
    }

    return NextResponse.json({ live, upcoming, final });
  } catch (e: any) {
    // Gracefully degrade — if the games table doesn't exist yet (dev env), return empty.
    console.error('[live-scores] query failed:', e?.message);
    return NextResponse.json({ live: [], upcoming: [], final: [] });
  }
}