/**
 * DiamondDraft — Weekly Stats Engine
 *
 * Produces per-player weekly stat lines and fantasy points for a league's
 * rosters. This is the data layer behind the fantasy home, the odds meter, and
 * the league AI chat.
 *
 * Data sources, in priority order:
 *   1. `player_stats` — real box-score rows (stats_json) when available for the
 *      player + week. This is the ground truth once games have been played.
 *   2. `dd_player_pool.projection` — the season-long per-stat projection JSONB
 *      (e.g. { pass_yd: 352, pass_td: 2, rec: 6, rec_yd: 102 }). Every pool row
 *      has this, so we can always render a meaningful weekly line.
 *
 * Fantasy points are computed with the league's real scoring config via the
 * existing `scoreStatLine` engine, so a player's weekly number matches the
 * league's scoring preset (PPR, half-PPR, roto, etc.).
 *
 * The engine is deterministic: the same (player, week) always yields the same
 * line, which keeps the odds meter stable between renders.
 */

import { query } from '@/lib/db';
import { scoreStatLine, type StatLine } from './scoring';
import { getScoringPreset, type ScoringConfig, type Sport } from './presets';
import { getLiveWeekStats, isLiveSport, type LiveWeekStats } from './live-stats';
import { sortBySlotOrder } from './slot-order';
import { getFantasyWeekInfo, getWeekWindow } from './week-calendar';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface WeeklyStatEntry {
  /** Stat code → numeric value (e.g. { rec: 6, rec_yd: 102 }) */
  stats: StatLine;
  /** Human-readable stat chips for the popup card. */
  chips: { label: string; value: string }[];
  /** Fantasy points for the week under the league's scoring config. */
  points: number;
  /** Where the line came from. */
  source: 'live' | 'actual' | 'projection';
  /** Live game state when the line came from a real game. */
  gameState?: 'pre' | 'in' | 'post';
  /**
   * True when this player's team currently has the ball in a live game (for a
   * D/ST, when the opponent has the ball). Drives the "in play" highlight.
   */
  hasPossession?: boolean;
  /** True when the player's offense is inside the opponent's 20. */
  isRedZone?: boolean;
  /**
   * True when the line is a forward-looking estimate rather than earned
   * points — i.e. the week hasn't happened yet, or the player's game hasn't
   * kicked off. UI should render these as "PROJ" and never as a live score.
   */
  isProjected?: boolean;
}

export interface WeeklyPlayerLine {
  playerName: string;
  playerId: string | null;
  team: string | null;
  position: string | null;
  sport: string | null;
  slot: string;
  headshot: string | null;
  /** Season-long projected points (pool). */
  projectedPoints: number;
  /** This week's line. */
  week: WeeklyStatEntry;
  /** Opponent abbreviation, when known. */
  opponent: string | null;
}

export interface WeeklyRoster {
  memberId: string;
  teamName: string;
  isBot: boolean;
  starters: WeeklyPlayerLine[];
  bench: WeeklyPlayerLine[];
  /** Sum of starting-lineup fantasy points for the week. */
  starterPoints: number;
  /** Sum of bench fantasy points (tiebreak). */
  benchPoints: number;
  /** Season-long projected starter total (for the odds meter baseline). */
  projectedStarterPoints: number;
  /**
   * Sum of this week's projected starter points. For a future week this equals
   * `starterPoints`; for a live week it's the pre-game expectation.
   */
  projectedWeekPoints: number;
  /** How many starters are on the field with the ball right now. */
  inPlayCount: number;
}

export interface WeeklyStatsResult {
  leagueId: string;
  sport: Sport;
  week: number;
  scoringName: string;
  /** True when at least one player's line came from a real (live/final) game. */
  hasLiveData: boolean;
  /**
   * 0..1 — how much of the week's real games have been played, derived from
   * ESPN game states (final = 1, live = 0.5, not started = 0). Null when we
   * have no live data for the week (fall back to a schedule-based estimate).
   */
  liveProgress: number | null;
  /** Number of games in the week that are currently live (state === 'in'). */
  liveGames: number;
  /**
   * The league's current scoring period, derived from the Wed→Tue fantasy
   * calendar. Null when it can't be determined (non-weekly sports).
   */
  currentWeek: number | null;
  /**
   * True when `week` is later than `currentWeek`. The whole payload is then
   * projection-only: no live or historical box scores are mixed in.
   */
  isFutureWeek: boolean;
  /** True when every starter line in the payload is a projection. */
  isProjectedWeek: boolean;
  rosters: WeeklyRoster[];
}

// ────────────────────────────────────────────────────────────────────────────
// Stat display labels (per sport)
// ────────────────────────────────────────────────────────────────────────────

const NFL_LABELS: Record<string, string> = {
  pass_yd: 'Pass Yds', pass_td: 'Pass TD', pass_int: 'INT', pass_300: '300+',
  rush_yd: 'Rush Yds', rush_td: 'Rush TD', rush_100: '100+',
  rec: 'Rec', rec_yd: 'Rec Yds', rec_td: 'Rec TD', rec_100: '100+',
  fg: 'FG', fg_50: '50+ FG', xp: 'XP',
  def_td: 'Def TD', def_int: 'INT', def_sack: 'Sacks', def_fr: 'Fum Rec',
  def_safety: 'Safety',
};

const MLB_LABELS: Record<string, string> = {
  H: 'H', '2B': '2B', '3B': '3B', HR: 'HR', R: 'R', RBI: 'RBI', SB: 'SB',
  BB: 'BB', K: 'K', AVG: 'AVG', OBP: 'OBP', SLG: 'SLG',
  IP: 'IP', W: 'W', L: 'L', SV: 'SV', ER: 'ER', ERA: 'ERA', WHIP: 'WHIP',
  K_p: 'K', FIP: 'FIP',
};

function labelFor(sport: string, stat: string): string {
  if (sport === 'MLB') return MLB_LABELS[stat] ?? stat;
  return NFL_LABELS[stat] ?? stat;
}

/** Stats that should be hidden from the chip row (bonus thresholds, etc.). */
const HIDDEN_STATS = new Set(['pass_300', 'rush_100', 'rec_100', 'def_0', 'def_6', 'def_13', 'def_20', 'def_27', 'def_34', 'def_35']);

function chipsFor(sport: string, stats: StatLine): { label: string; value: string }[] {
  const chips: { label: string; value: string }[] = [];
  for (const [stat, value] of Object.entries(stats)) {
    if (HIDDEN_STATS.has(stat)) continue;
    if (!value) continue;
    const label = labelFor(sport, stat);
    // Percentages / rates keep one decimal; counting stats are integers.
    const isRate = ['AVG', 'OBP', 'SLG', 'ERA', 'WHIP', 'FIP'].includes(stat);
    const display = isRate
      ? value.toFixed(stat === 'ERA' || stat === 'WHIP' || stat === 'FIP' ? 2 : 3)
      : Number.isInteger(value)
        ? String(value)
        : value.toFixed(1);
    chips.push({ label, value: display });
  }
  return chips;
}

// ────────────────────────────────────────────────────────────────────────────
// Projection → weekly stat line
// ────────────────────────────────────────────────────────────────────────────

/**
 * Deterministically derive a weekly stat line from a season-long projection.
 *
 * The pool projection is a *per-game* projection (e.g. Joe Burrow: 352 pass
 * yards, 2 pass TD). We apply a small, stable per-week variance so different
 * weeks look different without being random between renders — a hash of
 * (playerName, week) seeds the multiplier.
 */
function projectionToWeekly(
  projection: Record<string, number>,
  playerName: string,
  week: number
): StatLine {
  const seed = hashString(`${playerName}:${week}`);
  const line: StatLine = {};
  for (const [stat, base] of Object.entries(projection)) {
    if (typeof base !== 'number' || !Number.isFinite(base)) continue;
    // Variance in [-0.18, +0.18], stable per player+week.
    const r = ((seed + hashString(stat)) % 1000) / 1000; // 0..1
    const mult = 1 + (r - 0.5) * 0.36;
    let value = base * mult;
    // Counting stats stay whole numbers; yardage stays whole; rates untouched.
    if (!['AVG', 'OBP', 'SLG', 'ERA', 'WHIP', 'FIP'].includes(stat)) {
      value = Math.round(value);
    }
    line[stat] = value;
  }
  return line;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

// ────────────────────────────────────────────────────────────────────────────
// Actual box score → stat line
// ────────────────────────────────────────────────────────────────────────────

/**
 * Map a `player_stats.stats_json` row into the scoring engine's stat codes.
 * ESPN box scores use short codes (YDS, TD, REC, INT…) that don't always match
 * the scoring config keys, so we translate the common ones.
 */
function actualToStatLine(sport: string, raw: Record<string, unknown>): StatLine {
  const line: StatLine = {};
  for (const [k, v] of Object.entries(raw)) {
    const num = typeof v === 'number' ? v : parseFloat(String(v));
    if (!Number.isFinite(num)) continue;
    const key = k.toUpperCase();
    if (sport === 'NFL') {
      // Best-effort mapping; only map keys the scoring config understands.
      const map: Record<string, string> = {
        'PASS YDS': 'pass_yd', 'PASSING YARDS': 'pass_yd',
        'PASS TD': 'pass_td', 'PASSING TOUCHDOWNS': 'pass_td',
        'INT': 'pass_int', 'INTERCEPTIONS': 'pass_int',
        'RUSH YDS': 'rush_yd', 'RUSHING YARDS': 'rush_yd',
        'RUSH TD': 'rush_td', 'RUSHING TOUCHDOWNS': 'rush_td',
        'REC': 'rec', 'RECEPTIONS': 'rec',
        'REC YDS': 'rec_yd', 'RECEIVING YARDS': 'rec_yd',
        'REC TD': 'rec_td', 'RECEIVING TOUCHDOWNS': 'rec_td',
        'FG': 'fg', 'XP': 'xp',
      };
      const mapped = map[key];
      if (mapped) line[mapped] = (line[mapped] ?? 0) + num;
    } else {
      // MLB: keys already match the config (H, HR, RBI, R, SB, BB, K, IP…).
      if (['H', '2B', '3B', 'HR', 'R', 'RBI', 'SB', 'BB', 'K', 'IP', 'W', 'L', 'SV', 'ER'].includes(key)) {
        line[key] = (line[key] ?? 0) + num;
      }
    }
  }
  return line;
}

// ────────────────────────────────────────────────────────────────────────────
// Main engine
// ────────────────────────────────────────────────────────────────────────────

interface RosterRow {
  member_id: string;
  team_name: string;
  is_bot: boolean;
  player_name: string;
  player_id: string | null;
  team: string | null;
  position: string | null;
  sport: string | null;
  slot: string | null;
  projected_points: string | null;
  projection: Record<string, number> | null;
  headshot_url: string | null;
}

/**
 * Build the full weekly stats payload for a league.
 */
export async function getWeeklyStats(
  leagueId: bigint,
  week: number
): Promise<WeeklyStatsResult> {
  const leagueRes = await query<{
    sport: string;
    scoring_preset: string;
    scoring_config: any;
    season_year: number;
  }>(
    `SELECT sport, scoring_preset, scoring_config, season_year FROM dd_leagues WHERE id = $1`,
    [leagueId]
  );
  const league = leagueRes.rows[0];
  if (!league) throw new Error('League not found');

  const sport = league.sport as Sport;
  const seasonYear = Number(league.season_year) || new Date().getFullYear();

  // ── Fantasy calendar gate ────────────────────────────────────────────────
  // A scoring period runs Wednesday → Tuesday. Weeks after the current one
  // have not been played, so they must render as PROJECTIONS ONLY. Without
  // this gate, live box scores and stale `player_stats` rows (which carry no
  // week column) leak into every future week and show phantom "earned" points.
  const weekInfo = getFantasyWeekInfo(sport, seasonYear);
  const currentWeek = weekInfo.currentWeek;
  const isFuture = currentWeek != null && week > currentWeek;

  // Resolve the scoring config: prefer the league's stored config, else preset.
  let scoring: ScoringConfig;
  const stored =
    typeof league.scoring_config === 'string'
      ? safeJson(league.scoring_config)
      : league.scoring_config;
  if (stored && stored.mode && (stored.batting || stored.passing)) {
    scoring = stored as ScoringConfig;
  } else {
    scoring = getScoringPreset(sport, league.scoring_preset || 'standard_ppr');
  }

  const rosterRes = await query<RosterRow>(
    `SELECT r.member_id::text, m.team_name,
            (u.password_hash = 'bot_no_login') AS is_bot,
            r.player_name, r.player_id, r.team, r.position, r.sport, r.slot,
            pp.projected_points, pp.projection, pp.headshot_url
     FROM dd_rosters r
     JOIN dd_league_members m ON m.id = r.member_id
     JOIN web_users u ON u.id = m.user_id
     LEFT JOIN dd_player_pool pp
       ON pp.player_name = r.player_name AND pp.sport = r.sport
     WHERE r.league_id = $1
     ORDER BY r.member_id, r.slot`,
    [leagueId]
  );

  // Real box scores for this league's players (best-effort).
  //
  // NOTE: `player_stats` has no `week` column and `game_date` is frequently
  // NULL, so a single stored box score would otherwise be replayed as the
  // "actual" result for EVERY week, including ones that haven't happened.
  // We therefore only consult it for the current or a past week, and we scope
  // each row to the requested week's Wed→Tue window so a stale prior-season
  // box score (or a NULL-dated row) can never surface as this week's "actual".
  const names = [...new Set(rosterRes.rows.map((r) => r.player_name))];
  const actualByPlayer = new Map<string, StatLine>();
  const weekWindow = getWeekWindow(sport, seasonYear, week);
  if (names.length && !isFuture) {
    try {
      const actualRes = await query<{
        player_name: string;
        stats_json: Record<string, unknown> | null;
      }>(
        `SELECT DISTINCT ON (player_name) player_name, stats_json
         FROM player_stats
         WHERE sport = $1 AND player_name = ANY($2::text[])
           AND stats_json IS NOT NULL
           AND game_date IS NOT NULL
           AND ($3::timestamptz IS NULL
                OR (game_date >= $3::timestamptz AND game_date <= $4::timestamptz))
         ORDER BY player_name, game_date DESC NULLS LAST, recorded_at DESC`,
        [sport, names, weekWindow?.start ?? null, weekWindow?.end ?? null]
      );
      for (const row of actualRes.rows) {
        if (!row.stats_json) continue;
        const line = actualToStatLine(sport, row.stats_json);
        if (Object.keys(line).length) actualByPlayer.set(row.player_name, line);
      }
    } catch {
      // player_stats is optional — projections always cover us.
    }
  }

  // Live game stats for the week (the primary source once games are played).
  // Skipped entirely for future weeks — there is nothing live to report and
  // fetching would only risk surfacing another week's numbers.
  let live: LiveWeekStats | null = null;
  if (isLiveSport(sport) && !isFuture) {
    try {
      live = await getLiveWeekStats(sport, seasonYear, week);
    } catch {
      live = null;
    }
  }
  const hasLiveData = Boolean(live && (live.players.size || live.teamDefense.size));

  // Derive a real week-progress signal from the ESPN game states so the odds
  // meter reflects how much of the slate has actually been played.
  let liveProgress: number | null = null;
  let liveGames = 0;
  if (live && live.games.length) {
    liveGames = live.games.filter((g) => g.state === 'in').length;
    const played = live.games.reduce(
      (s, g) => s + (g.state === 'post' ? 1 : g.state === 'in' ? 0.5 : 0),
      0
    );
    liveProgress = played / live.games.length;
  }

  const byMember = new Map<string, WeeklyRoster>();

  for (const r of rosterRes.rows) {
    let entry = byMember.get(r.member_id);
    if (!entry) {
      entry = {
        memberId: r.member_id,
        teamName: r.team_name,
        isBot: r.is_bot,
        starters: [],
        bench: [],
        starterPoints: 0,
        benchPoints: 0,
        projectedStarterPoints: 0,
        projectedWeekPoints: 0,
        inPlayCount: 0,
      };
      byMember.set(r.member_id, entry);
    }

    const isDefense = (r.position ?? '').toUpperCase() === 'DEF' || (r.position ?? '').toUpperCase() === 'D/ST';

    // Resolution order: live game line → stored box score → projection.
    let stats: StatLine;
    let source: 'live' | 'actual' | 'projection';
    let gameState: 'pre' | 'in' | 'post' | undefined;
    let opponent: string | null = null;
    let hasPossession = false;
    let isRedZone = false;

    const liveEntry = live
      ? isDefense
        ? r.team
          ? live.teamDefense.get(r.team)
          : undefined
        : live.players.get(r.player_name)
      : undefined;

    if (liveEntry && Object.keys(liveEntry.stats).length) {
      stats = liveEntry.stats;
      source = 'live';
      gameState = liveEntry.gameState;
      opponent = liveEntry.opponent;
      hasPossession = Boolean(liveEntry.hasPossession);
      isRedZone = Boolean(liveEntry.isRedZone);
    } else {
      const actual = actualByPlayer.get(r.player_name);
      if (actual && Object.keys(actual).length) {
        stats = actual;
        source = 'actual';
      } else if (r.projection && Object.keys(r.projection).length) {
        stats = projectionToWeekly(r.projection, r.player_name, week);
        source = 'projection';
      } else {
        stats = {};
        source = 'projection';
      }
      // Even without a live stat line, we know the player's team's game state
      // from the scoreboard. This keeps "yet to play" players from being
      // mistaken for finished ones when deciding whether a week is complete.
      if (live && r.team) {
        const ts = live.teamState.get(r.team);
        if (ts) {
          gameState = ts;
          const g = live.games.find(
            (gm) => gm.homeAbbrev === r.team || gm.awayAbbrev === r.team
          );
          if (g) opponent = g.homeAbbrev === r.team ? g.awayAbbrev : g.homeAbbrev;
          if (ts === 'in') {
            // A skill player is in play when his own offense has the ball; a
            // D/ST is in play when the opponent has it.
            const offenseTeam = isDefense ? opponent : r.team;
            if (offenseTeam) {
              hasPossession = live.possession.has(offenseTeam);
              isRedZone = live.redZone.has(offenseTeam);
            }
          }
        }
      }
    }

    // Future weeks, and players whose game hasn't kicked off, are estimates.
    const isProjected = isFuture || source === 'projection' || gameState === 'pre';

    const scored = scoreStatLine(sport, stats, scoring);
    const points = round1(scored.fantasyPoints);
    const projectedPoints = r.projected_points != null ? Number(r.projected_points) : 0;

    const line: WeeklyPlayerLine = {
      playerName: r.player_name,
      playerId: r.player_id,
      team: r.team,
      position: r.position,
      sport: r.sport,
      slot: r.slot ?? 'BN',
      headshot: r.headshot_url,
      projectedPoints,
      week: {
        stats,
        chips: chipsFor(sport, stats),
        points,
        source,
        gameState,
        hasPossession,
        isRedZone,
        isProjected,
      },
      opponent,
    };

    if (r.slot && r.slot !== 'BN' && r.slot !== 'BENCH' && r.slot !== 'IR' && r.slot !== 'IL') {
      entry.starters.push(line);
      entry.starterPoints += points;
      entry.projectedStarterPoints += projectedPoints;
      if (isProjected) entry.projectedWeekPoints += points;
      else entry.projectedWeekPoints += projectedPoints;
      if (hasPossession) entry.inPlayCount += 1;
    } else {
      entry.bench.push(line);
      entry.benchPoints += points;
    }
  }

  const rosters = [...byMember.values()].map((r) => ({
    ...r,
    // ESPN lineup order: QB, RB, RB, WR, WR, TE, FLEX, FLEX+, D/ST, K.
    // The SQL `ORDER BY r.slot` is alphabetical, which produced
    // FLEX, FLEX, K, QB, RB… — so we re-sort here into the canonical order.
    starters: sortBySlotOrder(r.starters, (p) => p.slot, sport),
    bench: sortBySlotOrder(r.bench, (p) => p.slot, sport),
    starterPoints: round1(r.starterPoints),
    benchPoints: round1(r.benchPoints),
    projectedStarterPoints: round1(r.projectedStarterPoints),
    projectedWeekPoints: round1(r.projectedWeekPoints),
  }));

  return {
    leagueId: String(leagueId),
    sport,
    week,
    scoringName: scoring.name,
    hasLiveData,
    liveProgress,
    liveGames,
    currentWeek,
    isFutureWeek: isFuture,
    isProjectedWeek:
      isFuture || rosters.every((r) => r.starters.every((p) => p.week.isProjected === true)),
    rosters,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function safeJson(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
