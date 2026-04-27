import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const sport = searchParams.get('sport') || '';
  const live = searchParams.get('live') === 'true';

  const conditions: string[] = [];
  const params: any[] = [];

  if (sport) { params.push(sport.toUpperCase()); conditions.push(`UPPER(sport) = $${params.length}`); }
  if (live) { conditions.push(`is_live = true`); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT game_id, sport, home_team, home_team_abbrev, away_team, away_team_abbrev,
            venue, game_date, status, status_detail,
            home_score, away_score, period, clock,
            is_live, is_final, home_record, away_record, updated_at
     FROM games
     ${where}
     ORDER BY is_live DESC, game_date ASC
     LIMIT 50`,
    params
  );

  // Also get recent live scores for live games
  const liveScores: Record<string, any[]> = {};
  if (result.rows.some((g: any) => g.is_live)) {
    const liveGameIds = result.rows.filter((g: any) => g.is_live).map((g: any) => g.game_id);
    const scores = await query(
      `SELECT game_id, scoring_team, points_scored, score_type, description, recorded_at
       FROM live_scores
       WHERE game_id = ANY($1)
       ORDER BY recorded_at DESC
       LIMIT 50`,
      [liveGameIds]
    );
    for (const s of scores.rows) {
      if (!liveScores[s.game_id]) liveScores[s.game_id] = [];
      liveScores[s.game_id].push(s);
    }
  }

  const data = result.rows.map((g: any) => ({
    ...g,
    recent_scoring: liveScores[g.game_id] || [],
  }));

  return NextResponse.json({ data });
}