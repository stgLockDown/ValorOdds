/**
 * DiamondDraft — Roster position-limit enforcement.
 *
 * This module implements the logic that prevents a user from drafting
 * an entire team of QBs when the league limits are, e.g., 1 QB starter.
 *
 * The rules are:
 *  1. Each roster slot has a `count` and `eligible` positions.
 *  2. A player whose `position` is eligible for a **specific** (non-flex)
 *     starter slot can be drafted up to that slot's capacity.
 *  3. If ALL specific starter slots that the player's position can fill
 *     are already at capacity AND there are still unfilled starter slots
 *     at OTHER positions, the pick is **blocked**.
 *  4. Flex slots (eligible: ['RB','WR','TE'] etc.) absorb overflow but
 *     do not increase the "specific" capacity for a single position beyond
 *     the sum of specific slots + flex slots.
 *  5. Bench slots are unlimited in the sense that any drafted player goes
 *     to the roster, but the **total roster size** acts as a hard ceiling.
 *
 * The enforcement is tunable per-league via the `enforcePositionLimits`
 * flag in `dd_leagues.settings` (default: true).
 */

import type { RosterSlot } from './presets';

export interface FilledCounts {
  /** Map of position → number of players drafted at that position */
  [position: string]: number;
}

export interface PositionLimitInfo {
  /** The position being checked (e.g. 'QB') */
  position: string;
  /** Whether this pick is allowed */
  allowed: boolean;
  /** Human-readable reason if blocked (null if allowed) */
  reason: string | null;
  /** Total roster spots this position can occupy (specific + flex) */
  capacity: number;
  /** How many of this position are already on the roster */
  filled: number;
  /** Positions that still need filling (unfilled starter slots) */
  unfilledNeeds: string[];
}

/**
 * Compute the maximum number of players of a given position that can
 * be on a roster, considering both specific starter slots and flex slots.
 *
 * For example, in a standard NFL roster:
 *   - QB: 1 specific slot (QB×1) + 0 flex slots that include QB → capacity 1
 *   - RB: 2 specific (RB×2) + 1 FLEX (RB/WR/TE) + 0 SFLEX → capacity 3
 *   - WR: 2 specific (WR×2) + 1 FLEX → capacity 3
 *   - TE: 1 specific (TE×1) + 1 FLEX → capacity 2
 */
export function getPositionCapacity(
  rosterSlots: RosterSlot[],
  position: string
): number {
  let capacity = 0;
  for (const slot of rosterSlots) {
    if (slot.eligible.includes('*')) continue; // skip IR / taxi
    if (slot.eligible.includes(position)) {
      // For flex slots (multi-position eligible), they contribute to
      // capacity but are shared — we still count them so the user can
      // draft up to (specific + flex) of a single position.
      capacity += slot.count;
    }
  }
  return capacity;
}

/**
 * Get the list of positions that still need to be filled (i.e. starter
 * slots that are not yet satisfied by drafted players).
 */
export function getUnfilledNeeds(
  rosterSlots: RosterSlot[],
  filled: FilledCounts
): { slot: string; label: string; positions: string[]; needed: number }[] {
  const unfilled: { slot: string; label: string; positions: string[]; needed: number }[] = [];
  for (const slot of rosterSlots) {
    if (!slot.isStarter) continue;
    if (slot.eligible.includes('*')) continue; // skip flex-like wildcard starters
    const filledForSlot = slot.eligible.reduce(
      (sum, pos) => sum + (filled[pos] ?? 0),
      0
    );
    const need = slot.count - filledForSlot;
    if (need > 0) {
      unfilled.push({
        slot: slot.slot,
        label: slot.label,
        positions: slot.eligible,
        needed: need,
      });
    }
  }
  return unfilled;
}

/**
 * Check whether drafting a player at `position` is allowed given the
 * current roster state and league roster config.
 *
 * Returns a `PositionLimitInfo` with `allowed`, `reason`, capacity, etc.
 */
export function checkPositionLimit(
  rosterSlots: RosterSlot[],
  position: string,
  filled: FilledCounts,
  totalRosterSize: number,
  totalDrafted: number
): PositionLimitInfo {
  // Hard ceiling: total roster size
  if (totalDrafted >= totalRosterSize) {
    return {
      position,
      allowed: false,
      reason: `Your roster is full (${totalRosterSize} players). You cannot draft more players.`,
      capacity: 0,
      filled: totalDrafted,
      unfilledNeeds: [],
    };
  }

  const capacity = getPositionCapacity(rosterSlots, position);
  const filledAtPos = filled[position] ?? 0;

  // If the position isn't in any slot at all (unknown position), allow it
  // (it'll go to bench) — but only if roster isn't full (checked above).
  if (capacity === 0) {
    return {
      position,
      allowed: true,
      reason: null,
      capacity: 0,
      filled: filledAtPos,
      unfilledNeeds: [],
    };
  }

  // If under capacity, always allow
  if (filledAtPos < capacity) {
    return {
      position,
      allowed: true,
      reason: null,
      capacity,
      filled: filledAtPos,
      unfilledNeeds: [],
    };
  }

  // At or over capacity for this position — check if other needs remain
  const unfilled = getUnfilledNeeds(rosterSlots, filled);
  // Filter out slots that this position could fill (those don't count as "other" needs)
  const otherNeeds = unfilled.filter(
    (n) => !n.positions.includes(position)
  );

  if (otherNeeds.length > 0) {
    const needLabels = otherNeeds.map((n) => `${n.needed}× ${n.label}`);
    return {
      position,
      allowed: false,
      reason: `Position limit reached for ${position} (${filledAtPos}/${capacity}). You still need to fill: ${needLabels.join(', ')}.`,
      capacity,
      filled: filledAtPos,
      unfilledNeeds: otherNeeds.flatMap((n) => n.positions),
    };
  }

  // At capacity but no other needs — allow (depth / bench pick)
  return {
    position,
    allowed: true,
    reason: null,
    capacity,
    filled: filledAtPos,
    unfilledNeeds: [],
  };
}

/**
 * Compute a full per-position summary for UI display.
 * Returns, for each position that has a dedicated slot, the filled count
 * and the capacity.
 */
export function getPositionSummary(
  rosterSlots: RosterSlot[],
  filled: FilledCounts
): { position: string; filled: number; capacity: number; isFull: boolean }[] {
  const seen = new Set<string>();
  const summary: { position: string; filled: number; capacity: number; isFull: boolean }[] = [];
  for (const slot of rosterSlots) {
    if (slot.eligible.includes('*')) continue;
    for (const pos of slot.eligible) {
      if (seen.has(pos)) continue;
      seen.add(pos);
      const cap = getPositionCapacity(rosterSlots, pos);
      const filledCount = filled[pos] ?? 0;
      summary.push({
        position: pos,
        filled: filledCount,
        capacity: cap,
        isFull: filledCount >= cap,
      });
    }
  }
  return summary;
}
