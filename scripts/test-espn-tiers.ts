/**
 * Tier-gating validation for the ESPN sync extension.
 *
 * The important property being tested here is that paid analytics are removed
 * from the payload *server-side*. If VOR fields merely stayed in the response
 * and were hidden by the extension UI, any user could read them straight out of
 * the network tab, so the redaction must be verified rather than assumed.
 */

import {
  espnSyncFeaturesFor,
  redactForTier,
  upgradePromptFor,
} from '../lib/dd/espn-sync-tiers';
import { computeVor, type VorPlayerInput } from '../lib/dd/vor';
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

function section(t: string) {
  console.log(`\n\x1b[1m${t}\x1b[0m`);
}

// Build a small real board to redact.
const pool: VorPlayerInput[] = [];
for (const pos of ['QB', 'RB', 'WR', 'TE']) {
  for (let i = 0; i < 25; i++) {
    pool.push({
      playerName: `${pos}${i + 1}`,
      position: pos,
      projectedPoints: 300 - i * 5,
      adp: i + 1,
      rank: i + 1,
    });
  }
}
const result = computeVor({
  available: pool,
  rosterSlots: NFL_ROSTER_PRESETS.standard.slots,
  numTeams: 12,
});

const PAID_FIELDS = ['vor', 'vorScore', 'replacementLevel', 'dropoff', 'isTierCliff', 'adpValue'];

// ─────────────────────────────────────────────────────────────────────────────
section('1. Feature flags per tier');

const free = espnSyncFeaturesFor('free');
const basic = espnSyncFeaturesFor('basic');
const premium = espnSyncFeaturesFor('premium');
const vip = espnSyncFeaturesFor('vip');
const admin = espnSyncFeaturesFor('free', true);

check('free: bar loads', free.canSync);
check('free: no VOR', !free.canSeeVor);
check('free: no scarcity', !free.canSeeScarcity);
check('free: no AI chat', !free.canUseAiChat);

check('basic: VOR unlocked', basic.canSeeVor);
check('basic: scarcity unlocked', basic.canSeeScarcity);
check('basic: tier cliffs unlocked', basic.canSeeTierCliffs);
check('basic: pick grades unlocked', basic.canSeePickGrades);
check('basic: still NO AI chat (matches canUseChat)', !basic.canUseAiChat);

check('premium: AI chat unlocked', premium.canUseAiChat);
check('premium: everything else unlocked', premium.canSeeVor && premium.canSeeScarcity);
check('vip: AI chat unlocked', vip.canUseAiChat);
check('admin on free tier: full access', admin.canSeeVor && admin.canUseAiChat);

check('board limit rises with tier', free.boardLimit < basic.boardLimit && basic.boardLimit < premium.boardLimit,
  `free=${free.boardLimit} basic=${basic.boardLimit} premium=${premium.boardLimit}`);
check('free is throttled harder', free.minSyncIntervalMs > premium.minSyncIntervalMs,
  `free=${free.minSyncIntervalMs}ms premium=${premium.minSyncIntervalMs}ms`);

// ─────────────────────────────────────────────────────────────────────────────
section('2. Server-side redaction — the security-critical path');

const freeView = redactForTier(result, free);
const basicView = redactForTier(result, basic);
const premiumView = redactForTier(result, premium);

const freeLeaks = freeView.board.flatMap((row) =>
  PAID_FIELDS.filter((f) => f in (row as Record<string, unknown>)),
);
check('free board contains ZERO paid fields', freeLeaks.length === 0,
  `leaked: ${[...new Set(freeLeaks)].join(', ')}`);

check('free still receives player names (bar is usable)',
  freeView.board.every((r) => 'playerName' in (r as Record<string, unknown>)));
check('free receives no scarcity rows', freeView.scarcity.length === 0);
check('free receives no run alerts', freeView.activeRuns.length === 0);

check('basic board RETAINS vor field',
  basicView.board.every((r) => 'vor' in (r as Record<string, unknown>)));
check('basic receives scarcity rows', basicView.scarcity.length > 0);

check('free board respects its row cap', freeView.board.length <= free.boardLimit,
  `${freeView.board.length} rows vs cap ${free.boardLimit}`);
check('premium board is larger than free',
  premiumView.board.length > freeView.board.length,
  `premium=${premiumView.board.length} free=${freeView.board.length}`);

check('suggestion counts scale with tier',
  freeView.suggestions.length <= basicView.suggestions.length &&
    basicView.suggestions.length <= premiumView.suggestions.length,
  `free=${freeView.suggestions.length} basic=${basicView.suggestions.length} premium=${premiumView.suggestions.length}`);

// ─────────────────────────────────────────────────────────────────────────────
section('3. Upgrade prompts');

const freePrompt = upgradePromptFor(free);
const basicPrompt = upgradePromptFor(basic);
const premiumPrompt = upgradePromptFor(premium);
const adminPrompt = upgradePromptFor(admin);

check('free is prompted to upgrade to basic', freePrompt?.targetTier === 'basic',
  `got ${freePrompt?.targetTier}`);
check('basic is prompted to upgrade to premium', basicPrompt?.targetTier === 'premium',
  `got ${basicPrompt?.targetTier}`);
check('premium sees no prompt', premiumPrompt === null);
check('admin sees no prompt', adminPrompt === null);

console.log(`\n    free  → "${freePrompt?.headline}"`);
console.log(`    basic → "${basicPrompt?.headline}"`);

// ─────────────────────────────────────────────────────────────────────────────
section('4. Null / undefined tier defaults safely to free');

const nullTier = espnSyncFeaturesFor(null);
const undefTier = espnSyncFeaturesFor(undefined);
check('null tier gets no VOR', !nullTier.canSeeVor);
check('null tier gets no AI', !nullTier.canUseAiChat);
check('undefined tier gets no VOR', !undefTier.canSeeVor);
check('null tier reported as "free"', nullTier.tier === 'free');

console.log(`\n\x1b[1mResults: \x1b[32m${passed} passed\x1b[0m, ${
  failed > 0 ? `\x1b[31m${failed} failed\x1b[0m` : '0 failed'
}\n`);

process.exit(failed > 0 ? 1 : 0);
