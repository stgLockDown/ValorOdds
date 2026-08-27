/**
 * Games Hub data layer — powers /games/[sport] (card grid) and
 * /games/[sport]/[gameSlug]/[tab] (per-game tabbed detail pages) for both
 * the public marketing site and the logged-in dashboard.
 *
 * Scope: MLB + NFL only (per product decision — these are the two sports
 * with the richest downstream data: ESPN box scores, standings, batter-vs-
 * pitcher matchups, and now (as of this session) live odds for both).
 *
 * Design mirrors lib/public-data.ts: anonymous-safe, cached with
 * unstable_cache where the query is DB-only, fails soft to empty/null
 * rather than throwing so a partial outage never 500s a page.
 */

import { query } from '@/lib/db';
import { unstable_cache } from 'next/cache';
import { sportFilterClause } from '@/lib/sport-filter';
import { normalizeTeam, formatTeamName, buildEspnScoreIndex, SPORT_PATHS, isDerivativeMarket, matchupSignature, type EspnScore } from '@/lib/espn-scores';
import { formatBookmakerName } from '@/lib/sportsbooks';
import { teamSlug, fmtAmerican, impliedProb, isValidAmericanOdds, MAX_VALID_AMERICAN_ODDS } from '@/lib/public-data';
import { teamLogoUrl } from '@/lib/team-logos';
import { fetchGameSummary, type GameSummary } from '@/lib/espn-summary';

const SUPPORTED_SPORTS = new Set(['MLB', 'NFL']);

export function isGamesHubSport(sportCode: string): boolean {
  return SUPPORTED_SPORTS.has((sportCode || '').toUpperCase());
}

// ---------------------------------------------------------------------------
// Slugs — {away-team}-{home-team}-{yyyy-mm-dd}, matching the convention we
// confirmed via competitor research (away team listed first).
// ---------------------------------------------------------------------------

export function dateSlug(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

export function buildGameSlug(awayTeam: string, homeTeam: string, commenceTime: string): string {
  return `${teamSlug(awayTeam)}-${teamSlug(homeTeam)}-${dateSlug(commenceTime)}`;
}

// ---------------------------------------------------------------------------
// Odds snapshot types
// ---------------------------------------------------------------------------

export type MoneylineSide = { team: string; price: number | null; bookmaker: string | null };
export type SpreadSide = { team: string; point: number | null; price: number | null; bookmaker: string | null };
export type TotalSide = { name: 'Over' | 'Under'; point: number | null; price: number | null; bookmaker: string | null };

export type OddsSnapshotRow = {
  bookmakerKey: string;
  bookmakerName: string;
  marketType: 'h2h' | 'spreads' | 'totals';
  outcomeName: string;
  outcomePrice: number;
  outcomePoint: number | null;
};

export type GameCard = {
  gameId: string;
  sport: string;
  slug: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string | null;
  awayLogo: string | null;
  commenceTime: string;
  status: 'scheduled' | 'live' | 'final';
  statusDetail: string | null;
  period: number;
  clock: string | null;
  homeScore: number;
  awayScore: number;
  espnEventId: string | null;
  bestMoneyline: MoneylineSide[];
  bestSpread: SpreadSide[];
  bestTotal: TotalSide[];
  nBooks: number;
};

/**
 * Pull every h2h/spreads/totals row we have for the given upcoming/live
 * games in one query, keyed by game_id. Used internally by getGamesGrid.
 */
async function fetchOddsForGames(
  sportCode: string,
  gameIds: string[],
): Promise<Map<string, OddsSnapshotRow[]>> {
  const out = new Map<string, OddsSnapshotRow[]>();
  if (gameIds.length === 0) return out;
  const filter = sportFilterClause(sportCode, 1);
  if (!filter) return out;
  const idsIdx = filter.params.length + 1;
  try {
    const r = await query(
      `SELECT DISTINCT ON (game_id, market_type, outcome_name, bookmaker_key)
         game_id, bookmaker_key, bookmaker_name, market_type,
         outcome_name, outcome_price, outcome_point
       FROM odds_snapshots
       WHERE ${filter.clause}
         AND game_id = ANY($${idsIdx})
         AND outcome_price != 0
         AND ABS(outcome_price) <= ${MAX_VALID_AMERICAN_ODDS}
       ORDER BY game_id, market_type, outcome_name, bookmaker_key, snapshot_time DESC`,
      [...filter.params, gameIds],
    );
    for (const row of r.rows as any[]) {
      const list = out.get(row.game_id) || [];
      list.push({
        bookmakerKey: row.bookmaker_key,
        bookmakerName: formatBookmakerName(row.bookmaker_key, row.bookmaker_name),
        marketType: row.market_type,
        outcomeName: row.outcome_name,
        outcomePrice: Number(row.outcome_price),
        outcomePoint: row.outcome_point != null ? Number(row.outcome_point) : null,
      });
      out.set(row.game_id, list);
    }
  } catch {
    // swallow — caller renders without odds
  }
  return out;
}

function bestMoneylineFromRows(rows: OddsSnapshotRow[], homeTeam: string, awayTeam: string): MoneylineSide[] {
  const h2h = rows.filter((r) => r.marketType === 'h2h');
  const bySide = new Map<string, OddsSnapshotRow>();
  for (const r of h2h) {
    const existing = bySide.get(r.outcomeName);
    if (!existing || r.outcomePrice > existing.outcomePrice) bySide.set(r.outcomeName, r);
  }
  const order = [awayTeam, homeTeam];
  return order.map((team) => {
    const hit = Array.from(bySide.values()).find((r) => normalizeTeam(r.outcomeName) === normalizeTeam(team));
    return hit
      ? { team, price: hit.outcomePrice, bookmaker: hit.bookmakerName }
      : { team, price: null, bookmaker: null };
  });
}

function bestSpreadFromRows(rows: OddsSnapshotRow[], homeTeam: string, awayTeam: string): SpreadSide[] {
  const spreads = rows.filter((r) => r.marketType === 'spreads');
  const order = [awayTeam, homeTeam];
  return order.map((team) => {
    const forTeam = spreads.filter((r) => normalizeTeam(r.outcomeName) === normalizeTeam(team));
    if (forTeam.length === 0) return { team, point: null, price: null, bookmaker: null };
    // Prefer the best (highest) price at the most common point spread.
    const best = forTeam.reduce((a, b) => (b.outcomePrice > a.outcomePrice ? b : a));
    return { team, point: best.outcomePoint, price: best.outcomePrice, bookmaker: best.bookmakerName };
  });
}

function bestTotalFromRows(rows: OddsSnapshotRow[]): TotalSide[] {
  const totals = rows.filter((r) => r.marketType === 'totals');
  const sides: ('Over' | 'Under')[] = ['Over', 'Under'];
  return sides.map((name) => {
    const forSide = totals.filter((r) => r.outcomeName === name);
    if (forSide.length === 0) return { name, point: null, price: null, bookmaker: null };
    const best = forSide.reduce((a, b) => (b.outcomePrice > a.outcomePrice ? b : a));
    return { name, point: best.outcomePoint, price: best.outcomePrice, bookmaker: best.bookmakerName };
  });
}

/**
 * Games grid for a sport — upcoming (next 10 days) + games still live/final
 * from the last 12 hours, enriched with team logos, live ESPN score state,
 * and best-priced moneyline/spread/total across every tracked sportsbook.
 *
 * NOT cached with unstable_cache (unlike lib/public-data.ts helpers)
 * because it blends in the ESPN score index, which is fetched fresh
 * (cache: 'no-store') on every call — the page itself controls freshness
 * via `revalidate`.
 */
export async function getGamesGrid(sportCode: string, limit = 60): Promise<GameCard[]> {
  const code = (sportCode || '').toUpperCase();
  if (!isGamesHubSport(code)) return [];
  const filter = sportFilterClause(code, 1);
  if (!filter) return [];

  let rows: any[] = [];
  try {
    const r = await query(
      `SELECT game_id, sport, home_team, away_team, commence_time,
              COUNT(DISTINCT bookmaker_key)::int AS n_books
       FROM odds_snapshots
       WHERE ${filter.clause}
         AND commence_time > NOW() - INTERVAL '16 hours'
         AND commence_time < NOW() + INTERVAL '10 days'
       GROUP BY game_id, sport, home_team, away_team, commence_time
       ORDER BY commence_time ASC
       LIMIT $${filter.params.length + 1}`,
      [...filter.params, Math.max(limit * 3, 120)],
    );
    rows = r.rows;
  } catch {
    return [];
  }

  // De-dupe by matchup signature (same pattern as getUpcomingGamesBySport),
  // keeping the game_id with richer sportsbook coverage. The signature is
  // time-tolerant (truncated to the hour) so the same game from
  // different feeds with slightly different start times (e.g. 20:07 vs
  // 20:09 vs 20:13) collapses to a single card instead of rendering as
  // duplicates. We also filter out derivative/junk markets ("Home Runs
  // (15 Games)", "Home (Runs)", etc.) that aren't real games.
  const bySignature = new Map<string, any>();
  for (const row of rows) {
    if (isDerivativeMarket(row.home_team, row.away_team)) continue;
    const sig = matchupSignature(row.home_team, row.away_team, row.commence_time);
    if (!sig) continue;
    const existing = bySignature.get(sig);
    if (!existing || row.n_books > existing.n_books) bySignature.set(sig, row);
  }
  const games = Array.from(bySignature.values())
    .sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime())
    .slice(0, limit);

  const [oddsByGame, espnIndex] = await Promise.all([
    fetchOddsForGames(code, games.map((g) => g.game_id)),
    buildEspnScoreIndex([code]).catch(
      () => ({ match: () => null, size: 0 }) as { match: (h: string, a: string) => EspnScore | null; size: number },
    ),
  ]);

  return games.map((row) => {
    const homeTeam = formatTeamName(row.home_team);
    const awayTeam = formatTeamName(row.away_team);
    const espn = espnIndex.match(row.home_team, row.away_team);
    const oddsRows = oddsByGame.get(row.game_id) || [];

    const status: GameCard['status'] = espn?.isLive ? 'live' : espn?.isFinal ? 'final' : 'scheduled';

    return {
      gameId: row.game_id,
      sport: code,
      slug: buildGameSlug(awayTeam, homeTeam, new Date(row.commence_time).toISOString()),
      homeTeam,
      awayTeam,
      homeLogo: teamLogoUrl(code, homeTeam),
      awayLogo: teamLogoUrl(code, awayTeam),
      commenceTime: new Date(row.commence_time).toISOString(),
      status,
      statusDetail: espn?.statusDetail ?? null,
      period: espn?.period ?? 0,
      clock: espn?.clock ?? null,
      homeScore: espn?.homeScore ?? 0,
      awayScore: espn?.awayScore ?? 0,
      espnEventId: espn?.eventId ?? null,
      bestMoneyline: bestMoneylineFromRows(oddsRows, homeTeam, awayTeam),
      bestSpread: bestSpreadFromRows(oddsRows, homeTeam, awayTeam),
      bestTotal: bestTotalFromRows(oddsRows),
      nBooks: row.n_books || 0,
    };
  });
}

/**
 * Resolve a single game by its `{away}-{home}-{yyyy-mm-dd}` slug.
 *
 * Performance-optimized: instead of fetching ALL games in a ±2-day window
 * (up to 600), fetching odds for ALL of them, and building ESPN scores for
 * ALL of them — this queries a narrow date window, finds the matching game
 * by slug, and then enriches ONLY that one game with odds + ESPN scores.
 * This reduces the work from O(hundreds of games) to O(1 game).
 *
 * Wrapped in unstable_cache (30s revalidate) so that the public page's
 * generateMetadata() and page body — which both call this — share one
 * cached result instead of each triggering the full DB + ESPN fetch chain.
 */
export const getGameBySlug = unstable_cache(
  async (sportCode: string, slug: string): Promise<GameCard | null> => {
    const code = (sportCode || '').toUpperCase();
    const decoded = decodeURIComponent(slug || '');

  // --- Primary: direct DB lookup by parsed date + team slug matching ---
  // The slug format is {awaySlug}-{homeSlug}-{yyyy-mm-dd}. We extract the
  // date (last 10 chars), query the DB for candidate games on that date
  // (±1 day for timezone safety — tighter than the old ±2 days), and match
  // by recomputing each candidate's slug. Only the matched game is then
  // enriched with odds + ESPN scores.
  const dateMatch = decoded.match(/(\d{4}-\d{2}-\d{2})$/);
  if (dateMatch && isGamesHubSport(code)) {
    const filter = sportFilterClause(code, 1);
    if (filter) {
      try {
        const targetDate = new Date(dateMatch[1] + 'T00:00:00Z');
        const startIdx = filter.params.length + 1;
        const endIdx = filter.params.length + 2;
        // Query a narrow date window (±1 day) to keep the candidate set
        // small. The old ±2-day / LIMIT 600 approach fetched hundreds of
        // games and enriched ALL of them with odds + ESPN scores just to
        // find one — a massive over-fetch that caused 30s+ page loads.
        const r = await query(
          `SELECT game_id, sport, home_team, away_team, commence_time,
                  COUNT(DISTINCT bookmaker_key)::int AS n_books
           FROM odds_snapshots
           WHERE ${filter.clause}
             AND commence_time IS NOT NULL
             AND commence_time >= $${startIdx}
             AND commence_time <= $${endIdx}
           GROUP BY game_id, sport, home_team, away_team, commence_time
           ORDER BY commence_time ASC
           LIMIT 200`,
          [...filter.params, new Date(targetDate.getTime() - 1 * 86400000), new Date(targetDate.getTime() + 1 * 86400000)],
        );

        // Phase 1: match by slug using only DB columns (no external calls).
        // Build slugs from the raw DB rows to find our target game_id.
        let matched: { row: any; homeTeam: string; awayTeam: string } | null = null;
        for (const row of r.rows as any[]) {
          const homeTeam = formatTeamName(row.home_team);
          const awayTeam = formatTeamName(row.away_team);
          const candidateSlug = buildGameSlug(awayTeam, homeTeam, new Date(row.commence_time).toISOString());
          if (candidateSlug === decoded || row.game_id === decoded) {
            matched = { row, homeTeam, awayTeam };
            break;
          }
        }

        if (matched) {
          // Phase 2: enrich ONLY the matched game with odds + ESPN scores.
          // This is the key optimization — we fetch odds for ONE game_id
          // and build an ESPN score index (which is cached) to look up ONE
          // game, instead of doing it for every candidate in the window.
          const { row, homeTeam, awayTeam } = matched;
          const [oddsByGame, espnIndex] = await Promise.all([
            fetchOddsForGames(code, [row.game_id]),
            buildEspnScoreIndex([code]).catch(
              () => ({ match: () => null, size: 0 }) as { match: (h: string, a: string) => EspnScore | null; size: number },
            ),
          ]);
          const espn = espnIndex.match(row.home_team, row.away_team);
          const oddsRows = oddsByGame.get(row.game_id) || [];
          const status: GameCard['status'] = espn?.isLive ? 'live' : espn?.isFinal ? 'final' : 'scheduled';
          return {
            gameId: row.game_id,
            sport: code,
            slug: buildGameSlug(awayTeam, homeTeam, new Date(row.commence_time).toISOString()),
            homeTeam,
            awayTeam,
            homeLogo: teamLogoUrl(code, homeTeam),
            awayLogo: teamLogoUrl(code, awayTeam),
            commenceTime: new Date(row.commence_time).toISOString(),
            status,
            statusDetail: espn?.statusDetail ?? null,
            period: espn?.period ?? 0,
            clock: espn?.clock ?? null,
            homeScore: espn?.homeScore ?? 0,
            awayScore: espn?.awayScore ?? 0,
            espnEventId: espn?.eventId ?? null,
            bestMoneyline: bestMoneylineFromRows(oddsRows, homeTeam, awayTeam),
            bestSpread: bestSpreadFromRows(oddsRows, homeTeam, awayTeam),
            bestTotal: bestTotalFromRows(oddsRows),
            nBooks: row.n_books || 0,
          };
        }
      } catch {
        // fall through to grid-based lookup
      }
    }
  }

  // --- Fallback: grid-based lookup (16h..10d window, 200-game cap) ---
  const games = await getGamesGrid(code, 200);
  const bySlug = games.find((g) => g.slug === decoded);
  if (bySlug) return bySlug;
  return games.find((g) => g.gameId === decoded) ?? null;
  },
  ['game-by-slug'],
  { revalidate: 30, tags: ['games'] },
);

// ---------------------------------------------------------------------------
// Full odds breakdown (Odds tab) — every book's price for h2h/spreads/totals.
// ---------------------------------------------------------------------------

export type FullOddsBook = {
  bookmaker: string;
  moneyline: { away: number | null; home: number | null };
  spread: { away: { point: number | null; price: number | null }; home: { point: number | null; price: number | null } };
  total: { over: { point: number | null; price: number | null }; under: { point: number | null; price: number | null } };
};

export async function getFullOddsBreakdown(
  sportCode: string,
  gameId: string,
  homeTeam: string,
  awayTeam: string,
): Promise<FullOddsBook[]> {
  const code = (sportCode || '').toUpperCase();
  const filter = sportFilterClause(code, 1);
  if (!filter) return [];
  const gameIdx = filter.params.length + 1;
  let rows: any[] = [];
  try {
    const r = await query(
      `SELECT DISTINCT ON (bookmaker_key, market_type, outcome_name)
         bookmaker_key, bookmaker_name, market_type, outcome_name, outcome_price, outcome_point
       FROM odds_snapshots
       WHERE ${filter.clause}
         AND game_id = $${gameIdx}
         AND outcome_price != 0
         AND ABS(outcome_price) <= ${MAX_VALID_AMERICAN_ODDS}
       ORDER BY bookmaker_key, market_type, outcome_name, snapshot_time DESC`,
      [...filter.params, gameId],
    );
    rows = r.rows;
  } catch {
    return [];
  }

  const byBook = new Map<string, FullOddsBook>();
  for (const row of rows) {
    const key = row.bookmaker_key;
    if (!byBook.has(key)) {
      byBook.set(key, {
        bookmaker: formatBookmakerName(row.bookmaker_key, row.bookmaker_name),
        moneyline: { away: null, home: null },
        spread: { away: { point: null, price: null }, home: { point: null, price: null } },
        total: { over: { point: null, price: null }, under: { point: null, price: null } },
      });
    }
    const entry = byBook.get(key)!;
    const isHome = normalizeTeam(row.outcome_name) === normalizeTeam(homeTeam);
    const isAway = normalizeTeam(row.outcome_name) === normalizeTeam(awayTeam);
    const price = Number(row.outcome_price);
    const point = row.outcome_point != null ? Number(row.outcome_point) : null;
    if (row.market_type === 'h2h') {
      if (isHome) entry.moneyline.home = price;
      if (isAway) entry.moneyline.away = price;
    } else if (row.market_type === 'spreads') {
      if (isHome) entry.spread.home = { point, price };
      if (isAway) entry.spread.away = { point, price };
    } else if (row.market_type === 'totals') {
      if (row.outcome_name === 'Over') entry.total.over = { point, price };
      if (row.outcome_name === 'Under') entry.total.under = { point, price };
    }
  }
  return Array.from(byBook.values()).sort((a, b) => a.bookmaker.localeCompare(b.bookmaker));
}

// ---------------------------------------------------------------------------
// Standings (Standings tab) — ESPN public API, no auth required.
// ---------------------------------------------------------------------------

export type StandingsTeamRow = {
  teamName: string;
  abbrev: string;
  logo: string | null;
  wins: number;
  losses: number;
  ties: number;
  winPct: string;
  gamesBehind: string;
  streak: string;
};

export type StandingsDivision = {
  conference: string;
  division: string;
  teams: StandingsTeamRow[];
};

const STANDINGS_PATH: Record<string, string> = {
  MLB: 'baseball/mlb',
  NFL: 'football/nfl',
};

export const getStandings = unstable_cache(
  async (sportCode: string): Promise<StandingsDivision[]> => {
    const code = (sportCode || '').toUpperCase();
    const path = STANDINGS_PATH[code];
    if (!path) return [];
    try {
      const res = await fetch(
        `https://site.api.espn.com/apis/v2/sports/${path}/standings?level=3`,
        { next: { revalidate: 900 } },
      );
      if (!res.ok) return [];
      const json: any = await res.json();
      const conferences: any[] = Array.isArray(json?.children) ? json.children : [];
      const out: StandingsDivision[] = [];
      for (const conf of conferences) {
        const divisions: any[] = Array.isArray(conf?.children) ? conf.children : [];
        for (const div of divisions) {
          const entries: any[] = Array.isArray(div?.standings?.entries) ? div.standings.entries : [];
          const teams: StandingsTeamRow[] = entries.map((e: any) => {
            const stats = new Map<string, string>();
            for (const s of e?.stats || []) stats.set(s.type, s.displayValue);
            return {
              teamName: e?.team?.displayName || 'Unknown',
              abbrev: e?.team?.abbreviation || '',
              logo: e?.team?.logos?.[0]?.href || null,
              wins: Number(stats.get('wins') || 0),
              losses: Number(stats.get('losses') || 0),
              ties: Number(stats.get('ties') || 0),
              winPct: stats.get('winpercent') || '',
              gamesBehind: stats.get('gamesbehind') || '-',
              streak: stats.get('streak') || '',
            };
          });
          out.push({ conference: conf?.name || '', division: div?.name || '', teams });
        }
      }
      return out;
    } catch {
      return [];
    }
  },
  ['public:standings'],
  { revalidate: 900, tags: ['public-odds'] },
);

// ---------------------------------------------------------------------------
// Box score (Box Score tab) — public, non-authed wrapper around
// lib/espn-summary.ts. Resolves the ESPN event id via the score index
// (same matcher the dashboard uses) so no session/pinned-game lookup needed.
// ---------------------------------------------------------------------------

export async function getPublicBoxScore(
  sportCode: string,
  homeTeam: string,
  awayTeam: string,
): Promise<GameSummary | null> {
  const code = (sportCode || '').toUpperCase();
  if (!SPORT_PATHS[code]) return null;
  try {
    const index = await buildEspnScoreIndex([code]);
    const match = index.match(homeTeam, awayTeam);
    if (!match?.eventId) return null;
    return await fetchGameSummary(code, match.eventId);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Batter vs. Pitcher widget (Details tab, MLB only) — pulls the projected
// starting lineup's opposing-pitcher matchups plus headshots.
// ---------------------------------------------------------------------------

export type MatchupPlayer = {
  playerName: string;
  team: string;
  position: string | null;
  opposingPitcher: string;
  headshotUrl: string | null;
};

export async function getBatterVsPitcherMatchups(
  homeTeam: string,
  awayTeam: string,
  limit = 12,
): Promise<MatchupPlayer[]> {
  try {
    const r = await query(
      `SELECT DISTINCT ON (player_name)
         player_name, team, position, opposing_pitcher
       FROM player_stats
       WHERE sport = 'MLB'
         AND opposing_pitcher IS NOT NULL AND opposing_pitcher <> ''
         AND (team = $1 OR team = $2)
         AND game_date > NOW() - INTERVAL '18 hours'
       ORDER BY player_name, game_date DESC
       LIMIT $3`,
      [homeTeam, awayTeam, limit * 2],
    );
    if (r.rows.length === 0) return [];

    const names = Array.from(new Set((r.rows as any[]).map((row) => row.player_name)));
    const headshots = new Map<string, string>();
    if (names.length > 0) {
      const hs = await query(
        `SELECT DISTINCT ON (player_name) player_name, headshot_url
         FROM dd_player_pool
         WHERE sport = 'MLB' AND player_name = ANY($1) AND headshot_url IS NOT NULL
         ORDER BY player_name, updated_at DESC`,
        [names],
      );
      for (const row of hs.rows as any[]) headshots.set(row.player_name, row.headshot_url);
    }

    return (r.rows as any[]).slice(0, limit).map((row) => ({
      playerName: row.player_name,
      team: row.team,
      position: row.position,
      opposingPitcher: row.opposing_pitcher,
      headshotUrl: headshots.get(row.player_name) ?? null,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Injuries (Injuries tab) — both teams' reports from the `injuries` table.
// ---------------------------------------------------------------------------

export type GameInjuryRow = {
  playerName: string;
  team: string;
  position: string | null;
  status: string;
  injuryType: string | null;
  reportedDate: string;
};

export async function getInjuriesForGame(
  sportCode: string,
  homeTeam: string,
  awayTeam: string,
): Promise<{ home: GameInjuryRow[]; away: GameInjuryRow[] }> {
  try {
    const r = await query(
      `SELECT DISTINCT ON (player_name, team)
         player_name, team, position, status, injury_type, reported_date
       FROM injuries
       WHERE UPPER(sport) = UPPER($1)
         AND (team = $2 OR team = $3)
         AND fetched_at > NOW() - INTERVAL '10 days'
       ORDER BY player_name, team, fetched_at DESC`,
      [sportCode, homeTeam, awayTeam],
    );
    const home: GameInjuryRow[] = [];
    const away: GameInjuryRow[] = [];
    for (const row of r.rows as any[]) {
      const entry: GameInjuryRow = {
        playerName: row.player_name,
        team: row.team,
        position: row.position,
        status: row.status,
        injuryType: row.injury_type,
        reportedDate: row.reported_date ? new Date(row.reported_date).toISOString().slice(0, 10) : '',
      };
      if (normalizeTeam(row.team) === normalizeTeam(homeTeam)) home.push(entry);
      else if (normalizeTeam(row.team) === normalizeTeam(awayTeam)) away.push(entry);
    }
    return { home, away };
  } catch {
    return { home: [], away: [] };
  }
}

// ---------------------------------------------------------------------------
// Weather (Details tab, MLB only — outdoor stadiums).
// ---------------------------------------------------------------------------

export type GameWeather = {
  stadium: string;
  city: string;
  temperature: number;
  conditions: string;
  windSpeed: number;
  impact: string;
};

/** Best-effort weather lookup by team city name substring match. */
export async function getWeatherForTeam(teamName: string): Promise<GameWeather | null> {
  try {
    const r = await query(
      `SELECT stadium, city, temperature, conditions, wind_speed, impact
       FROM weather_alerts
       WHERE fetched_at > NOW() - INTERVAL '6 hours'
       ORDER BY fetched_at DESC
       LIMIT 40`,
    );
    const cityWord = String(teamName || '').split(' ')[0]?.toLowerCase();
    const hit = (r.rows as any[]).find(
      (row) =>
        String(row.city || '').toLowerCase().includes(cityWord) ||
        String(row.stadium || '').toLowerCase().includes(cityWord),
    );
    if (!hit) return null;
    return {
      stadium: hit.stadium,
      city: hit.city,
      temperature: Number(hit.temperature),
      conditions: hit.conditions,
      windSpeed: Number(hit.wind_speed),
      impact: hit.impact || 'LOW',
    };
  } catch {
    return null;
  }
}

export { fmtAmerican, impliedProb, isValidAmericanOdds };
