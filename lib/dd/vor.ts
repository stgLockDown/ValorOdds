/**
 * DiamondDraft — Value Over Replacement (VOR) engine.
 *
 * This is the analytics core behind the ESPN sync bar. Given a league's roster
 * configuration, the set of players already drafted, and the remaining player
 * pool, it answers the question a drafter actually cares about:
 *
 *   "Of everyone still on the board, who gains me the most points relative to
 *    what I could get at that same position later?"
 *
 * Raw projected points are a poor draft signal because positions are not
 * interchangeable. A QB projected for 320 points looks better than a RB
 * projected for 240 — but if the 12th-best QB still scores 280 while the 12th
 * best RB scores 130, the RB is worth far more to your lineup. VOR corrects
 * for that by subtracting a positional *replacement level*: the projected
 * output of the player you could realistically still roster at that position
 * after the run on it has passed.
 *
 * Definitions used here
 * ─────────────────────
 *  replacement level : projected points of the Nth-best remaining player at a
 *                      position, where N is how many more of that position the
 *                      league as a whole is still expected to draft.
 *  VOR               : player.projectedPoints − replacementLevel(position)
 *  scarcity          : how steeply value drops off at a position right now.
 *  tier cliff        : a large projected-points gap immediately below a player,
 *                      meaning "take him now or the quality falls off".
 *  positional run    : an unusual recent concentration of picks at a position,
 *                      which pulls that position's replacement level down fast.
 *
 * Everything in this module is pure and synchronous so it can be unit-tested
 * without a database, and so the sync endpoint stays fast enough to call on
 * every pick.
 */

import type { RosterSlot } from './presets';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal player shape the VOR engine needs. Deliberately narrower than
 * `PlayerPoolEntry` so callers can feed it ESPN-scraped players, pool rows, or
 * test fixtures without adapting a large interface.
 */
export interface VorPlayerInput {
  playerName: string;
  position: string | null;
  team?: string | null;
  projectedPoints: number;
  adp?: number | null;
  rank?: number;
  tier?: number;
  injuryStatus?: string | null;
  /** Optional stable id for dedupe / client keying. */
  id?: string | null;
}

/** A player scored by the engine, ready to render in the bar. */
export interface VorPlayer extends VorPlayerInput {
  /** projectedPoints − replacement level for this position. */
  vor: number;
  /** VOR expressed 0–100 relative to the best remaining VOR. */
  vorScore: number;
  /** Replacement level used for this player's position. */
  replacementLevel: number;
  /** Projected-points gap to the next player at the same position. */
  dropoff: number;
  /** True when `dropoff` is large enough to constitute a tier cliff. */
  isTierCliff: boolean;
  /** Positional rank among remaining players (1 = best available at pos). */
  positionRank: number;
  /**
   * ADP delta: positive = available later than ADP suggests (a value pick),
   * negative = taking him here is a reach. Null when ADP is unknown.
   */
  adpValue: number | null;
}

/** Per-position scarcity snapshot. */
export interface PositionScarcity {
  position: string;
  /** Remaining players at this position who are startable-relevant. */
  remaining: number;
  /** How many more of this position the league still needs to fill. */
  stillNeeded: number;
  /** remaining ÷ stillNeeded. Below ~1.5 means genuinely scarce. */
  supplyRatio: number;
  /** Replacement level currently in effect at this position. */
  replacementLevel: number;
  /** Points between best available and replacement level. */
  valueAtRisk: number;
  /** Picks at this position within the recent window (run detection). */
  recentPicks: number;
  /** True when this position is being drafted unusually fast right now. */
  isRun: boolean;
  /** 0–100 urgency score combining scarcity, cliff steepness and run pressure. */
  urgency: number;
}

/** A recommendation for the team currently on the clock. */
export interface VorSuggestion {
  player: VorPlayer;
  /** Ranked ordering, 1 = top recommendation. */
  order: number;
  /** Short human-readable justification shown in the bar. */
  reason: string;
  /**
   * Whether this pick fills a still-unfilled *starter* slot. Starters are
   * weighted more heavily than bench depth.
   */
  fillsStarterNeed: boolean;
}

/** Grade assigned to a pick that has already happened. */
export interface PickGrade {
  playerName: string;
  position: string | null;
  /** Letter grade A+ … F. */
  grade: string;
  /** 0–100 numeric score behind the grade. */
  score: number;
  /** VOR the pick captured. */
  vor: number;
  /** How many spots earlier/later than ADP. Positive = value, negative = reach. */
  adpDelta: number | null;
  /** One-line explanation. */
  note: string;
}

export interface VorInput {
  /** Players still on the board. */
  available: VorPlayerInput[];
  /** League roster configuration (drives replacement level + needs). */
  rosterSlots: RosterSlot[];
  /** Number of teams in the league. */
  numTeams: number;
  /** Positions already drafted by the requesting user's team. */
  myRoster?: { position: string | null }[];
  /**
   * Recent league-wide picks, most recent last. Used for run detection.
   * Only positions matter.
   */
  recentPicks?: { position: string | null }[];
  /** Total picks made so far across the league. */
  picksMade?: number;
  /** How many recent picks to consider a "window" for run detection. */
  runWindow?: number;
}

export interface VorResult {
  /** All available players scored and sorted by VOR descending. */
  board: VorPlayer[];
  /** Scarcity snapshot per position, most urgent first. */
  scarcity: PositionScarcity[];
  /** Top recommendations for the user on the clock. */
  suggestions: VorSuggestion[];
  /** Positions the user still needs to fill in their starting lineup. */
  unfilledStarters: string[];
  /** Positions currently experiencing a run. */
  activeRuns: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Tuning constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A gap counts as a tier cliff when the drop to the next player at the same
 * position exceeds this fraction of the position's own replacement level.
 * Expressed as a ratio so it scales across scoring systems and sports rather
 * than being hard-coded to fantasy-football point magnitudes.
 */
const TIER_CLIFF_RATIO = 0.08;

/** Default number of recent picks examined when detecting positional runs. */
const DEFAULT_RUN_WINDOW = 8;

/**
 * A position is "running" when its share of the recent window exceeds this
 * multiple of its expected share. Expected share is derived from roster needs,
 * so a position that legitimately makes up a third of rosters is not flagged
 * simply for being common.
 */
const RUN_THRESHOLD_MULTIPLE = 2.0;

/**
 * Minimum number of picks *above expectation* before a run is declared.
 *
 * The ratio test alone is far too sensitive on a short window: in an 8-pick
 * window a position expected to appear ~1 time trips a 1.75x ratio the moment
 * it appears twice, which is ordinary draft noise rather than a run. Requiring
 * a meaningful absolute excess as well as a high ratio suppresses that false
 * positive while still catching genuine runs (5-6 picks at one position).
 */
const RUN_MIN_EXCESS = 2;

/** Weight applied to VOR when a player fills an unfilled starter slot. */
const STARTER_NEED_BONUS = 1.15;

/** Penalty multiplier applied to players carrying an active injury flag. */
const INJURY_PENALTY = 0.9;

/** Injury statuses treated as materially risky for draft-day purposes. */
const RISKY_INJURY = new Set(['O', 'OUT', 'IR', 'D', 'DOUBTFUL', 'SUSPENDED', 'PUP', 'NFI']);

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Normalise a position string; unknown/blank becomes 'UNK'. */
function norm(pos: string | null | undefined): string {
  const p = (pos ?? '').trim().toUpperCase();
  return p.length > 0 ? p : 'UNK';
}

/** True when an injury status should reduce a player's effective value. */
function isRiskyInjury(status: string | null | undefined): boolean {
  if (!status) return false;
  return RISKY_INJURY.has(status.trim().toUpperCase());
}

/**
 * Count how many roster spots the league as a whole demands at each position.
 *
 * Two rules matter here, and getting either wrong distorts every VOR number:
 *
 * 1. **Starters only.** Replacement level is by definition the quality of
 *    player you can still get *after* the starters are gone — bench players
 *    ARE the replacement pool. Counting bench slots as demand double-counts
 *    the concept and drives replacement level far too deep (in a 12-team NFL
 *    league it moves the RB replacement from ~RB28 to ~RB40), which inflates
 *    every VOR and flattens the differences between positions. This is the
 *    standard Value-Based-Drafting definition.
 *
 * 2. **Flex slots are split, not duplicated.** A FLEX(RB/WR/TE) is one
 *    physical roster spot. Counting it in full for RB *and* WR *and* TE would
 *    treble that spot (RB demand would read 108 instead of 40 in a 12-team
 *    league). Distributing it evenly across eligible positions keeps league
 *    totals honest.
 *
 * Wildcard slots (IR / taxi, `eligible: ['*']`) are ignored entirely — they do
 * not represent real positional demand.
 */
function leaguePositionDemand(
  rosterSlots: RosterSlot[],
  numTeams: number,
): Map<string, number> {
  const perTeam = new Map<string, number>();

  for (const slot of rosterSlots) {
    if (slot.eligible.includes('*')) continue;
    // Bench depth is the replacement pool, not demand — see rule 1 above.
    if (!slot.isStarter) continue;

    const eligible = slot.eligible.map(norm).filter((p) => p !== 'UNK');
    if (eligible.length === 0) continue;

    const share = slot.count / eligible.length;
    for (const pos of eligible) {
      perTeam.set(pos, (perTeam.get(pos) ?? 0) + share);
    }
  }

  const demand = new Map<string, number>();
  for (const [pos, count] of perTeam) {
    demand.set(pos, count * Math.max(1, numTeams));
  }
  return demand;
}

/** Group available players by normalised position, each sorted best-first. */
function groupByPosition(players: VorPlayerInput[]): Map<string, VorPlayerInput[]> {
  const groups = new Map<string, VorPlayerInput[]>();
  for (const p of players) {
    const pos = norm(p.position);
    const arr = groups.get(pos);
    if (arr) arr.push(p);
    else groups.set(pos, [p]);
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => b.projectedPoints - a.projectedPoints);
  }
  return groups;
}

/**
 * Compute the replacement level for a position.
 *
 * The replacement player is the last one expected to come off the board before
 * supply at that position is exhausted, i.e. index `stillNeeded - 1` in the
 * remaining pool. Two edge cases matter:
 *
 *  - If demand exceeds supply, every remaining player will be rostered, so the
 *    replacement level is the worst available player at the position.
 *  - If nothing is still needed, the position is saturated; we fall back to the
 *    worst available so VOR stays finite rather than collapsing to zero.
 */
function replacementLevelFor(
  remaining: VorPlayerInput[],
  stillNeeded: number,
): number {
  if (remaining.length === 0) return 0;
  if (stillNeeded <= 0) {
    return remaining[remaining.length - 1].projectedPoints;
  }
  const idx = Math.min(Math.floor(stillNeeded) - 1, remaining.length - 1);
  return remaining[Math.max(0, idx)].projectedPoints;
}

/** Tally positions on a roster. */
function tallyPositions(roster: { position: string | null }[] | undefined): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of roster ?? []) {
    const pos = norm(r.position);
    counts.set(pos, (counts.get(pos) ?? 0) + 1);
  }
  return counts;
}

/**
 * Determine which starter slots the user has not yet filled.
 *
 * Slots are processed most-restrictive-first (fewest eligible positions) and
 * players are consumed greedily. Filling dedicated slots before flex slots
 * prevents a flex-eligible player from being credited against a flex slot while
 * a dedicated slot it could have filled is left showing as an open need.
 */
function computeUnfilledStarters(
  rosterSlots: RosterSlot[],
  myRoster: { position: string | null }[] | undefined,
): string[] {
  const pool = tallyPositions(myRoster);

  const starters = rosterSlots
    .filter((s) => s.isStarter && !s.eligible.includes('*'))
    .slice()
    .sort((a, b) => a.eligible.length - b.eligible.length);

  const unfilled: string[] = [];

  for (const slot of starters) {
    const eligible = slot.eligible.map(norm);
    for (let i = 0; i < slot.count; i++) {
      // Spend from the position with the most surplus so scarce dedicated
      // positions are preserved for the slots that specifically require them.
      let bestPos: string | null = null;
      let bestCount = 0;
      for (const pos of eligible) {
        const have = pool.get(pos) ?? 0;
        if (have > bestCount) {
          bestCount = have;
          bestPos = pos;
        }
      }
      if (bestPos) {
        pool.set(bestPos, bestCount - 1);
      } else {
        unfilled.push(slot.slot);
      }
    }
  }

  return unfilled;
}

/** Convert a 0–100 score into a letter grade. */
function scoreToGrade(score: number): string {
  if (score >= 95) return 'A+';
  if (score >= 88) return 'A';
  if (score >= 82) return 'A-';
  if (score >= 76) return 'B+';
  if (score >= 70) return 'B';
  if (score >= 64) return 'B-';
  if (score >= 58) return 'C+';
  if (score >= 50) return 'C';
  if (score >= 42) return 'C-';
  if (score >= 34) return 'D+';
  if (score >= 25) return 'D';
  return 'F';
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Score the remaining player pool and produce the full analytics payload that
 * the ESPN sync bar renders.
 */
export function computeVor(input: VorInput): VorResult {
  const {
    available,
    rosterSlots,
    numTeams,
    myRoster,
    recentPicks = [],
    runWindow = DEFAULT_RUN_WINDOW,
  } = input;

  if (available.length === 0) {
    return {
      board: [],
      scarcity: [],
      suggestions: [],
      unfilledStarters: computeUnfilledStarters(rosterSlots, myRoster),
      activeRuns: [],
    };
  }

  const demand = leaguePositionDemand(rosterSlots, numTeams);
  const groups = groupByPosition(available);
  const drafted = tallyPositions(recentPicks);
  const unfilledStarters = computeUnfilledStarters(rosterSlots, myRoster);

  // Positions that would fill one of the user's open starter slots. A slot key
  // is not always a position (e.g. FLEX), so expand through the roster config.
  const starterNeedPositions = new Set<string>();
  for (const slotKey of unfilledStarters) {
    const slot = rosterSlots.find((s) => s.slot === slotKey);
    for (const pos of slot?.eligible ?? [slotKey]) {
      starterNeedPositions.add(norm(pos));
    }
  }

  // ── Run detection ────────────────────────────────────────────────────────
  // Compare each position's share of the recent window against the share we
  // would expect from league-wide roster demand.
  const window = recentPicks.slice(-Math.max(1, runWindow));
  const windowCounts = new Map<string, number>();
  for (const p of window) {
    const pos = norm(p.position);
    windowCounts.set(pos, (windowCounts.get(pos) ?? 0) + 1);
  }
  const totalDemand = Array.from(demand.values()).reduce((a, b) => a + b, 0) || 1;

  const activeRuns: string[] = [];
  const runPressure = new Map<string, number>();
  for (const [pos, count] of windowCounts) {
    const observedShare = count / Math.max(1, window.length);
    const expectedShare = (demand.get(pos) ?? 0) / totalDemand;
    // Positions with no roster demand cannot meaningfully "run".
    if (expectedShare <= 0) continue;
    const ratio = observedShare / expectedShare;
    runPressure.set(pos, ratio);

    // A run must clear BOTH tests: a high ratio relative to expectation, and a
    // meaningful absolute excess of picks. The ratio alone is too twitchy on a
    // short window (2 QBs in 8 picks is normal, not a run); the absolute excess
    // alone would miss runs at genuinely rare positions.
    const expectedCount = expectedShare * window.length;
    const excess = count - expectedCount;

    if (ratio >= RUN_THRESHOLD_MULTIPLE && excess >= RUN_MIN_EXCESS && count >= 3) {
      activeRuns.push(pos);
    }
  }

  // ── Replacement levels + scarcity ────────────────────────────────────────
  const replacement = new Map<string, number>();
  const stillNeededByPos = new Map<string, number>();

  for (const [pos, remaining] of groups) {
    const totalDemandPos = demand.get(pos) ?? 0;
    const alreadyDrafted = drafted.get(pos) ?? 0;
    const stillNeeded = Math.max(0, totalDemandPos - alreadyDrafted);
    stillNeededByPos.set(pos, stillNeeded);
    replacement.set(pos, replacementLevelFor(remaining, stillNeeded));
  }

  // ── Score every available player ─────────────────────────────────────────
  const board: VorPlayer[] = [];

  for (const [pos, remaining] of groups) {
    const repl = replacement.get(pos) ?? 0;

    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i];
      const next = remaining[i + 1];
      const dropoff = next ? p.projectedPoints - next.projectedPoints : 0;
      // Scale the cliff threshold off replacement level so it adapts to the
      // league's scoring magnitude instead of assuming NFL point ranges.
      const cliffThreshold = Math.max(1, Math.abs(repl) * TIER_CLIFF_RATIO);

      const vor = p.projectedPoints - repl;
      const adpValue =
        p.adp != null && p.rank != null ? Math.round((p.adp - p.rank) * 10) / 10 : null;

      board.push({
        ...p,
        vor: Math.round(vor * 10) / 10,
        vorScore: 0, // normalised in a second pass once the max is known
        replacementLevel: Math.round(repl * 10) / 10,
        dropoff: Math.round(dropoff * 10) / 10,
        isTierCliff: dropoff >= cliffThreshold,
        positionRank: i + 1,
        adpValue,
      });
    }
  }

  board.sort((a, b) => b.vor - a.vor);

  // Normalise VOR to a 0–100 display score against the best player on the
  // board, so the bar can render a consistent bar-fill regardless of sport.
  const maxVor = board.length > 0 ? board[0].vor : 0;
  if (maxVor > 0) {
    for (const p of board) {
      p.vorScore = Math.max(0, Math.round((p.vor / maxVor) * 100));
    }
  }

  // ── Scarcity snapshot ────────────────────────────────────────────────────
  const scarcity: PositionScarcity[] = [];
  for (const [pos, remaining] of groups) {
    const repl = replacement.get(pos) ?? 0;
    const stillNeeded = stillNeededByPos.get(pos) ?? 0;
    const best = remaining[0]?.projectedPoints ?? 0;
    const valueAtRisk = Math.max(0, best - repl);
    const supplyRatio = stillNeeded > 0 ? remaining.length / stillNeeded : Number.POSITIVE_INFINITY;
    const isRun = activeRuns.includes(pos);

    // Urgency blends three independent pressures, each capped at 1 so no single
    // term can dominate: thin supply, a steep drop below the best player, and
    // an in-progress run on the position.
    const supplyTerm = Number.isFinite(supplyRatio)
      ? Math.max(0, Math.min(1, 1 - supplyRatio / 3))
      : 0;
    const cliffTerm = best > 0 ? Math.max(0, Math.min(1, valueAtRisk / Math.max(1, best))) : 0;
    const runTerm = isRun ? Math.min(1, (runPressure.get(pos) ?? 0) / 3) : 0;
    const needTerm = starterNeedPositions.has(pos) ? 1 : 0.35;

    const urgency = Math.round(
      Math.min(100, (supplyTerm * 45 + cliffTerm * 30 + runTerm * 25) * needTerm),
    );

    scarcity.push({
      position: pos,
      remaining: remaining.length,
      stillNeeded: Math.round(stillNeeded * 10) / 10,
      supplyRatio: Number.isFinite(supplyRatio) ? Math.round(supplyRatio * 100) / 100 : -1,
      replacementLevel: Math.round(repl * 10) / 10,
      valueAtRisk: Math.round(valueAtRisk * 10) / 10,
      recentPicks: windowCounts.get(pos) ?? 0,
      isRun,
      urgency,
    });
  }
  scarcity.sort((a, b) => b.urgency - a.urgency);

  // ── Suggestions ──────────────────────────────────────────────────────────
  // Re-rank the top of the board by an adjusted VOR that accounts for roster
  // need, injury risk and positional urgency. We only consider a slice of the
  // board because anything far down it will never be the recommendation.
  const candidatePool = board.slice(0, 40);
  const urgencyByPos = new Map(scarcity.map((s) => [s.position, s.urgency]));

  const scored = candidatePool.map((p) => {
    const pos = norm(p.position);
    const fillsStarterNeed = starterNeedPositions.has(pos);

    let adjusted = p.vor;
    if (fillsStarterNeed) adjusted *= STARTER_NEED_BONUS;
    if (isRiskyInjury(p.injuryStatus)) adjusted *= INJURY_PENALTY;
    // Let urgency add up to a 20% nudge — enough to break ties between close
    // players without letting scarcity override a large raw VOR advantage.
    adjusted *= 1 + (urgencyByPos.get(pos) ?? 0) / 500;

    return { player: p, adjusted, fillsStarterNeed };
  });

  scored.sort((a, b) => b.adjusted - a.adjusted);

  const suggestions: VorSuggestion[] = scored.slice(0, 5).map((s, i) => {
    const pos = norm(s.player.position);
    const reasons: string[] = [];

    if (s.fillsStarterNeed) reasons.push(`fills an open ${pos} starter slot`);
    if (s.player.isTierCliff) {
      reasons.push(`${s.player.dropoff.toFixed(1)} pt cliff to the next ${pos}`);
    }
    if (activeRuns.includes(pos)) reasons.push(`${pos} run in progress`);
    if (s.player.adpValue != null && s.player.adpValue >= 5) {
      reasons.push(`available ${s.player.adpValue.toFixed(0)} picks past ADP`);
    }
    if (isRiskyInjury(s.player.injuryStatus)) {
      reasons.push(`injury risk (${s.player.injuryStatus})`);
    }
    if (reasons.length === 0) {
      reasons.push(`best value on the board at +${s.player.vor.toFixed(1)} VOR`);
    }

    return {
      player: s.player,
      order: i + 1,
      reason: reasons.join(' · '),
      fillsStarterNeed: s.fillsStarterNeed,
    };
  });

  return { board, scarcity, suggestions, unfilledStarters, activeRuns };
}

/**
 * Grade a pick that has already been made, judged against the board as it
 * looked at the moment of the pick.
 *
 * Two signals drive the grade: how much VOR the pick captured relative to the
 * best available alternative, and how the pick compares to ADP. A pick that
 * takes the top-VOR player available grades near the top; reaching well ahead
 * of ADP for a low-VOR player grades poorly.
 */
export function gradePick(
  picked: VorPlayerInput,
  boardAtPick: VorPlayer[],
  overallPickNumber?: number,
): PickGrade {
  const pos = norm(picked.position);
  const match = boardAtPick.find(
    (p) => p.playerName === picked.playerName && norm(p.position) === pos,
  );

  const vor = match?.vor ?? 0;
  const bestVor = boardAtPick.length > 0 ? boardAtPick[0].vor : 0;

  // Value efficiency: what fraction of the best-available VOR this pick got.
  const efficiency = bestVor > 0 ? Math.max(0, Math.min(1, vor / bestVor)) : 0.5;

  // ADP delta: negative means reaching (drafted earlier than consensus).
  const adp = picked.adp ?? match?.adp ?? null;
  const adpDelta =
    adp != null && overallPickNumber != null
      ? Math.round((adp - overallPickNumber) * 10) / 10
      : null;

  // Convert the ADP delta into a modest ±15 point adjustment. Reaching by a
  // round or so is normal draft behaviour, so the curve is deliberately gentle
  // and saturates rather than punishing hard.
  let adpAdjust = 0;
  if (adpDelta != null) {
    adpAdjust = Math.max(-15, Math.min(15, adpDelta * 0.6));
  }

  const score = Math.max(0, Math.min(100, Math.round(efficiency * 85 + adpAdjust + 7.5)));

  let note: string;
  if (match && match.positionRank === 1 && efficiency > 0.9) {
    note = `Top ${pos} on the board and the best overall value available.`;
  } else if (efficiency >= 0.8) {
    note = `Strong value — captured ${Math.round(efficiency * 100)}% of the best available VOR.`;
  } else if (adpDelta != null && adpDelta < -12) {
    note = `Significant reach — roughly ${Math.abs(adpDelta).toFixed(0)} picks ahead of ADP.`;
  } else if (efficiency >= 0.5) {
    note = `Reasonable pick, though higher-VOR options remained on the board.`;
  } else {
    note = `Below-market value — notably stronger options were still available.`;
  }

  return {
    playerName: picked.playerName,
    position: picked.position,
    grade: scoreToGrade(score),
    score,
    vor: Math.round(vor * 10) / 10,
    adpDelta,
    note,
  };
}

/**
 * Build a compact plain-text summary of the current draft situation, suitable
 * for injecting as context into the AI chat assistant. Kept short so it does
 * not crowd out the user's own question in the prompt window.
 */
export function summariseDraftContext(
  result: VorResult,
  opts: { round?: number; pick?: number; teamName?: string } = {},
): string {
  const lines: string[] = [];

  if (opts.round != null && opts.pick != null) {
    lines.push(`Round ${opts.round}, pick ${opts.pick}.`);
  }
  if (opts.teamName) lines.push(`Team: ${opts.teamName}.`);

  if (result.unfilledStarters.length > 0) {
    lines.push(`Open starter slots: ${result.unfilledStarters.join(', ')}.`);
  } else {
    lines.push('Starting lineup is full; drafting for depth.');
  }

  if (result.activeRuns.length > 0) {
    lines.push(`Positional run underway at: ${result.activeRuns.join(', ')}.`);
  }

  const topScarce = result.scarcity.slice(0, 3);
  if (topScarce.length > 0) {
    lines.push(
      `Most urgent positions: ${topScarce
        .map((s) => `${s.position} (urgency ${s.urgency}, ${s.remaining} left)`)
        .join(', ')}.`,
    );
  }

  const top = result.board.slice(0, 8);
  if (top.length > 0) {
    lines.push(
      `Best available by VOR: ${top
        .map((p) => `${p.playerName} (${norm(p.position)}, +${p.vor.toFixed(1)})`)
        .join('; ')}.`,
    );
  }

  return lines.join('\n');
}
