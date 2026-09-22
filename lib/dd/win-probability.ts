/**
 * DiamondDraft — Win Probability Engine
 *
 * Computes a live win probability for a head-to-head matchup by blending:
 *   1. The AI's season-long projection for each team's starting lineup
 *      (the "prior" — who the analytics think is better).
 *   2. The points already scored this week (the "evidence").
 *   3. The projected points still to come from players whose games haven't
 *      finished (the "remaining upside").
 *
 * The result is a percentage that moves as points are scored, which drives the
 * animated odds meter. It is a pure function so the server and the client
 * compute identical numbers.
 */

import type { WeeklyRoster } from './weekly-stats';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface WinProbabilityInput {
  home: WeeklyRoster;
  away: WeeklyRoster;
  /** 0..1 — how much of the week has elapsed (0 = kickoff, 1 = final). */
  weekProgress: number;
  /** True once the matchup has been scored final. */
  isFinal?: boolean;
  /** Actual final scores, when the matchup is final. */
  finalHomeScore?: number | null;
  finalAwayScore?: number | null;
}

export interface WinProbability {
  /** Probability the home team wins, 0..100. */
  homeWinPct: number;
  /** Probability the away team wins, 0..100. */
  awayWinPct: number;
  /** Probability of a tie, 0..100. */
  tiePct: number;
  /** Projected final score for each side. */
  homeProjected: number;
  awayProjected: number;
  /** Projected margin (home − away). */
  projectedMargin: number;
  /** 0..100 — how confident the model is (higher = more separation). */
  confidence: number;
  /** Short human-readable explanation of the biggest driver. */
  reason: string;
  /** Which side the model favors. */
  favored: 'home' | 'away' | 'even';
}

// ────────────────────────────────────────────────────────────────────────────
// Engine
// ────────────────────────────────────────────────────────────────────────────

/**
 * Standard deviation of a single player's weekly fantasy outcome, as a
 * fraction of their projection. Fantasy scoring is high-variance; ~45% is a
 * reasonable single-player coefficient of variation.
 */
const PLAYER_CV = 0.45;

/** Floor on the margin sigma so a 0–0 tie doesn't produce a 50/50 lock. */
const MIN_SIGMA = 6;

export function computeWinProbability(input: WinProbabilityInput): WinProbability {
  const { home, away, weekProgress, isFinal } = input;

  // ── Final result: probability collapses to the actual outcome. ──
  if (isFinal && input.finalHomeScore != null && input.finalAwayScore != null) {
    const hs = input.finalHomeScore;
    const as = input.finalAwayScore;
    const homeWin = hs > as ? 100 : 0;
    const awayWin = as > hs ? 100 : 0;
    const tie = hs === as ? 100 : 0;
    return {
      homeWinPct: homeWin,
      awayWinPct: awayWin,
      tiePct: tie,
      homeProjected: round1(hs),
      awayProjected: round1(as),
      projectedMargin: round1(hs - as),
      confidence: 100,
      reason:
        hs === as
          ? 'The matchup finished level.'
          : `${hs > as ? home.teamName : away.teamName} closed it out.`,
      favored: hs === as ? 'even' : hs > as ? 'home' : 'away',
    };
  }

  const progress = clamp(weekProgress, 0, 1);
  const remaining = 1 - progress;

  // ── Projected final score ──
  // Already-scored points are locked in. The rest of each team's projection is
  // scaled by how much of the week is left.
  const homeRemaining = home.projectedStarterPoints * remaining;
  const awayRemaining = away.projectedStarterPoints * remaining;
  const homeProjected = home.starterPoints + homeRemaining;
  const awayProjected = away.starterPoints + awayRemaining;

  const margin = homeProjected - awayProjected;

  // ── Uncertainty ──
  // Variance comes from the players still to play. Early in the week the
  // outcome is wide open; late in the week it's nearly decided.
  const homePlayersLeft = countRemaining(home, progress);
  const awayPlayersLeft = countRemaining(away, progress);
  const homeVar = varianceOf(home, homePlayersLeft, remaining);
  const awayVar = varianceOf(away, awayPlayersLeft, remaining);
  const sigma = Math.max(MIN_SIGMA, Math.sqrt(homeVar + awayVar));

  // ── Logistic win probability ──
  // P(home) = 1 / (1 + e^(−margin/σ)). This is the standard normal-CDF
  // approximation and behaves well for fantasy margins.
  const pHome = 1 / (1 + Math.exp(-margin / sigma));

  // Small tie band: if the projected margin is inside ~1.5 points, call it a
  // meaningful tie chance rather than pretending certainty.
  const tieBand = Math.exp(-Math.pow(margin / (sigma * 0.9), 2) / 2);
  const tiePct = clamp(tieBand * 12, 0, 12);

  const homeWinPct = clamp(pHome * (100 - tiePct), 0, 100);
  const awayWinPct = clamp((1 - pHome) * (100 - tiePct), 0, 100);

  // Confidence: how far the projection is from a coin flip, tempered by how
  // much of the week is left.
  const separation = Math.abs(pHome - 0.5) * 2; // 0..1
  const confidence = clamp(Math.round((separation * 0.7 + progress * 0.3) * 100), 1, 99);

  const favored: 'home' | 'away' | 'even' =
    Math.abs(margin) < 1.5 ? 'even' : margin > 0 ? 'home' : 'away';

  return {
    homeWinPct: round1(homeWinPct),
    awayWinPct: round1(awayWinPct),
    tiePct: round1(tiePct),
    homeProjected: round1(homeProjected),
    awayProjected: round1(awayProjected),
    projectedMargin: round1(margin),
    confidence,
    reason: buildReason(home, away, margin, progress, favored),
    favored,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Estimate how many of a team's starters still have points to add. We don't
 * have per-player game times, so we approximate: at progress p, roughly
 * (1 − p) of the lineup is still to play, weighted toward the higher-variance
 * (higher-projection) players.
 */
function countRemaining(roster: WeeklyRoster, progress: number): number {
  const total = roster.starters.length;
  if (total === 0) return 0;
  return Math.max(0, Math.round(total * (1 - progress)));
}

/**
 * Variance of the points still to come. Each remaining player contributes
 * (projection × CV)² of variance, scaled by how much of the week is left.
 */
function varianceOf(roster: WeeklyRoster, playersLeft: number, remaining: number): number {
  if (playersLeft <= 0 || remaining <= 0) return 0;
  const starters = roster.starters;
  if (starters.length === 0) return 0;

  // Average per-player projection (fall back to the team projection).
  const avgProj =
    starters.reduce((s, p) => s + (p.projectedPoints || 0), 0) / starters.length ||
    roster.projectedStarterPoints / Math.max(1, starters.length);

  const perPlayerSd = Math.max(2, avgProj * PLAYER_CV);
  return playersLeft * perPlayerSd * perPlayerSd * remaining;
}

function buildReason(
  home: WeeklyRoster,
  away: WeeklyRoster,
  margin: number,
  progress: number,
  favored: 'home' | 'away' | 'even'
): string {
  if (favored === 'even') {
    return progress < 0.15
      ? 'Too early to call — both lineups are still to play.'
      : 'Dead heat — this one is coming down to the wire.';
  }
  const leader = favored === 'home' ? home : away;
  const trailer = favored === 'home' ? away : home;
  const lead = Math.abs(margin);

  if (progress < 0.15) {
    return `${leader.teamName} has the stronger AI projection (+${lead.toFixed(1)}).`;
  }
  if (progress > 0.85) {
    return `${leader.teamName} is nearly home (+${lead.toFixed(1)} projected).`;
  }
  return `${leader.teamName} leads the projection by ${lead.toFixed(1)} over ${trailer.teamName}.`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
