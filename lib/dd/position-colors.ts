/**
 * DiamondDraft — Position-based color highlighting.
 *
 * Every position (QB, RB, WR, … DL, LB, DB, … C, 1B, SP, …) gets a
 * distinct color used in the draft board, player list, roster cards,
 * and position-filter buttons.
 *
 * Colors are chosen to be readable on the dark brand surface (#111827 /
 * #1f2937) — each position has a foreground (text), a soft background
 * tint, and a border color.
 */

export interface PositionColor {
  /** Primary foreground / text color (hex) */
  fg: string;
  /** Soft background tint (rgba, semi-transparent) */
  bg: string;
  /** Border accent color (hex) */
  border: string;
  /** A short label for the color, used in legends */
  name: string;
}

/**
 * A CSS style object compatible with React's `style` prop.
 * We use a plain record here so this module can be `.ts` (no JSX).
 */
export type CSSStyle = Record<string, string | number>;

/** Full NFL offensive + defensive position color map. */
const NFL_COLORS: Record<string, PositionColor> = {
  QB:  { fg: '#60a5fa', bg: 'rgba(96,165,250,0.15)',  border: '#60a5fa', name: 'Quarterback' },
  RB:  { fg: '#34d399', bg: 'rgba(52,211,153,0.15)',  border: '#34d399', name: 'Running Back' },
  WR:  { fg: '#fbbf24', bg: 'rgba(251,191,36,0.15)',  border: '#fbbf24', name: 'Wide Receiver' },
  TE:  { fg: '#f472b6', bg: 'rgba(244,114,182,0.15)', border: '#f472b6', name: 'Tight End' },
  K:   { fg: '#a78bfa', bg: 'rgba(167,139,250,0.15)', border: '#a78bfa', name: 'Kicker' },
  DEF: { fg: '#fb923c', bg: 'rgba(251,146,60,0.15)',  border: '#fb923c', name: 'Team Defense' },
  // IDP
  DL:  { fg: '#f87171', bg: 'rgba(248,113,113,0.15)', border: '#f87171', name: 'Defensive Line' },
  DE:  { fg: '#f87171', bg: 'rgba(248,113,113,0.15)', border: '#f87171', name: 'Defensive End' },
  DT:  { fg: '#ef4444', bg: 'rgba(239,68,68,0.15)',   border: '#ef4444', name: 'Defensive Tackle' },
  LB:  { fg: '#22d3ee', bg: 'rgba(34,211,238,0.15)',  border: '#22d3ee', name: 'Linebacker' },
  DB:  { fg: '#c084fc', bg: 'rgba(192,132,252,0.15)', border: '#c084fc', name: 'Defensive Back' },
  CB:  { fg: '#c084fc', bg: 'rgba(192,132,252,0.15)', border: '#c084fc', name: 'Cornerback' },
  S:   { fg: '#e879f9', bg: 'rgba(232,121,249,0.15)', border: '#e879f9', name: 'Safety' },
  // Flex / generic
  FLEX:  { fg: '#94a3b8', bg: 'rgba(148,163,184,0.15)', border: '#94a3b8', name: 'Flex' },
  SFLEX: { fg: '#94a3b8', bg: 'rgba(148,163,184,0.15)', border: '#94a3b8', name: 'Super Flex' },
  D_FLEX: { fg: '#fb7185', bg: 'rgba(251,113,133,0.15)', border: '#fb7185', name: 'Defensive Flex' },
  // Bench / IR / Taxi — neutral
  BN:    { fg: '#6b7280', bg: 'rgba(107,114,128,0.15)', border: '#6b7280', name: 'Bench' },
  IR:    { fg: '#6b7280', bg: 'rgba(107,114,128,0.15)', border: '#6b7280', name: 'Injured Reserve' },
  TAXI:  { fg: '#6b7280', bg: 'rgba(107,114,128,0.15)', border: '#6b7280', name: 'Taxi Squad' },
};

/** Full MLB position color map. */
const MLB_COLORS: Record<string, PositionColor> = {
  C:   { fg: '#fbbf24', bg: 'rgba(251,191,36,0.15)',  border: '#fbbf24', name: 'Catcher' },
  '1B':{ fg: '#34d399', bg: 'rgba(52,211,153,0.15)',  border: '#34d399', name: 'First Base' },
  '2B':{ fg: '#60a5fa', bg: 'rgba(96,165,250,0.15)',  border: '#60a5fa', name: 'Second Base' },
  '3B':{ fg: '#f472b6', bg: 'rgba(244,114,182,0.15)', border: '#f472b6', name: 'Third Base' },
  SS:  { fg: '#22d3ee', bg: 'rgba(34,211,238,0.15)',  border: '#22d3ee', name: 'Shortstop' },
  OF:  { fg: '#a78bfa', bg: 'rgba(167,139,250,0.15)', border: '#a78bfa', name: 'Outfield' },
  LF:  { fg: '#a78bfa', bg: 'rgba(167,139,250,0.15)', border: '#a78bfa', name: 'Left Field' },
  CF:  { fg: '#c084fc', bg: 'rgba(192,132,252,0.15)', border: '#c084fc', name: 'Center Field' },
  RF:  { fg: '#818cf8', bg: 'rgba(129,140,248,0.15)', border: '#818cf8', name: 'Right Field' },
  DH:  { fg: '#fb923c', bg: 'rgba(251,146,60,0.15)',  border: '#fb923c', name: 'Designated Hitter' },
  UTIL:{ fg: '#94a3b8', bg: 'rgba(148,163,184,0.15)', border: '#94a3b8', name: 'Utility' },
  SP:  { fg: '#f87171', bg: 'rgba(248,113,113,0.15)', border: '#f87171', name: 'Starting Pitcher' },
  RP:  { fg: '#ef4444', bg: 'rgba(239,68,68,0.15)',   border: '#ef4444', name: 'Relief Pitcher' },
  P:   { fg: '#fca5a5', bg: 'rgba(252,165,165,0.15)', border: '#fca5a5', name: 'Pitcher (Any)' },
  MI:  { fg: '#67e8f9', bg: 'rgba(103,232,249,0.15)', border: '#67e8f9', name: 'Middle Infield' },
  CI:  { fg: '#6ee7b7', bg: 'rgba(110,231,183,0.15)', border: '#6ee7b7', name: 'Corner Infield' },
};

/** Fallback color for unknown / bench / generic slots. */
const DEFAULT_COLOR: PositionColor = {
  fg: '#9ca3af',
  bg: 'rgba(156,163,175,0.10)',
  border: '#9ca3af',
  name: 'Player',
};

/**
 * Get the color definition for a position.
 * Accepts the sport ('NFL' | 'MLB') and a position string.
 * Falls back to the default muted gray for unknown positions.
 */
export function getPositionColor(sport: string, position: string | null | undefined): PositionColor {
  if (!position) return DEFAULT_COLOR;
  const map = sport === 'MLB' ? MLB_COLORS : NFL_COLORS;
  return map[position] ?? DEFAULT_COLOR;
}

/**
 * Get an inline-style object suitable for a position-colored badge.
 * Usage: <span style={positionBadgeStyle(sport, pos)}>QB</span>
 */
export function positionBadgeStyle(sport: string, position: string | null | undefined): CSSStyle {
  const c = getPositionColor(sport, position);
  return {
    color: c.fg,
    backgroundColor: c.bg,
    borderColor: c.border,
    borderWidth: 1,
    borderStyle: 'solid',
  };
}

/**
 * Get an inline-style for a left-border accent (used on player list rows
 * and roster cards).
 */
export function positionLeftBorderStyle(sport: string, position: string | null | undefined): CSSStyle {
  const c = getPositionColor(sport, position);
  return {
    borderLeft: `3px solid ${c.border}`,
  };
}

/**
 * Get an inline-style for a subtle cell background (draft board).
 */
export function positionCellBgStyle(sport: string, position: string | null | undefined): CSSStyle {
  const c = getPositionColor(sport, position);
  return {
    backgroundColor: c.bg,
  };
}

/**
 * Build a legend list for the given sport — all positions that have
 * distinct colors, suitable for rendering a color key in the UI.
 */
export function getPositionLegend(sport: string): { position: string; color: PositionColor }[] {
  const map = sport === 'MLB' ? MLB_COLORS : NFL_COLORS;
  // For NFL, show the "filterable" positions plus IDP if present
  const order = sport === 'MLB'
    ? ['C', '1B', '2B', '3B', 'SS', 'OF', 'DH', 'SP', 'RP']
    : ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB', 'D_FLEX'];
  return order
    .filter((pos) => map[pos])
    .map((pos) => ({ position: pos, color: map[pos] }));
}
