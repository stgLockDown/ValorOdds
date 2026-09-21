/**
 * DiamondDraft — AI Team Grades
 *
 * Post-draft analytics engine. Given every team's drafted players (joined to
 * the player pool for projected points + eligibility), this module:
 *
 *   1. Optimally fills each team's STARTING lineup from its drafted players
 *      (respecting slot eligibility — QB/RB/WR/TE/FLEX/SFLEX/K/DEF for NFL,
 *      C/1B/2B/3B/SS/OF/UTIL/SP/RP/P for MLB).
 *   2. Sums the projected points of the optimal starters → "projected power".
 *   3. Ranks every team against the rest of the league and assigns a letter
 *      grade derived from how far above/below the league mean each team sits.
 *   4. Derives per-position-group strengths & weaknesses by comparing each
 *      team's group output to the league average for that group.
 *
 * Everything here is pure/deterministic so it can be unit-tested and reused
 * by both the API route and any client-side rendering.
 */

import type { RosterConfig, RosterSlot, Sport } from './presets';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

/** A drafted player as seen by the grading engine. */
export interface GradePlayer {
  /** Stable key (pick id or player id) */
  key: string;
  name: string;
  /** Primary position, e.g. 'QB', 'RB', 'DEF', 'SP' */
  position: string;
  /** Positions this player is eligible to fill (from the pool). */
  eligible: string[];
  team: string | null;
  /** Season-long projected fantasy points (0 when unknown). */
  projectedPoints: number;
  /** Overall draft rank (lower = better); null when unknown. */
  rank: number | null;
  /** ADP (average draft position); null when unknown. */
  adp: number | null;
  headshot: string | null;
}

/** A player slotted into a starting lineup spot. */
export interface LineupSlot {
  slot: string;
  label: string;
  player: GradePlayer | null;
}

/** Per-position-group breakdown for a single team. */
export interface GroupBreakdown {
  group: string;
  label: string;
  /** Projected points this team gets from the group's starters. */
  points: number;
  /** League average for this group. */
  leagueAvg: number;
  /** points - leagueAvg */
  delta: number;
  /** 0-100 percentile-ish score vs the league (50 = league average). */
  score: number;
}

export interface TeamGrade {
  memberId: string;
  teamName: string;
  displayName: string;
  isBot: boolean;
  /** 1-based rank by projected starter points (1 = best). */
  rank: number;
  /** Total projected points from the optimal starting lineup. */
  projectedPoints: number;
  /** Points left on the bench (depth indicator). */
  benchPoints: number;
  /** Letter grade A+ … F */
  grade: string;
  /** 0-100 composite score (50 = league average). */
  score: number;
  /** How far above/below the league mean, in standard deviations. */
  zScore: number;
  /** The optimal starting lineup. */
  lineup: LineupSlot[];
  /** Players not in the starting lineup. */
  bench: GradePlayer[];
  /** Position groups where this team is strongest (delta > 0). */
  strengths: GroupBreakdown[];
  /** Position groups where this team is weakest (delta < 0). */
  weaknesses: GroupBreakdown[];
  /** All group breakdowns. */
  groups: GroupBreakdown[];
  /** Count of drafted players. */
  playerCount: number;
}

export interface LeagueGrades {
  sport: Sport;
  /** Teams sorted best → worst. */
  teams: TeamGrade[];
  /** The team the AI rates highest. */
  bestTeamId: string | null;
  /** League-wide average projected starter points. */
  leagueAvg: number;
  /** Standard deviation of projected starter points. */
  leagueStdDev: number;
  /** Human-readable AI summary of the league. */
  summary: string;
  /** Per-group league averages, for reference. */
  groupAverages: Record<string, number>;
}

// ────────────────────────────────────────────────────────────────────────────
// Position groups
// ────────────────────────────────────────────────────────────────────────────

interface GroupDef {
  key: string;
  label: string;
  positions: string[];
}

const NFL_GROUPS: GroupDef[] = [
  { key: 'QB', label: 'Quarterback', positions: ['QB'] },
  { key: 'RB', label: 'Running Backs', positions: ['RB'] },
  { key: 'WR', label: 'Wide Receivers', positions: ['WR'] },
  { key: 'TE', label: 'Tight Ends', positions: ['TE'] },
  { key: 'K', label: 'Kicker', positions: ['K'] },
  { key: 'DEF', label: 'Team Defense', positions: ['DEF'] },
];

const MLB_GROUPS: GroupDef[] = [
  { key: 'HIT', label: 'Hitting', positions: ['C', '1B', '2B', '3B', 'SS', 'OF', 'LF', 'CF', 'RF', 'DH'] },
  { key: 'SP', label: 'Starting Pitching', positions: ['SP'] },
  { key: 'RP', label: 'Relief Pitching', positions: ['RP'] },
];

const NCAAF_GROUPS: GroupDef[] = [
  { key: 'QB', label: 'Quarterback', positions: ['QB'] },
  { key: 'RB', label: 'Running Backs', positions: ['RB'] },
  { key: 'WR', label: 'Wide Receivers', positions: ['WR'] },
  { key: 'TE', label: 'Tight Ends', positions: ['TE'] },
  { key: 'K', label: 'Kicker', positions: ['K'] },
];

export function groupsForSport(sport: Sport): GroupDef[] {
  if (sport === 'MLB') return MLB_GROUPS;
  if (sport === 'NCAAF') return NCAAF_GROUPS;
  return NFL_GROUPS;
}

// ────────────────────────────────────────────────────────────────────────────
// Lineup optimization
// ────────────────────────────────────────────────────────────────────────────

/**
 * Does a player satisfy a slot's eligibility?
 * Wildcard slots (eligible: ['*']) accept anyone.
 */
function playerFitsSlot(player: GradePlayer, slot: RosterSlot): boolean {
  if (slot.eligible.includes('*')) return true;
  if (slot.eligible.includes(player.position)) return true;
  // Fall back to the pool's eligible_pos list (e.g. ['WR','FLEX']).
  return player.eligible.some((e) => slot.eligible.includes(e));
}

/**
 * Fill a team's starting lineup from its drafted players.
 *
 * Strategy: process the most *restrictive* starter slots first (fewest
 * eligible positions), assigning the highest-projected still-available
 * player that fits. This is the standard greedy heuristic for the
 * eligibility-constrained assignment problem and reliably produces the
 * optimal lineup for real fantasy roster shapes (dedicated K/DEF/QB slots
 * get filled before the shared FLEX/SFLEX/UTIL slots absorb leftovers).
 */
export function optimizeLineup(
  rosterConfig: RosterConfig | null | undefined,
  players: GradePlayer[]
): { starters: LineupSlot[]; bench: GradePlayer[]; projectedPoints: number } {
  const slots = (rosterConfig?.slots ?? []).filter((s) => s.isStarter);

  // Expand slots by count, then sort most-restrictive-first.
  const expanded: RosterSlot[] = [];
  for (const s of slots) {
    for (let i = 0; i < (s.count ?? 0); i++) expanded.push(s);
  }
  expanded.sort((a, b) => {
    const aWild = a.eligible.includes('*') ? 99 : a.eligible.length;
    const bWild = b.eligible.includes('*') ? 99 : b.eligible.length;
    if (aWild !== bWild) return aWild - bWild;
    return (b.count ?? 0) - (a.count ?? 0);
  });

  // Highest projected first; tie-break by better (lower) rank.
  const pool = [...players].sort((a, b) => {
    if (b.projectedPoints !== a.projectedPoints) return b.projectedPoints - a.projectedPoints;
    return (a.rank ?? 9999) - (b.rank ?? 9999);
  });

  const used = new Set<string>();
  const starters: LineupSlot[] = [];
  let projectedPoints = 0;

  for (const slot of expanded) {
    const pick = pool.find((p) => !used.has(p.key) && playerFitsSlot(p, slot));
    if (pick) {
      used.add(pick.key);
      starters.push({ slot: slot.slot, label: slot.label, player: pick });
      projectedPoints += pick.projectedPoints;
    } else {
      starters.push({ slot: slot.slot, label: slot.label, player: null });
    }
  }

  const bench = pool.filter((p) => !used.has(p.key));
  return { starters, bench, projectedPoints: round1(projectedPoints) };
}

// ────────────────────────────────────────────────────────────────────────────
// Grading
// ────────────────────────────────────────────────────────────────────────────

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Map a z-score to a letter grade. */
export function letterGrade(z: number): string {
  if (z >= 1.5) return 'A+';
  if (z >= 1.0) return 'A';
  if (z >= 0.6) return 'A-';
  if (z >= 0.3) return 'B+';
  if (z >= 0.05) return 'B';
  if (z >= -0.2) return 'B-';
  if (z >= -0.5) return 'C+';
  if (z >= -0.8) return 'C';
  if (z >= -1.1) return 'C-';
  if (z >= -1.5) return 'D';
  return 'F';
}

/** Convert a delta vs league average into a 0-100 score (50 = average). */
function deltaToScore(delta: number, leagueAvg: number): number {
  if (leagueAvg <= 0) return 50;
  const pct = delta / leagueAvg; // e.g. +0.2 = 20% above average
  const score = 50 + pct * 100;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Compute the full league grade report.
 *
 * @param sport        'NFL' | 'MLB' | 'NCAAF'
 * @param rosterConfig the league's roster config (starter slots drive the lineup)
 * @param teams        one entry per league member with their drafted players
 */
export function computeLeagueGrades(
  sport: Sport,
  rosterConfig: RosterConfig | null | undefined,
  teams: {
    memberId: string;
    teamName: string;
    displayName: string;
    isBot: boolean;
    players: GradePlayer[];
  }[]
): LeagueGrades {
  const groups = groupsForSport(sport);

  // 1. Optimize each lineup.
  const optimized = teams.map((t) => {
    const { starters, bench, projectedPoints } = optimizeLineup(rosterConfig, t.players);
    return { ...t, starters, bench, projectedPoints };
  });

  // 2. League mean + stddev of starter points.
  const totals = optimized.map((t) => t.projectedPoints);
  const leagueAvg = totals.length
    ? round1(totals.reduce((a, b) => a + b, 0) / totals.length)
    : 0;
  const variance = totals.length
    ? totals.reduce((a, b) => a + (b - leagueAvg) ** 2, 0) / totals.length
    : 0;
  const leagueStdDev = round1(Math.sqrt(variance));

  // 3. Per-group league averages (sum of each team's group starters).
  const groupAverages: Record<string, number> = {};
  const perTeamGroups: Record<string, Record<string, number>> = {};

  for (const t of optimized) {
    const byGroup: Record<string, number> = {};
    for (const g of groups) byGroup[g.key] = 0;
    for (const s of t.starters) {
      if (!s.player) continue;
      const g = groups.find((gr) => gr.positions.includes(s.player!.position));
      if (g) byGroup[g.key] += s.player.projectedPoints;
    }
    perTeamGroups[t.memberId] = byGroup;
  }

  for (const g of groups) {
    const vals = optimized.map((t) => perTeamGroups[t.memberId][g.key] ?? 0);
    groupAverages[g.key] = vals.length
      ? round1(vals.reduce((a, b) => a + b, 0) / vals.length)
      : 0;
  }

  // 4. Build per-team grades.
  const graded: TeamGrade[] = optimized.map((t) => {
    const z = leagueStdDev > 0 ? (t.projectedPoints - leagueAvg) / leagueStdDev : 0;

    const groupBreakdowns: GroupBreakdown[] = groups.map((g) => {
      const points = round1(perTeamGroups[t.memberId][g.key] ?? 0);
      const avg = groupAverages[g.key] ?? 0;
      const delta = round1(points - avg);
      return {
        group: g.key,
        label: g.label,
        points,
        leagueAvg: avg,
        delta,
        score: deltaToScore(delta, avg),
      };
    });

    const strengths = groupBreakdowns
      .filter((b) => b.delta > 0)
      .sort((a, b) => b.delta - a.delta);
    const weaknesses = groupBreakdowns
      .filter((b) => b.delta < 0)
      .sort((a, b) => a.delta - b.delta);

    return {
      memberId: t.memberId,
      teamName: t.teamName,
      displayName: t.displayName,
      isBot: t.isBot,
      rank: 0, // assigned after sorting
      projectedPoints: t.projectedPoints,
      benchPoints: round1(t.bench.reduce((a, b) => a + b.projectedPoints, 0)),
      grade: letterGrade(z),
      score: Math.max(0, Math.min(100, Math.round(50 + z * 15))),
      zScore: Math.round(z * 100) / 100,
      lineup: t.starters,
      bench: t.bench,
      strengths,
      weaknesses,
      groups: groupBreakdowns,
      playerCount: t.players.length,
    };
  });

  // 5. Rank best → worst.
  graded.sort((a, b) => {
    if (b.projectedPoints !== a.projectedPoints) return b.projectedPoints - a.projectedPoints;
    return b.benchPoints - a.benchPoints;
  });
  graded.forEach((t, i) => {
    t.rank = i + 1;
  });

  const bestTeamId = graded.length ? graded[0].memberId : null;

  return {
    sport,
    teams: graded,
    bestTeamId,
    leagueAvg,
    leagueStdDev,
    summary: buildSummary(graded, leagueAvg, sport),
    groupAverages,
  };
}

/** Human-readable AI verdict on the league. */
function buildSummary(teams: TeamGrade[], leagueAvg: number, sport: Sport): string {
  if (!teams.length) return 'No teams have drafted yet.';

  const best = teams[0];
  const worst = teams[teams.length - 1];
  const spread = round1(best.projectedPoints - worst.projectedPoints);

  const parts: string[] = [];
  parts.push(
    `The AI projects ${best.teamName} as the strongest roster in the league, ` +
      `averaging ${best.projectedPoints} projected points per week from its optimal ` +
      `starting lineup — ${round1(best.projectedPoints - leagueAvg)} above the league average of ${leagueAvg}.`
  );

  if (best.strengths.length) {
    const top = best.strengths[0];
    parts.push(
      `Their biggest edge comes at ${top.label.toLowerCase()}, where they out-score the ` +
        `league by ${top.delta} projected points.`
    );
  }

  if (teams.length > 1) {
    parts.push(
      `The gap between the top and bottom rosters is ${spread} projected points, ` +
        `with ${worst.teamName} sitting ${round1(leagueAvg - worst.projectedPoints)} below average.`
    );
  }

  const deep = [...teams].sort((a, b) => b.benchPoints - a.benchPoints)[0];
  if (deep && deep.benchPoints > 0) {
    parts.push(
      `${deep.teamName} has the deepest bench (${deep.benchPoints} projected bench points), ` +
        `which matters most once injuries and bye weeks hit.`
    );
  }

  return parts.join(' ');
}
