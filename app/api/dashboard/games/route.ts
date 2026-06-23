import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { buildEspnScoreIndex } from '@/lib/espn-scores';

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
  // Bot's custom_api_scheduler runs every 30 min — use 35-min window so we
  // always catch the latest cycle plus jitter buffer.
  const conds: string[] = [`fetched_at > NOW() - INTERVAL '35 minutes'`];

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

  // The Sportsbook-API feeding `custom_api_events` carries odds only (no
  // scores/status). Enrich every row with real scores from ESPN's public
  // scoreboard API, matched by normalized team names. If ESPN is unreachable
  // the index is empty and we gracefully fall back to whatever raw_data has.
  const sportsInResult = Array.from(
    new Set(
      result.rows
        .map((r: any) => (r.sport || '').toUpperCase())
        .filter((s: string) => s.length > 0),
    ),
  );

  let espnIndex: { match: (h: string, a: string, d?: string | null) => any; size: number } = {
    match: () => null,
    size: 0,
  };
  try {
    espnIndex = await buildEspnScoreIndex(sportsInResult);
  } catch {
    // keep the no-op fallback index
  }

  const data = result.rows.map((r: any) => {
    const rd = (() => {
      try {
        return typeof r.raw_data === 'string' ? JSON.parse(r.raw_data) : r.raw_data;
      } catch {
        return null;
      }
    })();

    // Try to attach a real ESPN score for this matchup.
    const espn = espnIndex.match(r.home_team, r.away_team, r.commence_time);

    const isLive = espn ? espn.isLive : Boolean(rd?.is_live);
    const isFinal = espn ? espn.isFinal : Boolean(rd?.is_final);
    const status = isLive ? 'in_progress' : isFinal ? 'final' : 'scheduled';

    return {
      game_id: r.event_id,
      sport: (r.sport || '').toUpperCase(),
      home_team: r.home_team,
      home_team_abbrev: espn?.homeAbbrev ?? rd?.home_team_abbrev ?? null,
      away_team: r.away_team,
      away_team_abbrev: espn?.awayAbbrev ?? rd?.away_team_abbrev ?? null,
      venue: rd?.venue ?? null,
      game_date: r.commence_time,
      status,
      status_detail: espn?.statusDetail ?? rd?.status_detail ?? null,
      home_score: espn ? espn.homeScore : (rd?.home_score ?? 0),
      away_score: espn ? espn.awayScore : (rd?.away_score ?? 0),
      period: espn ? espn.period : (rd?.period ?? 0),
      clock: espn?.clock ?? rd?.clock ?? null,
      is_live: isLive,
      is_final: isFinal,
      home_record: espn?.homeRecord ?? rd?.home_record ?? null,
      away_record: espn?.awayRecord ?? rd?.away_record ?? null,
      updated_at: r.fetched_at,
      num_sportsbooks: r.num_sportsbooks,
      recent_scoring: liveScores[r.event_id] || [],
    };
  });

  return NextResponse.json({ data });
}
