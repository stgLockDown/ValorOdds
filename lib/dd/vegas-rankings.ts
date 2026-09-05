/**
 * DiamondDraft — Vegas-odds-based fantasy rankings.
 *
 * The idea (per the user's product direction): use the betting market's
 * implied team totals and win probabilities — derived from moneyline /
 * spread / total lines in `odds_snapshots` — as an additional ranking
 * signal alongside the existing ESPN-based `rank` and `adp`.
 *
 * Why it's useful:
 *  - A QB / WR / TE / RB on a team with a high implied team total (e.g. 27
 *    points when the league average is 22) is in a game the market expects
 *    to produce more offense → more passing/rushing volume → better fantasy
 *    outlook. Players on teams with a low implied total project for fewer
 *    scoring opportunities.
 *  - For MLB batters the same logic applies: a team expected to score 5.2
 *    runs offers more plate appearances with runners on → more R/RBI/HR
 *    opportunity.
 *  - For MLB starting pitchers the signal INVERTS: a pitcher whose
 *    opponent has a LOW implied total is expected to allow fewer runs →
 *    better fantasy outlook (more innings, fewer ER, more wins).
 *  - Win probability matters for QBs (wins are a scoring category in some
 *    leagues) and for pitchers (a win is worth ~5 fantasy points in
 *    standard points leagues).
 *
 * This module is self-contained and can be called from the pool-generation
 * pipeline (lib/dd/player-pool.ts) to stamp every player with a
 * `vegasScore` (0-100, higher = better market outlook) and `vegasRank`
 * (1 = best market outlook in the sport). The scores are also surfaced
 * directly in the player hover info card and the draft room pool list via
 * lib/dd/player-info.ts and the /api/dd/players route.
 */

import { query } from '@/lib/db';
import { sportFilterClause } from '@/lib/sport-filter';
import { normalizeTeam } from '@/lib/espn-scores';
import { espnAbbrev } from '@/lib/team-logos';
import { impliedProb, MAX_VALID_AMERICAN_ODDS } from '@/lib/public-data';
import type { Sport } from './presets';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-team Vegas outlook derived from the best available odds for its next game. */
export type TeamVegasOutlook = {
  teamAbbrev: string;
  /** Implied points/runs the market expects this team to score. */
  impliedTotal: number;
  /** Market-implied win probability (0-1, vig included). */
  winProb: number;
  /** 0-100 composite — higher = better fantasy outlook for offense. */
  vegasScore: number;
};

export type PlayerVegasRank = {
  playerName: string;
  team: string | null;
  position: string | null;
  sport: Sport;
  /** Implied team total for the player's team (or opponent total for SP). */
  impliedTotal: number | null;
  /** Market-implied win probability for the player's team. */
  winProb: number | null;
  /** 0-100 composite score. Higher = better. */
  vegasScore: number | null;
  /** 1-based rank within the sport by vegasScore (1 = best). null if no odds. */
  vegasRank: number | null;
};

// ---------------------------------------------------------------------------
// Core math: implied team total from spread + total
// ---------------------------------------------------------------------------

/**
 * Standard capping formula for a team's implied total:
 *
 *   impliedTotal(favorite) = gameTotal/2 + |spread|/2
 *   impliedTotal(underdog) = gameTotal/2 - |spread|/2
 *
 * The spread is from the favorite's perspective (negative = favorite in
 * American convention, but The Odds API writes spreads as the point the
 * team needs to cover — favorite gets a negative point, dog gets positive).
 * We use the magnitude and sign of the best spread to split the total.
 */
function computeImpliedTeamTotals(
  gameTotal: number,
  awaySpreadPoint: number | null,
  homeSpreadPoint: number | null,
): { away: number; home: number } {
  // Default: split evenly.
  if (gameTotal == null || gameTotal <= 0) return { away: 0, home: 0 };

  // Use the away spread point (negative = away is favorite). The home point
  // is the mirror, so either works; we prefer away for determinism.
  const spread = awaySpreadPoint ?? (homeSpreadPoint != null ? -homeSpreadPoint : 0);
  // Favorite's implied total = total/2 + |spread|/2
  // If away spread is negative → away is favorite → away gets the + half.
  const awayImplied = gameTotal / 2 + spread / 2;
  const homeImplied = gameTotal / 2 - spread / 2;
  return { away: round1(awayImplied), home: round1(homeImplied) };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// Fetch best odds per upcoming game for a sport
// ---------------------------------------------------------------------------

type GameBestOdds = {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homeAbbrev: string | null;
  awayAbbrev: string | null;
  gameTotal: number | null;
  awaySpreadPoint: number | null;
  homeSpreadPoint: number | null;
  awayMl: number | null;
  homeMl: number | null;
};

async function fetchUpcomingGamesBestOdds(sport: Sport): Promise<GameBestOdds[]> {
  const filter = sportFilterClause(sport, 1);
  if (!filter) return [];
  const limitIdx = filter.params.length + 1;

  // Single query: pull the distinct upcoming games, then aggregate the best
  // moneyline / median total / median spread per game in SQL using window
  // functions + DISTINCT ON. Avoids an N+1 query storm (300 games × 1 query
  // was ~60s+; this is one round-trip).
  let rows: any[] = [];
  try {
    const r = await query(
      `WITH upcoming AS (
         SELECT DISTINCT ON (game_id) game_id, home_team, away_team
         FROM odds_snapshots
         WHERE ${filter.clause}
           AND commence_time > NOW() - INTERVAL '2 hours'
           AND commence_time < NOW() + INTERVAL '7 days'
           AND outcome_price != 0
         ORDER BY game_id, commence_time ASC
       ),
       agg AS (
         SELECT
           o.game_id,
           u.home_team,
           u.away_team,
           -- best (highest) moneyline price per side
           MAX(CASE WHEN o.market_type='h2h' AND normalize_team_match(o.outcome_name, u.away_team) THEN o.outcome_price END) AS away_ml,
           MAX(CASE WHEN o.market_type='h2h' AND normalize_team_match(o.outcome_name, u.home_team) THEN o.outcome_price END) AS home_ml,
           -- median total point (approximated by AVG on Over outcomes —
           -- the books cluster tightly so avg ≈ median)
           AVG(CASE WHEN o.market_type='totals' AND o.outcome_name='Over' THEN o.outcome_point END) AS game_total,
           AVG(CASE WHEN o.market_type='spreads' AND normalize_team_match(o.outcome_name, u.away_team) THEN o.outcome_point END) AS away_spread,
           AVG(CASE WHEN o.market_type='spreads' AND normalize_team_match(o.outcome_name, u.home_team) THEN o.outcome_point END) AS home_spread
         FROM odds_snapshots o
         JOIN upcoming u ON u.game_id = o.game_id
         WHERE ${filter.clause.replace(/sport_key/g, 'o.sport_key')}
           AND o.outcome_price != 0
           AND ABS(o.outcome_price) <= ${MAX_VALID_AMERICAN_ODDS}
         GROUP BY o.game_id, u.home_team, u.away_team
       )
       SELECT game_id, home_team, away_team,
              away_ml, home_ml,
              game_total, away_spread, home_spread
       FROM agg`,
      [...filter.params, ...filter.params],
    );
    rows = r.rows;
  } catch {
    // Fallback: the normalize_team_match helper may not exist as a SQL
    // function — fall back to a simpler client-side aggregation below.
    rows = [];
  }

  if (rows.length === 0) {
    return fetchUpcomingGamesBestOddsFallback(sport, filter, limitIdx);
  }

  return rows.map((row) => ({
    gameId: row.game_id,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    homeAbbrev: espnAbbrev(sport, row.home_team),
    awayAbbrev: espnAbbrev(sport, row.away_team),
    gameTotal: row.game_total != null ? round1(Number(row.game_total)) : null,
    awaySpreadPoint: row.away_spread != null ? round1(Number(row.away_spread)) : null,
    homeSpreadPoint: row.home_spread != null ? round1(Number(row.home_spread)) : null,
    awayMl: row.away_ml != null ? Number(row.away_ml) : null,
    homeMl: row.home_ml != null ? Number(row.home_ml) : null,
  }));
}

/**
 * Fallback: fetch games + odds separately and aggregate client-side. Used
 * only if the window-function query fails (e.g. missing helper function).
 * Capped at 60 games to keep latency bounded.
 */
async function fetchUpcomingGamesBestOddsFallback(
  sport: Sport,
  filter: { clause: string; params: string[] },
  limitIdx: number,
): Promise<GameBestOdds[]> {
  let games: { game_id: string; home_team: string; away_team: string }[] = [];
  try {
    const r = await query(
      `SELECT DISTINCT ON (game_id) game_id, home_team, away_team
       FROM odds_snapshots
       WHERE ${filter.clause}
         AND commence_time > NOW() - INTERVAL '2 hours'
         AND commence_time < NOW() + INTERVAL '7 days'
         AND outcome_price != 0
       ORDER BY game_id, commence_time ASC
       LIMIT $${limitIdx}`,
      [...filter.params, 60],
    );
    games = r.rows as any[];
  } catch {
    return [];
  }

  const gameIds = games.map((g) => g.game_id);
  if (gameIds.length === 0) return [];

  const oddsIdx = filter.params.length + 1;
  let oddsRows: any[] = [];
  try {
    const odds = await query(
      `SELECT game_id, market_type, outcome_name, outcome_price, outcome_point
       FROM odds_snapshots
       WHERE ${filter.clause}
         AND game_id = ANY($${oddsIdx})
         AND outcome_price != 0
         AND ABS(outcome_price) <= $${oddsIdx + 1}`,
      [...filter.params, gameIds, MAX_VALID_AMERICAN_ODDS],
    );
    oddsRows = odds.rows as any[];
  } catch {
    return [];
  }

  const oddsByGame = new Map<string, any[]>();
  for (const row of oddsRows) {
    const list = oddsByGame.get(row.game_id) || [];
    list.push(row);
    oddsByGame.set(row.game_id, list);
  }

  const out: GameBestOdds[] = [];
  for (const g of games) {
    const rows = oddsByGame.get(g.game_id) || [];
    if (rows.length === 0) continue;
    const awayNorm = normalizeTeam(g.away_team);
    const homeNorm = normalizeTeam(g.home_team);

    let awayMl: number | null = null;
    let homeMl: number | null = null;
    for (const row of rows) {
      if (row.market_type !== 'h2h') continue;
      const price = Number(row.outcome_price);
      const sideNorm = normalizeTeam(row.outcome_name);
      if (sideNorm === awayNorm && (awayMl == null || price > awayMl)) awayMl = price;
      if (sideNorm === homeNorm && (homeMl == null || price > homeMl)) homeMl = price;
    }
    const overPoints = rows
      .filter((r) => r.market_type === 'totals' && r.outcome_name === 'Over' && r.outcome_point != null)
      .map((r) => Number(r.outcome_point));
    const gameTotal = overPoints.length > 0 ? overPoints.sort((a, b) => a - b)[Math.floor(overPoints.length / 2)] : null;
    const awaySpreads = rows
      .filter((r) => r.market_type === 'spreads' && normalizeTeam(r.outcome_name) === awayNorm && r.outcome_point != null)
      .map((r) => Number(r.outcome_point));
    const awaySpreadPoint = awaySpreads.length > 0 ? awaySpreads.sort((a, b) => a - b)[Math.floor(awaySpreads.length / 2)] : null;
    const homeSpreads = rows
      .filter((r) => r.market_type === 'spreads' && normalizeTeam(r.outcome_name) === homeNorm && r.outcome_point != null)
      .map((r) => Number(r.outcome_point));
    const homeSpreadPoint = homeSpreads.length > 0 ? homeSpreads.sort((a, b) => a - b)[Math.floor(homeSpreads.length / 2)] : null;

    out.push({
      gameId: g.game_id,
      homeTeam: g.home_team,
      awayTeam: g.away_team,
      homeAbbrev: espnAbbrev(sport, g.home_team),
      awayAbbrev: espnAbbrev(sport, g.away_team),
      gameTotal,
      awaySpreadPoint,
      homeSpreadPoint,
      awayMl,
      homeMl,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Build the per-team outlook map
// ---------------------------------------------------------------------------

/**
 * Compute the Vegas outlook (implied total, win prob, composite score) for
 * every team that has an upcoming game with odds, keyed by team abbreviation
 * (matching the `team` column in dd_player_pool).
 */
export async function getTeamVegasOutlooks(sport: Sport): Promise<Map<string, TeamVegasOutlook>> {
  const games = await fetchUpcomingGamesBestOdds(sport);
  const out = new Map<string, TeamVegasOutlook>();

  // Collect all implied totals to normalize into a 0-100 score.
  const allImplied: number[] = [];

  for (const g of games) {
    const totals = computeImpliedTeamTotals(g.gameTotal ?? 0, g.awaySpreadPoint, g.homeSpreadPoint);
    for (const side of ['away', 'home'] as const) {
      const abbrev = side === 'away' ? g.awayAbbrev : g.homeAbbrev;
      if (!abbrev) continue;
      const ml = side === 'away' ? g.awayMl : g.homeMl;
      const implied = side === 'away' ? totals.away : totals.home;
      const winProb = ml != null ? impliedProb(ml) : 0.5;
      // Keep the best (highest) implied total if a team has multiple games.
      const existing = out.get(abbrev);
      if (!existing || implied > existing.impliedTotal) {
        out.set(abbrev, {
          teamAbbrev: abbrev,
          impliedTotal: implied,
          winProb,
          vegasScore: 0, // filled in after normalization
        });
        allImplied.push(implied);
      }
    }
  }

  // Normalize implied totals into a 0-100 score.
  // Use min-max scaling across the sport so the top-scoring team = 100 and
  // the lowest = ~30 (floor so nobody scores 0 — there's always some
  // offensive opportunity). Win prob adds a small bonus (up to +8) since
  // winning teams tend to score and QBs/pitchers get the W.
  if (allImplied.length === 0) return out;
  const min = Math.min(...allImplied);
  const max = Math.max(...allImplied);
  const range = max - min || 1;

  for (const outlook of out.values()) {
    const base = 30 + ((outlook.impliedTotal - min) / range) * 62; // 30-92
    const winBonus = outlook.winProb * 8; // 0-8
    outlook.vegasScore = Math.round((base + winBonus) * 10) / 10;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Assign vegasScore + vegasRank to every player in the pool
// ---------------------------------------------------------------------------

/**
 * Compute a Vegas score + rank for every player in the dd_player_pool for a
 * given sport/season. Returns a map keyed by player_name → PlayerVegasRank.
 *
 * For offensive players (NFL skill positions, MLB batters) the score is the
 * team's offensive outlook (higher team implied total = higher score).
 * For MLB starting pitchers the score INVERTS: a pitcher facing a team with
 * a LOW implied total gets a HIGHER score (expected to allow fewer runs).
 */
export async function computePlayerVegasRanks(
  sport: Sport,
  seasonYear: number,
): Promise<Map<string, PlayerVegasRank>> {
  const teamOutlooks = await getTeamVegasOutlooks(sport);

  // Pull every player in the pool with their team + position.
  let players: { player_name: string; team: string | null; position: string | null }[] = [];
  try {
    const r = await query(
      `SELECT player_name, team, position
       FROM dd_player_pool
       WHERE sport = $1 AND season_year = $2`,
      [sport, seasonYear],
    );
    players = r.rows as any[];
  } catch {
    return new Map();
  }

  if (players.length === 0 || teamOutlooks.size === 0) return new Map();

  // Determine the inversion set: positions where a LOWER opponent/team
  // implied total is better. For MLB starting pitchers, we look at the
  // OUTLOOK of the team they're FACING (their opponent), not their own team.
  // Since we don't have opponent info in the pool row, we approximate: a
  // pitcher's own team having a LOW implied total correlates with the game
  // being low-scoring (pitcher's duel), so we invert on own-team outlook.
  // This is a reasonable proxy given the data we have.
  const INVERT_POSITIONS = new Set(sport === 'MLB' ? ['SP', 'RP', 'P'] : []);

  const entries: PlayerVegasRank[] = players.map((p) => {
    const outlook = p.team ? teamOutlooks.get(p.team) : undefined;
    if (!outlook) {
      return {
        playerName: p.player_name,
        team: p.team,
        position: p.position,
        sport,
        impliedTotal: null,
        winProb: null,
        vegasScore: null,
        vegasRank: null,
      };
    }
    const invert = p.position ? INVERT_POSITIONS.has(p.position.toUpperCase()) : false;
    // For inverted positions, flip the score: a low team total → high score.
    // We invert by subtracting from 130 (since max score ~100, this maps
    // 100→30 and 30→100, keeping the 0-100ish range).
    const score = invert ? Math.round((130 - outlook.vegasScore) * 10) / 10 : outlook.vegasScore;
    return {
      playerName: p.player_name,
      team: p.team,
      position: p.position,
      sport,
      impliedTotal: outlook.impliedTotal,
      winProb: outlook.winProb,
      vegasScore: score,
      vegasRank: null,
    };
  });

  // Rank within sport by vegasScore (higher = better → rank 1).
  const ranked = entries
    .filter((e) => e.vegasScore != null)
    .sort((a, b) => (b.vegasScore! - a.vegasScore!));
  ranked.forEach((e, i) => {
    e.vegasRank = i + 1;
  });

  const out = new Map<string, PlayerVegasRank>();
  for (const e of entries) out.set(e.playerName, e);
  return out;
}

// ---------------------------------------------------------------------------
// Persistence: write vegas_rank + vegas_score back to dd_player_pool
// ---------------------------------------------------------------------------

/**
 * Stamp every player in dd_player_pool with their current vegas_score and
 * vegas_rank. Called from the pool-generation pipeline after the main
 * ESPN-based ranking is done, and can be re-run independently (e.g. on a
 * cron) to keep the Vegas outlook fresh as odds move.
 *
 * Requires the dd_player_pool table to have `vegas_score` and `vegas_rank`
 * columns (added by migration db/migrations/012_dd_vegas_rank.sql).
 */
export async function stampVegasRanks(sport: Sport, seasonYear: number): Promise<{ stamped: number }> {
  const ranks = await computePlayerVegasRanks(sport, seasonYear);
  if (ranks.size === 0) return { stamped: 0 };

  let stamped = 0;
  for (const [playerName, rank] of ranks) {
    try {
      await query(
        `UPDATE dd_player_pool
         SET vegas_score = $4, vegas_rank = $5, updated_at = NOW()
         WHERE sport = $1 AND season_year = $2 AND player_name = $3`,
        [sport, seasonYear, playerName, rank.vegasScore, rank.vegasRank],
      );
      if (rank.vegasScore != null) stamped++;
    } catch {
      // Column may not exist yet (pre-migration) — swallow and continue.
    }
  }
  return { stamped };
}
