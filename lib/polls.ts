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

/**
 * Seed today's polls from the freshest game data in odds_snapshots.
 *
 * Picks up to MAX_POLLS games commencing in the next LOOKAHEAD_HOURS,
 * deduplicated by normalized team names, with quality scoring that
 * prefers real professional teams (no esports usernames) and major sports.
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

  if (games.rows.length === 0) return;

  // Insert with ON CONFLICT DO NOTHING (idempotent — if polls already
  // exist for today, this is a no-op).
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const values: string[] = [];
  const params: unknown[] = [];
  games.rows.forEach((g, i) => {
    const base = i * 7;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`);
    params.push(today, g.sport, g.game_id, g.home_team, g.away_team, g.commence_time, i);
  });

  await query(
    `INSERT INTO community_polls (poll_date, sport, game_id, home_team, away_team, commence_time, display_order)
     VALUES ${values.join(', ')}
     ON CONFLICT (poll_date, game_id) DO NOTHING`,
    params,
  );
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
