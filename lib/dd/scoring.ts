/**
 * DiamondDraft — Scoring Engine
 *
 * Computes fantasy points from a stat line based on a scoring config.
 * Supports both 'points' mode (sum of stat * multiplier) and 'roto'
 * mode (category accumulation with z-score-based standings).
 *
 * Sport-aware: NFL stat lines have passing/rushing/receiving/kicking/defense
 * stats, MLB stat lines have batting/pitching stats.
 */

import type { ScoringConfig, ScoringRule, Sport } from './presets';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

/** A raw stat line from a player's game — keys are stat codes */
export type StatLine = Record<string, number>;

export interface ScoredLine {
  fantasyPoints: number;
  breakdown: { stat: string; label: string; value: number; points: number }[];
}

// ──────────────────────────────────────────────
// Points mode: sum stat * multiplier
// ──────────────────────────────────────────────

function applyRules(
  statLine: StatLine,
  rules: ScoringRule[] | undefined
): { points: number; breakdown: ScoredLine['breakdown'] } {
  let points = 0;
  const breakdown: ScoredLine['breakdown'] = [];

  if (!rules) return { points, breakdown };

  for (const rule of rules) {
    const value = statLine[rule.stat] ?? 0;
    if (value === 0) continue;

    const statPoints = value * rule.pointsPerUnit;
    points += statPoints;
    breakdown.push({
      stat: rule.stat,
      label: rule.label,
      value,
      points: Math.round(statPoints * 100) / 100,
    });
  }

  return { points, breakdown };
}

/**
 * Score a player's stat line using a points-mode scoring config.
 * Works for both NFL and MLB — the config determines which rule sets apply.
 */
export function scoreStatLine(
  sport: Sport,
  statLine: StatLine,
  config: ScoringConfig
): ScoredLine {
  const allBreakdown: ScoredLine['breakdown'] = [];
  let totalPoints = 0;

  if (sport === 'MLB') {
    // Determine if this is a batting or pitching stat line (or both)
    const isBatting = Object.keys(statLine).some((k) =>
      ['H', '2B', '3B', 'HR', 'R', 'RBI', 'SB', 'BB', 'K', 'AVG', 'OBP', 'SLG', 'wOBA'].includes(k)
    );
    const isPitching = Object.keys(statLine).some((k) =>
      ['IP', 'K_p', 'W', 'L', 'SV', 'ER', 'ERA', 'WHIP', 'FIP', 'K_9'].includes(k)
    );

    if (isBatting) {
      const { points, breakdown } = applyRules(statLine, config.batting);
      totalPoints += points;
      allBreakdown.push(...breakdown);
    }
    if (isPitching) {
      const { points, breakdown } = applyRules(statLine, config.pitching);
      totalPoints += points;
      allBreakdown.push(...breakdown);
    }
  } else {
    // NFL — apply all applicable rule sets
    const passing = applyRules(statLine, config.passing);
    const rushing = applyRules(statLine, config.rushing);
    const receiving = applyRules(statLine, config.receiving);
    const kicking = applyRules(statLine, config.kicking);
    const defense = applyRules(statLine, config.defense);

    totalPoints = passing.points + rushing.points + receiving.points + kicking.points + defense.points;
    allBreakdown.push(...passing.breakdown, ...rushing.breakdown, ...receiving.breakdown, ...kicking.breakdown, ...defense.breakdown);
  }

  return {
    fantasyPoints: Math.round(totalPoints * 100) / 100,
    breakdown: allBreakdown,
  };
}

// ──────────────────────────────────────────────
// Roto mode: category standings with z-scores
// ──────────────────────────────────────────────

export interface RotoCategoryValue {
  category: string;
  value: number;
}

export interface RotoStanding {
  memberId: string;
  teamName: string;
  categoryValues: Record<string, number>;
  categoryRanks: Record<string, number>;
  totalRankPoints: number;
  rank: number;
}

/**
 * Compute roto standings from category totals for all teams in a league.
 * Uses standard roto scoring: best team in each category gets N points
 * (N = number of teams), worst gets 1. Ties split the points.
 *
 * For rate stats (AVG, ERA, WHIP, OBP, SLG), higher is better for batting
 * and lower is better for pitching.
 */
export function computeRotoStandings(
  teams: { memberId: string; teamName: string; categories: Record<string, number> }[],
  config: ScoringConfig
): RotoStanding[] {
  if (!config.rotoCategories) {
    return teams.map((t) => ({
      memberId: t.memberId,
      teamName: t.teamName,
      categoryValues: t.categories,
      categoryRanks: {},
      totalRankPoints: 0,
      rank: 1,
    }));
  }

  const battingCats = config.rotoCategories.batting;
  const pitchingCats = config.rotoCategories.pitching;
  const allCats = [...battingCats, ...pitchingCats];

  // Rate stats where lower is better (pitching)
  const lowerIsBetter = new Set(['ERA', 'WHIP', 'FIP']);

  // For each category, rank the teams
  const categoryRanks: Record<string, Record<string, number>> = {};
  const numTeams = teams.length;

  for (const cat of allCats) {
    const sorted = [...teams].sort((a, b) => {
      const aVal = a.categories[cat] ?? 0;
      const bVal = b.categories[cat] ?? 0;
      return lowerIsBetter.has(cat) ? aVal - bVal : bVal - aVal;
    });

    // Assign rank points (numTeams for 1st, 1 for last), splitting ties
    const ranks: Record<string, number> = {};
    let i = 0;
    while (i < sorted.length) {
      // Find tie group
      let j = i;
      const val = sorted[i].categories[cat] ?? 0;
      while (j < sorted.length && (sorted[j].categories[cat] ?? 0) === val) {
        j++;
      }
      // Average rank points for the tie group
      const rankPoints = numTeams - (i + j - 1) / 2;
      for (let k = i; k < j; k++) {
        ranks[sorted[k].memberId] = rankPoints;
      }
      i = j;
    }
    categoryRanks[cat] = ranks;
  }

  // Compute total rank points and final standings
  const standings: RotoStanding[] = teams.map((team) => {
    const categoryValues: Record<string, number> = {};
    const catRanks: Record<string, number> = {};
    let totalRankPoints = 0;

    for (const cat of allCats) {
      categoryValues[cat] = team.categories[cat] ?? 0;
      const rp = categoryRanks[cat]?.[team.memberId] ?? 0;
      catRanks[cat] = rp;
      totalRankPoints += rp;
    }

    return {
      memberId: team.memberId,
      teamName: team.teamName,
      categoryValues,
      categoryRanks: catRanks,
      totalRankPoints: Math.round(totalRankPoints * 100) / 100,
      rank: 0, // set below
    };
  });

  // Sort by total rank points (descending) and assign final rank
  standings.sort((a, b) => b.totalRankPoints - a.totalRankPoints);
  standings.forEach((s, i) => {
    s.rank = i + 1;
  });

  return standings;
}

// ──────────────────────────────────────────────
// H2H matchup scoring
// ──────────────────────────────────────────────

/**
 * Score a head-to-head matchup between two teams.
 * For points mode: sum all starter fantasy points, higher score wins.
 * For categories mode: count categories won, most categories wins.
 */
export function scoreH2HMatchup(
  homeScore: number,
  awayScore: number,
  format: 'h2h_points' | 'h2h_categories'
): { winner: 'home' | 'away' | 'tie'; homeScore: number; awayScore: number } {
  if (format === 'h2h_points') {
    if (homeScore > awayScore) return { winner: 'home', homeScore, awayScore };
    if (awayScore > homeScore) return { winner: 'away', homeScore, awayScore };
    return { winner: 'tie', homeScore, awayScore };
  }

  // For categories mode, the scores represent category wins
  if (homeScore > awayScore) return { winner: 'home', homeScore, awayScore };
  if (awayScore > homeScore) return { winner: 'away', homeScore, awayScore };
  return { winner: 'tie', homeScore, awayScore };
}

/**
 * Compute a team's total fantasy points for a scoring period
 * from their lineup's scored stat lines.
 */
export function sumLineupPoints(scoredLines: ScoredLine[]): number {
  return Math.round(
    scoredLines.reduce((sum, line) => sum + line.fantasyPoints, 0) * 100
  ) / 100;
}
