/**
 * DiamondDraft — Draft progress & completion.
 *
 * The draft ends when every team's roster is full (or the draft order is
 * exhausted). A team's roster is "full" once it has drafted `rosterCapacity`
 * players — the sum of all roster slot counts, which is the same ceiling the
 * pick route enforces.
 *
 * Because a team can fill its roster before the snake order runs out (e.g.
 * when the declared round count exceeds the real roster capacity, or when
 * teams have unequal pick counts), the on-clock pointer SKIPS slots whose
 * member is already full. This prevents the "on the clock but can't draft"
 * deadlock the user hit.
 */

export interface DraftOrderEntry {
  round: number;
  pickInRound: number;
  overallPick: number;
  slot: number;
}

export interface DraftProgress {
  /** Index into the order of the next entry to act on (null when complete) */
  nextIndex: number | null;
  /** The next order entry (null when complete) */
  nextEntry: DraftOrderEntry | null;
  /** Whether the draft is complete (no team can pick) */
  isComplete: boolean;
  /** Picks already made */
  picksMade: number;
  /** Total picks that will actually be made */
  effectiveTotalPicks: number;
  /** memberId -> remaining draftable capacity */
  remainingByMember: Record<string, number>;
}

/**
 * Compute the next pick and completion state for a draft.
 *
 * @param fullOrder        The full snake/linear order (from generateDraftOrder)
 * @param slotToMemberId   Maps a 0-indexed slot to a member id (null if empty)
 * @param memberIds        All member ids in the league
 * @param picksByMember    memberId -> number of picks already made
 * @param rosterCapacity   Max players a single roster can hold
 * @param lastPick         The most recent pick's { round, pickInRound } (or null)
 */
export function computeDraftProgress(params: {
  fullOrder: DraftOrderEntry[];
  slotToMemberId: (slot: number) => string | null;
  memberIds: string[];
  picksByMember: Record<string, number>;
  rosterCapacity: number;
  lastPick?: { round: number; pickInRound: number } | null;
}): DraftProgress {
  const { fullOrder, slotToMemberId, memberIds, picksByMember, rosterCapacity, lastPick } = params;

  const remaining: Record<string, number> = {};
  let picksMade = 0;
  for (const id of memberIds) {
    const made = picksByMember[id] ?? 0;
    picksMade += made;
    remaining[id] = Math.max(0, rosterCapacity - made);
  }

  // Determine the cursor: the order index just after the last pick's entry.
  // Deriving it from the stored (round, pickInRound) is robust even when the
  // order was regenerated (e.g. declared num_teams > actual membership).
  let cursor = 0;
  if (lastPick) {
    const idx = fullOrder.findIndex(
      (e) => e.round === lastPick.round && e.pickInRound === lastPick.pickInRound
    );
    cursor = idx >= 0 ? idx + 1 : picksMade;
  }

  // Advance past entries whose member is already full (or has no member).
  while (cursor < fullOrder.length) {
    const entry = fullOrder[cursor];
    const memberId = slotToMemberId(entry.slot);
    if (memberId && (remaining[memberId] ?? 0) > 0) break;
    cursor++;
  }

  const isComplete = cursor >= fullOrder.length;

  // Total picks that will actually be made: picks already made plus every
  // remaining unit of capacity, capped by the length of the order.
  const remainingTotal = memberIds.reduce((s, id) => s + (remaining[id] ?? 0), 0);
  const effectiveTotalPicks = Math.min(fullOrder.length, picksMade + remainingTotal);

  return {
    nextIndex: isComplete ? null : cursor,
    nextEntry: isComplete ? null : fullOrder[cursor],
    isComplete,
    picksMade,
    effectiveTotalPicks,
    remainingByMember: remaining,
  };
}
