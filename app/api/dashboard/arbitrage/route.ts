import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import {
  canUseArbitrage,
  hasUnlimitedArbitrage,
  arbDailyLimitFor,
} from '@/lib/entitlements';
import { arbBucket, isSameBook } from '@/lib/sportsbooks';

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

  const tier = session.user.tier;
  const isAdmin = !!session.user.isAdmin;

  // Free tier has no arbitrage access at all.
  if (!canUseArbitrage(tier, isAdmin)) {
    return NextResponse.json(
      {
        error: 'Arbitrage requires a paid plan',
        detail:
          'The arbitrage finder is available on Basic (1 domestic + 1 international per day), Premium, and VIP.',
        upgradeUrl: '/pricing',
        data: [],
      },
      { status: 403 },
    );
  }

  const unlimited = hasUnlimitedArbitrage(tier, isAdmin);
  const dailyCap = arbDailyLimitFor(tier, isAdmin);

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

  // When the tier is capped (Basic), we must fetch a wider candidate pool so
  // we have enough domestic AND international opportunities to pick from after
  // classification + same-book dedupe. Unlimited tiers use the requested limit.
  const fetchLimit = unlimited ? limit : Math.max(limit, 100);

  const params: any[] = [minProfit, fetchLimit];
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
  //
  // First drop any "same-book" arbitrage. These are duplicate feeds of the
  // SAME underlying sportsbook (e.g. Pinnacle vs Pinnacle (Guest) / pinnacle_v3)
  // and are NOT real arbitrage — they're a data artifact. The Discord bot now
  // filters these too; we filter here for defense-in-depth so stale rows never
  // surface on the website.
  const cleanRows = result.rows.filter(
    (r: any) => !isSameBook(r.best_home_book, r.best_away_book),
  );

  const data = cleanRows.map((r: any) => {
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
      // 'domestic' (US) vs 'international' market bucket, used by the Basic
      // daily cap and surfaced for the UI.
      market: arbBucket(r.best_home_book, r.best_away_book),
      is_us_only: arbBucket(r.best_home_book, r.best_away_book) === 'domestic',
      detected_at: r.fetched_at,
    };
  });

  // Apply the Basic tier's per-day cap: at most 1 domestic + 1 international
  // opportunity. Premium/VIP/admin are unlimited and skip this entirely.
  // Rows arrive sorted by profit DESC, so "take the first N of each bucket"
  // yields the best opportunity in each market.
  let limited = data;
  let capped = false;
  if (!unlimited) {
    const counts = { domestic: 0, international: 0 };
    limited = [];
    for (const row of data) {
      const bucket = row.market as 'domestic' | 'international';
      const cap = bucket === 'international' ? dailyCap.international : dailyCap.domestic;
      if (cap === null) {
        limited.push(row);
        continue;
      }
      if (counts[bucket] < cap) {
        counts[bucket] += 1;
        limited.push(row);
      }
    }
    capped = true;
  } else {
    // Unlimited tiers still honour the caller's requested page size.
    limited = data.slice(0, limit);
  }

  return NextResponse.json({
    data: limited,
    stake_total: stakeTotal,
    tier,
    capped,
    daily_limit: capped ? dailyCap : null,
  });
}
