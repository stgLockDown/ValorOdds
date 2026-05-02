/**
 * Public data access for SEO landing pages.
 *
 * These queries power the programmatic /sports/[sport] and
 * /sports/[sport]/odds/[market] pages. Unlike the dashboard API routes, these
 * are called from server components that render for anonymous visitors, so:
 *   1. They never leak user-specific data.
 *   2. They go directly to Postgres (no auth round-trip) and are wrapped in
 *      short-lived Next.js cache entries via revalidate so we don't hammer
 *      the DB under search-engine crawl traffic.
 *   3. Failures return empty arrays rather than throwing, so a DB outage
 *      still renders a crawlable page shell.
 */

import { query } from '@/lib/db';
import { unstable_cache } from 'next/cache';

export type UpcomingGame = {
  gameId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string; // ISO
};

export type BestOdds = {
  gameId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  market: string;
  outcomes: {
    name: string;
    price: number;
    point: number | null;
    bookmaker: string;
  }[];
};

/**
 * Upcoming games in the next 7 days for a given sport code (MLB / NFL / etc.).
 * Cached for 5 minutes so crawlers hitting dozens of hubs don't thunder the DB.
 */
export const getUpcomingGamesBySport = unstable_cache(
  async (sportCode: string, limit = 40): Promise<UpcomingGame[]> => {
    try {
      const r = await query(
        `SELECT DISTINCT game_id, sport, home_team, away_team, commence_time
         FROM odds_snapshots
         WHERE UPPER(sport) = UPPER($1)
           AND commence_time > NOW()
           AND commence_time < NOW() + INTERVAL '7 days'
         ORDER BY commence_time ASC
         LIMIT $2`,
        [sportCode, limit],
      );
      return r.rows.map((row: any) => ({
        gameId: row.game_id,
        sport: row.sport,
        homeTeam: row.home_team,
        awayTeam: row.away_team,
        commenceTime: new Date(row.commence_time).toISOString(),
      }));
    } catch {
      return [];
    }
  },
  ['public:upcoming-games'],
  { revalidate: 300, tags: ['public-odds'] },
);

/**
 * Best-priced outcome across sportsbooks for each upcoming game in the given
 * sport + market. Used on /sports/[sport]/odds/[market] pages.
 * Cached for 2 minutes — fresh enough for SEO, light on the DB.
 */
export const getBestOddsBySportMarket = unstable_cache(
  async (sportCode: string, marketType: string, limit = 25): Promise<BestOdds[]> => {
    try {
      // Join trick: per (game, outcome_name), take the row with the best price.
      // Postgres-specific DISTINCT ON keeps this cheap.
      const r = await query(
        `SELECT DISTINCT ON (game_id, outcome_name)
           game_id, sport, home_team, away_team, commence_time,
           bookmaker_key, bookmaker_name, market_type,
           outcome_name, outcome_price, outcome_point
         FROM odds_snapshots
         WHERE UPPER(sport) = UPPER($1)
           AND market_type = $2
           AND commence_time > NOW()
           AND commence_time < NOW() + INTERVAL '7 days'
         ORDER BY game_id, outcome_name, outcome_price DESC, snapshot_time DESC
         LIMIT $3`,
        [sportCode, marketType, limit * 4],
      );
      const byGame: Record<string, BestOdds> = {};
      for (const row of r.rows as any[]) {
        const id = row.game_id;
        if (!byGame[id]) {
          byGame[id] = {
            gameId: id,
            sport: row.sport,
            homeTeam: row.home_team,
            awayTeam: row.away_team,
            commenceTime: new Date(row.commence_time).toISOString(),
            market: row.market_type,
            outcomes: [],
          };
        }
        byGame[id].outcomes.push({
          name: row.outcome_name,
          price: Number(row.outcome_price),
          point: row.outcome_point != null ? Number(row.outcome_point) : null,
          bookmaker: row.bookmaker_name || row.bookmaker_key,
        });
      }
      return Object.values(byGame).slice(0, limit);
    } catch {
      return [];
    }
  },
  ['public:best-odds-by-market'],
  { revalidate: 120, tags: ['public-odds'] },
);

/**
 * Count of recent arbitrage opportunities surfaced in the last 24h, by sport.
 * Used to decorate sport-hub pages with a dynamic value-prop headline like
 * "37 arbitrage opportunities surfaced in MLB today".
 */
export const getArbStatsBySport = unstable_cache(
  async (sportCode: string): Promise<{ last24h: number; avgEdgePct: number | null }> => {
    try {
      const r = await query(
        `SELECT COUNT(*)::int AS c, AVG(edge_pct) AS avg
         FROM arbitrage_opportunities
         WHERE UPPER(sport) = UPPER($1)
           AND detected_at > NOW() - INTERVAL '24 hours'`,
        [sportCode],
      );
      const row = r.rows[0] || { c: 0, avg: null };
      return { last24h: row.c || 0, avgEdgePct: row.avg != null ? Number(row.avg) : null };
    } catch {
      return { last24h: 0, avgEdgePct: null };
    }
  },
  ['public:arb-stats'],
  { revalidate: 300, tags: ['public-odds'] },
);

/** Convert American odds to an implied probability, for display. */
export function impliedProb(american: number): number {
  if (american >= 0) return 100 / (american + 100);
  return -american / (-american + 100);
}

/** Pretty-print American odds with explicit sign. */
export function fmtAmerican(price: number | null | undefined): string {
  if (price == null || !Number.isFinite(price)) return '—';
  return price > 0 ? `+${Math.round(price)}` : `${Math.round(price)}`;
}