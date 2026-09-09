/**
 * Community poll engine — "Who Will Win?"
 *
 * Each day we surface 3-4 real games from our odds_snapshots table as
 * lightweight, anonymous community polls on the homepage. Visitors vote
 * for which team they think will win, and see live vote tallies.
 *
 * Design goals:
 *   - No login required (anonymous, fingerprint-deduped).
 *   - Resets daily (polls are scoped to a date).
 *   - Self-seeding: if today's polls don't exist yet, they're generated
 *     on the first request from the freshest game data in odds_snapshots.
 *   - Minimal DB footprint (a few rows/day, tiny votes table).
 */

import { query } from '@/lib/db';
import type { Poll, PollDTO } from '@/lib/polls-types';
import { listEspnGames, type EspnGame } from '@/lib/espn-scores';

// Re-export types and display helpers so API routes can import
// everything from '@/lib/polls' without pulling in the client-safe
// types file separately.
export type { Poll, PollDTO } from '@/lib/polls-types';
export { sportLabel, sportEmoji } from '@/lib/polls-types';

const MAX_POLLS = 4;
const MAX_PER_SPORT = 2;
const LOOKAHEAD_HOURS = 30;

/**
 * Generate a voter fingerprint from IP + user-agent.
 * Uses a simple FNV-1a hash — we don't need cryptographic strength,
 * just a stable, irreversible identifier for dedup.
 */
export function voterFingerprint(ip: string, userAgent: string): string {
  const raw = `${ip}::${userAgent}`;
  // FNV-1a 32-bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Mix in a second pass for better distribution
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Extract the client IP from a Next.js Request, accounting for proxies.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return '0.0.0.0';
}

type SeedGame = {
  game_id: string;
  sport: string;
  home_team: string;
  away_team: string;
  commence_time: Date;
};

/**
 * Insert seeded games as today's polls (idempotent via ON CONFLICT).
 * `startOrder` preserves call-site ordering: odds-sourced rows are inserted
 * first, ESPN fallback rows continue from where that list ended.
 */
async function insertPolls(games: SeedGame[], startOrder = 0): Promise<number> {
  if (games.length === 0) return 0;

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const values: string[] = [];
  const params: unknown[] = [];
  games.forEach((g, i) => {
    const base = i * 7;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`);
    params.push(today, g.sport, g.game_id, g.home_team, g.away_team, g.commence_time, startOrder + i);
  });

  await query(
    `INSERT INTO community_polls (poll_date, sport, game_id, home_team, away_team, commence_time, display_order)
     VALUES ${values.join(', ')}
     ON CONFLICT (poll_date, game_id) DO NOTHING`,
    params,
  );
  return games.length;
}

// Throttle ESPN fallback attempts so a persistent outage doesn't turn every
// 30s poll refresh into a scoreboard fetch storm. One attempt per 5 min.
const ESPN_FALLBACK_THROTTLE_MS = 5 * 60 * 1000;
let espnFallbackLastAttempt = 0;

/** Local mirror of the SQL-side name normalization (strips [ .'-]). */
function normalizeName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[ .'-]/g, '');
}

/**
 * Top up today's poll slate from ESPN's public scoreboard API.
 *
 * Used when odds_snapshots can't fill the slate (ingestion outage, or an
 * off-night with no eligible odds). Mirrors the odds path's selection model:
 * same quality scoring, dedup by normalized team names, MAX_PER_SPORT cap,
 * and skips games already seeded from odds so we never double-list a matchup.
 */
async function topUpFromEspn(alreadySeeded: SeedGame[]): Promise<number> {
  // Throttle: at most one ESPN attempt per window.
  if (Date.now() - espnFallbackLastAttempt < ESPN_FALLBACK_THROTTLE_MS) return 0;
  espnFallbackLastAttempt = Date.now();

  // Same sport preference order as the odds query's quality scoring:
  // major US sports (50), soccer (20). MMA/UFC events are fights not team
  // matchups, and fight cards churn constantly — skip them for polls.
  const sports = ['NFL', 'MLB', 'NBA', 'NHL', 'SOCCER'];
  const all = await listEspnGames(sports);
  if (all.length === 0) return 0;

  const seededKeys = new Set(
    alreadySeeded.map((g) => {
      const a = normalizeName(g.home_team);
      const b = normalizeName(g.away_team);
      return [a, b].sort().join('|');
    }),
  );

  const scored = all
    .filter((g) => {
      if (!g.homeTeam || !g.awayTeam) return false;
      if (g.state !== 'pre') return false; // only not-yet-started games
      const t = g.startTime ? new Date(g.startTime).getTime() : NaN;
      if (!Number.isFinite(t)) return false;
      // Same window as the odds path: started <1h ago .. starts within 30h.
      if (t < Date.now() - 60 * 60 * 1000) return false;
      if (t > Date.now() + LOOKAHEAD_HOURS * 60 * 60 * 1000) return false;
      const a = normalizeName(g.homeTeam);
      const b = normalizeName(g.awayTeam);
      if (!a || !b) return false;
      return !seededKeys.has([a, b].sort().join('|'));
    })
    .map((g) => {
      const quality = g.sport === 'SOCCER' ? 20 : 50; // majors 50, soccer 20 (same as odds)
      return { g, quality };
    });

  // Rank within each sport (soonest first), cap MAX_PER_SPORT per sport.
  const perSport = new Map<string, { g: EspnGame; quality: number }[]>();
  for (const item of scored) {
    const list = perSport.get(item.g.sport) || [];
    list.push(item);
    perSport.set(item.g.sport, list);
  }

  const picks: { g: EspnGame; quality: number }[] = [];
  for (const [, list] of perSport) {
    list.sort((x, y) => {
      const tx = new Date(x.g.startTime || 0).getTime();
      const ty = new Date(y.g.startTime || 0).getTime();
      if (ty !== tx) return tx - ty; // soonest first
      return y.quality - x.quality;
    });
    picks.push(...list.slice(0, MAX_PER_SPORT));
  }

  if (picks.length === 0) return 0;

  // Final ordering matches the odds path (quality DESC, soonest ASC) and
  // the total is capped at the remaining slate slots.
  picks.sort((x, y) => {
    if (y.quality !== x.quality) return y.quality - x.quality;
    return new Date(x.g.startTime || 0).getTime() - new Date(y.g.startTime || 0).getTime();
  });
  const remaining = Math.max(0, MAX_POLLS - alreadySeeded.length);
  const chosen = picks.slice(0, remaining);

  const toInsert: SeedGame[] = chosen.map((p) => ({
    game_id: p.g.eventId ? `espn-${p.g.eventId}` : `espn-${normalizeName(p.g.homeTeam)}-${normalizeName(p.g.awayTeam)}`,
    sport: p.g.sport,
    home_team: p.g.homeTeam,
    away_team: p.g.awayTeam,
    commence_time: new Date(p.g.startTime as string),
  }));

  return insertPolls(toInsert, alreadySeeded.length);
}

/**
 * Seed today's polls from the freshest game data in odds_snapshots,
 * topping up from ESPN's public scoreboard API when odds can't fill
 * the slate (e.g. odds-ingestion outage).
 *
 * The odds path picks up to MAX_POLLS games commencing in the next
 * LOOKAHEAD_HOURS, deduplicated by normalized team names, with quality
 * scoring that prefers real professional teams and major sports. The
 * ESPN fallback mirrors that model so poll output looks identical
 * regardless of source.
 *
 * Idempotent — safe to call on every request (uses ON CONFLICT DO NOTHING).
 */
async function seedTodaysPolls(): Promise<void> {
  // Only seed if we don't already have enough polls for today.
  // This prevents the displayed polls from changing between requests
  // as the underlying odds data refreshes.
  const existing = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM community_polls WHERE poll_date = CURRENT_DATE`,
  );
  if (parseInt(existing.rows[0]?.count ?? '0', 10) >= MAX_POLLS) return;

  // Selection query:
  // 1. Eligible: h2h games in the lookahead window with non-empty team names.
  // 2. Quality score: +100 if no parenthetical names (real teams), +50 for
  //    major US sports, +20 for soccer, +10 otherwise.
  // 3. Deduplicate by normalized (home, away) — handles "St. Louis" vs
  //    "St.Louis" style variants across different sportsbook feeds.
  // 4. Rank within each sport, cap at MAX_PER_SPORT for variety.
  // 5. Take top MAX_POLLS by quality then commence time.
  const selectSQL = `
    WITH eligible AS (
      SELECT DISTINCT
        game_id, sport, home_team, away_team, commence_time,
        LENGTH(home_team) + LENGTH(away_team) AS name_len,
        LOWER(REGEXP_REPLACE(home_team, $$[ .'-]$$, '', 'g')) AS home_norm,
        LOWER(REGEXP_REPLACE(away_team, $$[ .'-]$$, '', 'g')) AS away_norm,
        CASE WHEN home_team NOT LIKE '%(%)%' AND away_team NOT LIKE '%(%)%' THEN 100 ELSE 0 END
        + CASE
            WHEN sport IN ('BASEBALL','MMA','BASKETBALL','AMERICAN_FOOTBALL','ICE_HOCKEY') THEN 50
            WHEN sport = 'SOCCER' THEN 20
            ELSE 10
          END AS quality
      FROM odds_snapshots
      WHERE market_type = 'h2h'
        AND commence_time > NOW() - INTERVAL '1 hour'
        AND commence_time < NOW() + INTERVAL '${LOOKAHEAD_HOURS} hours'
        AND home_team IS NOT NULL AND away_team IS NOT NULL
        AND home_team != '' AND away_team != ''
    ),
    deduped AS (
      SELECT DISTINCT ON (home_norm, away_norm)
        game_id, sport, home_team, away_team, commence_time, name_len, quality
      FROM eligible
      ORDER BY home_norm, away_norm, quality DESC, name_len DESC, commence_time ASC
    ),
    ranked AS (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY sport ORDER BY quality DESC, commence_time ASC) AS sport_rank
      FROM deduped
    )
    SELECT game_id, sport, home_team, away_team, commence_time, quality
    FROM ranked
    WHERE sport_rank <= ${MAX_PER_SPORT}
    ORDER BY quality DESC, commence_time ASC
    LIMIT ${MAX_POLLS}
  `;

  const games = await query<{
    game_id: string;
    sport: string;
    home_team: string;
    away_team: string;
    commence_time: Date;
  }>(selectSQL);

  const oddsGames: SeedGame[] = games.rows.map((g) => ({
    game_id: g.game_id,
    sport: g.sport,
    home_team: g.home_team,
    away_team: g.away_team,
    commence_time: g.commence_time,
  }));

  // Insert odds-sourced polls first (preferred source, first pick of
  // display_order). Only top up from ESPN if odds couldn't fill the slate.
  await insertPolls(oddsGames, 0);

  if (oddsGames.length < MAX_POLLS) {
    try {
      await topUpFromEspn(oddsGames);
    } catch (err) {
      console.error('[polls] ESPN fallback seeding failed:', err);
    }
  }
}

/**
 * Get today's polls with live vote tallies.
 * Seeds first if needed.
 *
 * @param voterFingerprint - if provided, includes which team this voter
 *   already voted for (so the UI can show their selection).
 */
export async function getTodaysPolls(
  fingerprint?: string,
): Promise<Poll[]> {
  try {
    await seedTodaysPolls();

    const r = await query<{
      id: number;
      sport: string;
      home_team: string;
      away_team: string;
      commence_time: Date;
      display_order: number;
      home_votes: number;
      away_votes: number;
      user_vote: string | null;
    }>(
      `SELECT
         p.id, p.sport, p.home_team, p.away_team, p.commence_time, p.display_order,
         COUNT(v.id) FILTER (WHERE v.voted_for = p.home_team) AS home_votes,
         COUNT(v.id) FILTER (WHERE v.voted_for = p.away_team) AS away_votes,
         ${fingerprint ? `(SELECT voted_for FROM community_poll_votes WHERE poll_id = p.id AND voter_fingerprint = $1)` : 'NULL'} AS user_vote
       FROM community_polls p
       LEFT JOIN community_poll_votes v ON v.poll_id = p.id
       WHERE p.poll_date = CURRENT_DATE
       GROUP BY p.id, p.sport, p.home_team, p.away_team, p.commence_time, p.display_order
       ORDER BY p.display_order ASC
       LIMIT ${MAX_POLLS}`,
      fingerprint ? [fingerprint] : [],
    );

    return r.rows.map((row) => ({
      id: row.id,
      sport: row.sport,
      homeTeam: row.home_team,
      awayTeam: row.away_team,
      commenceTime: new Date(row.commence_time).toISOString(),
      displayOrder: row.display_order,
      homeVotes: parseInt(String(row.home_votes), 10) || 0,
      awayVotes: parseInt(String(row.away_votes), 10) || 0,
      totalVotes: (parseInt(String(row.home_votes), 10) || 0) + (parseInt(String(row.away_votes), 10) || 0),
      userVote:
        row.user_vote === row.home_team
          ? 'home'
          : row.user_vote === row.away_team
            ? 'away'
            : null,
    }));
  } catch (err) {
    console.error('[polls] Error getting todays polls:', err);
    return [];
  }
}

/**
 * Record a vote. Deduplicates by fingerprint — if the voter already
 * voted on this poll, their vote is updated (changed) rather than
 * duplicated. This lets people change their mind.
 *
 * Returns the updated poll with new tallies, or null on failure.
 */
export async function castVote(
  pollId: number,
  team: 'home' | 'away',
  fingerprint: string,
): Promise<PollDTO | null> {
  try {
    const poll = await query<{
      home_team: string;
      away_team: string;
    }>(`SELECT home_team, away_team FROM community_polls WHERE id = $1`, [pollId]);

    if (poll.rows.length === 0) return null;

    const votedFor = team === 'home' ? poll.rows[0].home_team : poll.rows[0].away_team;

    // Upsert: if voter already voted, update their choice; otherwise insert.
    await query(
      `INSERT INTO community_poll_votes (poll_id, voted_for, voter_fingerprint)
       VALUES ($1, $2, $3)
       ON CONFLICT (poll_id, voter_fingerprint)
       DO UPDATE SET voted_for = EXCLUDED.voted_for, created_at = NOW()`,
      [pollId, votedFor, fingerprint],
    );

    // Return updated tallies
    const r = await query<{
      id: number;
      sport: string;
      home_team: string;
      away_team: string;
      commence_time: Date;
      display_order: number;
      home_votes: number;
      away_votes: number;
    }>(
      `SELECT
         p.id, p.sport, p.home_team, p.away_team, p.commence_time, p.display_order,
         COUNT(v.id) FILTER (WHERE v.voted_for = p.home_team) AS home_votes,
         COUNT(v.id) FILTER (WHERE v.voted_for = p.away_team) AS away_votes
       FROM community_polls p
       LEFT JOIN community_poll_votes v ON v.poll_id = p.id
       WHERE p.id = $1
       GROUP BY p.id, p.sport, p.home_team, p.away_team, p.commence_time, p.display_order`,
      [pollId],
    );

    if (r.rows.length === 0) return null;

    const row = r.rows[0];
    const homeVotes = parseInt(String(row.home_votes), 10) || 0;
    const awayVotes = parseInt(String(row.away_votes), 10) || 0;
    return {
      id: row.id,
      sport: row.sport,
      homeTeam: row.home_team,
      awayTeam: row.away_team,
      commenceTime: new Date(row.commence_time).toISOString(),
      displayOrder: row.display_order,
      homeVotes,
      awayVotes,
      totalVotes: homeVotes + awayVotes,
    };
  } catch (err) {
    console.error('[polls] Error casting vote:', err);
    return null;
  }
}
