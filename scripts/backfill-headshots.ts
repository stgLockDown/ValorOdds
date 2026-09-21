/**
 * Backfill dd_player_pool bio columns (espn_id, headshot_url, height, weight,
 * age, college, debut_year, experience_years, birth_place, jersey) for rows
 * that are missing them.
 *
 * Why this exists: `scripts/regenerate-pool.ts` used to INSERT without the bio
 * columns, so every pool regeneration wiped NFL + MLB headshots. That script is
 * now fixed, but existing rows still need repairing.
 *
 * Matching is by (sport, season_year, UPPER(player_name)) — team is NOT used
 * because ESPN team abbreviations drift (e.g. "WSH" vs "WAS") and would leave
 * players unmatched.
 *
 * Run: npx tsx scripts/backfill-headshots.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { fetchEspnPool } from '../lib/dd/espn-pool';
import { getScoringPreset } from '../lib/dd/presets';

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

async function backfillSport(pool: Pool, sport: 'NFL' | 'MLB') {
  console.log(`\n=== Backfilling ${sport} ${SEASON_YEAR} ===`);
  const scoringKey = sport === 'NFL' ? 'standard_ppr' : 'standard';
  const scoring = getScoringPreset(sport, scoringKey);
  const result = await fetchEspnPool(sport, SEASON_YEAR, scoring, 500);
  console.log(`Fetched ${result.players.length} ESPN players.`);

  const client = await pool.connect();
  let matched = 0;
  let unmatched = 0;
  const unmatchedSamples: string[] = [];
  try {
    await client.query('BEGIN');
    for (const p of result.players) {
      const res = await client.query(
        `UPDATE dd_player_pool
            SET espn_id          = COALESCE($1, espn_id),
                headshot_url     = COALESCE($2, headshot_url),
                height           = COALESCE($3, height),
                weight           = COALESCE($4, weight),
                age              = COALESCE($5, age),
                college          = COALESCE($6, college),
                debut_year       = COALESCE($7, debut_year),
                experience_years = COALESCE($8, experience_years),
                birth_place      = COALESCE($9, birth_place),
                jersey           = COALESCE($10, jersey)
          WHERE sport = $11
            AND season_year = $12
            AND UPPER(TRIM(player_name)) = $13`,
        [
          p.espnId || null,
          p.headshot || null,
          p.height || null,
          p.weight || null,
          p.age ?? null,
          p.college || null,
          p.debutYear ?? null,
          p.experienceYears ?? null,
          p.birthPlace || null,
          p.jersey || null,
          sport,
          SEASON_YEAR,
          p.playerName.toUpperCase().trim(),
        ]
      );
      if (res.rowCount && res.rowCount > 0) matched += res.rowCount;
      else {
        unmatched++;
        if (unmatchedSamples.length < 10) unmatchedSamples.push(p.playerName);
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  console.log(`${sport}: updated ${matched} rows; ${unmatched} ESPN players had no DB match.`);
  if (unmatchedSamples.length) console.log(`  Unmatched: ${unmatchedSamples.join(', ')}`);
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await backfillSport(pool, 'NFL');
    await backfillSport(pool, 'MLB');

    const check = await pool.query(
      `SELECT sport,
              COUNT(*)::text AS total,
              COUNT(headshot_url)::text AS with_headshot,
              COUNT(espn_id)::text AS with_espn
         FROM dd_player_pool
        WHERE season_year = $1
        GROUP BY sport
        ORDER BY sport`,
      [SEASON_YEAR]
    );
    console.log('\n=== Final state ===');
    for (const r of check.rows) {
      console.log(`${r.sport}: ${r.with_headshot}/${r.total} headshots, ${r.with_espn}/${r.total} espn_id`);
    }
  } finally {
    await pool.end();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
