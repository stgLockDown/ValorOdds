import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Games + live scores for the dashboard.
 *
 * Data source: `custom_api_events` (written by Sportsbook-API every ~60s)
 * unioned with `live_scores` (written by the bot when it sees scoring
 * events). The legacy `games` table stopped updating on 2026-03-14, so
 * we read `custom_api_events` for upcoming/in-progress games and only
 * touch `live_scores` for the in-game scoring feed.
 *
 * Output shape matches the previous endpoint so DashboardClient.tsx
 * keeps rendering without changes.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sport = (searchParams.get('sport') || '').trim();
  const live = searchParams.get('live') === 'true';

  const params: any[] = [];
  const conds: string[] = [`fetched_at > NOW() - INTERVAL '10 minutes'`];

  if (sport) {
    params.push(sport.toLowerCase());
    conds.push(`LOWER(sport) = $${params.length}`);
  }
  if (live) {
    conds.push(`(raw_data->>'is_live')::boolean = TRUE`);
  }

  const where = `WHERE ${conds.join(' AND ')}`;

  const result = await query(
    `SELECT DISTINCT ON (event_id)
            event_id, sport, home_team, away_team,
            commence_time, num_sportsbooks, odds_summary, raw_data, fetched_at
     FROM custom_api_events
     ${where}
     ORDER BY event_id, fetched_at DESC
     LIMIT 100`,
    params,
  );

  // Pull recent scoring events for any games marked live in raw_data
  const liveGameIds = result.rows
    .filter((r: any) => {
      try {
        const rd = typeof r.raw_data === 'string' ? JSON.parse(r.raw_data) : r.raw_data;
        return rd?.is_live === true;
      } catch {
        return false;
      }
    })
    .map((r: any) => r.event_id);

  const liveScores: Record<string, any[]> = {};
  if (liveGameIds.length > 0) {
    const scores = await query(
      `SELECT game_id, scoring_team, points_scored, score_type, description, recorded_at
       FROM live_scores
       WHERE game_id = ANY($1)
         AND recorded_at > NOW() - INTERVAL '4 hours'
       ORDER BY recorded_at DESC
       LIMIT 100`,
      [liveGameIds],
    );
    for (const s of scores.rows) {
      if (!liveScores[s.game_id]) liveScores[s.game_id] = [];
      liveScores[s.game_id].push(s);
    }
  }

  const data = result.rows.map((r: any) => {
    const rd = (() => {
      try {
        return typeof r.raw_data === 'string' ? JSON.parse(r.raw_data) : r.raw_data;
      } catch {
        return null;
      }
    })();
    const isLive = Boolean(rd?.is_live);
    return {
      game_id: r.event_id,
      sport: (r.sport || '').toUpperCase(),
      home_team: r.home_team,
      home_team_abbrev: rd?.home_team_abbrev ?? null,
      away_team: r.away_team,
      away_team_abbrev: rd?.away_team_abbrev ?? null,
      venue: rd?.venue ?? null,
      game_date: r.commence_time,
      status: isLive ? 'in_progress' : 'scheduled',
      status_detail: rd?.status_detail ?? null,
      home_score: rd?.home_score ?? 0,
      away_score: rd?.away_score ?? 0,
      period: rd?.period ?? 0,
      clock: rd?.clock ?? null,
      is_live: isLive,
      is_final: Boolean(rd?.is_final),
      home_record: rd?.home_record ?? null,
      away_record: rd?.away_record ?? null,
      updated_at: r.fetched_at,
      num_sportsbooks: r.num_sportsbooks,
      recent_scoring: liveScores[r.event_id] || [],
    };
  });

  return NextResponse.json({ data });
}
