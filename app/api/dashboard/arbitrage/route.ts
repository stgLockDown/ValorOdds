import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Convert American odds to decimal odds.
 * Mirrors the Discord bot's `americanToDecimal` in custom_api_scheduler.js
 * so the website's stake math matches what users see in Discord exactly.
 */
function americanToDecimal(odds: number): number {
  const o = Number(odds);
  if (!o || Number.isNaN(o)) return 0;
  return o > 0 ? o / 100 + 1 : 100 / Math.abs(o) + 1;
}

/**
 * Compute the two-sided arbitrage stake plan for a given total bankroll.
 * Identical formula to the Discord bot (custom_api_scheduler.js):
 *   totalInverse = 1/decHome + 1/decAway
 *   homeStake    = (total / decHome) / totalInverse
 *   awayStake    = (total / decAway) / totalInverse
 *   payout       = homeStake * decHome   (== awayStake * decAway)
 *   profit       = payout - total
 * Returns null when odds are unusable (so the UI can hide stakes gracefully).
 */
function computeStakes(homeOdds: number, awayOdds: number, total: number) {
  const decHome = americanToDecimal(homeOdds);
  const decAway = americanToDecimal(awayOdds);
  if (!(decHome > 0) || !(decAway > 0)) return null;

  const totalInverse = 1 / decHome + 1 / decAway;
  if (!(totalInverse > 0)) return null;

  const homeStake = (total / decHome) / totalInverse;
  const awayStake = (total / decAway) / totalInverse;
  const payout = homeStake * decHome;
  const profit = payout - total;

  return {
    side1_stake: Number(homeStake.toFixed(2)),
    side2_stake: Number(awayStake.toFixed(2)),
    payout: Number(payout.toFixed(2)),
    guaranteed_profit: Number(profit.toFixed(2)),
  };
}

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
  // Total bankroll to spread across both sides. Defaults to $100 (same base
  // the Discord bot uses) and is clamped to a sane range. Stakes scale
  // linearly with this value, so the UI can rescale instantly.
  const stakeTotal = Math.min(
    Math.max(1, parseFloat(searchParams.get('stake') || '100') || 100),
    1_000_000,
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
    // Match the Discord bot's stake math so users get identical "how much
    // to bet" guidance on the website. Stakes scale to the requested
    // bankroll (default $100).
    const stakes = computeStakes(
      Number(r.best_home_odds),
      Number(r.best_away_odds),
      stakeTotal,
    );
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
      side1_stake: stakes?.side1_stake ?? null,
      side2_bookmaker: r.best_away_book,
      side2_selection: r.away_team,
      side2_odds: r.best_away_odds,
      side2_stake: stakes?.side2_stake ?? null,
      profit_percentage: Number(r.profit_percentage),
      guaranteed_profit: stakes?.guaranteed_profit ?? null,
      payout: stakes?.payout ?? null,
      stake_total: stakeTotal,
      is_us_only: null,
      detected_at: r.fetched_at,
    };
  });

  return NextResponse.json({ data, stake_total: stakeTotal });
}
