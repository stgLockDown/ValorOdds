/**
 * ESPN game-summary fetcher.
 *
 * The scoreboard helper (lib/espn-scores.ts) only carries score/period/clock.
 * This module calls ESPN's public `summary` endpoint for a single event and
 * normalizes the response into:
 *
 *   1. A full box score — quarter/period/inning linescores, team stats, and
 *      per-player stat tables (labels aligned index-for-index with each
 *      athlete's stats array).
 *   2. A "big plays" feed — scoring plays, turnovers, and explosive plays
 *      detected per sport (NFL/NBA/MLB/NHL), newest first.
 *
 * Endpoint (no key required):
 *   https://site.api.espn.com/apis/site/v2/sports/{path}/summary?event={id}
 */

import { SPORT_PATHS } from './espn-scores';

// ESPN fronts the same JSON on a few hosts. `site.api` is the canonical one
// but is aggressively rate-limited (Akamai) from datacenter IPs; `site.web.api`
// is the mirror the public website uses and is far more permissive. We try
// each in order until one returns a usable payload.
const ESPN_HOSTS = [
  'https://site.web.api.espn.com/apis/site/v2/sports',
  'https://site.api.espn.com/apis/site/v2/sports',
];
const FETCH_TIMEOUT_MS = 8000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// Normalized output types
// ---------------------------------------------------------------------------

export type Linescore = {
  /** Label for the period: "1","2","3","4" (NBA/NFL), "1","2","3" (NHL), inning # (MLB). */
  label: string;
  home: number | null;
  away: number | null;
};

export type TeamStat = { label: string; home: string; away: string };

export type PlayerRow = {
  name: string;
  position: string | null;
  jersey: string | null;
  starter: boolean;
  stats: string[];
};

export type PlayerStatGroup = {
  /** e.g. "Batting", "Pitching", "Passing", "Rushing", "Skaters", "Goalies". */
  title: string;
  labels: string[];
  players: PlayerRow[];
};

export type TeamBox = {
  teamId: string | null;
  abbrev: string;
  name: string;
  score: number;
  record: string | null;
  logo: string | null;
};

export type BigPlay = {
  id: string;
  text: string;
  /** Short category label, e.g. "TD", "Dunk", "HR", "Goal", "INT". */
  kind: string;
  teamAbbrev: string | null;
  period: string | null;
  clock: string | null;
  homeScore: number | null;
  awayScore: number | null;
  /** ISO timestamp when available, for ordering. */
  wallclock: string | null;
};

export type GameSummary = {
  eventId: string;
  sport: string;
  state: 'pre' | 'in' | 'post';
  isLive: boolean;
  isFinal: boolean;
  statusDetail: string | null;
  period: number;
  clock: string | null;
  venue: string | null;
  home: TeamBox;
  away: TeamBox;
  linescores: Linescore[];
  teamStats: TeamStat[];
  /** Player stat tables keyed by team abbrev. */
  homePlayers: PlayerStatGroup[];
  awayPlayers: PlayerStatGroup[];
  bigPlays: BigPlay[];
};

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

function espnPathForSport(sport: string): string | null {
  const key = sport.toUpperCase();
  const paths = SPORT_PATHS[key];
  if (!paths || paths.length === 0) return null;
  return paths[0];
}

async function fetchJsonOnce(url: string): Promise<any | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        Referer: 'https://www.espn.com/',
      },
      // ESPN summary data is live; don't cache at the framework layer.
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Try each ESPN host in order until one returns a usable summary payload. */
async function fetchSummaryJson(sportPath: string, eventId: string): Promise<any | null> {
  for (const base of ESPN_HOSTS) {
    const url = `${base}/${sportPath}/summary?event=${encodeURIComponent(eventId)}`;
    const data = await fetchJsonOnce(url);
    // A valid summary always has a header with the event id.
    if (data && data.header) return data;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function toInt(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

function num(v: any, fallback = 0): number {
  const n = toInt(v);
  return n === null ? fallback : n;
}

/** Build a teamId -> abbreviation map from the competition competitors. */
function buildTeamAbbrevMap(header: any): Map<string, string> {
  const map = new Map<string, string>();
  const competitors = header?.competitions?.[0]?.competitors ?? [];
  for (const c of competitors) {
    const id = c?.team?.id != null ? String(c.team.id) : null;
    const ab = c?.team?.abbreviation ?? null;
    if (id && ab) map.set(id, ab);
  }
  return map;
}

function abbrevForTeamId(map: Map<string, string>, teamId: any): string | null {
  if (teamId === null || teamId === undefined) return null;
  return map.get(String(teamId)) ?? null;
}

/** Normalize the linescores for both teams into per-period rows. */
function normalizeLinescores(header: any): Linescore[] {
  const competitors = header?.competitions?.[0]?.competitors ?? [];
  const home = competitors.find((c: any) => c?.homeAway === 'home');
  const away = competitors.find((c: any) => c?.homeAway === 'away');
  const homeLs: any[] = home?.linescores ?? [];
  const awayLs: any[] = away?.linescores ?? [];
  const len = Math.max(homeLs.length, awayLs.length);
  const out: Linescore[] = [];
  for (let i = 0; i < len; i++) {
    const hv = homeLs[i];
    const av = awayLs[i];
    out.push({
      label: String(i + 1),
      home: hv ? num(hv.displayValue ?? hv.value, NaN as any) ?? null : null,
      away: av ? num(av.displayValue ?? av.value, NaN as any) ?? null : null,
    });
  }
  // Clean up any NaN that slipped through.
  for (const row of out) {
    if (row.home !== null && !Number.isFinite(row.home)) row.home = null;
    if (row.away !== null && !Number.isFinite(row.away)) row.away = null;
  }
  return out;
}

/** Team-level stats, aligned home vs away by label. */
function normalizeTeamStats(boxscore: any, sport: string): TeamStat[] {
  const teams: any[] = boxscore?.teams ?? [];
  if (teams.length < 2) return [];
  // Identify home/away order via statistics arrays; ESPN returns teams in
  // arbitrary order, so we match on the statistics labels instead.
  const extract = (team: any): Map<string, string> => {
    const map = new Map<string, string>();
    const stats: any[] = team?.statistics ?? [];
    for (const item of stats) {
      // NBA/NFL/NHL: { name, label, displayValue }
      if (item?.label != null && item?.displayValue != null) {
        map.set(String(item.label), String(item.displayValue));
        continue;
      }
      // MLB: nested by name ('batting'/'pitching'/'fielding') with stats[].
      if (Array.isArray(item?.stats)) {
        for (const s of item.stats) {
          const key = s?.abbreviation ?? s?.label ?? s?.name;
          if (key != null && s?.displayValue != null) {
            map.set(String(key), String(s.displayValue));
          }
        }
      }
    }
    return map;
  };

  const a = extract(teams[0]);
  const b = extract(teams[1]);
  // Union of labels, preserving a stable order (first-seen).
  const labels: string[] = [];
  for (const k of a.keys()) if (!labels.includes(k)) labels.push(k);
  for (const k of b.keys()) if (!labels.includes(k)) labels.push(k);

  return labels.map((label) => ({
    label,
    home: a.get(label) ?? '-',
    away: b.get(label) ?? '-',
  }));
}

/** Per-player stat tables for one team. */
function normalizePlayerGroups(teamBlock: any, sport: string): PlayerStatGroup[] {
  const groups: any[] = teamBlock?.statistics ?? [];
  const out: PlayerStatGroup[] = [];
  for (const g of groups) {
    const labels: string[] = (g?.labels ?? []).map((l: any) => String(l));
    if (labels.length === 0) continue;
    const title =
      g?.text ?? g?.name ?? g?.type ?? (labels.length ? labels[0] : 'Stats');
    const athletes: any[] = g?.athletes ?? [];
    if (athletes.length === 0) continue;
    const players: PlayerRow[] = athletes.map((a: any) => ({
      name: a?.athlete?.displayName ?? 'Unknown',
      position: a?.athlete?.position?.abbreviation ?? null,
      jersey: a?.athlete?.jersey != null ? String(a.athlete.jersey) : null,
      starter: Boolean(a?.starter),
      stats: (a?.stats ?? []).map((s: any) => (s == null ? '-' : String(s))),
    }));
    out.push({ title: String(title), labels, players });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Big-play detection (per sport)
// ---------------------------------------------------------------------------

const MLB_BIG_RE = /(homered|home run|grand slam|triple|doubled|double|stole|stolen base)/i;
const NBA_DUNK_RE = /dunk/i;
const NBA_BLOCK_STEAL_RE = /\b(block|steal)\b/i;

function detectBigPlays(summary: any, sport: string, abbrevMap: Map<string, string>): BigPlay[] {
  const key = sport.toUpperCase();
  if (key === 'NFL' || key === 'NCAAF') return nflBigPlays(summary, abbrevMap);
  if (key === 'MLB') return flatBigPlays(summary, abbrevMap, mlbFilter);
  if (key === 'NHL') return flatBigPlays(summary, abbrevMap, nhlFilter);
  // NBA / WNBA / NCAAB and default basketball.
  return flatBigPlays(summary, abbrevMap, nbaFilter);
}

type FlatFilter = (p: any) => { keep: boolean; kind: string };

function mlbFilter(p: any): { keep: boolean; kind: string } {
  const text: string = p?.text ?? p?.shortText ?? '';
  const isResult = p?.type?.text === 'Play Result' || p?.type?.text === 'play-result';
  const scoring = Boolean(p?.scoringPlay);
  if (scoring) return { keep: true, kind: /grand slam/i.test(text) ? 'Grand Slam' : 'HR' };
  if (isResult && MLB_BIG_RE.test(text)) {
    const kind = /homered|home run/i.test(text)
      ? 'HR'
      : /triple/i.test(text)
        ? '3B'
        : /doubled|double/i.test(text)
          ? '2B'
          : 'SB';
    return { keep: true, kind };
  }
  return { keep: false, kind: '' };
}

function nhlFilter(p: any): { keep: boolean; kind: string } {
  if (p?.scoringPlay || p?.type?.text === 'Goal') return { keep: true, kind: 'Goal' };
  return { keep: false, kind: '' };
}

function nbaFilter(p: any): { keep: boolean; kind: string } {
  const text: string = p?.text ?? '';
  const scoring = Boolean(p?.scoringPlay);
  if (scoring && NBA_DUNK_RE.test(text)) return { keep: true, kind: 'Dunk' };
  if (scoring && (p?.pointsAttempted === 3 || p?.scoreValue === 3 || /three.?point|3-pt|3pt/i.test(text)))
    return { keep: true, kind: '3PT' };
  if (NBA_BLOCK_STEAL_RE.test(text))
    return { keep: true, kind: /block/i.test(text) ? 'Block' : 'Steal' };
  return { keep: false, kind: '' };
}

/** NBA / MLB / NHL expose a flat `plays[]` array. */
function flatBigPlays(summary: any, abbrevMap: Map<string, string>, filter: FlatFilter): BigPlay[] {
  const plays: any[] = summary?.plays ?? [];
  const out: BigPlay[] = [];
  for (const p of plays) {
    const { keep, kind } = filter(p);
    if (!keep) continue;
    out.push({
      id: p?.id != null ? String(p.id) : `${out.length}`,
      text: p?.text ?? p?.shortText ?? '',
      kind,
      teamAbbrev: abbrevForTeamId(abbrevMap, p?.team?.id),
      period: p?.period?.displayValue ?? (p?.period?.number != null ? String(p.period.number) : null),
      clock: p?.clock?.displayValue ?? null,
      homeScore: toInt(p?.homeScore),
      awayScore: toInt(p?.awayScore),
      wallclock: p?.wallclock ?? null,
    });
  }
  return orderBigPlays(out);
}

/** NFL exposes `drives` (previous[] + current) each with `plays[]`. */
function nflBigPlays(summary: any, abbrevMap: Map<string, string>): BigPlay[] {
  const drives = summary?.drives ?? {};
  const all: any[] = [...(drives.previous ?? [])];
  if (drives.current) all.push(drives.current);
  const out: BigPlay[] = [];
  for (const drive of all) {
    const driveAbbrev = drive?.team?.abbreviation ?? null;
    const plays: any[] = drive?.plays ?? [];
    for (const p of plays) {
      const scoring = Boolean(p?.scoringPlay);
      const turnover = Boolean(p?.isTurnover) || /intercept|fumble/i.test(p?.text ?? '');
      const yards = toInt(p?.statYardage) ?? 0;
      if (!(scoring || turnover || yards >= 20)) continue;
      const kind = scoring
        ? (/field goal/i.test(p?.text ?? '') ? 'FG' : 'TD')
        : turnover
          ? (/intercept/i.test(p?.text ?? '') ? 'INT' : 'Fumble')
          : `${yards}yd`;
      out.push({
        id: p?.id != null ? String(p.id) : `${out.length}`,
        text: p?.text ?? '',
        kind,
        teamAbbrev: driveAbbrev,
        period: p?.period?.number != null ? String(p.period.number) : null,
        clock: p?.clock?.displayValue ?? null,
        homeScore: toInt(p?.homeScore),
        awayScore: toInt(p?.awayScore),
        wallclock: p?.wallclock ?? null,
      });
    }
  }
  return orderBigPlays(out);
}

/** Newest first, using wallclock when present (falls back to source order). */
function orderBigPlays(plays: BigPlay[]): BigPlay[] {
  const hasTs = plays.some((p) => p.wallclock);
  if (!hasTs) return plays.reverse();
  return plays.sort((a, b) => {
    const ta = a.wallclock ? Date.parse(a.wallclock) : 0;
    const tb = b.wallclock ? Date.parse(b.wallclock) : 0;
    return tb - ta;
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch + normalize a game's box score and big-plays feed from ESPN.
 * Returns null when the sport is unsupported or the event can't be loaded.
 */
export async function fetchGameSummary(sport: string, eventId: string): Promise<GameSummary | null> {
  const path = espnPathForSport(sport);
  if (!path || !eventId) return null;
  const data = await fetchSummaryJson(path, eventId);
  if (!data) return null;

  const header = data?.header ?? {};
  const comp = header?.competitions?.[0] ?? {};
  const competitors: any[] = comp?.competitors ?? [];
  const homeC = competitors.find((c: any) => c?.homeAway === 'home') ?? competitors[0];
  const awayC = competitors.find((c: any) => c?.homeAway === 'away') ?? competitors[1];

  const abbrevMap = buildTeamAbbrevMap(header);

  const status = comp?.status ?? {};
  const state: 'pre' | 'in' | 'post' =
    status?.type?.state === 'in' ? 'in' : status?.type?.state === 'post' ? 'post' : 'pre';

  const mkTeam = (c: any): TeamBox => ({
    teamId: c?.team?.id != null ? String(c.team.id) : null,
    abbrev: c?.team?.abbreviation ?? '—',
    name: c?.team?.displayName ?? 'Unknown',
    score: num(c?.score, 0),
    record: c?.record?.[0]?.summary ?? null,
    logo: c?.team?.logo ?? null,
  });

  const boxscore = data?.boxscore ?? {};
  const players: any[] = boxscore?.players ?? [];
  // Match player blocks to home/away by team id.
  const playersFor = (teamId: string | null) =>
    players.find((pb: any) => teamId != null && String(pb?.team?.id) === String(teamId));

  const homePlayers = normalizePlayerGroups(playersFor(homeC?.team?.id) ?? {}, sport);
  const awayPlayers = normalizePlayerGroups(playersFor(awayC?.team?.id) ?? {}, sport);

  return {
    eventId: String(header?.id ?? eventId),
    sport: sport.toUpperCase(),
    state,
    isLive: state === 'in',
    isFinal: state === 'post' || Boolean(status?.type?.completed),
    statusDetail: status?.type?.shortDetail ?? status?.type?.detail ?? null,
    period: num(status?.period, 0),
    clock: status?.displayClock ?? null,
    venue: data?.gameInfo?.venue?.fullName ?? data?.gameInfo?.venue?.name ?? null,
    home: mkTeam(homeC),
    away: mkTeam(awayC),
    linescores: normalizeLinescores(header),
    teamStats: normalizeTeamStats(boxscore, sport),
    homePlayers,
    awayPlayers,
    bigPlays: detectBigPlays(data, sport, abbrevMap),
  };
}
