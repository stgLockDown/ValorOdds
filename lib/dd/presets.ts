/**
 * DiamondDraft — Sport-specific presets for roster configurations,
 * scoring systems, draft formats, and season structures.
 *
 * This is the single source of truth for sport-aware behavior.
 * Adding a new sport (NBA, NHL, etc.) only requires adding a new
 * SportPreset here — no schema changes needed.
 *
 * All configs are stored as plain objects and persisted to JSONB
 * columns in dd_leagues (roster_config, scoring_config, settings).
 */

export type Sport = 'NFL' | 'MLB';

export type LeagueFormat =
  | 'roto'
  | 'h2h_points'
  | 'h2h_categories'
  | 'points'
  | 'best_ball';

export type DraftType = 'snake' | 'auction' | 'linear' | '3rr_snake' | 'custom';

export type KeeperType = 'redraft' | 'keeper' | 'dynasty';

// ──────────────────────────────────────────────
// Roster Slot definitions
// ──────────────────────────────────────────────

export interface RosterSlot {
  /** Slot key — e.g. 'QB', 'RB', 'WR', 'C', 'SP' */
  slot: string;
  /** Display label */
  label: string;
  /** Number of this slot in the lineup */
  count: number;
  /** Positions eligible to fill this slot */
  eligible: string[];
  /** Is this a starting lineup slot (vs bench/IR)? */
  isStarter: boolean;
}

export interface RosterConfig {
  sport: Sport;
  name: string;
  slots: RosterSlot[];
  /** Total roster size (computed) */
  totalRosterSize: number;
  /** Number of starting lineup slots (computed) */
  totalStarters: number;
}

// ──────────────────────────────────────────────
// Scoring definitions
// ──────────────────────────────────────────────

export interface ScoringRule {
  /** Stat key — e.g. 'pass_yd', 'hr', 'rbi' */
  stat: string;
  /** Display label */
  label: string;
  /** Points per unit of the stat */
  pointsPerUnit: number;
  /** For roto: is this a counted category? */
  isCategory?: boolean;
}

export interface ScoringConfig {
  sport: Sport;
  name: string;
  /** 'points' = fantasy point accumulation; 'roto' = category counting */
  mode: 'points' | 'roto';
  /** Hitting/scoring rules */
  batting: ScoringRule[];
  /** Pitching/defensive rules */
  pitching: ScoringRule[];
  /** For NFL: offensive skill rules */
  passing?: ScoringRule[];
  rushing?: ScoringRule[];
  receiving?: ScoringRule[];
  kicking?: ScoringRule[];
  defense?: ScoringRule[];
  /** Roto categories (for roto formats) */
  rotoCategories?: {
    batting: string[];
    pitching: string[];
  };
}

// ──────────────────────────────────────────────
// MLB Roster Presets
// ──────────────────────────────────────────────

const MLB_STANDARD_ROSTER: RosterConfig = {
  sport: 'MLB',
  name: 'Standard',
  slots: [
    { slot: 'C',    label: 'Catcher',          count: 1, eligible: ['C'],         isStarter: true },
    { slot: '1B',   label: 'First Base',       count: 1, eligible: ['1B'],        isStarter: true },
    { slot: '2B',   label: 'Second Base',      count: 1, eligible: ['2B'],        isStarter: true },
    { slot: '3B',   label: 'Third Base',       count: 1, eligible: ['3B'],        isStarter: true },
    { slot: 'SS',   label: 'Shortstop',        count: 1, eligible: ['SS'],        isStarter: true },
    { slot: 'OF',   label: 'Outfield',         count: 3, eligible: ['OF','LF','CF','RF'], isStarter: true },
    { slot: 'UTIL', label: 'Utility',          count: 1, eligible: ['C','1B','2B','3B','SS','OF','DH'], isStarter: true },
    { slot: 'SP',   label: 'Starting Pitcher', count: 2, eligible: ['SP'],        isStarter: true },
    { slot: 'RP',   label: 'Relief Pitcher',   count: 2, eligible: ['RP'],        isStarter: true },
    { slot: 'P',    label: 'Pitcher (Any)',    count: 2, eligible: ['SP','RP'],   isStarter: true },
    { slot: 'BENCH',label: 'Bench',            count: 5, eligible: ['C','1B','2B','3B','SS','OF','DH','SP','RP'], isStarter: false },
    { slot: 'IL',   label: 'Injured List',     count: 3, eligible: ['*'],         isStarter: false },
    { slot: 'MiLB', label: 'Minor League',     count: 5, eligible: ['*'],         isStarter: false },
  ],
  totalRosterSize: 27,
  totalStarters: 14,
};

const MLB_SHALLOW_ROSTER: RosterConfig = {
  sport: 'MLB',
  name: 'Shallow (10-team)',
  slots: [
    { slot: 'C',    label: 'Catcher',          count: 1, eligible: ['C'],         isStarter: true },
    { slot: '1B',   label: 'First Base',       count: 1, eligible: ['1B'],        isStarter: true },
    { slot: '2B',   label: 'Second Base',      count: 1, eligible: ['2B'],        isStarter: true },
    { slot: '3B',   label: 'Third Base',       count: 1, eligible: ['3B'],        isStarter: true },
    { slot: 'SS',   label: 'Shortstop',        count: 1, eligible: ['SS'],        isStarter: true },
    { slot: 'OF',   label: 'Outfield',         count: 3, eligible: ['OF','LF','CF','RF'], isStarter: true },
    { slot: 'UTIL', label: 'Utility',          count: 1, eligible: ['C','1B','2B','3B','SS','OF','DH'], isStarter: true },
    { slot: 'SP',   label: 'Starting Pitcher', count: 2, eligible: ['SP'],        isStarter: true },
    { slot: 'RP',   label: 'Relief Pitcher',   count: 1, eligible: ['RP'],        isStarter: true },
    { slot: 'P',    label: 'Pitcher (Any)',    count: 2, eligible: ['SP','RP'],   isStarter: true },
    { slot: 'BENCH',label: 'Bench',            count: 3, eligible: ['C','1B','2B','3B','SS','OF','DH','SP','RP'], isStarter: false },
    { slot: 'IL',   label: 'Injured List',     count: 3, eligible: ['*'],         isStarter: false },
  ],
  totalRosterSize: 20,
  totalStarters: 13,
};

const MLB_DEEP_ROSTER: RosterConfig = {
  sport: 'MLB',
  name: 'Deep (16-team / Dynasty)',
  slots: [
    { slot: 'C',    label: 'Catcher',          count: 2, eligible: ['C'],         isStarter: true },
    { slot: '1B',   label: 'First Base',       count: 1, eligible: ['1B'],        isStarter: true },
    { slot: '2B',   label: 'Second Base',      count: 1, eligible: ['2B'],        isStarter: true },
    { slot: '3B',   label: 'Third Base',       count: 1, eligible: ['3B'],        isStarter: true },
    { slot: 'SS',   label: 'Shortstop',        count: 1, eligible: ['SS'],        isStarter: true },
    { slot: 'MI',   label: 'Middle Infield',   count: 1, eligible: ['2B','SS'],   isStarter: true },
    { slot: 'CI',   label: 'Corner Infield',   count: 1, eligible: ['1B','3B'],   isStarter: true },
    { slot: 'OF',   label: 'Outfield',         count: 5, eligible: ['OF','LF','CF','RF'], isStarter: true },
    { slot: 'UTIL', label: 'Utility',          count: 1, eligible: ['C','1B','2B','3B','SS','OF','DH'], isStarter: true },
    { slot: 'SP',   label: 'Starting Pitcher', count: 3, eligible: ['SP'],        isStarter: true },
    { slot: 'RP',   label: 'Relief Pitcher',   count: 2, eligible: ['RP'],        isStarter: true },
    { slot: 'P',    label: 'Pitcher (Any)',    count: 3, eligible: ['SP','RP'],   isStarter: true },
    { slot: 'BENCH',label: 'Bench',            count: 8, eligible: ['C','1B','2B','3B','SS','OF','DH','SP','RP'], isStarter: false },
    { slot: 'IL',   label: 'Injured List',     count: 5, eligible: ['*'],         isStarter: false },
    { slot: 'MiLB', label: 'Minor League',     count: 10, eligible: ['*'],        isStarter: false },
  ],
  totalRosterSize: 45,
  totalStarters: 22,
};

// ──────────────────────────────────────────────
// NFL Roster Presets
// ──────────────────────────────────────────────

const NFL_STANDARD_ROSTER: RosterConfig = {
  sport: 'NFL',
  name: 'Standard',
  slots: [
    { slot: 'QB',   label: 'Quarterback',      count: 1, eligible: ['QB'],        isStarter: true },
    { slot: 'RB',   label: 'Running Back',     count: 2, eligible: ['RB'],        isStarter: true },
    { slot: 'WR',   label: 'Wide Receiver',    count: 2, eligible: ['WR'],        isStarter: true },
    { slot: 'TE',   label: 'Tight End',        count: 1, eligible: ['TE'],        isStarter: true },
    { slot: 'FLEX', label: 'Flex (RB/WR/TE)',  count: 1, eligible: ['RB','WR','TE'], isStarter: true },
    { slot: 'K',    label: 'Kicker',           count: 1, eligible: ['K'],         isStarter: true },
    { slot: 'DEF',  label: 'Team Defense',     count: 1, eligible: ['DEF'],       isStarter: true },
    { slot: 'BN',   label: 'Bench',            count: 6, eligible: ['QB','RB','WR','TE','K','DEF'], isStarter: false },
    { slot: 'IR',   label: 'Injured Reserve',  count: 3, eligible: ['*'],         isStarter: false },
  ],
  totalRosterSize: 20,
  totalStarters: 9,
};

const NFL_DEEP_ROSTER: RosterConfig = {
  sport: 'NFL',
  name: 'Deep (PPR / 14-team)',
  slots: [
    { slot: 'QB',   label: 'Quarterback',      count: 1, eligible: ['QB'],        isStarter: true },
    { slot: 'RB',   label: 'Running Back',     count: 2, eligible: ['RB'],        isStarter: true },
    { slot: 'WR',   label: 'Wide Receiver',    count: 3, eligible: ['WR'],        isStarter: true },
    { slot: 'TE',   label: 'Tight End',        count: 1, eligible: ['TE'],        isStarter: true },
    { slot: 'FLEX', label: 'Flex (RB/WR/TE)',  count: 2, eligible: ['RB','WR','TE'], isStarter: true },
    { slot: 'SFLEX',label: 'Super Flex',       count: 1, eligible: ['QB','RB','WR','TE'], isStarter: true },
    { slot: 'K',    label: 'Kicker',           count: 1, eligible: ['K'],         isStarter: true },
    { slot: 'DEF',  label: 'Team Defense',     count: 1, eligible: ['DEF'],       isStarter: true },
    { slot: 'BN',   label: 'Bench',            count: 8, eligible: ['QB','RB','WR','TE','K','DEF'], isStarter: false },
    { slot: 'IR',   label: 'Injured Reserve',  count: 3, eligible: ['*'],         isStarter: false },
  ],
  totalRosterSize: 25,
  totalStarters: 12,
};

const NFL_IDP_ROSTER: RosterConfig = {
  sport: 'NFL',
  name: 'IDP (Individual Defensive Players)',
  slots: [
    { slot: 'QB',   label: 'Quarterback',      count: 1, eligible: ['QB'],        isStarter: true },
    { slot: 'RB',   label: 'Running Back',     count: 2, eligible: ['RB'],        isStarter: true },
    { slot: 'WR',   label: 'Wide Receiver',    count: 2, eligible: ['WR'],        isStarter: true },
    { slot: 'TE',   label: 'Tight End',        count: 1, eligible: ['TE'],        isStarter: true },
    { slot: 'FLEX', label: 'Flex (RB/WR/TE)',  count: 1, eligible: ['RB','WR','TE'], isStarter: true },
    { slot: 'K',    label: 'Kicker',           count: 1, eligible: ['K'],         isStarter: true },
    { slot: 'DEF',  label: 'Team Defense',     count: 1, eligible: ['DEF'],       isStarter: true },
    { slot: 'DL',   label: 'Defensive Line',   count: 1, eligible: ['DL','DE','DT'], isStarter: true },
    { slot: 'LB',   label: 'Linebacker',       count: 1, eligible: ['LB'],        isStarter: true },
    { slot: 'DB',   label: 'Defensive Back',   count: 1, eligible: ['DB','CB','S'], isStarter: true },
    { slot: 'BN',   label: 'Bench',            count: 6, eligible: ['QB','RB','WR','TE','K','DEF','DL','LB','DB'], isStarter: false },
    { slot: 'IR',   label: 'Injured Reserve',  count: 3, eligible: ['*'],         isStarter: false },
  ],
  totalRosterSize: 23,
  totalStarters: 12,
};

const NFL_DYNASTY_ROSTER: RosterConfig = {
  sport: 'NFL',
  name: 'Dynasty (Deep Roster + Taxi Squad)',
  slots: [
    { slot: 'QB',    label: 'Quarterback',      count: 1, eligible: ['QB'],        isStarter: true },
    { slot: 'RB',    label: 'Running Back',     count: 2, eligible: ['RB'],        isStarter: true },
    { slot: 'WR',    label: 'Wide Receiver',    count: 3, eligible: ['WR'],        isStarter: true },
    { slot: 'TE',    label: 'Tight End',        count: 1, eligible: ['TE'],        isStarter: true },
    { slot: 'FLEX',  label: 'Flex (RB/WR/TE)',  count: 2, eligible: ['RB','WR','TE'], isStarter: true },
    { slot: 'SFLEX', label: 'Super Flex',       count: 1, eligible: ['QB','RB','WR','TE'], isStarter: true },
    { slot: 'K',     label: 'Kicker',           count: 1, eligible: ['K'],         isStarter: true },
    { slot: 'DEF',   label: 'Team Defense',     count: 1, eligible: ['DEF'],       isStarter: true },
    { slot: 'BN',    label: 'Bench',            count: 12, eligible: ['QB','RB','WR','TE','K','DEF'], isStarter: false },
    { slot: 'TAXI',  label: 'Taxi Squad',       count: 4, eligible: ['*'],         isStarter: false },
    { slot: 'IR',    label: 'Injured Reserve',  count: 4, eligible: ['*'],         isStarter: false },
  ],
  totalRosterSize: 35,
  totalStarters: 12,
};

const NFL_DEFENSE_ONLY_ROSTER: RosterConfig = {
  sport: 'NFL',
  name: 'Defense Only (2 Kickers, No Offense)',
  slots: [
    // No offensive skill positions (QB, RB, WR, TE, FLEX, SFLEX)
    // Two kickers instead of the usual one
    { slot: 'K',    label: 'Kicker',           count: 2, eligible: ['K'],         isStarter: true },
    { slot: 'DEF',  label: 'Team Defense',     count: 1, eligible: ['DEF'],       isStarter: true },
    // Individual defensive players — expanded starting lineup
    { slot: 'DL',   label: 'Defensive Line',   count: 2, eligible: ['DL','DE','DT'], isStarter: true },
    { slot: 'LB',   label: 'Linebacker',       count: 2, eligible: ['LB'],        isStarter: true },
    { slot: 'DB',   label: 'Defensive Back',   count: 2, eligible: ['DB','CB','S'], isStarter: true },
    // Flex defensive slots — any IDP
    { slot: 'D_FLEX', label: 'Defensive Flex (DL/LB/DB)', count: 2, eligible: ['DL','DE','DT','LB','DB','CB','S'], isStarter: true },
    // Bench — only kickers and defensive players allowed
    { slot: 'BN',   label: 'Bench',            count: 6, eligible: ['K','DEF','DL','DE','DT','LB','DB','CB','S'], isStarter: false },
    { slot: 'IR',   label: 'Injured Reserve',  count: 3, eligible: ['*'],         isStarter: false },
  ],
  totalRosterSize: 20,
  totalStarters: 11,
};

const NFL_IDP_DYNASTY_ROSTER: RosterConfig = {
  sport: 'NFL',
  name: 'IDP Dynasty (Offense + Defense + Taxi)',
  slots: [
    { slot: 'QB',    label: 'Quarterback',      count: 1, eligible: ['QB'],        isStarter: true },
    { slot: 'RB',    label: 'Running Back',     count: 2, eligible: ['RB'],        isStarter: true },
    { slot: 'WR',    label: 'Wide Receiver',    count: 3, eligible: ['WR'],        isStarter: true },
    { slot: 'TE',    label: 'Tight End',        count: 1, eligible: ['TE'],        isStarter: true },
    { slot: 'FLEX',  label: 'Flex (RB/WR/TE)',  count: 2, eligible: ['RB','WR','TE'], isStarter: true },
    { slot: 'SFLEX', label: 'Super Flex',       count: 1, eligible: ['QB','RB','WR','TE'], isStarter: true },
    { slot: 'K',     label: 'Kicker',           count: 1, eligible: ['K'],         isStarter: true },
    { slot: 'DEF',   label: 'Team Defense',     count: 1, eligible: ['DEF'],       isStarter: true },
    { slot: 'DL',    label: 'Defensive Line',   count: 2, eligible: ['DL','DE','DT'], isStarter: true },
    { slot: 'LB',    label: 'Linebacker',       count: 2, eligible: ['LB'],        isStarter: true },
    { slot: 'DB',    label: 'Defensive Back',   count: 2, eligible: ['DB','CB','S'], isStarter: true },
    { slot: 'BN',    label: 'Bench',            count: 10, eligible: ['QB','RB','WR','TE','K','DEF','DL','LB','DB'], isStarter: false },
    { slot: 'TAXI',  label: 'Taxi Squad',       count: 5, eligible: ['*'],         isStarter: false },
    { slot: 'IR',    label: 'Injured Reserve',  count: 4, eligible: ['*'],         isStarter: false },
  ],
  totalRosterSize: 40,
  totalStarters: 18,
};

// ──────────────────────────────────────────────
// MLB Scoring Presets
// ──────────────────────────────────────────────

const MLB_STANDARD_POINTS: ScoringConfig = {
  sport: 'MLB',
  name: 'Standard Points',
  mode: 'points',
  batting: [
    { stat: 'H',   label: 'Hit',            pointsPerUnit: 1 },
    { stat: '2B',  label: 'Double',         pointsPerUnit: 2 },
    { stat: '3B',  label: 'Triple',         pointsPerUnit: 3 },
    { stat: 'HR',  label: 'Home Run',       pointsPerUnit: 4 },
    { stat: 'R',   label: 'Run',            pointsPerUnit: 1 },
    { stat: 'RBI', label: 'Run Batted In',  pointsPerUnit: 1 },
    { stat: 'SB',  label: 'Stolen Base',    pointsPerUnit: 2 },
    { stat: 'BB',  label: 'Walk',           pointsPerUnit: 1 },
    { stat: 'K',   label: 'Strikeout',      pointsPerUnit: -0.5 },
  ],
  pitching: [
    { stat: 'IP',  label: 'Inning Pitched', pointsPerUnit: 3 },
    { stat: 'K_p', label: 'Strikeout',      pointsPerUnit: 1 },
    { stat: 'W',   label: 'Win',            pointsPerUnit: 5 },
    { stat: 'L',   label: 'Loss',           pointsPerUnit: -3 },
    { stat: 'SV',  label: 'Save',           pointsPerUnit: 5 },
    { stat: 'ER',  label: 'Earned Run',     pointsPerUnit: -2 },
  ],
};

const MLB_POINTS_ONLY: ScoringConfig = {
  sport: 'MLB',
  name: 'Points Only (Simplified)',
  mode: 'points',
  batting: [
    { stat: 'H',   label: 'Hit',            pointsPerUnit: 1 },
    { stat: 'HR',  label: 'Home Run',       pointsPerUnit: 3 },
    { stat: 'RBI', label: 'Run Batted In',  pointsPerUnit: 1 },
    { stat: 'R',   label: 'Run',            pointsPerUnit: 1 },
    { stat: 'SB',  label: 'Stolen Base',    pointsPerUnit: 1 },
    { stat: 'BB',  label: 'Walk',           pointsPerUnit: 1 },
  ],
  pitching: [
    { stat: 'IP',  label: 'Inning Pitched', pointsPerUnit: 3 },
    { stat: 'K_p', label: 'Strikeout',      pointsPerUnit: 1 },
    { stat: 'W',   label: 'Win',            pointsPerUnit: 5 },
    { stat: 'SV',  label: 'Save',           pointsPerUnit: 5 },
    { stat: 'ER',  label: 'Earned Run',     pointsPerUnit: -2 },
  ],
};

const MLB_5X5_ROTO: ScoringConfig = {
  sport: 'MLB',
  name: '5×5 Rotisserie',
  mode: 'roto',
  batting: [],
  pitching: [],
  rotoCategories: {
    batting: ['R', 'HR', 'RBI', 'SB', 'AVG'],
    pitching: ['W', 'SV', 'K_p', 'ERA', 'WHIP'],
  },
};

const MLB_SABERMETRIC_ROTO: ScoringConfig = {
  sport: 'MLB',
  name: 'Sabermetric Roto',
  mode: 'roto',
  batting: [],
  pitching: [],
  rotoCategories: {
    batting: ['OBP', 'SLG', 'HR', 'SB', 'wOBA'],
    pitching: ['K_9', 'WHIP', 'FIP', 'W', 'SV'],
  },
};

// ──────────────────────────────────────────────
// NFL Scoring Presets
// ──────────────────────────────────────────────

const NFL_STANDARD_PPR: ScoringConfig = {
  sport: 'NFL',
  name: 'Standard PPR',
  mode: 'points',
  batting: [],
  pitching: [],
  passing: [
    { stat: 'pass_yd',  label: 'Passing Yard',     pointsPerUnit: 0.04 },
    { stat: 'pass_td',  label: 'Passing TD',        pointsPerUnit: 4 },
    { stat: 'pass_int', label: 'Interception',      pointsPerUnit: -2 },
    { stat: 'pass_300', label: '300+ Yard Bonus',   pointsPerUnit: 5 },
  ],
  rushing: [
    { stat: 'rush_yd',  label: 'Rushing Yard',      pointsPerUnit: 0.1 },
    { stat: 'rush_td',  label: 'Rushing TD',        pointsPerUnit: 6 },
    { stat: 'rush_100', label: '100+ Yard Bonus',   pointsPerUnit: 5 },
  ],
  receiving: [
    { stat: 'rec',      label: 'Reception',         pointsPerUnit: 1.0 },
    { stat: 'rec_yd',   label: 'Receiving Yard',    pointsPerUnit: 0.1 },
    { stat: 'rec_td',   label: 'Receiving TD',      pointsPerUnit: 6 },
    { stat: 'rec_100',  label: '100+ Yard Bonus',   pointsPerUnit: 5 },
  ],
  kicking: [
    { stat: 'fg',       label: 'Field Goal',        pointsPerUnit: 3 },
    { stat: 'fg_50',    label: '50+ Yard FG',       pointsPerUnit: 5 },
    { stat: 'xp',       label: 'Extra Point',       pointsPerUnit: 1 },
  ],
  defense: [
    { stat: 'def_td',   label: 'Defensive TD',      pointsPerUnit: 6 },
    { stat: 'def_int',  label: 'Interception',      pointsPerUnit: 2 },
    { stat: 'def_sack', label: 'Sack',              pointsPerUnit: 1 },
    { stat: 'def_fr',   label: 'Fumble Recovery',   pointsPerUnit: 2 },
    { stat: 'def_safety', label: 'Safety',          pointsPerUnit: 2 },
    { stat: 'def_0',    label: 'Shutout (0 pts allowed)',  pointsPerUnit: 10 },
    { stat: 'def_6',    label: '1-6 pts allowed',   pointsPerUnit: 7 },
    { stat: 'def_13',   label: '7-13 pts allowed',  pointsPerUnit: 4 },
    { stat: 'def_20',   label: '14-20 pts allowed', pointsPerUnit: 1 },
    { stat: 'def_27',   label: '21-27 pts allowed', pointsPerUnit: 0 },
    { stat: 'def_34',   label: '28-34 pts allowed', pointsPerUnit: -1 },
    { stat: 'def_35',   label: '35+ pts allowed',   pointsPerUnit: -4 },
  ],
};

const NFL_HALF_PPR: ScoringConfig = {
  ...NFL_STANDARD_PPR,
  name: 'Half PPR',
  receiving: [
    { stat: 'rec',      label: 'Reception',         pointsPerUnit: 0.5 },
    { stat: 'rec_yd',   label: 'Receiving Yard',    pointsPerUnit: 0.1 },
    { stat: 'rec_td',   label: 'Receiving TD',      pointsPerUnit: 6 },
    { stat: 'rec_100',  label: '100+ Yard Bonus',   pointsPerUnit: 5 },
  ],
};

const NFL_NON_PPR: ScoringConfig = {
  ...NFL_STANDARD_PPR,
  name: 'Non-PPR (Standard)',
  receiving: [
    { stat: 'rec',      label: 'Reception',         pointsPerUnit: 0.0 },
    { stat: 'rec_yd',   label: 'Receiving Yard',    pointsPerUnit: 0.1 },
    { stat: 'rec_td',   label: 'Receiving TD',      pointsPerUnit: 6 },
    { stat: 'rec_100',  label: '100+ Yard Bonus',   pointsPerUnit: 5 },
  ],
};

const NFL_QB_HEAVY: ScoringConfig = {
  ...NFL_STANDARD_PPR,
  name: 'QB Heavy (6-pt passing TD)',
  passing: [
    { stat: 'pass_yd',  label: 'Passing Yard',     pointsPerUnit: 0.06 },
    { stat: 'pass_td',  label: 'Passing TD',        pointsPerUnit: 6 },
    { stat: 'pass_int', label: 'Interception',      pointsPerUnit: -3 },
    { stat: 'pass_300', label: '300+ Yard Bonus',   pointsPerUnit: 5 },
  ],
};

// ── IDP Scoring ──
// Individual Defensive Player scoring rules added on top of the
// standard offensive scoring. Covers tackles, sacks, interceptions,
// forced fumbles, and defensive TDs.
const NFL_IDP_STANDARD: ScoringConfig = {
  ...NFL_STANDARD_PPR,
  name: 'IDP Standard (Offense + Individual Defense)',
  defense: [
    // Team defense (same as standard)
    { stat: 'def_td',   label: 'Defensive TD',      pointsPerUnit: 6 },
    { stat: 'def_int',  label: 'Interception',      pointsPerUnit: 2 },
    { stat: 'def_sack', label: 'Sack',              pointsPerUnit: 1 },
    { stat: 'def_fr',   label: 'Fumble Recovery',   pointsPerUnit: 2 },
    { stat: 'def_safety', label: 'Safety',          pointsPerUnit: 2 },
    { stat: 'def_0',    label: 'Shutout (0 pts allowed)',  pointsPerUnit: 10 },
    { stat: 'def_6',    label: '1-6 pts allowed',   pointsPerUnit: 7 },
    { stat: 'def_13',   label: '7-13 pts allowed',  pointsPerUnit: 4 },
    { stat: 'def_20',   label: '14-20 pts allowed', pointsPerUnit: 1 },
    { stat: 'def_27',   label: '21-27 pts allowed', pointsPerUnit: 0 },
    { stat: 'def_34',   label: '28-34 pts allowed', pointsPerUnit: -1 },
    { stat: 'def_35',   label: '35+ pts allowed',   pointsPerUnit: -4 },
    // Individual defensive player stats
    { stat: 'idp_tackle',     label: 'Solo Tackle',          pointsPerUnit: 1 },
    { stat: 'idp_ast_tackle', label: 'Assisted Tackle',      pointsPerUnit: 0.5 },
    { stat: 'idp_sack',       label: 'Sack',                 pointsPerUnit: 2 },
    { stat: 'idp_tfl',        label: 'Tackle for Loss',      pointsPerUnit: 1.5 },
    { stat: 'idp_int',        label: 'Interception',         pointsPerUnit: 5 },
    { stat: 'idp_ff',         label: 'Forced Fumble',        pointsPerUnit: 3 },
    { stat: 'idp_fr',         label: 'Fumble Recovery',      pointsPerUnit: 3 },
    { stat: 'idp_pd',         label: 'Pass Defended',        pointsPerUnit: 1.5 },
    { stat: 'idp_td',         label: 'Defensive TD',         pointsPerUnit: 6 },
    { stat: 'idp_safety',     label: 'Safety (Individual)',  pointsPerUnit: 4 },
  ],
};

const NFL_IDP_HEAVY: ScoringConfig = {
  ...NFL_IDP_STANDARD,
  name: 'IDP Heavy (Defense-Heavy Scoring)',
  defense: NFL_IDP_STANDARD.defense!.map((r) => {
    // Boost the individual defensive stats for heavy IDP leagues
    if (r.stat === 'idp_tackle') return { ...r, pointsPerUnit: 1.5 };
    if (r.stat === 'idp_sack') return { ...r, pointsPerUnit: 4 };
    if (r.stat === 'idp_int') return { ...r, pointsPerUnit: 6 };
    if (r.stat === 'idp_ff') return { ...r, pointsPerUnit: 4 };
    if (r.stat === 'idp_td') return { ...r, pointsPerUnit: 8 };
    return r;
  }),
};

// ── Defense-Only Scoring ──
// For leagues with no offensive players — heavy emphasis on
// individual defensive stats, team defense, and kickers.
// Kicker scoring is boosted slightly to make the 2-kicker format meaningful.
const NFL_DEFENSE_ONLY: ScoringConfig = {
  ...NFL_IDP_HEAVY,
  name: 'Defense Only (Kicker + IDP Heavy)',
  mode: 'points',
  // No offensive scoring — clear out passing/rushing/receiving
  passing: [],
  rushing: [],
  receiving: [],
  // Boosted kicker scoring (2 kickers are a key part of this format)
  kicking: [
    { stat: 'fg',       label: 'Field Goal',        pointsPerUnit: 4 },
    { stat: 'fg_50',    label: '50+ Yard FG',       pointsPerUnit: 6 },
    { stat: 'fg_40',    label: '40-49 Yard FG',     pointsPerUnit: 5 },
    { stat: 'xp',       label: 'Extra Point',       pointsPerUnit: 1.5 },
    { stat: 'fg_miss',  label: 'FG Miss (penalty)', pointsPerUnit: -1 },
  ],
  // Heavy individual defense + team defense
  defense: [
    // Team defense (boosted for defense-only leagues)
    { stat: 'def_td',   label: 'Defensive TD',      pointsPerUnit: 8 },
    { stat: 'def_int',  label: 'Interception',      pointsPerUnit: 3 },
    { stat: 'def_sack', label: 'Sack',              pointsPerUnit: 2 },
    { stat: 'def_fr',   label: 'Fumble Recovery',   pointsPerUnit: 3 },
    { stat: 'def_safety', label: 'Safety',          pointsPerUnit: 4 },
    { stat: 'def_0',    label: 'Shutout (0 pts allowed)',  pointsPerUnit: 15 },
    { stat: 'def_6',    label: '1-6 pts allowed',   pointsPerUnit: 10 },
    { stat: 'def_13',   label: '7-13 pts allowed',  pointsPerUnit: 6 },
    { stat: 'def_20',   label: '14-20 pts allowed', pointsPerUnit: 2 },
    { stat: 'def_27',   label: '21-27 pts allowed', pointsPerUnit: 0 },
    { stat: 'def_34',   label: '28-34 pts allowed', pointsPerUnit: -2 },
    { stat: 'def_35',   label: '35+ pts allowed',   pointsPerUnit: -6 },
    // Individual defensive player stats (heavy)
    { stat: 'idp_tackle',     label: 'Solo Tackle',          pointsPerUnit: 1.5 },
    { stat: 'idp_ast_tackle', label: 'Assisted Tackle',      pointsPerUnit: 0.75 },
    { stat: 'idp_sack',       label: 'Sack',                 pointsPerUnit: 4 },
    { stat: 'idp_tfl',        label: 'Tackle for Loss',      pointsPerUnit: 2 },
    { stat: 'idp_int',        label: 'Interception',         pointsPerUnit: 6 },
    { stat: 'idp_ff',         label: 'Forced Fumble',        pointsPerUnit: 4 },
    { stat: 'idp_fr',         label: 'Fumble Recovery',      pointsPerUnit: 4 },
    { stat: 'idp_pd',         label: 'Pass Defended',        pointsPerUnit: 2 },
    { stat: 'idp_td',         label: 'Defensive TD',         pointsPerUnit: 8 },
    { stat: 'idp_safety',     label: 'Safety (Individual)',  pointsPerUnit: 6 },
  ],
};

// ──────────────────────────────────────────────
// Preset Registry
// ──────────────────────────────────────────────

export const MLB_ROSTER_PRESETS: Record<string, RosterConfig> = {
  standard: MLB_STANDARD_ROSTER,
  shallow: MLB_SHALLOW_ROSTER,
  deep: MLB_DEEP_ROSTER,
};

export const NFL_ROSTER_PRESETS: Record<string, RosterConfig> = {
  standard: NFL_STANDARD_ROSTER,
  deep: NFL_DEEP_ROSTER,
  idp: NFL_IDP_ROSTER,
  dynasty: NFL_DYNASTY_ROSTER,
  idp_dynasty: NFL_IDP_DYNASTY_ROSTER,
  defense_only: NFL_DEFENSE_ONLY_ROSTER,
};

export const MLB_SCORING_PRESETS: Record<string, ScoringConfig> = {
  standard: MLB_STANDARD_POINTS,
  points_only: MLB_POINTS_ONLY,
  old_school_roto: MLB_5X5_ROTO,
  sabermetric: MLB_SABERMETRIC_ROTO,
};

export const NFL_SCORING_PRESETS: Record<string, ScoringConfig> = {
  standard_ppr: NFL_STANDARD_PPR,
  half_ppr: NFL_HALF_PPR,
  non_ppr: NFL_NON_PPR,
  qb_heavy: NFL_QB_HEAVY,
  idp_standard: NFL_IDP_STANDARD,
  idp_heavy: NFL_IDP_HEAVY,
  defense_only: NFL_DEFENSE_ONLY,
};

// ──────────────────────────────────────────────
// Lookup helpers
// ──────────────────────────────────────────────

export function getRosterPreset(sport: Sport, key: string): RosterConfig {
  if (sport === 'MLB') return MLB_ROSTER_PRESETS[key] ?? MLB_STANDARD_ROSTER;
  return NFL_ROSTER_PRESETS[key] ?? NFL_STANDARD_ROSTER;
}

export function getScoringPreset(sport: Sport, key: string): ScoringConfig {
  if (sport === 'MLB') return MLB_SCORING_PRESETS[key] ?? MLB_STANDARD_POINTS;
  return NFL_SCORING_PRESETS[key] ?? NFL_STANDARD_PPR;
}

export function listRosterPresets(sport: Sport): { key: string; name: string; totalRosterSize: number; totalStarters: number; qbCount: number; hasSuperflex: boolean; slotSummary: string; isIdp: boolean; isDynasty: boolean; isDefenseOnly: boolean; kickerCount: number }[] {
  const presets = sport === 'MLB' ? MLB_ROSTER_PRESETS : NFL_ROSTER_PRESETS;
  return Object.entries(presets).map(([key, p]) => {
    const qbSlot = p.slots.find((s) => s.slot === 'QB');
    const hasSuperflex = p.slots.some((s) => s.slot === 'SFLEX');
    const qbCount = qbSlot?.count ?? 0;
    const kickerSlot = p.slots.find((s) => s.slot === 'K');
    const kickerCount = kickerSlot?.count ?? 0;
    // Build a compact summary of starter slots
    const starterSlots = p.slots.filter((s) => s.isStarter);
    const slotSummary = starterSlots
      .map((s) => `${s.count > 1 ? s.count : ''}${s.slot}`)
      .join(' · ');
    // Detect IDP (has DL/LB/DB starter slots)
    const isIdp = p.slots.some((s) => ['DL', 'LB', 'DB', 'D_FLEX'].includes(s.slot) && s.isStarter);
    // Detect dynasty (has TAXI squad slot or is the deep MLB roster)
    const isDynasty = p.slots.some((s) => s.slot === 'TAXI') || (sport === 'MLB' && key === 'deep');
    // Detect defense-only (no QB/RB/WR/TE starter slots, has IDP starters)
    const hasOffensiveStarters = p.slots.some(
      (s) => ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SFLEX'].includes(s.slot) && s.isStarter
    );
    const isDefenseOnly = !hasOffensiveStarters && isIdp && kickerCount >= 2;
    return {
      key,
      name: p.name,
      totalRosterSize: p.totalRosterSize,
      totalStarters: p.totalStarters,
      qbCount,
      hasSuperflex,
      slotSummary,
      isIdp,
      isDynasty,
      isDefenseOnly,
      kickerCount,
    };
  });
}

export function listScoringPresets(sport: Sport): { key: string; name: string; mode: string }[] {
  const presets = sport === 'MLB' ? MLB_SCORING_PRESETS : NFL_SCORING_PRESETS;
  return Object.entries(presets).map(([key, p]) => ({
    key,
    name: p.name,
    mode: p.mode,
  }));
}

// ──────────────────────────────────────────────
// Season structure per sport
// ──────────────────────────────────────────────

export interface SeasonStructure {
  sport: Sport;
  regularSeasonPeriods: number;
  periodLabel: string;
  playoffWeeks: number;
  seasonStartMonth: number;
  seasonEndMonth: number;
}

export const SEASON_STRUCTURES: Record<Sport, SeasonStructure> = {
  NFL: {
    sport: 'NFL',
    regularSeasonPeriods: 14,
    periodLabel: 'week',
    playoffWeeks: 4,
    seasonStartMonth: 9,
    seasonEndMonth: 1,
  },
  MLB: {
    sport: 'MLB',
    regularSeasonPeriods: 26,
    periodLabel: 'scoring period',
    playoffWeeks: 4,
    seasonStartMonth: 3,
    seasonEndMonth: 10,
  },
};

// ──────────────────────────────────────────────
// Draft format helpers
// ──────────────────────────────────────────────

export const DRAFT_TYPES: { value: DraftType; label: string; description: string }[] = [
  { value: 'snake',      label: 'Snake Draft',              description: 'Standard serpentine draft — reverses order each round' },
  { value: 'linear',     label: 'Linear Draft',             description: 'Same pick order every round' },
  { value: '3rr_snake',  label: '3rd-Round Reversal Snake', description: 'Snake with a reversal in round 3 — competitive standard' },
  { value: 'auction',    label: 'Auction Draft',             description: 'Bid on players with a fixed budget' },
  { value: 'custom',     label: 'Custom Order',              description: 'Commissioner-defined pick order' },
];

export const KEEPER_TYPES: { value: KeeperType; label: string; description: string }[] = [
  { value: 'redraft', label: 'Redraft',  description: 'No keepers — fresh draft every season' },
  { value: 'keeper',  label: 'Keeper',   description: 'Keep a few players from last season' },
  { value: 'dynasty', label: 'Dynasty',  description: 'Keep entire roster — build a franchise' },
];

export const LEAGUE_FORMATS: { value: LeagueFormat; label: string; description: string }[] = [
  { value: 'roto',            label: 'Rotisserie (Roto)',          description: 'Season-long category standings — classic fantasy baseball' },
  { value: 'h2h_points',      label: 'Head-to-Head Points',        description: 'Weekly matchups scored by total fantasy points' },
  { value: 'h2h_categories',  label: 'Head-to-Head Categories',    description: 'Weekly matchups won by most categories won' },
  { value: 'points',          label: 'Points Only',                description: 'Season-long total fantasy points — no matchups' },
  { value: 'best_ball',       label: 'Best Ball',                  description: 'Auto-optimize lineup each week — no in-season management' },
];

/**
 * Generate the pick order for a given draft type and number of teams/rounds.
 * Returns an array of { round, pickInRound, overallPick, slot } where slot
 * is the 0-indexed team position drafting.
 */
export function generateDraftOrder(
  draftType: DraftType,
  numTeams: number,
  rounds: number
): { round: number; pickInRound: number; overallPick: number; slot: number }[] {
  const picks: { round: number; pickInRound: number; overallPick: number; slot: number }[] = [];
  let overall = 0;

  for (let round = 1; round <= rounds; round++) {
    const isReverseRound =
      draftType === 'snake' || draftType === '3rr_snake'
        ? round % 2 === 0
        : false;

    // 3RR: rounds 1-2 are normal snake, round 3 reverses, then snake continues
    let actualReverse = isReverseRound;
    if (draftType === '3rr_snake' && round === 3) {
      actualReverse = true;
    } else if (draftType === '3rr_snake' && round === 4) {
      actualReverse = true; // round 3 and 4 both reversed (the "3rd round reversal" pattern)
    }

    for (let pickInRound = 1; pickInRound <= numTeams; pickInRound++) {
      overall++;
      const slot = actualReverse
        ? numTeams - pickInRound
        : pickInRound - 1;
      picks.push({ round, pickInRound, overallPick: overall, slot });
    }
  }

  return picks;
}
