import { query } from '@/lib/db';

async function main() {
  const r = await query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name='dd_player_pool' ORDER BY ordinal_position`,
  );
  console.log('=== dd_player_pool columns ===');
  for (const row of r.rows as any[]) console.log(`  ${row.column_name} (${row.data_type})`);

  const odds = await query(
    `SELECT COUNT(*)::int AS n, COUNT(DISTINCT game_id)::int AS games
     FROM odds_snapshots
     WHERE sport_key = 'americanfootball_nfl'
       AND commence_time > NOW() - INTERVAL '24 hours'
       AND outcome_price != 0`,
  );
  console.log('=== NFL odds last 24h ===', JSON.stringify(odds.rows[0]));

  const mlb = await query(
    `SELECT COUNT(DISTINCT game_id)::int AS games
     FROM odds_snapshots
     WHERE sport_key = 'baseball_mlb'
       AND commence_time > NOW() - INTERVAL '12 hours'`,
  );
  console.log('=== MLB games last 12h ===', JSON.stringify(mlb.rows[0]));

  // Sample an upcoming NFL game to see the odds structure for computing totals
  const sample = await query(
    `SELECT DISTINCT ON (game_id) game_id, home_team, away_team, commence_time
     FROM odds_snapshots
     WHERE sport_key = 'americanfootball_nfl'
       AND commence_time > NOW() + INTERVAL '1 hour'
     ORDER BY game_id, commence_time ASC
     LIMIT 3`,
  );
  console.log('=== sample upcoming NFL games ===');
  for (const row of sample.rows as any[]) console.log(`  ${row.away_team} @ ${row.home_team} | ${row.commence_time} | gid=${row.game_id}`);

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
