/**
 * DiamondDraft — Live game stats.
 *
 * Pulls real, in-progress and final player stat lines from ESPN's public
 * scoreboard + summary endpoints so weekly fantasy points are earned from
 * actual games (not season projections).
 *
 * Pipeline:
 *   1. `fetchScoreboard(sport, seasonYear, week)` → the week's games
 *      (event id, home/away abbrev, score, state).
 *   2. For each game, fetch the ESPN summary and extract:
 *        * every player's stat line (passing/rushing/receiving/kicking/defense)
 *        * each team's D/ST stat line (sacks, INTs, fumble recoveries, TDs,
 *          and points-allowed buckets) derived from the opponent's box score.
 *   3. Index everything by player name and by team abbreviation so the weekly
 *      stats engine can look up any rostered player (or D/ST) in O(1).
 *
 * Scope: NFL + NCAAF (week-based scoreboards). Other sports return an empty
 * result and the caller falls back to projections.
 */

import { fetchRawSummaryJson, espnPathForSport } from '../espn-summary';
import type { StatLine } from './scoring';

const ESPN_HOSTS = [
  'https://site.web.api.espn.com/apis/site/v2/sports',
  'https://site.api.espn.com/apis/site/v2/sports',
];
const FETCH_TIMEOUT_MS = 8000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export type GameState = 'pre' | 'in' | 'post';

export interface ScoreboardGame {
  eventId: string;
  homeAbbrev: string | null;
  awayAbbrev: string | null;
  homeScore: number;
  awayScore: number;
  state: GameState;
}

export interface LiveStatEntry {
  stats: StatLine;
  opponent: string | null;
  gameState: GameState;
}

export interface LiveWeekStats {
  games: ScoreboardGame[];
  /** player name → live stat line */
  players: Map<string, LiveStatEntry>;
  /** team abbreviation → D/ST stat line */
  teamDefense: Map<string, LiveStatEntry>;
  /**
   * team abbreviation → that team's game state this week. Populated from the
   * scoreboard even for games that haven't started, so a rostered player whose
   * game is still `pre` is correctly treated as "yet to play" rather than
   * silently falling back to a projection with no game state.
   */
  teamState: Map<string, GameState>;
}

/** Sports whose ESPN scoreboard is week-addressable. */
export function isLiveSport(sport: string): boolean {
  const s = (sport || '').toUpperCase();
  return s === 'NFL' || s === 'NCAAF';
}

// ───────────────────────────────────────────────────────────────────────────
// Fetch helpers
// ───────────────────────────────────────────────────────────────────────────

async function fetchJsonOnce(url: string): Promise<any | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', Referer: 'https://www.espn.com/' },
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchScoreboardJson(path: string, week: number, seasonYear: number): Promise<any | null> {
  for (const base of ESPN_HOSTS) {
    const url = `${base}/${path}/scoreboard?week=${week}&seasontype=2&dates=${seasonYear}`;
    const data = await fetchJsonOnce(url);
    if (data && Array.isArray(data.events)) return data;
  }
  return null;
}

// ───────────────────────────────────────────────────────────────────────────
// Parsing helpers
// ───────────────────────────────────────────────────────────────────────────

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/** Parse ESPN "made/attempted" strings like "1/1" or "3/4" → made count. */
function parseMadeAtt(v: unknown): number {
  const m = String(v ?? '').match(/^(\d+)\s*\/\s*(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

function stateOf(comp: any): GameState {
  const s = comp?.status?.type?.state;
  return s === 'in' ? 'in' : s === 'post' ? 'post' : 'pre';
}

function parseScoreboard(data: any): ScoreboardGame[] {
  const out: ScoreboardGame[] = [];
  for (const e of data?.events ?? []) {
    const comp = e?.competitions?.[0];
    if (!comp) continue;
    const competitors: any[] = comp?.competitors ?? [];
    const home = competitors.find((c) => c?.homeAway === 'home');
    const away = competitors.find((c) => c?.homeAway === 'away');
    out.push({
      eventId: String(e.id),
      homeAbbrev: home?.team?.abbreviation ?? null,
      awayAbbrev: away?.team?.abbreviation ?? null,
      homeScore: num(home?.score),
      awayScore: num(away?.score),
      state: stateOf(comp),
    });
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// NFL player + team-defense extraction
// ───────────────────────────────────────────────────────────────────────────

/** Extract every player's stat line from one team's box-score block. */
function extractNflPlayers(teamBlock: any): Map<string, StatLine> {
  const out = new Map<string, StatLine>();
  const groups: any[] = teamBlock?.statistics ?? [];
  for (const g of groups) {
    const labels: string[] = (g?.labels ?? []).map((l: any) => String(l));
    const groupName = String(g?.name ?? '');
    const athletes: any[] = g?.athletes ?? [];
    for (const a of athletes) {
      const pname: string | undefined = a?.athlete?.displayName;
      if (!pname) continue;
      const raw: string[] = (a?.stats ?? []).map((s: any) => (s == null ? '' : String(s)));
      const get = (label: string): string | undefined => {
        const i = labels.indexOf(label);
        return i >= 0 ? raw[i] : undefined;
      };
      const line = out.get(pname) ?? {};

      if (groupName === 'passing') {
        const yds = num(get('YDS'));
        line.pass_yd = (line.pass_yd ?? 0) + yds;
        line.pass_td = (line.pass_td ?? 0) + num(get('TD'));
        line.pass_int = (line.pass_int ?? 0) + num(get('INT'));
        if (yds >= 300) line.pass_300 = 1;
      } else if (groupName === 'rushing') {
        const yds = num(get('YDS'));
        line.rush_yd = (line.rush_yd ?? 0) + yds;
        line.rush_td = (line.rush_td ?? 0) + num(get('TD'));
        if (yds >= 100) line.rush_100 = 1;
      } else if (groupName === 'receiving') {
        const yds = num(get('YDS'));
        line.rec = (line.rec ?? 0) + num(get('REC'));
        line.rec_yd = (line.rec_yd ?? 0) + yds;
        line.rec_td = (line.rec_td ?? 0) + num(get('TD'));
        if (yds >= 100) line.rec_100 = 1;
      } else if (groupName === 'kicking') {
        const fgMade = parseMadeAtt(get('FG'));
        line.fg = (line.fg ?? 0) + fgMade;
        const long = num(get('LONG'));
        if (fgMade > 0 && long >= 50) line.fg_50 = (line.fg_50 ?? 0) + 1;
        line.xp = (line.xp ?? 0) + parseMadeAtt(get('XP'));
      } else if (groupName === 'defensive') {
        line.def_sack = (line.def_sack ?? 0) + num(get('SACKS'));
        line.def_td = (line.def_td ?? 0) + num(get('TD'));
      } else if (groupName === 'interceptions') {
        line.def_int = (line.def_int ?? 0) + num(get('INT'));
        line.def_td = (line.def_td ?? 0) + num(get('TD'));
      }
      out.set(pname, line);
    }
  }
  return out;
}

/**
 * Build a team's D/ST stat line. `own` is the team's own team-stats block
 * (for its defensive TDs); `opp` is the opponent's block (sacks allowed,
 * INTs thrown, fumbles lost); `ptsAllowed` is the opponent's score.
 */
function extractNflTeamDefense(own: any[], opp: any[], ptsAllowed: number): StatLine {
  const line: StatLine = {};
  const find = (arr: any[], name: string) => arr.find((s) => s?.name === name);
  const dv = (arr: any[], name: string) => find(arr, name)?.displayValue;

  const sacks = dv(opp, 'sacksYardsLost'); // "3-10" → 3 sacks allowed
  line.def_sack = sacks ? parseInt(String(sacks).split('-')[0], 10) || 0 : 0;
  line.def_int = num(dv(opp, 'interceptions'));
  line.def_fr = num(dv(opp, 'fumblesLost'));
  line.def_td = num(dv(own, 'defensiveTouchdowns'));

  if (ptsAllowed === 0) line.def_0 = 1;
  else if (ptsAllowed <= 6) line.def_6 = 1;
  else if (ptsAllowed <= 13) line.def_13 = 1;
  else if (ptsAllowed <= 20) line.def_20 = 1;
  else if (ptsAllowed <= 27) line.def_27 = 1;
  else if (ptsAllowed <= 34) line.def_34 = 1;
  else line.def_35 = 1;

  return line;
}

// ───────────────────────────────────────────────────────────────────────────
// Main entry point
// ───────────────────────────────────────────────────────────────────────────

/**
 * Fetch and index every player + team-defense stat line for a given week.
 * Returns an empty result for unsupported sports or when ESPN is unreachable
 * (callers fall back to projections).
 */
export async function getLiveWeekStats(
  sport: string,
  seasonYear: number,
  week: number
): Promise<LiveWeekStats> {
  const result: LiveWeekStats = {
    games: [],
    players: new Map(),
    teamDefense: new Map(),
    teamState: new Map(),
  };
  if (!isLiveSport(sport)) return result;

  const path = espnPathForSport(sport);
  if (!path) return result;

  const sb = await fetchScoreboardJson(path, week, seasonYear);
  if (!sb) return result;

  const games = parseScoreboard(sb);
  result.games = games;

  // Record every team's game state up front (covers games that haven't started).
  for (const g of games) {
    if (g.homeAbbrev) result.teamState.set(g.homeAbbrev, g.state);
    if (g.awayAbbrev) result.teamState.set(g.awayAbbrev, g.state);
  }

  await Promise.all(
    games.map(async (g) => {
      const summary = await fetchRawSummaryJson(path, g.eventId);
      if (!summary) return;

      const comp = summary?.header?.competitions?.[0];
      const competitors: any[] = comp?.competitors ?? [];
      const homeC = competitors.find((c) => c?.homeAway === 'home');
      const awayC = competitors.find((c) => c?.homeAway === 'away');
      const homeAbbrev: string | null = homeC?.team?.abbreviation ?? g.homeAbbrev;
      const awayAbbrev: string | null = awayC?.team?.abbreviation ?? g.awayAbbrev;
      const homeScore = num(homeC?.score ?? g.homeScore);
      const awayScore = num(awayC?.score ?? g.awayScore);
      const state = stateOf(comp);

      const boxPlayers: any[] = summary?.boxscore?.players ?? [];
      const boxTeams: any[] = summary?.boxscore?.teams ?? [];

      const teamStatsByAbbrev = new Map<string, any[]>();
      for (const tb of boxTeams) {
        const ab = tb?.team?.abbreviation;
        if (ab) teamStatsByAbbrev.set(ab, tb?.statistics ?? []);
      }

      // Players.
      for (const pb of boxPlayers) {
        const ab: string | null = pb?.team?.abbreviation ?? null;
        const opp = ab === homeAbbrev ? awayAbbrev : ab === awayAbbrev ? homeAbbrev : null;
        const players = extractNflPlayers(pb);
        for (const [name, stats] of players) {
          result.players.set(name, { stats, opponent: opp, gameState: state });
        }
      }

      // Team defense (D/ST).
      const pairs: [string | null, string | null, number][] = [
        [homeAbbrev, awayAbbrev, awayScore], // home D allows the away score
        [awayAbbrev, homeAbbrev, homeScore],
      ];
      for (const [teamAb, oppAb, ptsAllowed] of pairs) {
        if (!teamAb) continue;
        const own = teamStatsByAbbrev.get(teamAb) ?? [];
        const opp = oppAb ? teamStatsByAbbrev.get(oppAb) ?? [] : [];
        result.teamDefense.set(teamAb, {
          stats: extractNflTeamDefense(own, opp, ptsAllowed),
          opponent: oppAb,
          gameState: state,
        });
      }
    })
  );

  return result;
}
