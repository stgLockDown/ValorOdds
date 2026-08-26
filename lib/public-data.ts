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
import { isSameBook, formatBookmakerName } from '@/lib/sportsbooks';
import { normalizeTeam, isDerivativeMarket, matchupSignature } from '@/lib/espn-scores';

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
      // Some sports are double-fed by two upstream providers that mint
      // different `game_id`s for the exact same real-world matchup (QA
      // audit: "Duplicate game listing" — the same MLB game appeared twice
      // in the upcoming list). We can't de-duplicate by `game_id` alone, so
      // we pull book-coverage counts per game and collapse by normalized
      // matchup signature (teams + kickoff time) below, keeping whichever
      // game_id has the richer bookmaker coverage. Over-fetch a generous
      // multiple of `limit` so de-duping doesn't leave us short.
      const r = await query(
        `SELECT game_id, sport, home_team, away_team, commence_time,
                COUNT(DISTINCT bookmaker_key)::int AS n_books
         FROM odds_snapshots
         WHERE ${filter.clause}
           AND commence_time > NOW()
           AND commence_time < NOW() + INTERVAL '7 days'
         GROUP BY game_id, sport, home_team, away_team, commence_time
         ORDER BY commence_time ASC
         LIMIT $${filter.params.length + 1}`,
        [...filter.params, Math.max(limit * 4, 100)],
      );

      const bySignature = new Map<string, any>();
      for (const row of r.rows as any[]) {
        if (isDerivativeMarket(row.home_team, row.away_team)) continue;
        const sig = matchupSignature(row.home_team, row.away_team, row.commence_time);
        if (!sig) continue;
        const existing = bySignature.get(sig);
        if (!existing || row.n_books > existing.n_books) {
          bySignature.set(sig, row);
        }
      }

      return Array.from(bySignature.values())
        .sort(
          (a, b) =>
            new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime(),
        )
        .slice(0, limit)
        .map((row: any) => ({
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
           AND outcome_price != 0
           AND ABS(outcome_price) <= ${MAX_VALID_AMERICAN_ODDS}
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
          bookmaker: formatBookmakerName(row.bookmaker_key, row.bookmaker_name),
        });
      }

      // Some sports are double-fed by two upstream providers that mint
      // different game_ids for the same real-world matchup, which without
      // this collapse would render as two duplicate rows on the odds/market
      // pages (QA audit: "Duplicate game listing"). Collapse by normalized
      // matchup signature, keeping whichever game_id surfaced more outcome
      // rows (i.e. richer bookmaker coverage).
      const bySignature = new Map<string, BestOdds>();
      for (const game of Object.values(byGame)) {
        if (isDerivativeMarket(game.homeTeam, game.awayTeam)) continue;
        const sig = matchupSignature(game.homeTeam, game.awayTeam, game.commenceTime);
        if (!sig) continue;
        const existing = bySignature.get(sig);
        if (!existing || game.outcomes.length > existing.outcomes.length) {
          bySignature.set(sig, game);
        }
      }

      return Array.from(bySignature.values()).slice(0, limit);
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
           AND outcome_price != 0
           AND ABS(outcome_price) <= ${MAX_VALID_AMERICAN_ODDS}
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
          bookmaker: formatBookmakerName(row.bookmaker_key, row.bookmaker_name),
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

/**
 * Widest realistic bound for an American odds price. Real sportsbook prices
 * essentially never exceed this range; values outside it are placeholder/
 * bogus feed data (e.g. a prediction-market source writing "+199900" or
 * "-200000" instead of a real spread price) rather than a genuine quote
 * (QA audit: "Invalid odds values on Moneyline page").
 */
export const MAX_VALID_AMERICAN_ODDS = 100000;

/** True when a raw price value looks like a plausible American odds price. */
export function isValidAmericanOdds(price: number | null | undefined): boolean {
  if (price == null || !Number.isFinite(price)) return false;
  // A real American moneyline/spread price is never exactly 0 (there is no
  // such thing as "even money at zero" in this notation — that would be
  // +100/-100), and never wildly outside a realistic range.
  if (price === 0) return false;
  if (Math.abs(price) > MAX_VALID_AMERICAN_ODDS) return false;
  return true;
}

/**
 * Pretty-print American odds with explicit sign. Returns "Odds unavailable"
 * for missing, zero, or out-of-range values instead of a raw "0" or an
 * implausible price like "+199900" (QA audit: "Invalid odds values on
 * Moneyline page" — obviously-wrong numbers destroy user trust and could
 * mislead someone doing arbitrage math).
 */
export function fmtAmerican(price: number | null | undefined): string {
  if (!isValidAmericanOdds(price)) return 'Odds unavailable';
  return price! > 0 ? `+${Math.round(price!)}` : `${Math.round(price!)}`;
}

// ---------------------------------------------------------------------------
// LIVE MARKET INTELLIGENCE — public data for /market-intelligence page
//
// Design principles:
//   1. Aggregate counts are always safe (they prove scale without revealing plays).
//   2. Injury reports, news, and weather are public-domain data — freely showable.
//   3. Arbitrage and steam-move feeds are MASKED: we show the sport, the edge
//      percentage, and the market type, but NEVER the team names or specific
//      bookmaker prices. The actionable detail (which game, which books, which
//      side to bet) stays behind the signup wall. Teasers drive conversion.
//   4. Sportsbook rankings are aggregated performance metrics — they demonstrate
//      the depth of our data infrastructure without exposing individual plays.
//   5. All queries are cached (120–600s) and fail gracefully to empty results.
// ---------------------------------------------------------------------------

export type LiveMarketStats = {
  liveArbCount: number;
  arbSports: string[];
  steamMoves24h: number;
  steamMoveSports: string[];
  injuries24h: number;
  booksTracked: number;
  gamesToday: number;
  newsToday: number;
  weatherAlerts: number;
  lastUpdated: string;
};

/**
 * Aggregate live-market statistics for the public intelligence hero.
 * Shows scale ("86 live arbitrage opportunities across 2 sports right now")
 * without revealing any specific play.
 */
export const getLiveMarketStats = unstable_cache(
  async (): Promise<LiveMarketStats> => {
    try {
      const [arbRes, steamRes, injuryRes, bookRes, gameRes, newsRes, weatherRes] =
        await Promise.all([
          query(
            `SELECT sport, COUNT(*)::int AS c
             FROM custom_api_compare
             WHERE is_arbitrage = TRUE AND fetched_at > NOW() - INTERVAL '1 hour'
             GROUP BY sport ORDER BY c DESC`,
          ),
          query(
            `SELECT sport, COUNT(*)::int AS c
             FROM steam_moves
             WHERE detected_at > NOW() - INTERVAL '24 hours'
             GROUP BY sport ORDER BY c DESC`,
          ),
          query(
            `SELECT COUNT(*)::int AS c FROM injuries WHERE fetched_at > NOW() - INTERVAL '24 hours'`,
          ),
          // NOTE: previously counted from the `bookmakers` table filtered by
          // `last_seen > NOW() - INTERVAL '7 days'`, but that table is a
          // slow-moving reference list that stopped being updated, so the
          // freshness filter always matched 0 rows (QA audit: "'0
          // sportsbooks' stat contradicts the table below it"). Count
          // distinct bookmakers actually reporting odds recently instead,
          // which matches the sportsbook rankings table shown on the same
          // page.
          query(
            `SELECT COUNT(DISTINCT bookmaker_key)::int AS c
             FROM odds_snapshots
             WHERE snapshot_time > NOW() - INTERVAL '7 days'`,
          ),
          query(
            `SELECT COUNT(DISTINCT game_id)::int AS c
             FROM odds_snapshots
             WHERE commence_time > NOW() AND commence_time < NOW() + INTERVAL '24 hours'`,
          ),
          query(
            `SELECT COUNT(*)::int AS c FROM news WHERE published_at > NOW() - INTERVAL '24 hours'`,
          ),
          query(
            `SELECT COUNT(*)::int AS c FROM weather_alerts WHERE fetched_at > NOW() - INTERVAL '6 hours'`,
          ),
        ]);

      return {
        liveArbCount: (arbRes.rows as any[]).reduce((s, r) => s + r.c, 0),
        arbSports: (arbRes.rows as any[]).map((r) => r.sport),
        steamMoves24h: (steamRes.rows as any[]).reduce((s, r) => s + r.c, 0),
        steamMoveSports: (steamRes.rows as any[]).map((r) => r.sport),
        injuries24h: (injuryRes.rows[0] as any)?.c || 0,
        booksTracked: (bookRes.rows[0] as any)?.c || 0,
        gamesToday: (gameRes.rows[0] as any)?.c || 0,
        newsToday: (newsRes.rows[0] as any)?.c || 0,
        weatherAlerts: (weatherRes.rows[0] as any)?.c || 0,
        lastUpdated: new Date().toISOString(),
      };
    } catch {
      return {
        liveArbCount: 0,
        arbSports: [],
        steamMoves24h: 0,
        steamMoveSports: [],
        injuries24h: 0,
        booksTracked: 0,
        gamesToday: 0,
        newsToday: 0,
        weatherAlerts: 0,
        lastUpdated: new Date().toISOString(),
      };
    }
  },
  ['public:live-market-stats'],
  { revalidate: 120, tags: ['public-odds'] },
);

export type ArbitrageTeaser = {
  sport: string;
  market: string;
  edgePct: number;
  detectedMinutesAgo: number;
};

/**
 * Masked arbitrage teasers — shows sport, market type, and edge percentage only.
 * Team names, bookmaker names, and specific odds are deliberately omitted.
 * The teaser proves "there's a 14.98% edge in soccer right now" without
 * revealing which match or which books — that's the signup incentive.
 */
export const getArbitrageTeasers = unstable_cache(
  async (limit = 8): Promise<ArbitrageTeaser[]> => {
    try {
      const r = await query(
        `SELECT sport, profit_percentage,
                EXTRACT(EPOCH FROM (NOW() - fetched_at))::int AS secs_ago
         FROM custom_api_compare
         WHERE is_arbitrage = TRUE AND fetched_at > NOW() - INTERVAL '1 hour'
         ORDER BY profit_percentage DESC
         LIMIT $1`,
        [limit],
      );
      return (r.rows as any[]).map((row) => ({
        sport: row.sport,
        market: 'Moneyline',
        edgePct: Number(row.profit_percentage),
        detectedMinutesAgo: Math.floor((row.secs_ago || 0) / 60),
      }));
    } catch {
      return [];
    }
  },
  ['public:arb-teasers'],
  { revalidate: 120, tags: ['public-odds'] },
);

export type SteamMoveTeaser = {
  sport: string;
  homeTeam: string;
  awayTeam: string;
  marketType: string;
  outcomeName: string;
  direction: 'UP' | 'DOWN';
  booksMoved: number;
  totalBooks: number;
  moveMagnitude: number;
  detectedMinutesAgo: number;
};

/**
 * Sanitized steam-move feed. We show the teams, market, direction, and how
 * many books moved — this is "market consensus" data that demonstrates our
 * sharp-money detection without revealing the before/after prices that would
 * let someone replicate the play. The magnitude is shown as a delta (points
 * moved) rather than absolute odds, so the viewer sees "the line moved 50
 * points across 56 books" but can't tell where it moved from/to.
 */
export const getSteamMoveTeasers = unstable_cache(
  async (limit = 15): Promise<SteamMoveTeaser[]> => {
    try {
      const r = await query(
        `SELECT sport, home_team, away_team, market_type, outcome_name,
                before_avg_price, after_avg_price, books_moved, total_books,
                direction,
                EXTRACT(EPOCH FROM (NOW() - detected_at))::int AS secs_ago
         FROM steam_moves
         WHERE detected_at > NOW() - INTERVAL '6 hours'
           AND books_moved >= 5
         ORDER BY detected_at DESC
         LIMIT $1`,
        [limit],
      );
      return (r.rows as any[]).map((row) => ({
        sport: row.sport,
        homeTeam: row.home_team,
        awayTeam: row.away_team,
        marketType: row.market_type,
        outcomeName: row.outcome_name,
        direction: row.direction === 'UP' ? 'UP' : 'DOWN',
        booksMoved: row.books_moved,
        totalBooks: row.total_books,
        moveMagnitude: Math.round(Math.abs(Number(row.after_avg_price) - Number(row.before_avg_price))),
        detectedMinutesAgo: Math.floor((row.secs_ago || 0) / 60),
      }));
    } catch {
      return [];
    }
  },
  ['public:steam-teasers'],
  { revalidate: 120, tags: ['public-odds'] },
);

export type InjuryReport = {
  sport: string;
  playerName: string;
  team: string;
  position: string;
  status: string;
  injuryType: string;
  reportedDate: string;
};

/**
 * Public injury report feed. This data is sourced from the same public feeds
 * that ESPN, CBS, and Rotowire publish — there's no proprietary edge in
 * showing it publicly. It demonstrates our real-time data ingestion.
 */
export const getInjuryFeed = unstable_cache(
  async (sport?: string, limit = 20): Promise<InjuryReport[]> => {
    try {
      const params: any[] = [limit];
      let sportClause = '';
      if (sport) {
        sportClause = `AND UPPER(sport) = UPPER($2)`;
        params.push(sport);
      }
      const r = await query(
        `SELECT DISTINCT ON (sport, player_name, team)
           sport, player_name, team, position, status, injury_type, reported_date
         FROM injuries
         WHERE fetched_at > NOW() - INTERVAL '48 hours'
           ${sportClause}
         ORDER BY sport, player_name, team, fetched_at DESC
         LIMIT $1`,
        params,
      );
      return (r.rows as any[]).map((row) => ({
        sport: row.sport,
        playerName: row.player_name,
        team: row.team,
        position: row.position,
        status: row.status,
        injuryType: row.injury_type,
        reportedDate: row.reported_date
          ? new Date(row.reported_date).toISOString().slice(0, 10)
          : '',
      }));
    } catch {
      return [];
    }
  },
  ['public:injury-feed'],
  { revalidate: 300, tags: ['public-odds'] },
);

export type SportsbookRanking = {
  bookmakerName: string;
  rankPosition: number;
  linesTracked: number;
  arbAppearances: number;
  avgHoldPercent: number | null;
  lineFreshnessScore: number | null;
  bestMarketCount: number;
  weekStarting: string;
};

/**
 * Sportsbook performance rankings from our aggregated review data.
 * Shows which books we track most actively and their relative performance.
 * This demonstrates data depth without exposing individual plays.
 */
export const getSportsbookRankings = unstable_cache(
  async (limit = 15): Promise<SportsbookRanking[]> => {
    try {
      const r = await query(
        `SELECT DISTINCT ON (bookmaker_key)
           bookmaker_key, bookmaker_name, rank_position, lines_tracked, arb_appearances,
           avg_hold_percent, line_freshness_score, best_market_count, week_starting
         FROM sportsbook_reviews
         ORDER BY bookmaker_key, created_at DESC
         LIMIT $1`,
        [limit],
      );
      return (r.rows as any[])
        .filter((row) => row.bookmaker_name || row.bookmaker_key)
        .sort((a, b) => (a.rank_position || 999) - (b.rank_position || 999))
        .map((row) => ({
          bookmakerName: formatBookmakerName(row.bookmaker_key, row.bookmaker_name),
          rankPosition: row.rank_position || 0,
          linesTracked: row.lines_tracked || 0,
          arbAppearances: row.arb_appearances || 0,
          avgHoldPercent: row.avg_hold_percent != null ? Number(row.avg_hold_percent) : null,
          lineFreshnessScore: row.line_freshness_score != null ? Number(row.line_freshness_score) : null,
          bestMarketCount: row.best_market_count || 0,
          weekStarting: row.week_starting
            ? new Date(row.week_starting).toISOString().slice(0, 10)
            : '',
        }));
    } catch {
      return [];
    }
  },
  ['public:sportsbook-rankings'],
  { revalidate: 600, tags: ['public-odds'] },
);

export type WeatherAlert = {
  stadium: string;
  city: string;
  temperature: number;
  conditions: string;
  windSpeed: number;
  windGust: number | null;
  precipitation: number;
  impact: string;
  fetchedMinutesAgo: number;
};

/**
 * Stadium weather alerts — public data from weather APIs. Shows which venues
 * have weather conditions that may impact games. Demonstrates our contextual
 * data layer.
 */
export const getWeatherAlerts = unstable_cache(
  async (limit = 10): Promise<WeatherAlert[]> => {
    try {
      const r = await query(
        `SELECT DISTINCT ON (stadium)
           stadium, city, temperature, conditions, wind_speed, wind_gust,
           precipitation, impact,
           EXTRACT(EPOCH FROM (NOW() - fetched_at))::int AS secs_ago
         FROM weather_alerts
         WHERE fetched_at > NOW() - INTERVAL '6 hours'
         ORDER BY stadium, fetched_at DESC
         LIMIT $1`,
        [limit],
      );
      return (r.rows as any[]).map((row) => ({
        stadium: row.stadium,
        city: row.city,
        temperature: Number(row.temperature),
        conditions: row.conditions,
        windSpeed: Number(row.wind_speed),
        windGust: row.wind_gust != null ? Number(row.wind_gust) : null,
        precipitation: Number(row.precipitation),
        impact: row.impact || 'LOW',
        fetchedMinutesAgo: Math.floor((row.secs_ago || 0) / 60),
      }));
    } catch {
      return [];
    }
  },
  ['public:weather-alerts'],
  { revalidate: 300, tags: ['public-odds'] },
);

export type NewsItem = {
  sport: string;
  headline: string;
  source: string;
  publishedAt: string;
  url: string;
  imageUrl: string | null;
};

/**
 * Live sports news feed — sourced from the same public RSS feeds as ESPN.
 * Showing headlines publicly is standard practice (it's aggregated public
 * content) and keeps the intelligence page fresh and SEO-relevant.
 */
export const getLiveNewsFeed = unstable_cache(
  async (sport?: string, limit = 15): Promise<NewsItem[]> => {
    try {
      const params: any[] = [limit];
      let sportClause = '';
      if (sport) {
        sportClause = `AND UPPER(sport) = UPPER($2)`;
        params.push(sport);
      }
      const r = await query(
        `SELECT DISTINCT ON (headline)
           sport, headline, source, published_at, url, image_url
         FROM news
         WHERE published_at > NOW() - INTERVAL '12 hours'
           ${sportClause}
         ORDER BY headline, published_at DESC
         LIMIT $1`,
        params,
      );
      return (r.rows as any[]).map((row) => ({
        sport: row.sport,
        headline: row.headline,
        source: row.source,
        publishedAt: row.published_at
          ? new Date(row.published_at).toISOString()
          : '',
        url: row.url || '',
        imageUrl: row.image_url || null,
      }));
    } catch {
      return [];
    }
  },
  ['public:news-feed'],
  { revalidate: 300, tags: ['public-odds'] },
);
export type TopOpportunity = {
  sport: string;
  sportLabel: string;
  sportEmoji: string;
  homeTeam: string;
  awayTeam: string;
  match: string;
  profitPct: number;
  bestHomeOdds: number;
  bestHomeBook: string;
  bestAwayOdds: number;
  bestAwayBook: string;
  commenceTime: string | null;
  detectedMinutesAgo: number;
  freshness: 'LIVE' | 'RECENT' | 'STALE';
};

/**
 * Maps a raw sport string (which can be uppercase codes like "SOCCER",
 * lowercase like "mlb", or display names like "Soccer") to a short label
 * suitable for badge display.
 */
function mapSportLabel(sport: string): string {
  const s = (sport || '').toUpperCase().replace(/_/g, ' ').trim();
  const map: Record<string, string> = {
    'AMERICAN FOOTBALL': 'NFL',
    BASKETBALL: 'NBA',
    BASEBALL: 'MLB',
    MLB: 'MLB',
    'ICE HOCKEY': 'NHL',
    NHL: 'NHL',
    SOCCER: 'Soccer',
    MMA: 'MMA',
    BOXING: 'Boxing',
    TENNIS: 'Tennis',
    GOLF: 'Golf',
    NASCAR: 'NASCAR',
    'RUGBY LEAGUE': 'Rugby',
    'RUGBY UNION': 'Rugby',
    CRICKET: 'Cricket',
    DARTS: 'Darts',
    'AUSSIE RULES': 'AFL',
    HANDBALL: 'Handball',
    VOLLEYBALL: 'Volleyball',
    'TABLE TENNIS': 'Table Tennis',
    ESPORTS: 'Esports',
  };
  return map[s] ?? s;
}

/**
 * Emoji for a given sport string (flexible — handles both "mlb" and "BASEBALL").
 */
function mapSportEmoji(sport: string): string {
  const s = (sport || '').toUpperCase().replace(/_/g, ' ').trim();
  const map: Record<string, string> = {
    'AMERICAN FOOTBALL': '🏈',
    NFL: '🏈',
    BASKETBALL: '🏀',
    NBA: '🏀',
    BASEBALL: '⚾',
    MLB: '⚾',
    'ICE HOCKEY': '🏒',
    NHL: '🏒',
    SOCCER: '⚽',
    MMA: '🥊',
    BOXING: '🥊',
    TENNIS: '🎾',
    GOLF: '⛳',
    NASCAR: '🏁',
    'RUGBY LEAGUE': '🏉',
    'RUGBY UNION': '🏉',
    CRICKET: '🏏',
  };
  return map[s] ?? '🏆';
}

/**
 * Top real arbitrage opportunities from the last 24 hours.
 *
 * Data source: `custom_api_compare` (same table the Discord bot uses and the
 * same table the authenticated dashboard reads from). We:
 *   1. Dedupe by matchup (home_team + away_team), keeping the best profit %.
 *   2. Filter out "same-book" arbs (duplicate feeds of the same sportsbook).
 *   3. Filter out simulated/esports teams with parenthetical suffixes like
 *      "Team (username)" which come from gaming simulation leagues, not real
 *      sportsbooks tracking real games.
 *   4. Sort by profit % descending and return the top N.
 *
 * Unlike the masked `getArbitrageTeasers`, this function exposes team names,
 * bookmaker names, and exact odds — the homepage already shows this level of
 * detail (it was previously hardcoded) and it serves as a powerful
 * conversion incentive for visitors to sign up and get the full dashboard.
 *
 * Cached for 5 minutes so crawlers and visitors don't hammer the DB.
 */
export const getTopOpportunities = unstable_cache(
  async (limit = 6): Promise<TopOpportunity[]> => {
    try {
      // We use a subquery so that:
      //   1. Simulated/esports teams (with parenthetical suffixes like
      //      "Arsenal (flamez)") are filtered out IN SQL, not in JS — this
      //      ensures the candidate pool is all real teams.
      //   2. DISTINCT ON (home_team, away_team) keeps the best profit % per
      //      matchup (it requires ORDER BY to start with those columns).
      //   3. The OUTER query then sorts by profit DESC and applies the LIMIT,
      //      so we actually get the TOP opportunities — not just the first N
      //      matchups alphabetically (which was the bug that caused the
      //      homepage to show an empty state: the alphabetical-first rows
      //      were almost all simulated teams that got filtered in JS).
      const fetchLimit = Math.max(limit * 4, 24);

      const r = await query(
        `SELECT * FROM (
            SELECT DISTINCT ON (home_team, away_team)
                sport, home_team, away_team,
                best_home_odds, best_home_book,
                best_away_odds, best_away_book,
                profit_percentage, fetched_at,
                raw_data->>'start_time' AS start_time
            FROM custom_api_compare
            WHERE is_arbitrage = TRUE
              AND profit_percentage > 0
              AND fetched_at > NOW() - INTERVAL '24 hours'
              AND home_team !~ '\\([^)]*\\)'
              AND away_team !~ '\\([^)]*\\)'
            ORDER BY home_team, away_team,
                     profit_percentage DESC, fetched_at DESC
          ) t
         ORDER BY profit_percentage DESC
         LIMIT $1`,
        [fetchLimit],
      );

      const rows = r.rows as any[];

      // Same-book filter stays in JS because it relies on normalizeBookName()
      // alias logic that is complex to replicate in pure SQL. With the
      // simulated-team filter now in SQL, this pool is large enough that
      // dropping a few same-book pairs still leaves plenty for the top N.
      const clean = rows.filter(
        (row) => !isSameBook(row.best_home_book, row.best_away_book),
      );

      // Already sorted by profit DESC by the outer query; just slice.
      const top = clean.slice(0, limit);

      return top.map((row) => {
        const secsAgo = Math.floor(
          (Date.now() - new Date(row.fetched_at).getTime()) / 1000,
        );
        const minsAgo = Math.floor(secsAgo / 60);
        let freshness: 'LIVE' | 'RECENT' | 'STALE' = 'STALE';
        if (minsAgo <= 35) freshness = 'LIVE';
        else if (minsAgo <= 120) freshness = 'RECENT';

        return {
          sport: row.sport,
          sportLabel: mapSportLabel(row.sport),
          sportEmoji: mapSportEmoji(row.sport),
          homeTeam: row.home_team,
          awayTeam: row.away_team,
          match: `${row.home_team} vs ${row.away_team}`,
          profitPct: Number(row.profit_percentage),
          bestHomeOdds: Number(row.best_home_odds),
          bestHomeBook: row.best_home_book,
          bestAwayOdds: Number(row.best_away_odds),
          bestAwayBook: row.best_away_book,
          commenceTime: row.start_time ?? null,
          detectedMinutesAgo: minsAgo,
          freshness,
        };
      });
    } catch (err) {
      console.error('[getTopOpportunities] query failed:', err);
      return [];
    }
  },
  ['public:top-opportunities'],
  { revalidate: 300, tags: ['public-odds'] },
);
