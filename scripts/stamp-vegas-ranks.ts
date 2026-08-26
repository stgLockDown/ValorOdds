import { stampVegasRanks } from '@/lib/dd/vegas-rankings';

async function main() {
  for (const sport of ['MLB', 'NFL'] as const) {
    const res = await stampVegasRanks(sport, 2026);
    console.log(`${sport}: stamped ${res.stamped} players with vegas scores`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
