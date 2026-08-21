/**
 * ESPN live-score enrichment for the dashboard games feed.
 *
 * The Sportsbook-API powers `custom_api_events` with odds only — it carries
 * no score, status, period, or clock fields. As a result the dashboard's
 * games endpoint always rendered 0–0 and never showed finals. This helper
 * pulls real scores from ESPN's public scoreboard API and exposes a matcher
 * keyed by normalized team names + game date so the games route can fill in
 * `home_score`, `away_score`, `is_live`, `is_final`, `status_detail`,
 * `period`, `clock`, and team records without changing the response shape.
 */

export type EspnScore = {
  /** ESPN event id — used to fetch the box score / play-by-play summary. */
  eventId: string | null;
  homeTeam: string;
  awayTeam: string;
  homeAbbrev: string | null;
  awayAbbrev: string | null;
  homeScore: number;
  awayScore: number;
  homeRecord: string | null;
  awayRecord: string | null;
  state: 'pre' | 'in' | 'post';
  isLive: boolean;
  isFinal: boolean;
  statusDetail: string | null;
  period: number;
  clock: string | null;
  startTime: string | null;
  dateKey: string; // YYYY-MM-DD (UTC) of the event
};

export const SPORT_PATHS: Record<string, string[]> = {
  NBA: ['basketball/nba'],
  WNBA: ['basketball/wnba'],
  NCAAB: ['basketball/mens-college-basketball'],
  NFL: ['football/nfl'],
  NCAAF: ['football/college-football'],
  MLB: ['baseball/mlb'],
  NHL: ['hockey/nhl'],
  MMA: ['mma/ufc'],
  UFC: ['mma/ufc'],
  // ESPN splits soccer by competition; cover the leagues most likely to appear.
  SOCCER: [
    'soccer/usa.1',
    'soccer/eng.1',
    'soccer/uefa.champions',
    'soccer/esp.1',
    'soccer/ita.1',
    'soccer/ger.1',
    'soccer/mex.1',
  ],
};

/**
 * City/region abbreviations that different feed providers use
 * interchangeably with the full city name for the same franchise
 * (e.g. one feed writes "LA Angels", another writes "Los Angeles
 * Angels" for the exact same game). Expanding these before stripping
 * whitespace lets `normalizeTeam` treat both as identical, which is
 * what powers de-duplication of games that otherwise look distinct
 * only because of city-name formatting (QA audit: "Duplicate game
 * listing").
 */
const CITY_ABBREVIATIONS: [RegExp, string][] = [
  [/\bla\b/g, 'los angeles'],
  [/\bny\b/g, 'new york'],
  [/\bsf\b/g, 'san francisco'],
  [/\bkc\b/g, 'kansas city'],
  [/\btb\b/g, 'tampa bay'],
  [/\bstl\b/g, 'st louis'],
  [/\btex\b/g, 'texas'],
  [/\bariz\b/g, 'arizona'],
  [/\bwash\b/g, 'washington'],
  [/\bsd\b/g, 'san diego'],
];

/** Normalize a team name for fuzzy matching across data sources. */
/**
 * Canonical MLB full team names, keyed by every raw variant seen coming out
 * of the odds feed (full name, city-abbreviated, and a couple of stray
 * formatting inconsistencies like "St.Louis Cardinals" without a space).
 * Used purely for *display* — normalizeTeam() above remains the matching
 * key used for de-duplication. Fixes the audit finding that some rows show
 * full names ("Arizona Diamondbacks") while others show abbreviations
 * ("ARI Diamondbacks", "LA Angels", "KC Royals", "TEX Rangers").
 */
const MLB_TEAM_DISPLAY_NAMES: Record<string, string> = {
  'ari diamondbacks': 'Arizona Diamondbacks',
  'arizona diamondbacks': 'Arizona Diamondbacks',
  'athletics': 'Athletics',
  'atlanta braves': 'Atlanta Braves',
  'bal orioles': 'Baltimore Orioles',
  'baltimore orioles': 'Baltimore Orioles',
  'boston red sox': 'Boston Red Sox',
  'chicago cubs': 'Chicago Cubs',
  'chicago white sox': 'Chicago White Sox',
  'cincinnati reds': 'Cincinnati Reds',
  'cleveland guardians': 'Cleveland Guardians',
  'colorado rockies': 'Colorado Rockies',
  'detroit tigers': 'Detroit Tigers',
  'houston astros': 'Houston Astros',
  'kansas city royals': 'Kansas City Royals',
  'kc royals': 'Kansas City Royals',
  'la angels': 'Los Angeles Angels',
  'los angeles angels': 'Los Angeles Angels',
  'la dodgers': 'Los Angeles Dodgers',
  'los angeles dodgers': 'Los Angeles Dodgers',
  'mia marlins': 'Miami Marlins',
  'miami marlins': 'Miami Marlins',
  'mil brewers': 'Milwaukee Brewers',
  'milwaukee brewers': 'Milwaukee Brewers',
  'minnesota twins': 'Minnesota Twins',
  'new york mets': 'New York Mets',
  'new york yankees': 'New York Yankees',
  'philadelphia phillies': 'Philadelphia Phillies',
  'pittsburgh pirates': 'Pittsburgh Pirates',
  'san diego padres': 'San Diego Padres',
  'san francisco giants': 'San Francisco Giants',
  'seattle mariners': 'Seattle Mariners',
  'st. louis cardinals': 'St. Louis Cardinals',
  'st.louis cardinals': 'St. Louis Cardinals',
  'tampa bay rays': 'Tampa Bay Rays',
  'texas rangers': 'Texas Rangers',
  'tex rangers': 'Texas Rangers',
  'toronto blue jays': 'Toronto Blue Jays',
  'washington nationals': 'Washington Nationals',
};

/**
 * Formats a raw team name for display, expanding known MLB city
 * abbreviations to their full names. Falls back to the original string
 * (trimmed) for teams/sports not in the lookup table, so this is safe to
 * apply universally without breaking non-MLB team names.
 */
export function formatTeamName(name: string | null | undefined): string {
  const raw = String(name || '').trim();
  if (!raw) return raw;
  const key = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  return MLB_TEAM_DISPLAY_NAMES[key] || raw;
}

export function normalizeTeam(name: string | null | undefined): string {
  let n = String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fc|sc|cf|afc|football club)\b/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .trim();
  for (const [pattern, full] of CITY_ABBREVIATIONS) {
    n = n.replace(pattern, full);
  }
  return n.replace(/[^a-z0-9]+/g, '').trim();
}

function dateKeyUTC(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function scoreboardDateParam(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function recordSummary(competitor: any): string | null {
  const records = Array.isArray(competitor?.records) ? competitor.records : [];
  const overall =
    records.find(
      (r: any) =>
        String(r.type || '').toLowerCase() === 'total' ||
        String(r.name || '').toLowerCase() === 'overall',
    ) || records[0];
  return overall?.summary || null;
}

function parseEvent(event: any): EspnScore | null {
  const competition = event?.competitions?.[0];
  const competitors: any[] = Array.isArray(competition?.competitors)
    ? competition.competitors
    : [];
  if (competitors.length < 2) return null;

  const home =
    competitors.find((c) => String(c.homeAway || '').toLowerCase() === 'home') ||
    competitors[0];
  const away =
    competitors.find((c) => String(c.homeAway || '').toLowerCase() === 'away') ||
    competitors.find((c) => c !== home) ||
    competitors[1];

  const status = competition?.status || event?.status || {};
  const type = status?.type || {};
  const state = (type.state || 'pre') as 'pre' | 'in' | 'post';
  const startTime = event?.date || competition?.date || null;

  const toNum = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  return {
    eventId: event?.id != null ? String(event.id) : null,
    homeTeam: home?.team?.displayName || home?.team?.name || 'Home',
    awayTeam: away?.team?.displayName || away?.team?.name || 'Away',
    homeAbbrev: home?.team?.abbreviation || home?.team?.shortDisplayName || null,
    awayAbbrev: away?.team?.abbreviation || away?.team?.shortDisplayName || null,
    homeScore: toNum(home?.score),
    awayScore: toNum(away?.score),
    homeRecord: recordSummary(home),
    awayRecord: recordSummary(away),
    state,
    isLive: state === 'in',
    isFinal: state === 'post' || Boolean(type.completed),
    statusDetail: type.shortDetail || type.detail || type.description || null,
    period: Number(status.period ?? 0) || 0,
    clock: status.displayClock || null,
    startTime,
    dateKey: dateKeyUTC(startTime),
  };
}

async function fetchScoreboard(path: string, dates: string): Promise<EspnScore[]> {
  // Use the site.web.api.espn.com mirror — the site.api.espn.com host is
  // behind an Akamai CDN that intermittently returns 403 to server-side
  // requests. The web mirror is the same public API and has no such block.
  const base = `https://site.web.api.espn.com/apis/site/v2/sports/${path}/scoreboard`;
  try {
    let res = await fetch(`${base}?dates=${dates}`, {
      // Always fetch fresh scores; the route is force-dynamic anyway.
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    let json: any = res.ok ? await res.json() : null;
    let events: any[] = Array.isArray(json?.events) ? json.events : [];

    // Off-season / empty date slate → fall back to ESPN's default window so
    // recently completed or upcoming games still surface.
    if (events.length === 0) {
      res = await fetch(base, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      json = res.ok ? await res.json() : null;
      events = Array.isArray(json?.events) ? json.events : [];
    }

    return events.map(parseEvent).filter((e): e is EspnScore => Boolean(e));
  } catch {
    return [];
  }
}

export type EspnScoreIndex = {
  /** Look up a score by the two team names (order-independent) + optional date. */
  match(home: string, away: string, gameDate?: string | null): EspnScore | null;
  size: number;
};

/**
 * Build an in-memory index of ESPN scores for the given sports. Sports are
 * the uppercase public codes used by the dashboard (NBA, MLB, SOCCER, ...).
 * Scoreboards for today and yesterday (UTC) are fetched to cover late games
 * that cross midnight.
 */
export async function buildEspnScoreIndex(sports: string[]): Promise<EspnScoreIndex> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const dateParams = [
    scoreboardDateParam(yesterday),
    scoreboardDateParam(now),
    scoreboardDateParam(tomorrow),
  ];

  const paths = new Set<string>();
  for (const sport of sports) {
    const list = SPORT_PATHS[(sport || '').toUpperCase()];
    if (list) list.forEach((p) => paths.add(p));
  }

  const jobs: Promise<EspnScore[]>[] = [];
  for (const path of paths) {
    for (const dates of dateParams) {
      jobs.push(fetchScoreboard(path, dates));
    }
  }

  const results = await Promise.all(jobs);
  const all = results.flat();

  // Index by an order-independent team-pair key. When the same matchup appears
  // for multiple dates we prefer the live/most-recent record.
  const byPair = new Map<string, EspnScore>();
  const rank = (s: EspnScore) => (s.isLive ? 3 : s.isFinal ? 2 : 1);

  for (const s of all) {
    const a = normalizeTeam(s.homeTeam);
    const b = normalizeTeam(s.awayTeam);
    if (!a || !b) continue;
    const key = [a, b].sort().join('|');
    const existing = byPair.get(key);
    if (!existing || rank(s) > rank(existing)) {
      byPair.set(key, s);
    }
  }

  return {
    size: byPair.size,
    match(home: string, away: string) {
      const a = normalizeTeam(home);
      const b = normalizeTeam(away);
      if (!a || !b) return null;
      const key = [a, b].sort().join('|');
      return byPair.get(key) || null;
    },
  };
}
