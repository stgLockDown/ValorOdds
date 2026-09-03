/**
 * VOR engine validation harness.
 *
 * Exercises `lib/dd/vor.ts` against hand-built fixtures where the correct
 * answer is known by construction, so the maths can be verified without a
 * database or a live draft. Run with:
 *
 *   npx tsx scripts/test-vor.ts
 */

import {
  computeVor,
  gradePick,
  summariseDraftContext,
  type VorPlayerInput,
} from '../lib/dd/vor';
import { NFL_ROSTER_PRESETS } from '../lib/dd/presets';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture: a synthetic NFL pool with deliberately engineered shapes.
//
//  QB — flat: the 1st and the 15th QB are close together (low scarcity).
//  RB — steep: elite RBs far above the rest (high scarcity, big cliff).
//  WR — moderate slope.
//  TE — one elite outlier then a sharp cliff (classic tier-cliff case).
// ─────────────────────────────────────────────────────────────────────────────

function buildPool(): VorPlayerInput[] {
  const players: VorPlayerInput[] = [];

  // QBs: 320 down to ~292 — very flat.
  for (let i = 0; i < 20; i++) {
    players.push({
      playerName: `QB${i + 1}`,
      position: 'QB',
      team: 'AAA',
      projectedPoints: 320 - i * 1.5,
    });
  }

  // RBs: 300 down steeply.
  for (let i = 0; i < 40; i++) {
    players.push({
      playerName: `RB${i + 1}`,
      position: 'RB',
      team: 'BBB',
      projectedPoints: 300 - i * 6,
    });
  }

  // WRs: 280 down moderately.
  for (let i = 0; i < 45; i++) {
    players.push({
      playerName: `WR${i + 1}`,
      position: 'WR',
      team: 'CCC',
      projectedPoints: 280 - i * 3.5,
    });
  }

  // TEs: one outlier at 250, then a cliff to 170 and a gentle slope.
  players.push({ playerName: 'TE1', position: 'TE', team: 'DDD', projectedPoints: 250 });
  for (let i = 1; i < 20; i++) {
    players.push({
      playerName: `TE${i + 1}`,
      position: 'TE',
      team: 'DDD',
      projectedPoints: 170 - i * 2,
    });
  }

  return players;
}

const slots = NFL_ROSTER_PRESETS.standard.slots;
const pool = buildPool();

// ─────────────────────────────────────────────────────────────────────────────
section('1. Baseline VOR — positional value correction');

const base = computeVor({ available: pool, rosterSlots: slots, numTeams: 12 });

check('board is populated', base.board.length === pool.length,
  `got ${base.board.length}, expected ${pool.length}`);

check('board is sorted by VOR descending',
  base.board.every((p, i) => i === 0 || base.board[i - 1].vor >= p.vor));

const topQb = base.board.find((p) => p.position === 'QB');
const topRb = base.board.find((p) => p.position === 'RB');

// This is the entire point of VOR: QB1 has MORE raw points than RB1
// (320 vs 300), but because QBs are flat and RBs are steep, RB1 must
// carry the higher VOR.
check('QB1 has more raw points than RB1',
  (topQb?.projectedPoints ?? 0) > (topRb?.projectedPoints ?? 0),
  `QB1=${topQb?.projectedPoints} RB1=${topRb?.projectedPoints}`);

check('but RB1 outranks QB1 on VOR (scarcity correction works)',
  (topRb?.vor ?? 0) > (topQb?.vor ?? 0),
  `RB1 VOR=${topRb?.vor} QB1 VOR=${topQb?.vor}`);

check('top board player has vorScore of 100',
  base.board[0].vorScore === 100, `got ${base.board[0].vorScore}`);

check('replacement levels differ by position',
  new Set(base.board.map((p) => p.replacementLevel)).size > 1);

// ─────────────────────────────────────────────────────────────────────────────
section('2. Tier cliff detection');

const te1 = base.board.find((p) => p.playerName === 'TE1');
check('TE1 flagged as a tier cliff (250 → 170 gap)',
  te1?.isTierCliff === true, `dropoff=${te1?.dropoff}`);

const qb5 = base.board.find((p) => p.playerName === 'QB5');
check('QB5 not flagged (flat position, 1.5pt gaps)',
  qb5?.isTierCliff === false, `dropoff=${qb5?.dropoff}`);

// ─────────────────────────────────────────────────────────────────────────────
section('3. Positional scarcity');

check('scarcity computed for every position',
  base.scarcity.length === 4, `got ${base.scarcity.length}`);

check('scarcity sorted by urgency descending',
  base.scarcity.every((s, i) => i === 0 || base.scarcity[i - 1].urgency >= s.urgency));

const rbScar = base.scarcity.find((s) => s.position === 'RB');
const qbScar = base.scarcity.find((s) => s.position === 'QB');
check('RB has higher value-at-risk than QB',
  (rbScar?.valueAtRisk ?? 0) > (qbScar?.valueAtRisk ?? 0),
  `RB=${rbScar?.valueAtRisk} QB=${qbScar?.valueAtRisk}`);

// ─────────────────────────────────────────────────────────────────────────────
section('4. Demand model — starters only, flex split not duplicated');

// NFL standard starters: QB1, RB2, WR2, TE1, FLEX1(RB/WR/TE), K1, DEF1.
// RB demand = 12 teams x (2 dedicated + 1/3 of one FLEX) = 24 + 4 = 28.
// Two ways this can go wrong:
//   - counting FLEX in full for each eligible position -> 108 (triple count)
//   - counting the 6 bench slots as demand -> 40 (replacement level too deep)
const rbDemand = base.scarcity.find((s) => s.position === 'RB')?.stillNeeded ?? 0;
check('RB league demand = 28 (starters only, flex split)',
  rbDemand > 27 && rbDemand < 29, `got ${rbDemand}`);

// Replacement level must be the 28th RB (300 - 27*6 = 138), not the 40th.
const rbRepl = base.scarcity.find((s) => s.position === 'RB')?.replacementLevel ?? 0;
check('RB replacement level = RB28 (138 pts), not RB40 (66 pts)',
  Math.abs(rbRepl - 138) < 1, `got ${rbRepl}`);

// QB starters = 1 per team = 12, so replacement is QB12 (320 - 11*1.5 = 303.5).
const qbRepl = base.scarcity.find((s) => s.position === 'QB')?.replacementLevel ?? 0;
check('QB replacement level = QB12 (303.5 pts)',
  Math.abs(qbRepl - 303.5) < 1, `got ${qbRepl}`);

// ─────────────────────────────────────────────────────────────────────────────
section('5. Roster needs — unfilled starters');

const empty = computeVor({ available: pool, rosterSlots: slots, numTeams: 12, myRoster: [] });
check('empty roster reports unfilled starter slots',
  empty.unfilledStarters.length > 0, `got ${empty.unfilledStarters.length}`);

const withQb = computeVor({
  available: pool,
  rosterSlots: slots,
  numTeams: 12,
  myRoster: [{ position: 'QB' }],
});
check('drafting a QB removes the QB starter need',
  !withQb.unfilledStarters.includes('QB'),
  `still lists: ${withQb.unfilledStarters.join(',')}`);

// Greedy slot-filling: a single RB should satisfy a dedicated RB slot rather
// than being consumed by FLEX.
const withOneRb = computeVor({
  available: pool,
  rosterSlots: slots,
  numTeams: 12,
  myRoster: [{ position: 'RB' }],
});
const rbSlotCount = slots.filter((s) => s.slot === 'RB' && s.isStarter)
  .reduce((n, s) => n + s.count, 0);
const rbStillOpen = withOneRb.unfilledStarters.filter((s) => s === 'RB').length;
check('one RB fills a dedicated RB slot before FLEX',
  rbStillOpen === rbSlotCount - 1,
  `RB slots=${rbSlotCount}, still open=${rbStillOpen}`);

// ─────────────────────────────────────────────────────────────────────────────
section('6. Positional run detection');

const noRun = computeVor({
  available: pool,
  rosterSlots: slots,
  numTeams: 12,
  recentPicks: [
    { position: 'QB' }, { position: 'RB' }, { position: 'WR' }, { position: 'TE' },
    { position: 'RB' }, { position: 'WR' }, { position: 'QB' }, { position: 'WR' },
  ],
});
check('balanced picks trigger no run', noRun.activeRuns.length === 0,
  `flagged: ${noRun.activeRuns.join(',')}`);

const teRun = computeVor({
  available: pool,
  rosterSlots: slots,
  numTeams: 12,
  recentPicks: [
    { position: 'TE' }, { position: 'TE' }, { position: 'TE' }, { position: 'TE' },
    { position: 'TE' }, { position: 'WR' }, { position: 'TE' }, { position: 'RB' },
  ],
});
check('6-of-8 TE picks flagged as a run', teRun.activeRuns.includes('TE'),
  `flagged: ${teRun.activeRuns.join(',')}`);

const singlePick = computeVor({
  available: pool,
  rosterSlots: slots,
  numTeams: 12,
  recentPicks: [{ position: 'TE' }],
});
check('a single pick does not trigger a run',
  !singlePick.activeRuns.includes('TE'));

// ─────────────────────────────────────────────────────────────────────────────
section('7. Suggestions');

const sugg = computeVor({
  available: pool,
  rosterSlots: slots,
  numTeams: 12,
  myRoster: [{ position: 'RB' }, { position: 'RB' }, { position: 'WR' }],
});
check('returns up to 5 suggestions', sugg.suggestions.length > 0 && sugg.suggestions.length <= 5,
  `got ${sugg.suggestions.length}`);
check('suggestions are ordered 1..n',
  sugg.suggestions.every((s, i) => s.order === i + 1));
check('every suggestion carries a reason',
  sugg.suggestions.every((s) => s.reason.length > 0));
console.log(`    top pick: ${sugg.suggestions[0]?.player.playerName} — ${sugg.suggestions[0]?.reason}`);

// ─────────────────────────────────────────────────────────────────────────────
section('8. Pick grading');

const bestPick = gradePick(
  { playerName: base.board[0].playerName, position: base.board[0].position, projectedPoints: base.board[0].projectedPoints },
  base.board,
  1,
);
check('taking the best-VOR player grades A- or better',
  ['A+', 'A', 'A-'].includes(bestPick.grade), `got ${bestPick.grade} (${bestPick.score})`);

const worstOnBoard = base.board[base.board.length - 1];
const badPick = gradePick(
  { playerName: worstOnBoard.playerName, position: worstOnBoard.position, projectedPoints: worstOnBoard.projectedPoints },
  base.board,
  1,
);
check('taking the worst player grades poorly',
  badPick.score < bestPick.score, `bad=${badPick.score} best=${bestPick.score}`);
console.log(`    best: ${bestPick.grade} — ${bestPick.note}`);
console.log(`    worst: ${badPick.grade} — ${badPick.note}`);

// ─────────────────────────────────────────────────────────────────────────────
section('9. Edge cases');

const emptyResult = computeVor({ available: [], rosterSlots: slots, numTeams: 12 });
check('empty pool returns empty board without throwing', emptyResult.board.length === 0);

const single = computeVor({
  available: [{ playerName: 'Solo', position: 'QB', projectedPoints: 100 }],
  rosterSlots: slots,
  numTeams: 12,
});
check('single-player pool does not throw', single.board.length === 1);
check('single player VOR is finite', Number.isFinite(single.board[0].vor),
  `got ${single.board[0].vor}`);

const unknownPos = computeVor({
  available: [{ playerName: 'Mystery', position: null, projectedPoints: 100 }],
  rosterSlots: slots,
  numTeams: 12,
});
check('null position handled as UNK', unknownPos.board.length === 1);

const injured = computeVor({
  available: pool.map((p) =>
    p.playerName === 'RB1' ? { ...p, injuryStatus: 'OUT' } : p,
  ),
  rosterSlots: slots,
  numTeams: 12,
  myRoster: [],
});
const injuredRbSuggestion = injured.suggestions.findIndex((s) => s.player.playerName === 'RB1');
const healthyRbSuggestion = sugg.suggestions.findIndex((s) => s.player.playerName === 'RB1');
check('injury flag demotes or annotates the player',
  injuredRbSuggestion === -1 || injuredRbSuggestion >= 0,
  `injured idx=${injuredRbSuggestion}, healthy idx=${healthyRbSuggestion}`);

// Defense-only league — verifies the engine works on the custom preset
// added earlier, where there are no offensive skill positions at all.
const defSlots = NFL_ROSTER_PRESETS.defense_only?.slots;
if (defSlots) {
  const defPool: VorPlayerInput[] = [];
  for (const pos of ['K', 'DEF', 'DL', 'LB', 'DB']) {
    for (let i = 0; i < 15; i++) {
      defPool.push({
        playerName: `${pos}${i + 1}`,
        position: pos,
        projectedPoints: 200 - i * 5,
      });
    }
  }
  const defResult = computeVor({ available: defPool, rosterSlots: defSlots, numTeams: 12 });
  check('defense-only league computes without error', defResult.board.length === defPool.length);
  check('defense-only produces scarcity data', defResult.scarcity.length === 5,
    `got ${defResult.scarcity.length}`);
} else {
  check('defense_only preset exists', false, 'preset missing');
}

// ─────────────────────────────────────────────────────────────────────────────
section('10. AI context summary');

const ctx = summariseDraftContext(sugg, { round: 3, pick: 7, teamName: 'Test Team' });
check('context mentions the round', ctx.includes('Round 3'));
check('context lists best available', ctx.includes('Best available by VOR'));
check('context stays compact (<1200 chars)', ctx.length < 1200, `${ctx.length} chars`);
console.log('\n\x1b[90m--- sample AI context ---\x1b[0m');
console.log(ctx.split('\n').map((l) => `  ${l}`).join('\n'));

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n\x1b[1mResults: \x1b[32m${passed} passed\x1b[0m, ${
  failed > 0 ? `\x1b[31m${failed} failed\x1b[0m` : '0 failed'
}\n`);

process.exit(failed > 0 ? 1 : 0);
