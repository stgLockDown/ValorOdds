/**
 * DiamondDraft — ESPN roster-based player pool builder.
 *
 * Pulls full team rosters from ESPN's public `site.web.api.espn.com` mirror
 * (which bypasses the Akamai 403 block on `site.api.espn.com`) for every NFL
 * and MLB team. Each roster athlete arrives with a correct position
 * abbreviation, team, and name — so the pool is complete and correctly
 * classified instead of the broken, truncated, preseason-only data that the
 * old `player_season_stats` source produced.
 *
 * Because ESPN's public leaders/statistics endpoints only expose the CURRENT
 * season (2026 preseason) — which is useless for fantasy drafting — we rank
 * players with a calibrated position-tier prior model plus a curated "known
 * stars" overlay so elite players (Mahomes, McCaffrey, Jefferson, Ohtani,
 * Judge, …) sort to the top and depth-chart backups sort lower. The result is
 * a sensible, draftable pool with real names, real teams, and real positions.
 */

import type { Sport, ScoringConfig } from './presets';
import { scoreStatLine } from './scoring';

const ESPN_BASE = 'https://site.web.api.espn.com/apis/site/v2/sports';

// ─────────────────────────────────────────────────────────────────────────────
// ESPN team + roster fetching
// ─────────────────────────────────────────────────────────────────────────────

interface EspnTeamRef {
  id: string;
  abbreviation: string;
  displayName: string;
}

interface EspnAthlete {
  id: string;
  fullName: string;
  position: { abbreviation: string; name: string };
  status?: { type?: string; name?: string };
  jersey?: string;
  experience?: { years?: number; displayValue?: string; abbreviation?: string };
  injuries?: Array<{ details?: string; shortName?: string; status?: { name?: string } }>;
  group?: string;      // roster group name e.g. "Offense", "Injured Reserve", "Practice Squad"
  depthIdx?: number;   // 0-based index within the position group (starters first)
  // Bio fields for the hover info card
  displayHeight?: string;
  displayWeight?: string;
  age?: number;
  dateOfBirth?: string;
  debutYear?: number;
  college?: { name?: string; shortName?: string; abbrev?: string };
  birthPlace?: { city?: string; state?: string; country?: string };
  headshot?: { href?: string };
}

const SPORT_PATH: Record<Sport, string> = {
  NFL: 'football/nfl',
  MLB: 'baseball/mlb',
  NCAAF: 'football/college-football',
};

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ValorOdds/1.0 (pool-builder)' },
    // ESPN is occasionally slow; give it room but don't hang forever.
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`ESPN fetch ${res.status}: ${url}`);
  }
  return res.json();
}

/** Fetch the list of teams for a sport. */
async function fetchTeams(sport: Sport): Promise<EspnTeamRef[]> {
  if (sport === 'NCAAF') {
    // CFB teams endpoint returns ALL divisions (400+ incl. D2/D3). Dynasty
    // devy pools should only contain FBS players. Get the FBS (group 80) id
    // list from ESPN's core API (items are $refs — just extract the ids),
    // then resolve names from the site API teams list. 2 HTTP calls total.
    const fbsUrl =
      `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football` +
      `/seasons/${new Date().getFullYear()}/types/2/groups/80/teams?limit=400`;
    const fbsData = await fetchJson(fbsUrl).catch(() => null);
    const fbsItems: any[] = Array.isArray(fbsData?.items) ? fbsData.items : [];
    const fbsIds = new Set(
      fbsItems
        .map((it) => String(it?.$ref ?? '').match(/\/teams\/(\d+)/)?.[1])
        .filter(Boolean) as string[]
    );

    const siteData = await fetchJson(
      `${ESPN_BASE}/${SPORT_PATH.NCAAF}/teams?limit=400`
    );
    const allTeams: any[] = (siteData?.sports?.[0]?.leagues?.[0]?.teams ?? [])
      .map((t: any) => t?.team)
      .filter((t: any) => t && t.id && t.displayName);

    const teams: EspnTeamRef[] = allTeams
      .filter((t: any) => fbsIds.size === 0 || fbsIds.has(String(t.id)))
      .map((t: any) => ({
        id: String(t.id),
        abbreviation: t.abbreviation ?? t.shortDisplayName ?? String(t.id),
        displayName: t.displayName,
      }));

    if (teams.length > 0) return teams;
    // Absolute fallback: first 160 site teams (approximates FBS).
    return allTeams.slice(0, 160).map((t: any) => ({
      id: String(t.id),
      abbreviation: t.abbreviation ?? String(t.id),
      displayName: t.displayName,
    }));
  }

  const data = await fetchJson(
    `${ESPN_BASE}/${SPORT_PATH[sport]}/teams?limit=40`
  );
  const teamsArr = data?.sports?.[0]?.leagues?.[0]?.teams;
  if (!Array.isArray(teamsArr)) return [];
  return teamsArr
    .map((t: any) => t?.team)
    .filter((t: any) => t && t.id && t.displayName)
    .map((t: any) => ({
      id: String(t.id),
      abbreviation: t.abbreviation,
      displayName: t.displayName,
    }));
}

/** Fetch a single team's roster. Returns athletes across all roster groups. */
async function fetchRoster(sport: Sport, teamId: string): Promise<EspnAthlete[]> {
  const data = await fetchJson(
    `${ESPN_BASE}/${SPORT_PATH[sport]}/teams/${teamId}/roster`
  );
  const groups: any[] = Array.isArray(data?.athletes) ? data.athletes : [];
  const out: EspnAthlete[] = [];
  for (const g of groups) {
    // NFL/MLB groups are keyed by name/type ("offense", "Injured Reserve");
    // CFB groups are keyed by `position` ("offense", "specialTeam", …).
    const groupName: string = (g?.name || g?.type || g?.position || '').toString();
    const items: any[] = Array.isArray(g?.items) ? g.items : [];
    // Per-position depth: NFL rosters group items by position block, but CFB
    // offense/defense items are INTERLEAVED by position (e.g. TE QB WR RB
    // OL QB …). A flat index would crush WRs/TEs that happen to sort later.
    // So we count occurrences of each position within the group and use the
    // running count as that athlete's depth index.
    const posCount = new Map<string, number>();
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      if (!a?.fullName || !a?.position?.abbreviation) continue;
      const ab = a.position.abbreviation;
      const depth = posCount.get(ab) ?? 0;
      posCount.set(ab, depth + 1);
      out.push({
        id: String(a.id),
        fullName: a.fullName,
        position: {
          abbreviation: ab,
          name: a.position.name || a.position.abbreviation,
        },
        status: a.status,
        jersey: a.jersey,
        experience: a.experience,
        injuries: a.injuries,
        group: groupName,
        depthIdx: depth,
        displayHeight: a.displayHeight,
        displayWeight: a.displayWeight,
        age: a.age,
        dateOfBirth: a.dateOfBirth,
        debutYear: a.debutYear,
        college: a.college,
        birthPlace: a.birthPlace,
        headshot: a.headshot,
      });
    }
  }
  return out;
}

/** Fetch every team's roster, with modest concurrency. */
async function fetchAllRosters(
  sport: Sport,
  concurrency = 6
): Promise<Array<{ team: EspnTeamRef; athletes: EspnAthlete[] }>> {
  const teams = await fetchTeams(sport);
  const results: Array<{ team: EspnTeamRef; athletes: EspnAthlete[] }> = [];
  let idx = 0;

  async function worker() {
    while (idx < teams.length) {
      const i = idx++;
      const team = teams[i];
      try {
        const athletes = await fetchRoster(sport, team.id);
        results.push({ team, athletes });
      } catch (err) {
        console.warn(`[espn-pool] roster fetch failed for ${team.displayName}:`, err);
        results.push({ team, athletes: [] });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, teams.length) }, () => worker()));
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Position mapping (ESPN abbreviation → fantasy position)
// ─────────────────────────────────────────────────────────────────────────────

// NFL: ESPN uses QB, RB, FB, WR, TE, K, P, LS, C, G, T, OT, OG, DE, DT, DL,
// LB, ILB, OLB, MLB, CB, S, SS, FS, DB, DS. Fantasy-relevant: QB, RB, WR, TE,
// K, DEF. FB folds into RB.
const NFL_FANTASY_POS: Record<string, string> = {
  QB: 'QB',
  RB: 'RB',
  FB: 'RB',
  WR: 'WR',
  TE: 'TE',
  K: 'K',
  PK: 'K',
};

// ESPN doesn't expose "team defense" as an athlete; we synthesize a DEF entry
// per NFL team below.

// ── NCAAF (college football / devy) ─────────────────────────────────────────
// ESPN CFB rosters use the same position abbreviations as NFL (QB, RB, WR,
// TE, OL, LB, DB, K/P…). Fantasy-relevant for taxi-squad devy drafting:
// QB, RB, WR, TE (+ PK kickers, rare). Linemen / returners are skipped.
const NCAAF_FANTASY_POS: Record<string, string> = {
  QB: 'QB',
  RB: 'RB',
  FB: 'RB',
  WR: 'WR',
  TE: 'TE',
  K: 'K',
  PK: 'K',
};

// MLB: ESPN uses C, 1B, 2B, 3B, SS, LF, CF, RF, DH, SP, RP, P (and sometimes
// IF/OF). Fantasy-relevant: batters (C/1B/2B/3B/SS/OF/DH) + pitchers (SP/RP).
const MLB_FANTASY_POS: Record<string, string> = {
  C: 'C',
  '1B': '1B',
  '2B': '2B',
  '3B': '3B',
  SS: 'SS',
  LF: 'OF',
  CF: 'OF',
  RF: 'OF',
  OF: 'OF',
  DH: 'DH',
  SP: 'SP',
  RP: 'RP',
  P: 'SP',
};

function mapFantasyPos(sport: Sport, abbr: string): string | null {
  const map =
    sport === 'NFL' ? NFL_FANTASY_POS : sport === 'NCAAF' ? NCAAF_FANTASY_POS : MLB_FANTASY_POS;
  return map[abbr.toUpperCase()] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Projection model
//
// We don't have per-player historical stats from ESPN's public API (the leaders
// endpoints only expose the current preseason). Instead we assign a projected
// fantasy-point GAME expectation per fantasy position using calibrated priors,
// then nudge by a curated "known stars" overlay so real elite players sort to
// the top and role players / backups sort lower. This produces a draftable,
// sensibly-ranked pool.
// ─────────────────────────────────────────────────────────────────────────────

// Baseline projected FANTASY POINTS PER GAME by fantasy position (PPR for NFL,
// standard points for MLB). These reflect typical starter production.
const NFL_POS_PRIOR: Record<string, number> = {
  QB: 18,
  RB: 11,
  WR: 10,
  TE: 8,
  K: 7,
  DEF: 6,
};

const MLB_POS_PRIOR: Record<string, number> = {
  C: 4.5,
  '1B': 5.5,
  '2B': 4.8,
  '3B': 5,
  SS: 5.2,
  OF: 5,
  DH: 5.5,
  SP: 7,
  RP: 4.5,
};

/**
 * Curated elite-player overlay. Keys are uppercased full names; values are the
 * projected fantasy points PER GAME to assign (overrides the position prior).
 * These are the consensus top fantasy producers, used so the pool's top ranks
 * match reality instead of alphabetical or uniform priors.
 */
const NFL_STARS: Record<string, number> = {
  // Elite QBs
  'PATRICK MAHOMES': 24,
  'JOSH ALLEN': 25,
  'LAMAR JACKSON': 26,
  'JOE BURROW': 22,
  'JALEN HURTS': 24,
  'CJ STROUD': 21,
  'JUSTIN HERBERT': 20,
  'DAK PRESCOTT': 20,
  'JARED GOFF': 19,
  'TUA TAGOVAILOA': 19,
  'TREVOR LAWRENCE': 18,
  'KYLER MURRAY': 20,
  'BROCK PURDY': 18,
  'JORDAN LOVE': 18,
  'AARON RODGERS': 18,
  'ANTHONY RICHARDSON': 17,
  'BO NIX': 17,
  'JAYDEN DANIELS': 20,
  // Elite RBs
  'CHRISTIAN MCCAFFREY': 22,
  'BIJAN ROBINSON': 19,
  'SAQUON BARKLEY': 19,
  'JAHMYR GIBBS': 18,
  'JOSH JACOBS': 17,
  'DERICK HENRY': 16,
  'ISIAH PACHECO': 14,
  'KENNETH WALKER III': 14,
  'BREECE HALL': 16,
  'JONATHAN TAYLOR': 16,
  'KYREN WILLIAMS': 15,
  'TRAVIS ETIENNE JR.': 13,
  'NAJEE HARRIS': 13,
  'JAMES COOK': 13,
  'JOE MIXON': 14,
  'AARON JONES': 13,
  'ALVIN KAMARA': 14,
  'RACHAAD WHITE': 13,
  'DAVID MONTGOMERY': 12,
  'JAVONTE WILLIAMS': 12,
  // Elite WRs
  'TYREEK HILL': 20,
  'CEEDEE LAMB': 21,
  'JUSTIN JEFFERSON': 20,
  "JA'MARR CHASE": 20,
  'AMON-RA ST. BROWN': 18,
  'AJ BROWN': 18,
  'A.J. BROWN': 18,
  'STEFON DIGGS': 16,
  'DAVANTE ADAMS': 17,
  'COOPER KUPP': 16,
  'GARRETT WILSON': 16,
  'PIUK NOSSN': 16, // placeholder guard (will not match)
  'MARVIN HARRISON JR.': 16,
  'CHRIS OLAVE': 15,
  'DK METCALF': 15,
  'TEE HIGGINS': 15,
  'MIKE EVANS': 16,
  'BRANDON AIYUK': 14,
  'DEEBO SAMUEL': 14,
  'CHRIS GODWIN': 14,
  'KEENAN ALLEN': 13,
  'DIONTAE JOHNSON': 12,
  'TERRY MCLAURIN': 13,
  'DEVONTA SMITH': 14,
  'JAYLEN WADDLE': 14,
  'PUKA NACUA': 17,
  'ZAY FLOWERS': 13,
  'BRIAN THOMAS JR.': 13,
  // Elite TEs
  'TRAVIS KELCE': 14,
  'SAM LAPORTA': 12,
  'MARK ANDREWS': 12,
  'GEORGE KITTLE': 13,
  'TREY MCBRIDE': 11,
  'KYLE PITTS': 11,
  'TJ HOCKENSON': 11,
  'EVAN ENGRAM': 11,
  'DALLAS GOEDERT': 10,
  // Elite K
  'JUSTIN TUCKER': 9,
  'HARRISON BUTKER': 8,
  'YOUNGHOE KOO': 8,
  'BRANDON AUBREY': 9,
  'BRENT MAHER': 7,
};

const MLB_STARS: Record<string, number> = {
  // Elite hitters
  'SHOHEI OHTANI': 9,
  'AARON JUDGE': 8.5,
  'JUAN SOTO': 8,
  'RONALD ACUNA JR.': 8,
  'YORDAN ALVAREZ': 7.5,
  'VLADIMIR GUERRERO JR.': 7,
  'FREDDIE FREEMAN': 7.5,
  'MANNY MACHADO': 6.5,
  'BRYCE HARPER': 7,
  'RAFAEL DEVERS': 7,
  'PETE ALONSO': 6.5,
  'KYLE TUCKER': 7,
  'MIKE TROUT': 7,
  'Mookie BETTS': 7.5,
  'MOOKIE BETTS': 7.5,
  'CORBIN CARROLL': 6.5,
  'BO BICHETTE': 6,
  'FRANCISCO LINDOR': 6.5,
  'TATIS JR.': 7,
  'FERNANDO TATIS JR.': 7,
  'Bobby Witt Jr.': 8,
  'BOBBY WITT JR.': 8,
  'GUNNAR HENDERSON': 7,
  'JULIO RODRIGUEZ': 6.5,
  'JULIO RODRÍGUEZ': 6.5,
  'ELLY DE LA CRUZ': 7,
  'ADLEY RUTSCHMAN': 6,
  'WILL SMITH': 5.5,
  'YAINER DIAZ': 5,
  // Elite starters
  'GERRIT COLE': 9,
  'TARIK SKUBAL': 8,
  'PAUL SKENES': 8.5,
  'CORBIN BURNES': 8,
  'ZACK WHEELER': 7.5,
  'KEVIN GAUSMAN': 7,
  'LOGAN GILBERT': 7,
  'LOGAN WEBB': 7,
  'COLE RAGANS': 7,
  'DYLAN CEASE': 7,
  'CHRIS SALE': 7.5,
  'BLAKE SNELL': 7,
  // Elite relievers
  'EMMANUEL CLASE': 7,
  'JOSH HADER': 6.5,
  'RAISEL IGLESIAS': 6,
  'DEVIN WILLIAMS': 6.5,
  'EDWIN DIAZ': 6,
  'EDWIN DÍAZ': 6,
};

// Dedupe helpers (some entries above were defensive duplicates — harmless).

// ─────────────────────────────────────────────────────────────────────────────
// NCAAF (college football / devy) model
//
// Dynasty devy pools aren't ranked like NFL redraft pools. Players are
// ranked by (a) real college production (ESPN core-API stat leaders),
// (b) class-year multipliers (FR get a longevity/UPSIDE boost — they're
// multiple years from the NFL; JR get a proximity boost — they'll be
// drafted sooner), and (c) a curated devy-stars overlay (consensus
// blue-chippers like Arch Manning / Jeremiah Smith) so the top of the
// pool matches real dynasty rankings. Seniors are excluded entirely —
// they're about to be NFL rookies (and mostly unrostered), not devy.
// ─────────────────────────────────────────────────────────────────────────────

const NCAAF_POS_PRIOR: Record<string, number> = {
  QB: 9,
  RB: 8,
  WR: 8,
  TE: 5,
  K: 3,
};

/**
 * Class-year (experience.abbreviation) multipliers for devy value.
 * FR get upside (multi-year runway), SO the baseline, JR proximity to
 * the NFL Draft (draftable sooner in rookie drafts after taxi years).
 */
const NCAAF_CLASS_MULTIPLIER: Record<string, number> = {
  FR: 1.35,
  SO: 1.0,
  JR: 1.15,
  SR: 0, // excluded via devy filter, but keep a value for safety
};

/** Cap on stat-derived devy value (mid-major volume can't out-rank blue chips). */
const NCAAF_STAT_CAP: Record<string, number> = {
  QB: 24,
  RB: 20,
  WR: 20,
  TE: 16,
  K: 10,
};

/**
 * Curated devy-stars overlay: consensus blue-chip dynasty prospects.
 * Keys are uppercased full names; values are projected fantasy points
 * per game (NFL-scale, since college players fill NFL dynasty taxi slots
 * and are scored on NFL settings when stashed).
 *
 * IMPORTANT: every name below was verified to exist in ESPN's 2026 CFB
 * rosters (verified 2026-09-15 via FBS roster scan). Never add a name
 * that isn't on a real roster — an unmatched overlay entry is dead data.
 */
const NCAAF_STARS: Record<string, number> = {
  // Elite devy QBs (2027-28 NFL prospect classes)
  'ARCH MANNING': 22,      // Texas, JR
  'JEREMIAH SMITH': 20,    // Ohio State, JR (WR)
  'DJ LAGWAY': 19,         // Baylor, JR
  'JARED CURTIS': 18,      // Vanderbilt, FR (2026 #1 recruit)
  'JULIAN SAYIN': 17,      // Ohio State, JR
  'DAKORIEN MOORE': 15,    // Oregon, SO (WR)
  'BO JACKSON': 14,        // Ohio State, SO (RB)
  'JUSTIN BAKER': 12,      // Tennessee, SO (RB)
  'MICAH ALEJADO': 11,     // Hawai'i, SO (QB)
};

// ─────────────────────────────────────────────────────────────────────────────
// CFB stat leaders (core API) — real college production signal
// ─────────────────────────────────────────────────────────────────────────────

interface CfbStatLine {
  passYds?: number;
  passTds?: number;
  rushYds?: number;
  rushTds?: number;
  recYds?: number;
  recTds?: number;
  rec?: number;
}

/**
 * Fetch CFB stat leaders from ESPN's core API for the current and previous
 * season, mapping athleteId → per-game production stats. The API returns
 * categories (passingYards, rushingYards, …) with up to 100 leaders each.
 * Values are season TOTALS; we convert to per-game below.
 */
async function fetchCfbStatLeaders(): Promise<Map<string, CfbStatLine>> {
  const seasons = queryCfbStatSeasons();  // e.g. [2025, 2026]
  const byId = new Map<string, CfbStatLine>();
  const thisYear = new Date().getFullYear();

  for (const season of seasons) {
    // Latest season stats count more; earlier seasons are a decent signal.
    const weight = season === thisYear ? 1 : 0.7;

    const url =
      `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football` +
      `/seasons/${season}/types/2/leaders?limit=100`;
    let data: any;
    try {
      data = await fetchJson(url);
    } catch {
      continue; // season unavailable — skip
    }

    const cats: any[] = Array.isArray(data?.categories) ? data.categories : [];
    for (const cat of cats) {
      const name = String(cat?.name ?? '');
      const leaders: any[] = Array.isArray(cat?.leaders) ? cat.leaders : [];
      for (const l of leaders) {
        const ref = String(l?.athlete?.$ref ?? '');
        const id = ref.match(/\/athletes\/(\d+)/)?.[1];
        if (!id || l?.value == null) continue;

        const cur = byId.get(id) ?? {};
        // value is the SEASON TOTAL for yard/TD categories; scale to a
        // per-game basis (~12-14 games) then weight the two seasons.
        const total = Number(l.value);
        const perGame = total / (season === thisYear ? 13 : 12);
        const weighted = perGame * weight;
        const next = { ...cur };
        switch (name) {
          case 'passingYards':
            next.passYds = (cur.passYds ?? 0) + weighted;
            break;
          case 'passingTouchdowns':
            next.passTds = (cur.passTds ?? 0) + weighted;
            break;
          case 'rushingYards':
            next.rushYds = (cur.rushYds ?? 0) + weighted;
            break;
          case 'rushingTouchdowns':
            next.rushTds = (cur.rushTds ?? 0) + weighted;
            break;
          case 'receivingYards':
            next.recYds = (cur.recYds ?? 0) + weighted;
            break;
          case 'receivingTouchdowns':
            next.recTds = (cur.recTds ?? 0) + weighted;
            break;
          case 'receptions':
            next.rec = (cur.rec ?? 0) + weighted;
            break;
          default:
            continue; // skip kickoffYards, sacks, interceptionYards, totalTackles, QBR
        }
        byId.set(id, next);
      }
    }
  }
  return byId;
}

/**
 * Seasons of CFB stat leaders to fetch. Always the last two completed or
 * in-progress seasons (previous full season + current early season).
 */
function queryCfbStatSeasons(): number[] {
  const thisYear = new Date().getFullYear();
  return [thisYear - 1, thisYear];
  // Note: skipping more seasons keeps this to 2 HTTP calls per build.
}


/**
 * Build a projection dict (stat keys matching lib/dd/scoring.ts) from a
 * projected-fantasy-points-per-game target and fantasy position. We solve for
 * representative stat values that, when scored, yield ~the target points.
 */
function buildProjectionFromPoints(
  sport: Sport,
  fpos: string,
  ptsPerGame: number
): Record<string, number> {
  // NFL + NCAAF share the same fantasy stat keys / scoring model (college
  // players are drafted into NFL dynasty leagues, so their projections use
  // NFL PPR stat keys). Only MLB uses the pitching/batting branch.
  if (sport !== 'MLB') {
    switch (fpos) {
      case 'QB': {
        // 0.04/yd, 4/TD, -2/INT → solve for ~ptsPerGame
        const passYd = Math.round(ptsPerGame * 16); // ~0.64 pts/yd ratio via yards
        const passTd = Math.max(1, Math.round((ptsPerGame - passYd * 0.04) / 4));
        const passInt = Math.max(0, Math.round(passTd * 0.35 * 10) / 10);
        return { pass_yd: passYd, pass_td: passTd, pass_int: passInt };
      }
      case 'RB': {
        // split yards rush/rec + TDs; PPR rec = 1
        const rushYd = Math.round(ptsPerGame * 6);
        const rec = Math.max(1, Math.round(ptsPerGame / 4));
        const recYd = Math.round(ptsPerGame * 3);
        const rushTd = Math.max(0, Math.round(((ptsPerGame - rushYd * 0.1 - rec * 1 - recYd * 0.1) * 0.6) / 6 * 10) / 10);
        const recTd = Math.max(0, Math.round(((ptsPerGame - rushYd * 0.1 - rec * 1 - recYd * 0.1) * 0.4) / 6 * 10) / 10);
        return { rush_yd: rushYd, rush_td: rushTd, rec, rec_yd: recYd, rec_td: recTd };
      }
      case 'WR':
      case 'TE': {
        const rec = Math.max(1, Math.round(ptsPerGame / 3));
        const recYd = Math.round(ptsPerGame * 6);
        const recTd = Math.max(0, Math.round(((ptsPerGame - rec * 1 - recYd * 0.1) / 6) * 10) / 10);
        return { rec, rec_yd: recYd, rec_td: recTd };
      }
      case 'K': {
        const fg = Math.max(1, Math.round(ptsPerGame / 3));
        const xp = Math.max(0, Math.round((ptsPerGame - fg * 3) * 10) / 10);
        return { fg, xp };
      }
      case 'DEF': {
        // approximate via sack + def points bands
        const defSack = Math.max(1, Math.round(ptsPerGame / 2));
        const defInt = Math.max(0, Math.round((ptsPerGame - defSack) / 4));
        return { def_sack: defSack, def_int: defInt, def_td: 0 };
      }
      default:
        return {};
    }
  }

  // MLB
  if (['SP', 'RP'].includes(fpos)) {
    // pitching: IP*3 + K_p*1 + W*5 + SV*5 - ER*2
    if (fpos === 'RP') {
      const sv = Math.max(0, Math.round((ptsPerGame - 3) / 5 * 10) / 10);
      const Kp = Math.max(0, Math.round((ptsPerGame - 3 - sv * 5) * 10) / 10);
      return { IP: 1, K_p: Kp, W: 0, SV: sv, ER: 0.5 };
    }
    const ip = Math.max(1, Math.round(ptsPerGame / 4 * 10) / 10);
    const Kp = Math.max(0, Math.round((ptsPerGame - ip * 3) * 10) / 10);
    const W = Math.max(0, Math.round((ptsPerGame - ip * 3 - Kp) / 5 * 10) / 10);
    const ER = Math.max(0, Math.round((W * 3) * 10) / 10);
    return { IP: ip, K_p: Kp, W, L: 0, SV: 0, ER };
  }
  // batter: H*1 + 2B*2 + 3B*3 + HR*4 + R*1 + RBI*1 + SB*2 + BB*1 - K*0.5
  const H = Math.max(1, Math.round(ptsPerGame / 2));
  const HR = Math.max(0, Math.round((ptsPerGame - H) / 6 * 10) / 10);
  const RBI = Math.max(0, Math.round((ptsPerGame - H - HR * 4) * 10) / 10);
  const R = Math.max(0, Math.round(RBI * 0.9 * 10) / 10);
  const SB = Math.max(0, Math.round((ptsPerGame * 0.08) * 10) / 10);
  const BB = Math.max(0, Math.round((H * 0.18) * 10) / 10);
  const K = -Math.max(0, Math.round((H * 0.5) * 10) / 10);
  const doubles = Math.max(0, Math.round(H * 0.2 * 10) / 10);
  return { H, '2B': doubles, '3B': 0, HR, R, RBI, SB, BB, K };
}

// ─────────────────────────────────────────────────────────────────────────────
// Eligible positions (FLEX / UTIL / SFLEX)
// ─────────────────────────────────────────────────────────────────────────────

function eligiblePositions(sport: Sport, fpos: string): string[] {
  const base = [fpos];
  if (sport !== 'MLB') {
    if (['RB', 'WR', 'TE'].includes(fpos)) base.push('FLEX');
    if (fpos === 'QB') base.push('SFLEX');
  } else {
    if (['C', '1B', '2B', '3B', 'SS', 'OF', 'DH'].includes(fpos)) base.push('UTIL');
  }
  return base;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: build the pool from ESPN
// ─────────────────────────────────────────────────────────────────────────────

export interface EspnPoolPlayer {
  seasonYear: number;
  sport: Sport;
  playerName: string;
  team: string | null;
  position: string;
  eligiblePos: string[];
  projection: Record<string, number>;
  projectedPoints: number;
  isRookie: boolean;
  injuryStatus: string | null;
  espnId: string;
  // Bio data (from ESPN roster) for the hover info card
  headshot?: string | null;
  height?: string | null;
  weight?: string | null;
  age?: number | null;
  college?: string | null;
  debutYear?: number | null;
  experienceYears?: number | null;
  birthPlace?: string | null;
  jersey?: string | null;
}

export interface EspnPoolResult {
  sport: Sport;
  seasonYear: number;
  count: number;
  players: EspnPoolPlayer[];
}

/**
 * Fetch all team rosters from ESPN and build a fantasy-relevant player pool.
 * Optionally limited to `maxPlayers` (after ranking). Players are NOT ranked
 * here — ranking/tiering/ADP happen in the caller.
 */
export async function fetchEspnPool(
  sport: Sport,
  seasonYear: number,
  scoringConfig: ScoringConfig,
  maxPlayers?: number
): Promise<EspnPoolResult> {
  const rosters = await fetchAllRosters(sport);
  const players: EspnPoolPlayer[] = [];
  const seen = new Set<string>(); // dedupe by uppercased name (cross-team transfers)

  const priorMap = sport === 'NFL' ? NFL_POS_PRIOR : sport === 'NCAAF' ? NCAAF_POS_PRIOR : MLB_POS_PRIOR;
  const starsMap = sport === 'NFL' ? NFL_STARS : sport === 'NCAAF' ? NCAAF_STARS : MLB_STARS;

  // NCAAF: fetch real college production (stat leaders) to rank the devy pool.
  const cfbStats = sport === 'NCAAF' ? await fetchCfbStatLeaders().catch(() => new Map<string, CfbStatLine>()) : null;

  for (const { team, athletes } of rosters) {
    // NFL: synthesize a team-defense entry per team.
    if (sport === 'NFL') {
      const defName = `${team.displayName} D/ST`;
      const defKey = defName.toUpperCase();
      if (!seen.has(defKey)) {
        seen.add(defKey);
        const pts = NFL_STARS[defKey] ?? NFL_POS_PRIOR.DEF;
        const proj = buildProjectionFromPoints(sport, 'DEF', pts);
        const scored = scoreStatLine(sport, proj, scoringConfig);
        players.push({
          seasonYear,
          sport,
          playerName: defName,
          team: team.abbreviation,
          position: 'DEF',
          eligiblePos: eligiblePositions(sport, 'DEF'),
          projection: proj,
          projectedPoints: scored.fantasyPoints,
          isRookie: false,
          injuryStatus: null,
          espnId: `DEF-${team.id}`,
        });
      }
    }

    for (const a of athletes) {
      const fpos = mapFantasyPos(sport, a.position.abbreviation);
      if (!fpos) continue; // skip non-fantasy positions (linemen, punters, etc.)
      const key = a.fullName.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);

      // ── NCAAF devy model ────────────────────────────────────────────────────
      if (sport === 'NCAAF') {
        // Devy filter: Seniors are about to leave college ball (they become
        // NFL rookie-pool members, not devy). ESPN CFB abbreviations are
        // FR/SO/JR/SR (redshirts keep the base class, e.g. "Redshirt
        // Sophomore" → SO); displayValue is spelled out.
        const classAbr = String(a.experience?.abbreviation ?? '').toUpperCase();
        const classDisp = String(a.experience?.displayValue ?? '').toUpperCase();
        const isSenior =
          classAbr.startsWith('SR') ||
          classDisp.includes('SENIOR') ||
          classDisp.includes('GRADUATE');
        if (isSenior) continue;

        // Injury status (if any) — same source as NFL flow
        const inj = a.injuries?.[0];
        const injuryStatus = inj?.status?.name || inj?.shortName || null;

        // Real production from CFB stat leaders (per-game, season-weighted).
        const statLine = cfbStats?.get(a.id);
        let ptsPerGame = 0;
        if (statLine) {
          // NFL PPR scoring applied to per-game college stats.
          const scored = scoreStatLine('NCAAF', {
            pass_yd: statLine.passYds ?? 0,
            pass_td: statLine.passTds ?? 0,
            rush_yd: statLine.rushYds ?? 0,
            rush_td: statLine.rushTds ?? 0,
            rec: statLine.rec ?? 0,
            rec_yd: statLine.recYds ?? 0,
            rec_td: statLine.recTds ?? 0,
          }, scoringConfig);
          ptsPerGame = scored.fantasyPoints;
        }
        // Base prior for players without stat-leader data (most underclassmen
        // backups). Stars overlay always wins on top.
        const priorPts = starsMap[key] ?? priorMap[fpos] ?? 5;
        if (!statLine) {
          // Statless (most underclassmen backups): fraction of position prior.
          ptsPerGame = priorPts * 0.5;
        } else {
          // Real production: stat score (at 0.9 weight) vs the statless prior
          // floor; stars overlay is applied separately below.
          ptsPerGame = Math.max(priorPts * 0.5, ptsPerGame * 0.9);
        }
        if (starsMap[key]) ptsPerGame = starsMap[key];

        // Cap stat-derived value so mid-major volume kings don't out-rank
        // consensus blue chips.
        const cap = NCAAF_STAT_CAP[fpos] ?? 18;
        ptsPerGame = Math.min(ptsPerGame, cap);

        // Class-year multiplier (FR upside, JR draft proximity).
        const mult = NCAAF_CLASS_MULTIPLIER[classAbr] ?? 1;
        ptsPerGame = ptsPerGame * (mult || 1);

        // Depth discount within position group (backups < starters).
        const idx = a.depthIdx ?? 0;
        if (!starsMap[key]) {
          const depthFactor =
            idx === 0 ? 1.0 :
            idx === 1 ? 0.72 :
            idx === 2 ? 0.55 :
            idx === 3 ? 0.45 :
            0.38;
          ptsPerGame = ptsPerGame * depthFactor;
        }

        const proj = buildProjectionFromPoints(sport, fpos, ptsPerGame);
        const scored = scoreStatLine(sport, proj, scoringConfig);

        const bioCollege = a.college?.name || a.college?.shortName || null;
        const birthPlaceStr = a.birthPlace
          ? [a.birthPlace.city, a.birthPlace.state, a.birthPlace.country]
              .filter(Boolean)
              .join(', ')
          : null;

        players.push({
          seasonYear,
          sport,
          playerName: a.fullName,
          // For college players: team = college abbreviation (UGA, OSU, …)
          // so draft-room rows show the school; college = full school name.
          team: a.college?.abbrev || team.abbreviation,
          position: fpos,
          eligiblePos: eligiblePositions(sport, fpos),
          projection: proj,
          projectedPoints: scored.fantasyPoints,
          isRookie: classAbr === 'FR',
          injuryStatus,
          espnId: a.id,
          headshot: a.headshot?.href || null,
          height: a.displayHeight || null,
          weight: a.displayWeight || null,
          age: a.age ?? null,
          college: bioCollege,
          debutYear: a.debutYear ?? null,
          experienceYears: a.experience?.years ?? null,
          birthPlace: birthPlaceStr,
          jersey: a.jersey || null,
        });
        continue;
      }
      // ── end NCAAF devy model ───────────────────────────────────────────────

      // Injury status (if any)
      const inj = a.injuries?.[0];
      const injuryStatus = inj?.status?.name || inj?.shortName || null;

      // Rookie = 0 years experience
      const isRookie = (a.experience?.years ?? 0) <= 0;

      // Projected points per game: stars overlay → position prior.
      const ptsPerGame = starsMap[key] ?? priorMap[fpos] ?? 5;

      // Depth-based discount so backups/reserves don't share the starter
      // prior and flood the top of the rankings. ESPN rosters list athletes
      // within a position group roughly in depth-chart order (starters first),
      // and use distinct groups for "Injured Reserve" / "Practice Squad" /
      // "Suspended" / "Reserve". We apply a steep decay by depth index and an
      // extra penalty for inactive roster groups. Stars overlay always wins.
      let adjustedPts = ptsPerGame;
      if (!starsMap[key]) {
        const grp = (a.group || '').toLowerCase();
        const inactive =
          grp.includes('injured reserve') ||
          grp.includes('practice squad') ||
          grp.includes('suspended') ||
          grp.includes('reserve') ||
          grp.includes('non-football') ||
          grp.includes('pup') ||
          grp.includes('ir') ||
          grp.includes('inactive');
        const idx = a.depthIdx ?? 0;
        if (inactive) {
          // IR / PS / suspended players carry minimal fantasy value.
          adjustedPts = Math.min(ptsPerGame, 3) * 0.4;
        } else {
          // Decay by depth index within the position group.
          // idx 0 (starter): 1.00, idx 1: 0.72, idx 2: 0.55, idx 3: 0.45,
          // idx 4+: floor at 0.38. The first backup keeps most of the prior
          // (handcuffs matter), deeper reserves fall off quickly.
          const depthFactor =
            idx === 0 ? 1.0 :
            idx === 1 ? 0.72 :
            idx === 2 ? 0.55 :
            idx === 3 ? 0.45 :
            0.38;
          adjustedPts = ptsPerGame * depthFactor;
        }
      }

      const proj = buildProjectionFromPoints(sport, fpos, adjustedPts);
      const scored = scoreStatLine(sport, proj, scoringConfig);

      // Bio data for the hover info card
      const collegeName = a.college?.name || a.college?.shortName || null;
      const birthPlaceStr = a.birthPlace
        ? [a.birthPlace.city, a.birthPlace.state, a.birthPlace.country]
            .filter(Boolean)
            .join(', ')
        : null;

      players.push({
        seasonYear,
        sport,
        playerName: a.fullName,
        team: team.abbreviation,
        position: fpos,
        eligiblePos: eligiblePositions(sport, fpos),
        projection: proj,
        projectedPoints: scored.fantasyPoints,
        isRookie,
        injuryStatus,
        espnId: a.id,
        headshot: a.headshot?.href || null,
        height: a.displayHeight || null,
        weight: a.displayWeight || null,
        age: a.age ?? null,
        college: collegeName,
        debutYear: a.debutYear ?? null,
        experienceYears: a.experience?.years ?? null,
        birthPlace: birthPlaceStr,
        jersey: a.jersey || null,
      });
    }
  }

  // Sort by projected points descending so the top of the pool is the elite.
  players.sort((a, b) => b.projectedPoints - a.projectedPoints);

  let finalPlayers = players;
  if (maxPlayers && sport === 'NCAAF') {
    // Position quotas: ESPN's stat-leader categories are QB-heavy (passing
    // yards/TDs/QBR dominate the boards), so a pure points-sort drowns the
    // pool in QBs and starves TE/K. A devy pool should mirror a realistic
    // dynasty prospect mix: WR-heavy, then RB, then QB, with real TE depth.
    const quotas: Record<string, number> = {
      QB: 110,
      RB: 170,
      WR: 220,
      TE: 70,
      K: 30,
    };
    const taken: Record<string, number> = {};
    const quotaPicks: EspnPoolPlayer[] = [];
    const leftovers: EspnPoolPlayer[] = [];
    for (const p of players) {
      const q = quotas[p.position] ?? 60;
      if ((taken[p.position] ?? 0) < q) {
        taken[p.position] = (taken[p.position] ?? 0) + 1;
        quotaPicks.push(p);
      } else {
        leftovers.push(p);
      }
    }
    // Take quota picks first (in points order), then backfill with the
    // strongest leftovers if the target size isn't reached.
    const target = Math.min(maxPlayers, players.length);
    const fill = [...quotaPicks, ...leftovers]
      .slice(0, target)
      .sort((a, b) => b.projectedPoints - a.projectedPoints);
    finalPlayers = fill;
  } else if (maxPlayers) {
    finalPlayers = players.slice(0, maxPlayers);
  }

  return {
    sport,
    seasonYear,
    count: finalPlayers.length,
    players: finalPlayers,
  };
}
