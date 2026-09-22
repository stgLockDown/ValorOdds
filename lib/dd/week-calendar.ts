/**
 * DiamondDraft — Fantasy week calendar.
 *
 * ESPN's fantasy week is *not* the calendar week. A scoring period runs from
 * Wednesday 00:00 ET through the following Tuesday 23:59:59 ET:
 *
 *     Wed ── Thu ── Fri ── Sat ── Sun ── Mon ── Tue
 *     ▲ waivers open                      ▲ week ends / waivers lock
 *
 * So:
 *   • Monday Night Football closes out the week.
 *   • Tuesday is the waiver *processing* day — the wire is locked.
 *   • Wednesday morning the new week begins and the waiver wire re-opens.
 *
 * Everything here is computed in America/New_York because that's the league
 * clock ESPN uses, regardless of where the server or the manager sits.
 *
 * This module is read-only and side-effect free. When it cannot confidently
 * determine a week (unsupported sport, pre-season, bad season year) it returns
 * `null` for the current week so callers can fall back to their existing
 * behaviour instead of gating something incorrectly.
 */

export type WeekPhase = 'in_progress' | 'waiver_processing' | 'waivers_open';

export interface FantasyWeekInfo {
  /** Current scoring period, or null when it can't be determined. */
  currentWeek: number | null;
  /** Season year the week belongs to. */
  seasonYear: number;
  /** ISO timestamp for the start of the current week (Wed 00:00 ET). */
  weekStart: string | null;
  /** ISO timestamp for the end of the current week (Tue 23:59:59 ET). */
  weekEnd: string | null;
  /** Local-league day of week, 0 = Sunday … 6 = Saturday. */
  dayOfWeek: number;
  /** True on Tuesday — the week is closing out and waivers are locked. */
  isWaiverProcessingDay: boolean;
  /** True once Wednesday ET arrives: the wire is open for claims. */
  waiversOpen: boolean;
  /** Coarse phase label for UI copy. */
  phase: WeekPhase;
  /** ISO timestamp for when the wire next opens (next Wednesday 00:00 ET). */
  waiversOpenAt: string | null;
}

const MS_PER_DAY = 86_400_000;
const LEAGUE_TZ = 'America/New_York';

/** Parts of a Date as seen in the league timezone. */
function leagueParts(d: Date): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: LEAGUE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    hour: parseInt(get('hour'), 10) % 24,
    minute: parseInt(get('minute'), 10),
    weekday: weekdayMap[get('weekday')] ?? 0,
  };
}

/** Midnight ET on a given calendar date, as a UTC Date (DST-aware, ±1h probe). */
function etMidnight(year: number, month: number, day: number): Date {
  // ET is UTC-5 (EST) or UTC-4 (EDT). Start from the EST guess and correct.
  for (const offset of [5, 4]) {
    const guess = new Date(Date.UTC(year, month - 1, day, offset, 0, 0, 0));
    const p = leagueParts(guess);
    if (p.year === year && p.month === month && p.day === day && p.hour === 0) return guess;
  }
  return new Date(Date.UTC(year, month - 1, day, 5, 0, 0, 0));
}

/** Day-of-week (0=Sun) for a calendar date, timezone independent. */
function dowOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Labor Day (first Monday of September) for a season year.
 * The NFL opener is always the Thursday after Labor Day.
 */
function laborDay(year: number): { year: number; month: number; day: number } {
  for (let day = 1; day <= 7; day++) {
    if (dowOf(year, 9, day) === 1) return { year, month: 9, day };
  }
  return { year, month: 9, day: 1 };
}

/**
 * Start of fantasy week 1 — the Wednesday immediately before the NFL opener.
 * Labor Day (Mon) + 2 days = Wednesday; the opener is Thursday, +3.
 */
function nflWeekOneStart(seasonYear: number): Date {
  const ld = laborDay(seasonYear);
  const mondayMidnight = etMidnight(ld.year, ld.month, ld.day);
  return new Date(mondayMidnight.getTime() + 2 * MS_PER_DAY);
}

/** Sports whose schedule follows the NFL Wed→Tue scoring period. */
function isWeeklySport(sport: string | null | undefined): boolean {
  const s = String(sport ?? '').toUpperCase();
  return s === 'NFL' || s === 'NCAAF';
}

/**
 * Resolve the current fantasy week and waiver state.
 *
 * @param sport       League sport (only NFL/NCAAF get a calendar week).
 * @param seasonYear  League season year.
 * @param now         Override for testing.
 * @param totalWeeks  Clamp the result to the league's schedule length.
 */
export function getFantasyWeekInfo(
  sport: string | null | undefined,
  seasonYear: number,
  now: Date = new Date(),
  totalWeeks?: number
): FantasyWeekInfo {
  const p = leagueParts(now);
  const dayOfWeek = p.weekday;
  const isWaiverProcessingDay = dayOfWeek === 2; // Tuesday
  // The wire is open Wednesday through Monday; it locks all day Tuesday.
  const waiversOpen = !isWaiverProcessingDay;
  const phase: WeekPhase = isWaiverProcessingDay
    ? 'waiver_processing'
    : dayOfWeek === 3
      ? 'waivers_open'
      : 'in_progress';

  // Next Wednesday 00:00 ET (today if it's already Wednesday).
  const daysUntilWed = (3 - dayOfWeek + 7) % 7;
  const todayMidnight = etMidnight(p.year, p.month, p.day);
  const waiversOpenAtDate = new Date(todayMidnight.getTime() + daysUntilWed * MS_PER_DAY);

  const base: FantasyWeekInfo = {
    currentWeek: null,
    seasonYear,
    weekStart: null,
    weekEnd: null,
    dayOfWeek,
    isWaiverProcessingDay,
    waiversOpen,
    phase,
    waiversOpenAt: waiversOpenAtDate.toISOString(),
  };

  if (!isWeeklySport(sport) || !Number.isFinite(seasonYear) || seasonYear < 2000) {
    return base;
  }

  const wk1 = nflWeekOneStart(seasonYear);
  const elapsed = now.getTime() - wk1.getTime();
  if (elapsed < 0) {
    // Pre-season: the season hasn't started, so week 1 is "upcoming".
    return {
      ...base,
      currentWeek: 1,
      weekStart: wk1.toISOString(),
      weekEnd: new Date(wk1.getTime() + 7 * MS_PER_DAY - 1000).toISOString(),
    };
  }

  let week = Math.floor(elapsed / (7 * MS_PER_DAY)) + 1;
  if (totalWeeks && totalWeeks > 0) week = Math.min(week, totalWeeks);
  if (week < 1) week = 1;

  const weekStart = new Date(wk1.getTime() + (week - 1) * 7 * MS_PER_DAY);
  const weekEnd = new Date(weekStart.getTime() + 7 * MS_PER_DAY - 1000);

  return {
    ...base,
    currentWeek: week,
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
  };
}

/**
 * Convenience: is the requested week in the future relative to today?
 * Returns false whenever the current week can't be determined, so callers
 * never gate on a guess.
 */
export function isFutureWeek(
  week: number,
  sport: string | null | undefined,
  seasonYear: number,
  now: Date = new Date()
): boolean {
  const info = getFantasyWeekInfo(sport, seasonYear, now);
  if (info.currentWeek == null) return false;
  return week > info.currentWeek;
}

/** Human copy for the waiver wire banner. */
export function waiverStatusText(info: FantasyWeekInfo): string {
  if (info.isWaiverProcessingDay) {
    return 'Waivers process today (Tuesday). The wire re-opens Wednesday at 12:00 AM ET.';
  }
  if (info.phase === 'waivers_open') {
    return 'Waiver wire is open — claims are processed next Tuesday.';
  }
  return 'Waiver wire is open. The scoring period ends Tuesday night.';
}
