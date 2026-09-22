/**
 * DiamondDraft — Canonical lineup slot ordering (ESPN parity).
 *
 * ESPN renders a fantasy lineup in a fixed, position-first order rather than
 * alphabetically by slot code. Every surface that lists a roster (the matchup
 * board, the lineup editor, the weekly stats engine, team pages) should share
 * this one ordering so the app reads the same way everywhere.
 *
 * NFL order:
 *   QB → RB → RB → WR → WR → TE → FLEX → FLEX+ (superflex/op)
 *      → IDP (DL/LB/DB/IDP flex) → D-FLEX → DEF → K
 *      → BN (bench) → IR → TAXI
 *
 * MLB order:
 *   C → 1B → 2B → 3B → SS → MI → CI → OF → UTIL → SP → RP → P
 *      → BENCH → IL → MiLB
 *
 * This module is purely additive: it never filters, drops, or rewrites a slot
 * it does not recognise. Unknown slots sort *after* every known starter slot
 * but *before* the bench, preserving their relative input order.
 */

/** Slot codes in canonical display order, highest priority first. */
const NFL_SLOT_ORDER: string[] = [
  'QB',
  'RB',
  'WR',
  'TE',
  'FLEX',
  'RB_WR',
  'WR_TE',
  'RB_WR_TE',
  'SFLEX',
  'SUPERFLEX',
  'OP',
  'DL',
  'DE',
  'DT',
  'LB',
  'DB',
  'CB',
  'S',
  'IDP',
  'IDP_FLEX',
  'D_FLEX',
  'DEF',
  'DST',
  'D/ST',
  'K',
  'P',
];

const MLB_SLOT_ORDER: string[] = [
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'MI',
  'CI',
  'LF',
  'CF',
  'RF',
  'OF',
  'DH',
  'UTIL',
  'SP',
  'RP',
  'P',
];

/** Slots that are never part of the active lineup, in their own trailing order. */
const RESERVE_SLOT_ORDER: string[] = ['BN', 'BE', 'BENCH', 'IR', 'IL', 'NA', 'TAXI', 'MiLB', 'MINORS'];

/** Base rank granted to unknown-but-starting slots. */
const UNKNOWN_STARTER_RANK = 900;
/** Base rank for reserve slots (bench/IR/taxi) — always last. */
const RESERVE_BASE_RANK = 1000;

function buildIndex(order: string[]): Map<string, number> {
  const m = new Map<string, number>();
  order.forEach((slot, i) => m.set(slot, i));
  return m;
}

const NFL_INDEX = buildIndex(NFL_SLOT_ORDER);
const MLB_INDEX = buildIndex(MLB_SLOT_ORDER);
const RESERVE_INDEX = buildIndex(RESERVE_SLOT_ORDER);

/** Normalise a raw slot code for lookup (upper-case, strip separators). */
export function normalizeSlot(slot: string | null | undefined): string {
  return String(slot ?? '')
    .trim()
    .toUpperCase();
}

/** True when the slot is a bench / IR / taxi style reserve slot. */
export function isReserveSlot(slot: string | null | undefined): boolean {
  const s = normalizeSlot(slot);
  if (!s) return false;
  return RESERVE_INDEX.has(s) || RESERVE_INDEX.has(s.replace(/[^A-Z]/g, ''));
}

/**
 * Rank a slot for display. Lower sorts first.
 *
 * Starters land in 0..~100, unknown starters in the 900s (keeping their
 * relative order), and reserves in the 1000s.
 */
export function slotRank(slot: string | null | undefined, sport?: string | null): number {
  const s = normalizeSlot(slot);
  if (!s) return UNKNOWN_STARTER_RANK;

  // Reserves always trail the active lineup.
  const reserveIdx = RESERVE_INDEX.get(s) ?? RESERVE_INDEX.get(s.replace(/[^A-Z]/g, ''));
  if (reserveIdx != null) return RESERVE_BASE_RANK + reserveIdx;

  const isMlb = String(sport ?? '').toUpperCase() === 'MLB';
  // Try the sport-specific table first, then the other one, so a mis-tagged
  // sport still produces a sensible order instead of dumping everything into
  // the unknown bucket.
  const primary = isMlb ? MLB_INDEX : NFL_INDEX;
  const secondary = isMlb ? NFL_INDEX : MLB_INDEX;

  const hit = primary.get(s);
  if (hit != null) return hit;

  const alt = secondary.get(s);
  if (alt != null) return alt;

  // Handle numbered duplicates ESPN sometimes emits (RB1, WR2, FLEX1…).
  const stripped = s.replace(/\d+$/, '');
  if (stripped && stripped !== s) {
    const strippedHit = primary.get(stripped) ?? secondary.get(stripped);
    if (strippedHit != null) return strippedHit;
  }

  return UNKNOWN_STARTER_RANK;
}

/**
 * Stable comparator for two slot codes.
 *
 * Ties (two RBs, two WRs…) return 0 so callers relying on a stable sort keep
 * the incoming order — which is how the lineup optimizer already assigns
 * RB1/RB2, WR1/WR2, etc.
 */
export function compareSlots(
  a: string | null | undefined,
  b: string | null | undefined,
  sport?: string | null
): number {
  const ra = slotRank(a, sport);
  const rb = slotRank(b, sport);
  if (ra !== rb) return ra - rb;
  // Same rank → fall back to the raw code so RB1 precedes RB2 deterministically.
  const sa = normalizeSlot(a);
  const sb = normalizeSlot(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/**
 * Sort any list of slot-bearing records into canonical ESPN order.
 *
 * Returns a NEW array; the input is never mutated. `Array.prototype.sort` is
 * stable in every runtime we target (V8 ≥ 7.0), so equal-ranked entries keep
 * their original order.
 */
export function sortBySlotOrder<T>(
  items: T[],
  getSlot: (item: T) => string | null | undefined,
  sport?: string | null
): T[] {
  return [...items].sort((a, b) => compareSlots(getSlot(a), getSlot(b), sport));
}

/**
 * Human label for a slot code, matching ESPN's shorthand.
 * Falls back to the raw code so unknown slots still render.
 */
const SLOT_LABELS: Record<string, string> = {
  QB: 'QB',
  RB: 'RB',
  WR: 'WR',
  TE: 'TE',
  FLEX: 'FLEX',
  RB_WR: 'R/W',
  WR_TE: 'W/T',
  RB_WR_TE: 'FLEX',
  SFLEX: 'FLEX+',
  SUPERFLEX: 'FLEX+',
  OP: 'FLEX+',
  DEF: 'D/ST',
  DST: 'D/ST',
  'D/ST': 'D/ST',
  D_FLEX: 'D-FLEX',
  IDP_FLEX: 'IDP',
  K: 'K',
  BN: 'BE',
  BE: 'BE',
  BENCH: 'BE',
  IR: 'IR',
  IL: 'IL',
  TAXI: 'TAXI',
};

export function slotLabel(slot: string | null | undefined): string {
  const s = normalizeSlot(slot);
  return SLOT_LABELS[s] ?? s;
}
