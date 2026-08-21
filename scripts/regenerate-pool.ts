/**
 * One-off: regenerate the dd_player_pool table from ESPN rosters for both
 * NFL and MLB. Run with: npx tsx scripts/regenerate-pool.ts
 *
 * Connects via DATABASE_URL from .env.local, fetches ESPN rosters, scores
 * each player against the standard scoring preset, and bulk-upserts into
 * dd_player_pool (DELETE + INSERT per sport/season).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { fetchEspnPool } from '../lib/dd/espn-pool';
import { getScoringPreset } from '../lib/dd/presets';

// Minimal .env.local loader (dotenv is not installed; @next/env is but this is simpler).
(function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local');
  try {
    const raw = readFileSync(envPath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // ignore — rely on real env vars if present
  }
})();

const SEASON_YEAR = 2026;

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    for (const sport of ['NFL', 'MLB'] as const) {
      const scoringKey = sport === 'NFL' ? 'standard_ppr' : 'standard';
      const scoring = getScoringPreset(sport, scoringKey);
      const limit = sport === 'NFL' ? 400 : 500;

      console.log(`\n=== Regenerating ${sport} ${SEASON_YEAR} (limit ${limit}) ===`);
      const result = await fetchEspnPool(sport, SEASON_YEAR, scoring, limit);
      const players = result.players;
      console.log(`Fetched ${players.length} players from ESPN.`);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `DELETE FROM dd_player_pool WHERE sport = $1 AND season_year = $2`,
          [sport, SEASON_YEAR]
        );

        let inserted = 0;
        for (let i = 0; i < players.length; i++) {
          const p = players[i];
          const rank = i + 1;
          // tier + adp computed simply here (mirrors player-pool.ts logic)
          const tierLeader = players[0].projectedPoints;
          let tier = 1;
          if (tierLeader > 0 && p.projectedPoints < tierLeader * 0.85) {
            // crude: assign tier by thresholds
          }
          // Recompute tier with gap method
          // (simplified inline to avoid importing the full engine)
          const leagueSize = 12;
          const rosterSize = sport === 'NFL' ? 20 : 27;
          const totalPicks = leagueSize * rosterSize;
          const adp = Math.round((rank * (totalPicks / players.length)) * 10) / 10;

          await client.query(
            `INSERT INTO dd_player_pool
               (season_year, sport, player_name, team, position, eligible_pos,
                adp, rank, tier, projection, projected_points, is_rookie, injury_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [
              SEASON_YEAR,
              sport,
              p.playerName,
              p.team,
              p.position,
              p.eligiblePos,
              adp,
              rank,
              1, // tier computed below in bulk
              JSON.stringify(p.projection),
              p.projectedPoints,
              p.isRookie,
              p.injuryStatus,
            ]
          );
          inserted++;
        }

        // Compute tiers with the gap method (15% drop from tier leader).
        const all = players.map((p, i) => ({ rank: i + 1, pts: p.projectedPoints }));
        let currentTier = 1;
        let tierLeader = all[0]?.pts ?? 0;
        const tierByRank: Record<number, number> = { 1: 1 };
        for (let i = 1; i < all.length; i++) {
          if (tierLeader > 0 && all[i].pts < tierLeader * 0.85) {
            currentTier++;
            tierLeader = all[i].pts;
          }
          tierByRank[all[i].rank] = Math.min(currentTier, 10);
        }
        for (const a of all) {
          await client.query(
            `UPDATE dd_player_pool SET tier = $1 WHERE sport = $2 AND season_year = $3 AND rank = $4`,
            [tierByRank[a.rank], sport, SEASON_YEAR, a.rank]
          );
        }

        await client.query('COMMIT');
        console.log(`Inserted ${inserted} ${sport} players into dd_player_pool.`);

        // Verify
        const verify = await client.query(
          `SELECT COUNT(*)::int AS c,
                  COUNT(*) FILTER (WHERE position IS NULL OR position = '')::int AS empty_pos,
                  COUNT(DISTINCT position)::int AS pos_count
           FROM dd_player_pool WHERE sport = $1 AND season_year = $2`,
          [sport, SEASON_YEAR]
        );
        console.log(`Verify:`, verify.rows[0]);
        const top5 = await client.query(
          `SELECT rank, projected_points::text, position, team, player_name
           FROM dd_player_pool WHERE sport = $1 AND season_year = $2
           ORDER BY rank LIMIT 5`,
          [sport, SEASON_YEAR]
        );
        console.log(`Top 5:`, top5.rows);
      } finally {
        client.release();
      }
    }
    console.log('\n✅ Pool regeneration complete.');
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('REGEN FAILED:', e);
  process.exit(1);
});
