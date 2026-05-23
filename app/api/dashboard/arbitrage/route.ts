import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Live arbitrage opportunities for the dashboard.
 *
 * Data source: `custom_api_compare` (written by the Discord bot's
 * `custom_api_scheduler.js` every 60s). The legacy `arbitrage_opportunities`
 * table is a separate ingest path that has been dormant since 2026-03-14;
 * we read from `custom_api_compare` so the website matches what the bot
 * is posting in Discord.
 *
 * Each row in `custom_api_compare` already exposes:
 *   sport, home_team, away_team, best_home_odds, best_home_book,
 *   best_away_odds, best_away_book, profit_percentage, is_arbitrage,
 *   raw_data (JSON: full per-book breakdown), fetched_at
 *
 * We expose the website-facing shape used by `DashboardClient.tsx` so
 * existing UI code keeps working.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sport = (searchParams.get('sport') || '').trim();
  const minProfit = parseFloat(searchParams.get('min_profit') || '0');
  const limit = Math.min(
    Math.max(1, parseInt(searchParams.get('limit') || '20', 10)),
    100,
  );

  const params: any[] = [minProfit, limit];
  let sportFilter = '';
  if (sport) {
    params.push(sport);
    sportFilter = `AND UPPER(sport) = UPPER($${params.length})`;
  }

  // Only consider rows from the most recent scheduler cycle. The bot's
  // `custom_api_scheduler.js` runs every 30 minutes (1800s, configured in
  // unified_server.js), so we use a 35-minute window to ensure we always
  // catch the latest cycle plus a small jitter buffer. Going tighter than
  // the scheduler period would leave the dashboard empty for most of each
  // 30-minute cycle.
  const result = await query(
    `SELECT id, sport, home_team, away_team,
            best_home_odds, best_home_book,
            best_away_odds, best_away_book,
            profit_percentage, implied_total,
            is_arbitrage, raw_data, fetched_at
     FROM custom_api_compare
     WHERE is_arbitrage = TRUE
       AND profit_percentage >= $1
       AND fetched_at > NOW() - INTERVAL '35 minutes'
       ${sportFilter}
     ORDER BY profit_percentage DESC NULLS LAST
     LIMIT $2`,
    params,
  );

  // Map to the website-facing shape used by the dashboard. We mimic the old
  // `arbitrage_opportunities` columns so DashboardClient.tsx can render
  // both sources interchangeably during the cutover.
  const data = result.rows.map((r: any) => {
    const raw = (() => {
      try {
        return typeof r.raw_data === 'string' ? JSON.parse(r.raw_data) : r.raw_data;
      } catch {
        return null;
      }
    })();
    const startTime = raw?.start_time ?? raw?.commence_time ?? null;
    return {
      id: r.id,
      sport: r.sport,
      home_team: r.home_team,
      away_team: r.away_team,
      commence_time: startTime,
      market_type: 'h2h',
      market_name: 'Moneyline',
      side1_bookmaker: r.best_home_book,
      side1_selection: r.home_team,
      side1_odds: r.best_home_odds,
      side1_stake: null,
      side2_bookmaker: r.best_away_book,
      side2_selection: r.away_team,
      side2_odds: r.best_away_odds,
      side2_stake: null,
      profit_percentage: Number(r.profit_percentage),
      guaranteed_profit: null,
      is_us_only: null,
      detected_at: r.fetched_at,
    };
  });

  return NextResponse.json({ data });
}
