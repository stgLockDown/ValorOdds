/**
 * DiamondDraft — Player Info Engine
 *
 * Fetches ESPN career season statistics for a player (using their ESPN ID)
 * and generates AI analytics / fantasy insight for the hover info card.
 *
 * Data flow:
 *   1. Look up the player in dd_player_pool (by pool ID) → get espn_id + bio
 *   2. Fetch ESPN statisticslog → get list of seasons with stat $ref links
 *   3. Fetch the most recent 3 seasons' stat lines from ESPN core API
 *   4. Fetch DB player_season_stats (if available) for cross-reference
 *   5. Generate AI analytics using the same provider ladder as the chat feature
 *      (OpenAI primary, DeepSeek fallback)
 */

import type { Sport } from './presets';
import { getPlayerByIdFromPool, getPlayerFromPool } from './player-pool';
import { query } from '@/lib/db';

const ESPN_CORE = 'https://sports.core.api.espn.com/v2/sports';
const SPORT_LEAGUE: Record<string, string> = {
  NFL: 'football/leagues/nfl',
  MLB: 'baseball/leagues/mlb',
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SeasonStatLine {
  season: number;
  stats: Record<string, { value: string; displayName: string; perGame?: string }>;
}

export interface PlayerInfo {
  // Identity
  poolId: string;
  playerName: string;
  team: string | null;
  position: string | null;
  sport: Sport;
  seasonYear: number;
  // Draft metrics
  rank: number | null;
  tier: number | null;
  adp: number | null;
  projectedPoints: number | null;
  projection: Record<string, number> | null;
  isRookie: boolean;
  injuryStatus: string | null;
  // Bio
  espnId: string | null;
  headshot: string | null;
  height: string | null;
  weight: string | null;
  age: number | null;
  college: string | null;
  debutYear: number | null;
  experienceYears: number | null;
  birthPlace: string | null;
  jersey: string | null;
  // Career stats from ESPN (recent seasons)
  careerStats: SeasonStatLine[];
  // DB season stats (if available)
  dbSeasonStats: {
    season: string;
    gamesPlayed: number;
    avgFantasyScore: number | null;
    totalFantasyScore: number | null;
    avgYards: number | null;
    avgTouchdowns: number | null;
    avgHomeRuns: number | null;
    avgRbis: number | null;
    avgStrikeouts: number | null;
    avgHits: number | null;
  } | null;
  // AI analytics
  aiAnalytics: string | null;
  aiError: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ESPN stat fetching
// ─────────────────────────────────────────────────────────────────────────────

interface EspnStatLogEntry {
  season: { $ref: string };
  statistics: Array<{ type: string; statistics: { $ref: string } }>;
}

interface EspnStatSplit {
  categories: Array<{
    name: string;
    displayName: string;
    stats: Array<{
      name: string;
      displayName: string;
      value: number;
      displayValue: string;
      perGameValue?: number;
      perGameDisplayValue?: string;
      abbreviation?: string;
    }>;
  }>;
}

async function fetchEspnStatLog(
  sport: Sport,
  espnId: string
): Promise<EspnStatLogEntry[]> {
  // Skip synthetic DEF IDs (format "DEF-<teamId>")
  if (espnId.startsWith('DEF-')) return [];

  const path = SPORT_LEAGUE[sport];
  if (!path) return [];

  const url = `${ESPN_CORE}/${path}/athletes/${espnId}/statisticslog?lang=en&region=us`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ValorOdds/1.0 (player-info)' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const entries: EspnStatLogEntry[] = data?.entries ?? [];
  return entries;
}

/**
 * Fetch a single season's stat line from ESPN core API.
 * Extracts fantasy-relevant stats into a flat dictionary.
 */
async function fetchEspnSeasonStats(refUrl: string): Promise<SeasonStatLine | null> {
  try {
    const res = await fetch(refUrl, {
      headers: { 'User-Agent': 'ValorOdds/1.0 (player-info)' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data: EspnStatSplit = await res.json();

    const stats: SeasonStatLine['stats'] = {};
    for (const cat of data?.categories ?? []) {
      for (const s of cat.stats ?? []) {
        // Only keep stats with meaningful values (skip null/undefined)
        if (s.value === undefined || s.value === null) continue;
        stats[s.name] = {
          value: s.displayValue || String(s.value),
          displayName: s.displayName,
          perGame: s.perGameDisplayValue,
        };
      }
    }
    return { season: 0, stats }; // season filled in by caller
  } catch {
    return null;
  }
}

/**
 * Fetch the most recent N seasons of stats from ESPN for a player.
 */
async function fetchCareerStats(
  sport: Sport,
  espnId: string,
  maxSeasons = 3
): Promise<SeasonStatLine[]> {
  const log = await fetchEspnStatLog(sport, espnId);
  if (log.length === 0) return [];

  // Extract season year from the $ref URL and sort descending
  const seasons = log
    .map((entry) => {
      const ref = entry.season?.$ref ?? '';
      const match = ref.match(/\/seasons\/(\d{4})\b/);
      const year = match ? parseInt(match[1], 10) : 0;
      const totalStatRef = entry.statistics?.find((s) => s.type === 'total')?.statistics?.$ref;
      return { year, ref: totalStatRef };
    })
    .filter((s) => s.year > 0 && s.ref)
    .sort((a, b) => b.year - a.year);

  // Fetch the most recent N seasons in parallel
  const recent = seasons.slice(0, maxSeasons);
  const results = await Promise.all(
    recent.map(async (s) => {
      const line = await fetchEspnSeasonStats(s.ref!);
      if (!line) return null;
      line.season = s.year;
      return line;
    })
  );

  return results.filter((r): r is SeasonStatLine => r !== null);
}

// ─────────────────────────────────────────────────────────────────────────────
// DB season stats (cross-reference)
// ─────────────────────────────────────────────────────────────────────────────

async function fetchDbSeasonStats(
  sport: Sport,
  playerName: string
): Promise<PlayerInfo['dbSeasonStats']> {
  try {
    const res = await query<{
      season: string;
      games_played: number;
      avg_fantasy_score: string | null;
      total_fantasy_score: string | null;
      avg_yards: string | null;
      avg_touchdowns: string | null;
      avg_home_runs: string | null;
      avg_rbis: string | null;
      avg_strikeouts: string | null;
      avg_hits: string | null;
    }>(
      `SELECT season, games_played,
              avg_fantasy_score::text, total_fantasy_score::text,
              avg_yards::text, avg_touchdowns::text,
              avg_home_runs::text, avg_rbis::text,
              avg_strikeouts::text, avg_hits::text
       FROM player_season_stats
       WHERE sport = $1 AND player_name ILIKE $2
       ORDER BY season DESC LIMIT 1`,
      [sport, playerName]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      season: r.season,
      gamesPlayed: r.games_played,
      avgFantasyScore: r.avg_fantasy_score ? parseFloat(r.avg_fantasy_score) : null,
      totalFantasyScore: r.total_fantasy_score ? parseFloat(r.total_fantasy_score) : null,
      avgYards: r.avg_yards ? parseFloat(r.avg_yards) : null,
      avgTouchdowns: r.avg_touchdowns ? parseFloat(r.avg_touchdowns) : null,
      avgHomeRuns: r.avg_home_runs ? parseFloat(r.avg_home_runs) : null,
      avgRbis: r.avg_rbis ? parseFloat(r.avg_rbis) : null,
      avgStrikeouts: r.avg_strikeouts ? parseFloat(r.avg_strikeouts) : null,
      avgHits: r.avg_hits ? parseFloat(r.avg_hits) : null,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Analytics — same provider ladder as the chat feature
// ─────────────────────────────────────────────────────────────────────────────

interface Provider {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  style: 'gpt5' | 'legacy';
}

const isGpt5 = (model: string) => /^(gpt-5|o[0-9])/i.test(model);

function buildAnalyticsProviders(): Provider[] {
  const openaiKey = process.env.OPENAI_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const providers: Provider[] = [];

  if (openaiKey) {
    const models = [
      process.env.OPENAI_CHAT_MODEL || 'gpt-5.5',
      process.env.OPENAI_CHAT_FALLBACK_MODEL || 'gpt-5.4',
      process.env.OPENAI_CHAT_MINI_MODEL || 'gpt-5.4-mini',
    ].filter((m, i, arr) => m && arr.indexOf(m) === i);
    for (const model of models) {
      providers.push({
        name: `openai:${model}`,
        baseUrl: 'https://api.openai.com/v1',
        apiKey: openaiKey,
        model,
        style: isGpt5(model) ? 'gpt5' : 'legacy',
      });
    }
  }

  if (deepseekKey) {
    providers.push({
      name: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: deepseekKey,
      model: process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-chat',
      style: 'legacy',
    });
  }

  return providers;
}

async function callAnalyticsProvider(
  p: Provider,
  messages: Array<{ role: string; content: string }>
): Promise<string | null> {
  const payload: Record<string, unknown> = {
    model: p.model,
    messages,
    stream: false,
  };
  if (p.style === 'gpt5') {
    payload.max_completion_tokens = 600;
  } else {
    payload.max_tokens = 600;
    payload.temperature = 0.5;
  }

  try {
    const res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${p.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(
        `[player-info/ai] ${p.name} returned ${res.status}: ${body.slice(0, 200)}`
      );
      return null;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content : null;
  } catch (err) {
    console.warn(`[player-info/ai] ${p.name} error:`, err);
    return null;
  }
}

/**
 * Build a concise text summary of the player's stats for the AI prompt.
 */
function buildStatsSummary(
  sport: Sport,
  projectedPoints: number | null,
  projection: Record<string, number> | null,
  careerStats: SeasonStatLine[],
  dbStats: PlayerInfo['dbSeasonStats']
): string {
  const lines: string[] = [];

  lines.push(`Sport: ${sport}`);
  if (projectedPoints !== null) {
    lines.push(`Projected fantasy points/game: ${projectedPoints.toFixed(1)}`);
  }
  if (projection) {
    const projStr = Object.entries(projection)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    lines.push(`Projections: ${projStr}`);
  }

  if (careerStats.length > 0) {
    lines.push('\nRecent ESPN season stats:');
    for (const season of careerStats) {
      // Extract the most fantasy-relevant stats
      const keyStats: string[] = [];
      if (sport === 'NFL') {
        const passYd = season.stats['passingYards'];
        const passTd = season.stats['passingTouchdowns'];
        const interceptions = season.stats['interceptions'];
        const rushYd = season.stats['rushingYards'];
        const rushTd = season.stats['rushingTouchdowns'];
        const rec = season.stats['receptions'];
        const recYd = season.stats['receivingYards'];
        const recTd = season.stats['receivingTouchdowns'];
        const gp = season.stats['gamesPlayed'];
        if (gp) keyStats.push(`GP: ${gp.value}`);
        if (passYd) keyStats.push(`Pass Yds: ${passYd.value}`);
        if (passTd) keyStats.push(`Pass TD: ${passTd.value}`);
        if (interceptions) keyStats.push(`INT: ${interceptions.value}`);
        if (rushYd) keyStats.push(`Rush Yds: ${rushYd.value}`);
        if (rushTd) keyStats.push(`Rush TD: ${rushTd.value}`);
        if (rec) keyStats.push(`Rec: ${rec.value}`);
        if (recYd) keyStats.push(`Rec Yds: ${recYd.value}`);
        if (recTd) keyStats.push(`Rec TD: ${recTd.value}`);
      } else {
        // MLB
        const gp = season.stats['gamesPlayed'];
        const avg = season.stats['battingAverage'];
        const hr = season.stats['homeRuns'];
        const rbi = season.stats['runsBattedIn'];
        const hits = season.stats['hits'];
        const sb = season.stats['stolenBases'];
        const k = season.stats['strikeouts'];
        const era = season.stats['era'];
        const wins = season.stats['wins'];
        const saves = season.stats['saves'];
        const innings = season.stats['inningsPitched'];
        if (gp) keyStats.push(`GP: ${gp.value}`);
        if (avg) keyStats.push(`AVG: ${avg.value}`);
        if (hr) keyStats.push(`HR: ${hr.value}`);
        if (rbi) keyStats.push(`RBI: ${rbi.value}`);
        if (hits) keyStats.push(`H: ${hits.value}`);
        if (sb) keyStats.push(`SB: ${sb.value}`);
        if (era) keyStats.push(`ERA: ${era.value}`);
        if (wins) keyStats.push(`W: ${wins.value}`);
        if (saves) keyStats.push(`SV: ${saves.value}`);
        if (innings) keyStats.push(`IP: ${innings.value}`);
        if (k) keyStats.push(`K: ${k.value}`);
      }
      if (keyStats.length > 0) {
        lines.push(`  ${season.season}: ${keyStats.join(', ')}`);
      }
    }
  }

  if (dbStats) {
    lines.push(
      `\nDB season stats (${dbStats.season}): ` +
        `${dbStats.gamesPlayed} GP, ` +
        `${dbStats.avgFantasyScore ?? '?'} avg fantasy pts/game, ` +
        `${dbStats.totalFantasyScore ?? '?'} total fantasy pts`
    );
  }

  return lines.join('\n');
}

/**
 * Generate AI analytics for a player using the configured providers.
 * Returns the analysis text or null if no provider succeeded.
 */
async function generateAIAnalytics(
  player: {
    playerName: string;
    team: string | null;
    position: string | null;
    sport: Sport;
    isRookie: boolean;
    injuryStatus: string | null;
    experienceYears: number | null;
    projectedPoints: number | null;
    projection: Record<string, number> | null;
    rank: number | null;
    tier: number | null;
    adp: number | null;
    college: string | null;
  },
  careerStats: SeasonStatLine[],
  dbStats: PlayerInfo['dbSeasonStats']
): Promise<{ text: string | null; error: string | null }> {
  const providers = buildAnalyticsProviders();
  if (providers.length === 0) {
    return { text: null, error: 'No AI provider configured' };
  }

  const statsSummary = buildStatsSummary(
    player.sport,
    player.projectedPoints,
    player.projection,
    careerStats,
    dbStats
  );

  const systemPrompt = `You are an expert fantasy sports analyst for ValorOdds DiamondDraft.
Provide a concise, data-driven fantasy analysis of the player.
Keep it to 3-4 short paragraphs. Cover:
1. Fantasy outlook and projected production
2. Strengths and what makes them valuable
3. Risks or concerns (injury, age, competition, etc.)
4. Draft recommendation (where to target them, value relative to ADP)
Be specific and reference the stats provided. Do not use markdown headers. Use plain text with short paragraphs.`;

  const userPrompt = `Analyze this ${player.sport} player for fantasy drafting:

Player: ${player.playerName}
Position: ${player.position || 'N/A'}
Team: ${player.team || 'N/A'}
${player.isRookie ? 'Rookie' : `Experience: ${player.experienceYears ?? '?'} years`}
${player.injuryStatus ? `Injury Status: ${player.injuryStatus}` : 'Injury Status: Healthy'}
${player.college ? `College: ${player.college}` : ''}
Draft Rank: #${player.rank ?? '?'} (Tier ${player.tier ?? '?'})
${player.adp ? `Estimated ADP: ${player.adp}` : ''}

${statsSummary}

Provide a concise fantasy analysis (3-4 short paragraphs).`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  for (const p of providers) {
    const result = await callAnalyticsProvider(p, messages);
    if (result && result.trim().length > 20) {
      return { text: result.trim(), error: null };
    }
  }

  return { text: null, error: 'All AI providers failed' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main: get full player info
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get full player info (bio + career stats + AI analytics) for the hover card.
 * Accepts either a dd_player_pool id or a sport+playerName lookup.
 */
export async function getPlayerInfo(opts: {
  poolId?: string;
  sport?: Sport;
  seasonYear?: number;
  playerName?: string;
}): Promise<PlayerInfo | null> {
  let player;
  if (opts.poolId) {
    player = await getPlayerByIdFromPool(opts.poolId);
  } else if (opts.sport && opts.seasonYear && opts.playerName) {
    player = await getPlayerFromPool(opts.sport, opts.seasonYear, opts.playerName);
  }
  if (!player) return null;

  // Fetch career stats from ESPN (if we have an ESPN ID)
  const careerStats: SeasonStatLine[] = player.espnId
    ? await fetchCareerStats(player.sport, player.espnId, 3).catch(() => [])
    : [];

  // Fetch DB season stats as cross-reference
  const dbSeasonStats = await fetchDbSeasonStats(player.sport, player.playerName);

  // Generate AI analytics
  const { text: aiAnalytics, error: aiError } = await generateAIAnalytics(
    {
      playerName: player.playerName,
      team: player.team,
      position: player.position,
      sport: player.sport,
      isRookie: player.isRookie,
      injuryStatus: player.injuryStatus,
      experienceYears: player.experienceYears ?? null,
      projectedPoints: player.projectedPoints,
      projection: player.projection,
      rank: player.rank,
      tier: player.tier,
      adp: player.adp,
      college: player.college ?? null,
    },
    careerStats,
    dbSeasonStats
  );

  return {
    poolId: player.id!,
    playerName: player.playerName,
    team: player.team,
    position: player.position,
    sport: player.sport,
    seasonYear: player.seasonYear,
    rank: player.rank,
    tier: player.tier,
    adp: player.adp,
    projectedPoints: player.projectedPoints,
    projection: player.projection,
    isRookie: player.isRookie,
    injuryStatus: player.injuryStatus,
    espnId: player.espnId ?? null,
    headshot: player.headshot ?? null,
    height: player.height ?? null,
    weight: player.weight ?? null,
    age: player.age ?? null,
    college: player.college ?? null,
    debutYear: player.debutYear ?? null,
    experienceYears: player.experienceYears ?? null,
    birthPlace: player.birthPlace ?? null,
    jersey: player.jersey ?? null,
    careerStats,
    dbSeasonStats,
    aiAnalytics,
    aiError,
  };
}
