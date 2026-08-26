/**
 * DiamondDraft — Player Pool Engine
 *
 * Generates sport-aware player pools for drafts.
 *
 * PRIMARY SOURCE: ESPN public rosters (via `lib/dd/espn-pool.ts`). Every NFL
 * and MLB team roster is fetched, filtered to fantasy-relevant positions, and
 * ranked with a calibrated prior + curated stars overlay so elite players sort
 * to the top. This replaced the old `player_season_stats` source, which was
 * truncated (94 rows), preseason-only (1-2 games_played), and had 63/94 rows
 * with empty positions — causing missing + mis-ranked players in the draft.
 *
 * FALLBACK: if ESPN is unreachable, we fall back to the DB-based stats source
 * so the draft still works (just less accurate).
 *
 * The player pool is stored in dd_player_pool and used by the draft room.
 */

import { query, queryOne, tx } from '@/lib/db';
import type { Sport, ScoringConfig } from './presets';
import { getScoringPreset, getRosterPreset } from './presets';
import { scoreStatLine } from './scoring';
import { fetchEspnPool } from './espn-pool';
import { stampVegasRanks } from './vegas-rankings';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface PlayerPoolEntry {
  id?: string;
  seasonYear: number;
  sport: Sport;
  playerName: string;
  team: string | null;
  position: string | null;
  eligiblePos: string[];
  adp: number | null;
  rank: number;
  tier: number;
  projection: Record<string, number> | null;
  projectedPoints: number;
  zScores: Record<string, number> | null;
  isRookie: boolean;
  injuryStatus: string | null;
  // Bio data (from ESPN roster) for the hover info card
  espnId?: string | null;
  headshot?: string | null;
  height?: string | null;
  weight?: string | null;
  age?: number | null;
  college?: string | null;
  debutYear?: number | null;
  experienceYears?: number | null;
  birthPlace?: string | null;
  jersey?: string | null;
  // Vegas-odds fantasy ranking (derived from implied team totals / win prob)
  vegasScore?: number | null;
  vegasRank?: number | null;
}

export interface GeneratePoolOptions {
  sport: Sport;
  seasonYear: number;
  /** Scoring preset key */
  scoringPreset: string;
  /** Max number of players to include */
  limit?: number;
  /** Include free agents / unranked players */
  includeFreeAgents?: boolean;
}

// ──────────────────────────────────────────────
// Position mapping from DB positions to fantasy positions
// ──────────────────────────────────────────────

const NFL_POS_MAP: Record<string, string> = {
  PAS: 'QB',
  QBT: 'QB',
  QB: 'QB',
  REC: 'WR',
  WR: 'WR',
  RUS: 'RB',
  RB: 'RB',
  TE: 'TE',
  K: 'K',
  PK: 'K',
  DEF: 'DEF',
  DST: 'DEF',
  DL: 'DL',
  DE: 'DL',
  DT: 'DL',
  LB: 'LB',
  DB: 'DB',
  CB: 'DB',
  S: 'DB',
};

const MLB_POS_MAP: Record<string, string> = {
  C: 'C',
  '1B': '1B',
  '2B': '2B',
  '3B': '3B',
  SS: 'SS',
  OF: 'OF',
  LF: 'OF',
  CF: 'OF',
  RF: 'OF',
  DH: 'DH',
  SP: 'SP',
  RP: 'RP',
  P: 'SP',
};

function mapPosition(sport: Sport, dbPosition: string | null): string | null {
  if (!dbPosition) return null;
  const map = sport === 'NFL' ? NFL_POS_MAP : MLB_POS_MAP;
  return map[dbPosition.toUpperCase()] ?? dbPosition;
}

// ──────────────────────────────────────────────
// Build a projection from season stats
// ──────────────────────────────────────────────

interface SeasonStatRow {
  player_name: string;
  team_name: string | null;
  position: string | null;
  games_played: number | null;
  avg_points: string | null;
  avg_yards: string | null;
  avg_touchdowns: string | null;
  avg_hits: string | null;
  avg_home_runs: string | null;
  avg_rbis: string | null;
  avg_saves: string | null;
  avg_strikeouts: string | null;
  avg_fantasy_score: string | null;
  total_fantasy_score: string | null;
}

function buildProjection(sport: Sport, row: SeasonStatRow): Record<string, number> {
  const proj: Record<string, number> = {};
  const gp = row.games_played || 1;

  if (sport === 'NFL') {
    // NFL projections per game
    const yards = parseFloat(row.avg_yards ?? '0');
    const tds = parseFloat(row.avg_touchdowns ?? '0');

    // Determine if QB (passing) or skill player (rushing/receiving)
    const pos = mapPosition(sport, row.position);
    if (pos === 'QB') {
      proj.pass_yd = yards;
      proj.pass_td = tds;
      // Estimate interceptions (~0.7 per game for QBs)
      proj.pass_int = Math.max(0, Math.round((tds * 0.4) * 10) / 10);
    } else if (pos === 'RB') {
      proj.rush_yd = yards * 0.6;
      proj.rec_yd = yards * 0.4;
      proj.rush_td = tds * 0.6;
      proj.rec_td = tds * 0.4;
      proj.rec = Math.round(yards / 8); // estimate receptions
    } else if (pos === 'WR') {
      proj.rec_yd = yards;
      proj.rec_td = tds;
      proj.rec = Math.round(yards / 12);
    } else if (pos === 'TE') {
      proj.rec_yd = yards;
      proj.rec_td = tds;
      proj.rec = Math.round(yards / 10);
    }
  } else {
    // MLB projections per game
    const pos = mapPosition(sport, row.position);
    const hits = parseFloat(row.avg_hits ?? '0');
    const hrs = parseFloat(row.avg_home_runs ?? '0');
    const rbis = parseFloat(row.avg_rbis ?? '0');
    const ks = parseFloat(row.avg_strikeouts ?? '0');
    const saves = parseFloat(row.avg_saves ?? '0');

    if (pos === 'SP' || pos === 'RP' || pos === 'P') {
      // Pitcher projections
      proj.K_p = ks;
      proj.SV = saves;
      // Estimate IP, W, L, ER from available data
      proj.IP = Math.max(0, Math.round((ks / 6) * 10) / 10); // rough IP estimate from K rate
      proj.W = Math.round(Math.max(0, ks * 0.15) * 10) / 10;
      proj.ER = Math.round(Math.max(0, hits * 0.3) * 10) / 10;
    } else {
      // Batter projections
      proj.H = hits;
      proj.HR = hrs;
      proj.RBI = rbis;
      // Estimate doubles, triples, runs, SB, BB from hits
      proj['2B'] = Math.round(hits * 0.2 * 10) / 10;
      proj['3B'] = Math.round(hits * 0.03 * 10) / 10;
      proj.R = Math.round(hits * 0.4 * 10) / 10;
      proj.SB = Math.round(hits * 0.05 * 10) / 10;
      proj.BB = Math.round(hits * 0.15 * 10) / 10;
      proj.K = Math.round(-hits * 0.3 * 10) / 10;
    }
  }

  return proj;
}

// ──────────────────────────────────────────────
// Tier calculation
// ──────────────────────────────────────────────

function computeTiers(players: { projectedPoints: number; rank: number }[]): number[] {
  if (players.length === 0) return [];

  // Simple tier system: group players by projected point gaps
  // Tier 1: top tier, Tier 2: next group, etc.
  // Use a gap-based approach: if a player is >15% below the tier leader, start a new tier
  const tiers: number[] = new Array(players.length).fill(1);
  let currentTier = 1;
  let tierLeaderPoints = players[0]?.projectedPoints ?? 0;

  for (let i = 1; i < players.length; i++) {
    const points = players[i].projectedPoints;
    if (tierLeaderPoints > 0 && points < tierLeaderPoints * 0.85) {
      currentTier++;
      tierLeaderPoints = points;
    }
    tiers[i] = currentTier;
  }

  // Cap at 10 tiers
  return tiers.map((t) => Math.min(t, 10));
}

// ──────────────────────────────────────────────
// Generate and store player pool
// ──────────────────────────────────────────────

export async function generatePlayerPool(opts: GeneratePoolOptions): Promise<{
  sport: Sport;
  seasonYear: number;
  count: number;
  topPlayers: PlayerPoolEntry[];
  source: 'espn' | 'db-fallback';
}> {
  const { sport, seasonYear, scoringPreset } = opts;
  const limit = opts.limit ?? (sport === 'NFL' ? 400 : 500);
  const scoringConfig = getScoringPreset(sport, scoringPreset);

  let entries: PlayerPoolEntry[] = [];
  let source: 'espn' | 'db-fallback' = 'espn';

  // ── PRIMARY: ESPN roster-based pool ──────────────────────────────────────
  try {
    const espn = await fetchEspnPool(sport, seasonYear, scoringConfig, limit);
    if (espn.count > 0) {
      entries = espn.players.map((p) => ({
        seasonYear,
        sport,
        playerName: p.playerName,
        team: p.team,
        position: p.position,
        eligiblePos: p.eligiblePos,
        adp: null,
        rank: 0,
        tier: 1,
        projection: p.projection,
        projectedPoints: p.projectedPoints,
        zScores: null,
        isRookie: p.isRookie,
        injuryStatus: p.injuryStatus,
        espnId: p.espnId,
        headshot: p.headshot ?? null,
        height: p.height ?? null,
        weight: p.weight ?? null,
        age: p.age ?? null,
        college: p.college ?? null,
        debutYear: p.debutYear ?? null,
        experienceYears: p.experienceYears ?? null,
        birthPlace: p.birthPlace ?? null,
        jersey: p.jersey ?? null,
      }));
      source = 'espn';
    }
  } catch (err) {
    console.error('[player-pool] ESPN fetch failed, falling back to DB stats:', err);
  }

  // ── FALLBACK: DB season-stats pool (only if ESPN produced nothing) ───────
  if (entries.length === 0) {
    source = 'db-fallback';
    const stats = await query<SeasonStatRow>(
      `SELECT player_name, team_name, position, games_played,
              avg_points::text, avg_yards::text, avg_touchdowns::text,
              avg_hits::text, avg_home_runs::text, avg_rbis::text,
              avg_saves::text, avg_strikeouts::text,
              avg_fantasy_score::text, total_fantasy_score::text
       FROM player_season_stats
       WHERE sport = $1
       ORDER BY COALESCE(avg_fantasy_score, 0) DESC
       LIMIT $2`,
      [sport, limit * 2]
    );

    entries = stats.rows.map((row) => {
      const position = mapPosition(sport, row.position);
      const projection = buildProjection(sport, row);
      const scored = scoreStatLine(sport, projection, scoringConfig);

      let eligiblePos: string[] = [];
      if (position) {
        eligiblePos = [position];
        if (sport === 'NFL' && ['RB', 'WR', 'TE'].includes(position)) {
          eligiblePos.push('FLEX');
        }
        if (sport === 'NFL' && position === 'QB') {
          eligiblePos.push('SFLEX');
        }
        if (sport === 'MLB' && ['C', '1B', '2B', '3B', 'SS', 'OF', 'DH'].includes(position)) {
          eligiblePos.push('UTIL');
        }
      }

      return {
        seasonYear,
        sport,
        playerName: row.player_name,
        team: row.team_name,
        position,
        eligiblePos,
        adp: null,
        rank: 0,
        tier: 1,
        projection,
        projectedPoints: scored.fantasyPoints,
        zScores: null,
        isRookie: false,
        injuryStatus: null,
      };
    });
  }

  if (entries.length === 0) {
    return { sport, seasonYear, count: 0, topPlayers: [], source };
  }

  // Sort by projected points (descending) and assign ranks
  entries.sort((a, b) => b.projectedPoints - a.projectedPoints);
  entries.forEach((entry, i) => {
    entry.rank = i + 1;
  });

  // Compute tiers
  const tierArr = computeTiers(entries.map((e) => ({ projectedPoints: e.projectedPoints, rank: e.rank })));
  entries.forEach((entry, i) => {
    entry.tier = tierArr[i];
  });

  // Estimate ADP based on rank (with some noise for realism)
  entries.forEach((entry) => {
    // ADP ~ rank with slight variation; for NFL a 12-team league has ~20 rounds = 240 picks
    const leagueSize = sport === 'NFL' ? 12 : 12;
    const rosterSize = sport === 'NFL' ? 20 : 27;
    const totalPicks = leagueSize * rosterSize;
    entry.adp = Math.round(entry.rank * (totalPicks / entries.length) * 10) / 10;
  });

  // Trim to the requested limit
  const finalEntries = entries.slice(0, limit);

  // Store in dd_player_pool (upsert)
  await tx(async (client) => {
    // Clear existing pool for this sport/season
    await client.query(
      `DELETE FROM dd_player_pool WHERE sport = $1 AND season_year = $2`,
      [sport, seasonYear]
    );

    // Batch insert
    for (const entry of finalEntries) {
      await client.query(
        `INSERT INTO dd_player_pool
           (season_year, sport, player_name, team, position, eligible_pos,
            adp, rank, tier, projection, projected_points, is_rookie, injury_status,
            espn_id, headshot_url, height, weight, age, college, debut_year,
            experience_years, birth_place, jersey, vegas_score, vegas_rank)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                 $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)`,
        [
          entry.seasonYear,
          entry.sport,
          entry.playerName,
          entry.team,
          entry.position,
          entry.eligiblePos,
          entry.adp,
          entry.rank,
          entry.tier,
          JSON.stringify(entry.projection),
          entry.projectedPoints,
          entry.isRookie,
          entry.injuryStatus,
          entry.espnId ?? null,
          entry.headshot ?? null,
          entry.height ?? null,
          entry.weight ?? null,
          entry.age ?? null,
          entry.college ?? null,
          entry.debutYear ?? null,
          entry.experienceYears ?? null,
          entry.birthPlace ?? null,
          entry.jersey ?? null,
          entry.vegasScore ?? null,
          entry.vegasRank ?? null,
        ]
      );
    }
  });

  // Stamp Vegas-odds fantasy rankings (implied team totals / win prob → score)
  // Best-effort: failures are logged but don't break pool generation.
  try {
    const vegasRes = await stampVegasRanks(sport, seasonYear);
    console.log(`[player-pool] Vegas ranks stamped for ${sport} ${seasonYear}: ${vegasRes.stamped} players`);
  } catch (vegasErr) {
    console.error(`[player-pool] Vegas rank stamping failed for ${sport} ${seasonYear}:`, vegasErr);
  }

  return {
    sport,
    seasonYear,
    count: finalEntries.length,
    topPlayers: finalEntries.slice(0, 20),
    source,
  };
}

// ──────────────────────────────────────────────
// Query the player pool
// ──────────────────────────────────────────────

export interface PoolQueryOptions {
  sport: Sport;
  seasonYear: number;
  position?: string;
  search?: string;
  /** Exclude players already drafted (by name) */
  excludeNames?: string[];
  limit?: number;
  offset?: number;
  sortBy?: 'rank' | 'projected_points' | 'adp' | 'name' | 'vegas_rank';
}

export async function queryPlayerPool(opts: PoolQueryOptions): Promise<{
  players: PlayerPoolEntry[];
  total: number;
}> {
  const { sport, seasonYear } = opts;
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const sortBy = opts.sortBy ?? 'rank';

  const sortColumn = {
    rank: 'rank',
    projected_points: 'projected_points',
    adp: 'adp',
    name: 'player_name',
    vegas_rank: 'vegas_rank',
  }[sortBy] ?? 'rank';

  const sortOrder = sortBy === 'name' ? 'ASC' : sortBy === 'vegas_rank' ? 'ASC NULLS LAST' : 'ASC NULLS LAST';

  const conditions: string[] = ['sport = $1', 'season_year = $2'];
  const params: unknown[] = [sport, seasonYear];
  let paramIdx = 3;

  if (opts.position && opts.position !== 'ALL') {
    conditions.push(`($3 = ANY(eligible_pos) OR position = $3)`);
    params.push(opts.position);
    paramIdx++;
  }

  if (opts.search) {
    conditions.push(`player_name ILIKE $${paramIdx}`);
    params.push(`%${opts.search}%`);
    paramIdx++;
  }

  if (opts.excludeNames && opts.excludeNames.length > 0) {
    conditions.push(`player_name != ALL($${paramIdx}::text[])`);
    params.push(opts.excludeNames);
    paramIdx++;
  }

  const whereClause = conditions.join(' AND ');

  // Get total count
  const countRes = await queryOne<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM dd_player_pool WHERE ${whereClause}`,
    params
  );
  const total = countRes ? parseInt(countRes.cnt, 10) : 0;

  // Get players
  const playersRes = await query<{
    id: string;
    player_name: string;
    team: string | null;
    position: string | null;
    eligible_pos: string[];
    adp: string | null;
    rank: number;
    tier: number;
    projection: Record<string, number> | null;
    projected_points: string;
    is_rookie: boolean;
    injury_status: string | null;
    espn_id: string | null;
    headshot_url: string | null;
    height: string | null;
    weight: string | null;
    age: number | null;
    college: string | null;
    debut_year: number | null;
    experience_years: number | null;
    birth_place: string | null;
    jersey: string | null;
    vegas_score: string | null;
    vegas_rank: number | null;
  }>(
    `SELECT id::text, player_name, team, position, eligible_pos,
            adp::text, rank, tier, projection, projected_points::text,
            is_rookie, injury_status,
            espn_id, headshot_url, height, weight, age, college,
            debut_year, experience_years, birth_place, jersey,
            vegas_score::text, vegas_rank
     FROM dd_player_pool
     WHERE ${whereClause}
     ORDER BY ${sortColumn} ${sortOrder}
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, limit, offset]
  );

  const players: PlayerPoolEntry[] = playersRes.rows.map((r) => ({
    id: r.id,
    seasonYear,
    sport,
    playerName: r.player_name,
    team: r.team,
    position: r.position,
    eligiblePos: r.eligible_pos ?? [],
    adp: r.adp ? parseFloat(r.adp) : null,
    rank: r.rank,
    tier: r.tier,
    projection: r.projection,
    projectedPoints: parseFloat(r.projected_points),
    zScores: null,
    isRookie: r.is_rookie,
    injuryStatus: r.injury_status,
    espnId: r.espn_id,
    headshot: r.headshot_url,
    height: r.height,
    weight: r.weight,
    age: r.age,
    college: r.college,
    debutYear: r.debut_year,
    experienceYears: r.experience_years,
    birthPlace: r.birth_place,
    jersey: r.jersey,
    vegasScore: r.vegas_score ? parseFloat(r.vegas_score) : null,
    vegasRank: r.vegas_rank,
  }));

  return { players, total };
}

/**
 * Get a single player from the pool by name.
 */
export async function getPlayerFromPool(
  sport: Sport,
  seasonYear: number,
  playerName: string
): Promise<PlayerPoolEntry | null> {
  const r = await queryOne<{
    id: string;
    player_name: string;
    team: string | null;
    position: string | null;
    eligible_pos: string[];
    adp: string | null;
    rank: number;
    tier: number;
    projection: Record<string, number> | null;
    projected_points: string;
    is_rookie: boolean;
    injury_status: string | null;
    espn_id: string | null;
    headshot_url: string | null;
    height: string | null;
    weight: string | null;
    age: number | null;
    college: string | null;
    debut_year: number | null;
    experience_years: number | null;
    birth_place: string | null;
    jersey: string | null;
    vegas_score: string | null;
    vegas_rank: number | null;
  }>(
    `SELECT id::text, player_name, team, position, eligible_pos,
            adp::text, rank, tier, projection, projected_points::text,
            is_rookie, injury_status,
            espn_id, headshot_url, height, weight, age, college,
            debut_year, experience_years, birth_place, jersey,
            vegas_score::text, vegas_rank
     FROM dd_player_pool
     WHERE sport = $1 AND season_year = $2 AND player_name = $3`,
    [sport, seasonYear, playerName]
  );

  if (!r) return null;

  return {
    id: r.id,
    seasonYear,
    sport,
    playerName: r.player_name,
    team: r.team,
    position: r.position,
    eligiblePos: r.eligible_pos ?? [],
    adp: r.adp ? parseFloat(r.adp) : null,
    rank: r.rank,
    tier: r.tier,
    projection: r.projection,
    projectedPoints: parseFloat(r.projected_points),
    zScores: null,
    isRookie: r.is_rookie,
    injuryStatus: r.injury_status,
    espnId: r.espn_id,
    headshot: r.headshot_url,
    height: r.height,
    weight: r.weight,
    age: r.age,
    college: r.college,
    debutYear: r.debut_year,
    experienceYears: r.experience_years,
    birthPlace: r.birth_place,
    jersey: r.jersey,
    vegasScore: r.vegas_score ? parseFloat(r.vegas_score) : null,
    vegasRank: r.vegas_rank,
  };
}

/**
 * Get a single player from the pool by its dd_player_pool id.
 */
export async function getPlayerByIdFromPool(
  poolId: string
): Promise<PlayerPoolEntry | null> {
  const r = await queryOne<{
    id: string;
    season_year: number;
    sport: string;
    player_name: string;
    team: string | null;
    position: string | null;
    eligible_pos: string[];
    adp: string | null;
    rank: number;
    tier: number;
    projection: Record<string, number> | null;
    projected_points: string;
    is_rookie: boolean;
    injury_status: string | null;
    espn_id: string | null;
    headshot_url: string | null;
    height: string | null;
    weight: string | null;
    age: number | null;
    college: string | null;
    debut_year: number | null;
    experience_years: number | null;
    birth_place: string | null;
    jersey: string | null;
    vegas_score: string | null;
    vegas_rank: number | null;
  }>(
    `SELECT id::text, season_year, sport, player_name, team, position, eligible_pos,
            adp::text, rank, tier, projection, projected_points::text,
            is_rookie, injury_status,
            espn_id, headshot_url, height, weight, age, college,
            debut_year, experience_years, birth_place, jersey,
            vegas_score::text, vegas_rank
     FROM dd_player_pool
     WHERE id = $1`,
    [BigInt(poolId)]
  );

  if (!r) return null;

  return {
    id: r.id,
    seasonYear: r.season_year,
    sport: r.sport as Sport,
    playerName: r.player_name,
    team: r.team,
    position: r.position,
    eligiblePos: r.eligible_pos ?? [],
    adp: r.adp ? parseFloat(r.adp) : null,
    rank: r.rank,
    tier: r.tier,
    projection: r.projection,
    projectedPoints: parseFloat(r.projected_points),
    zScores: null,
    isRookie: r.is_rookie,
    injuryStatus: r.injury_status,
    espnId: r.espn_id,
    headshot: r.headshot_url,
    height: r.height,
    weight: r.weight,
    age: r.age,
    college: r.college,
    debutYear: r.debut_year,
    experienceYears: r.experience_years,
    birthPlace: r.birth_place,
    jersey: r.jersey,
    vegasScore: r.vegas_score ? parseFloat(r.vegas_score) : null,
    vegasRank: r.vegas_rank,
  };
}

/**
 * Check if a player pool exists for a given sport/season.
 * If not, generate it on the fly.
 */
// In-memory flag: tracks which (sport, seasonYear) pools have been confirmed
// to exist in the DB during this server process. Avoids a redundant COUNT query
// on every /api/dd/players request once the pool is known to exist.
const _poolExistsCache = new Set<string>();

export async function ensurePlayerPool(
  sport: Sport,
  seasonYear: number,
  scoringPreset: string
): Promise<{ count: number; generated: boolean }> {
  const cacheKey = `${sport}:${seasonYear}`;
  if (_poolExistsCache.has(cacheKey)) {
    return { count: 0, generated: false };
  }

  const existing = await queryOne<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM dd_player_pool WHERE sport = $1 AND season_year = $2`,
    [sport, seasonYear]
  );

  if (existing && parseInt(existing.cnt, 10) > 0) {
    _poolExistsCache.add(cacheKey);
    return { count: parseInt(existing.cnt, 10), generated: false };
  }

  // Generate the pool
  const result = await generatePlayerPool({ sport, seasonYear, scoringPreset });
  _poolExistsCache.add(cacheKey);
  return { count: result.count, generated: true };
}
