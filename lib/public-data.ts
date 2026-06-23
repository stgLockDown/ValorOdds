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
import { sportFilterClause } from '@/lib/sport-filter';

/**
 * Sport filter logic lives in `@/lib/sport-filter` so authenticated
 * dashboard routes share the same vocabulary as these public SEO
 * queries. See that module for the per-sport `sport_key` patterns.
 */

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
      const filter = sportFilterClause(sportCode, 1);
      if (!filter) return [];
      const r = await query(
        `SELECT DISTINCT game_id, sport, home_team, away_team, commence_time
         FROM odds_snapshots
         WHERE ${filter.clause}
           AND commence_time > NOW()
           AND commence_time < NOW() + INTERVAL '7 days'
         ORDER BY commence_time ASC
         LIMIT $${filter.params.length + 1}`,
        [...filter.params, limit],
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
      const filter = sportFilterClause(sportCode, 1);
      if (!filter) return [];
      const marketParamIdx = filter.params.length + 1;
      const limitParamIdx = marketParamIdx + 1;
      // Join trick: per (game, outcome_name), take the row with the best price.
      // Postgres-specific DISTINCT ON keeps this cheap.
      const r = await query(
        `SELECT DISTINCT ON (game_id, outcome_name)
           game_id, sport, home_team, away_team, commence_time,
           bookmaker_key, bookmaker_name, market_type,
           outcome_name, outcome_price, outcome_point
         FROM odds_snapshots
         WHERE ${filter.clause}
           AND market_type = $${marketParamIdx}
           AND commence_time > NOW()
           AND commence_time < NOW() + INTERVAL '7 days'
         ORDER BY game_id, outcome_name, outcome_price DESC, snapshot_time DESC
         LIMIT $${limitParamIdx}`,
        [...filter.params, marketType, limit * 4],
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
      const filter = sportFilterClause(sportCode, 1);
      if (!filter) return { last24h: 0, avgEdgePct: null };
      const r = await query(
        `SELECT COUNT(*)::int AS c, AVG(edge_pct) AS avg
         FROM arbitrage_opportunities
         WHERE ${filter.clause}
           AND detected_at > NOW() - INTERVAL '24 hours'`,
        filter.params,
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

/**
 * A single upcoming game by id (scoped to a sport for safety + cache key).
 * Returns the matchup plus the best moneyline prices, for the per-game page.
 */
export const getGameById = unstable_cache(
  async (
    sportCode: string,
    gameId: string,
  ): Promise<
    | (UpcomingGame & {
        bestMoneyline: { name: string; price: number; bookmaker: string }[];
      })
    | null
  > => {
    try {
      const filter = sportFilterClause(sportCode, 1);
      if (!filter) return null;
      const gameParamIdx = filter.params.length + 1;
      const r = await query(
        `SELECT DISTINCT ON (outcome_name)
           game_id, sport, home_team, away_team, commence_time,
           bookmaker_name, bookmaker_key, outcome_name, outcome_price
         FROM odds_snapshots
         WHERE ${filter.clause}
           AND game_id = $${gameParamIdx}
           AND market_type = 'h2h'
         ORDER BY outcome_name, outcome_price DESC, snapshot_time DESC
         LIMIT 12`,
        [...filter.params, gameId],
      );
      if (r.rows.length === 0) return null;
      const first = r.rows[0] as any;
      return {
        gameId: first.game_id,
        sport: first.sport,
        homeTeam: first.home_team,
        awayTeam: first.away_team,
        commenceTime: new Date(first.commence_time).toISOString(),
        bestMoneyline: (r.rows as any[]).map((row) => ({
          name: row.outcome_name,
          price: Number(row.outcome_price),
          bookmaker: row.bookmaker_name || row.bookmaker_key,
        })),
      };
    } catch {
      return null;
    }
  },
  ['public:game-by-id'],
  { revalidate: 120, tags: ['public-odds'] },
);

/**
 * All upcoming games across every supported sport, flattened, for the
 * secondary games sitemap. Capped per sport to keep the sitemap well under
 * the 50k-URL limit while still surfacing the full upcoming slate.
 */
export const getAllUpcomingGames = unstable_cache(
  async (
    sportCodes: string[],
    perSport = 60,
  ): Promise<(UpcomingGame & { slug: string })[]> => {
    const out: (UpcomingGame & { slug: string })[] = [];
    for (const code of sportCodes) {
      try {
        const games = await getUpcomingGamesBySport(code, perSport);
        for (const g of games) {
          out.push({ ...g, slug: code.toLowerCase() });
        }
      } catch {
        // skip this sport on error
      }
    }
    return out;
  },
  ['public:all-upcoming-games'],
  { revalidate: 600, tags: ['public-odds'] },
);

/**
 * Distinct teams seen in upcoming games for a sport, for per-team hub pages
 * and the teams sitemap. Returns team display names.
 */
export const getTeamsBySport = unstable_cache(
  async (sportCode: string): Promise<string[]> => {
    try {
      const filter = sportFilterClause(sportCode, 1);
      if (!filter) return [];
      const r = await query(
        `SELECT DISTINCT team FROM (
           SELECT home_team AS team FROM odds_snapshots
            WHERE ${filter.clause} AND commence_time > NOW() - INTERVAL '2 days'
           UNION
           SELECT away_team AS team FROM odds_snapshots
            WHERE ${filter.clause} AND commence_time > NOW() - INTERVAL '2 days'
         ) t
         WHERE team IS NOT NULL AND team <> ''
         ORDER BY team ASC
         LIMIT 200`,
        [...filter.params, ...filter.params],
      );
      return (r.rows as any[]).map((row) => row.team).filter(Boolean);
    } catch {
      return [];
    }
  },
  ['public:teams-by-sport'],
  { revalidate: 3600, tags: ['public-odds'] },
);

/** Upcoming games for a single team (home or away), for the team hub page. */
export const getGamesByTeam = unstable_cache(
  async (sportCode: string, teamName: string, limit = 20): Promise<UpcomingGame[]> => {
    try {
      const filter = sportFilterClause(sportCode, 1);
      if (!filter) return [];
      const teamIdx = filter.params.length + 1;
      const limitIdx = teamIdx + 1;
      const r = await query(
        `SELECT DISTINCT game_id, sport, home_team, away_team, commence_time
         FROM odds_snapshots
         WHERE ${filter.clause}
           AND (home_team = $${teamIdx} OR away_team = $${teamIdx})
           AND commence_time > NOW()
           AND commence_time < NOW() + INTERVAL '14 days'
         ORDER BY commence_time ASC
         LIMIT $${limitIdx}`,
        [...filter.params, teamName, limit],
      );
      return (r.rows as any[]).map((row) => ({
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
  ['public:games-by-team'],
  { revalidate: 600, tags: ['public-odds'] },
);

/** URL-safe slug for a team name (reversible enough for matching). */
export function teamSlug(name: string): string {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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