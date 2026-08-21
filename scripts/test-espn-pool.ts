/**
 * One-off test: run the ESPN pool fetcher and print summary stats to verify
 * counts, positions, and star rankings before we wire it into the DB.
 */
import { fetchEspnPool } from '../lib/dd/espn-pool';
import { getScoringPreset } from '../lib/dd/presets';

async function main() {
  for (const sport of ['NFL', 'MLB'] as const) {
    const scoring = getScoringPreset(sport, sport === 'NFL' ? 'standard_ppr' : 'standard');
    console.log(`\n=== ${sport} ===`);
    const result = await fetchEspnPool(sport, 2026, scoring);
    console.log(`Total players: ${result.count}`);

    // Position breakdown
    const byPos: Record<string, number> = {};
    let emptyPos = 0;
    for (const p of result.players) {
      byPos[p.position] = (byPos[p.position] ?? 0) + 1;
      if (!p.position) emptyPos++;
    }
    console.log('By position:', byPos);
    console.log(`Empty positions: ${emptyPos}`);

    // Top 25 by projected points
    console.log('Top 25:');
    for (const p of result.players.slice(0, 25)) {
      console.log(
        `  ${String(p.projectedPoints).padStart(6)}  ${p.position.padEnd(4)} ${p.team ?? '---'}  ${p.playerName}`
      );
    }
  }
}

main().catch((e) => {
  console.error('TEST FAILED:', e);
  process.exit(1);
});
