/**
 * Live game graphic — broadcast-style live game data.
 *
 * Normalizes ESPN's public `summary` endpoint into everything a
 * broadcast-style live game graphic needs:
 *
 *   • both teams (logos, colors, records, scores)
 *   • game status (period, clock, state, network, venue)
 *   • the current situation (down & distance, ball on, red zone)
 *   • every drive (start/end field position, result, plays)
 *   • the recent play-by-play (with field position for each snap)
 *   • the win-probability series (for the live chart)
 *   • the betting odds (spread / total / moneyline)
 *
 * Field-position convention: ESPN's `yardLine` is measured from the
 * possessing team's OWN goal line (0 = own end zone, 100 = opponent end
 * zone). We keep that convention and let the UI render the field from the
 * offense's perspective, which is what makes the ball marker and the
 * trajectory arc line up with the yard markers.
 *
 * Endpoint (no key required):
 *   https://site.api.espn.com/apis/site/v2/sports/{path}/summary?event={id}
 */

import { espnPathForSport, fetchRawSummaryJson } from './espn-summary';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LiveGameTeam = {
  id: string | null;
  abbrev: string;
  name: string;
  shortName: string;
  logo: string | null;
  color: string | null;
  altColor: string | null;
  score: number;
  record: string | null;
  homeAway: 'home' | 'away';
};

export type LiveGamePlay = {
  id: string;
  text: string;
  typeText: string | null;
  typeAbbrev: string | null;
  /** The team that ran the play (drive team). */
  abbrev: string | null;
  /** The team with possession AFTER the play (may differ on turnovers/punts). */
  possessionAbbrev: string | null;
  period: number | null;
  clock: string | null;
  down: number | null;
  distance: number | null;
  /** Absolute 0–100 from the possessing team's own goal line. */
  yardLine: number | null;
  yardsToEndzone: number | null;
  downDistanceText: string | null;
  possessionText: string | null;
  isRedZone: boolean;
  isScoringPlay: boolean;
  isTurnover: boolean;
  statYardage: number | null;
  homeScore: number | null;
  awayScore: number | null;
  wallclock: string | null;
  /** ESPN's global play sequence number (monotonic across the game). */
  sequenceNumber: number | null;
};

export type LiveGameDrive = {
  id: string;
  teamAbbrev: string | null;
  description: string | null;
  startYardLine: number | null;
  endYardLine: number | null;
  startText: string | null;
  endText: string | null;
  isScore: boolean;
  result: string | null;
  displayResult: string | null;
  offensivePlays: number | null;
  yards: number | null;
  timeElapsed: string | null;
  plays: LiveGamePlay[];
};

export type LiveGameOdds = {
  provider: string | null;
  providerLogo: string | null;
  details: string | null;
  spread: number | null;
  overUnder: number | null;
  homeMoneyLine: number | null;
  awayMoneyLine: number | null;
  homeSpreadOdds: number | null;
  awaySpreadOdds: number | null;
  overOdds: number | null;
  underOdds: number | null;
};

export type LiveGameSituation = {
  down: number | null;
  distance: number | null;
  yardLine: number | null;
  yardsToEndzone: number | null;
  downDistanceText: string | null;
  possessionText: string | null;
  isRedZone: boolean;
  possessionAbbrev: string | null;
};

export type LiveGameGraphic = {
  eventId: string;
  sport: string;
  state: 'pre' | 'in' | 'post';
  isLive: boolean;
  isFinal: boolean;
  statusDetail: string | null;
  period: number;
  clock: string | null;
  venue: string | null;
  broadcast: string | null;
  home: LiveGameTeam;
  away: LiveGameTeam;
  possession: 'home' | 'away' | null;
  situation: LiveGameSituation | null;
  drives: LiveGameDrive[];
  currentDrive: LiveGameDrive | null;
  lastPlay: LiveGamePlay | null;
  /** Recent plays, newest first. */
  plays: LiveGamePlay[];
  scoringPlays: LiveGamePlay[];
  winProbability: { home: number; away: number; tie: number } | null;
  winProbabilitySeries: { playId: string; home: number; away: number }[];
  odds: LiveGameOdds | null;
  linescores: { label: string; home: number | null; away: number | null }[];
};

// ---------------------------------------------------------------------------
// Helpers
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

function str(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s.length ? s : null;
}

function stateOf(comp: any): 'pre' | 'in' | 'post' {
  const s = comp?.status?.type?.state;
  return s === 'in' ? 'in' : s === 'post' ? 'post' : 'pre';
}

/** Pick the best logo href from an ESPN team object. */
function logoOf(team: any): string | null {
  const logos: any[] = team?.logos ?? [];
  const preferred =
    logos.find((l) => Array.isArray(l?.rel) && l.rel.includes('default')) ??
    logos.find((l) => Array.isArray(l?.rel) && l.rel.includes('full')) ??
    logos[0];
  return preferred?.href ?? team?.logo ?? null;
}

function normalizePlay(
  p: any,
  fallbackAbbrev: string | null,
  abbrevByTeamId: Map<string, string>
): LiveGamePlay {
  const start = p?.start ?? {};
  const end = p?.end ?? {};
  const yardLine = toInt(end?.yardLine) ?? toInt(start?.yardLine);
  const yardsToEndzone = toInt(end?.yardsToEndzone) ?? toInt(start?.yardsToEndzone);
  const down = toInt(start?.down);
  const distance = toInt(start?.distance);
  const isRedZone =
    (yardsToEndzone !== null && yardsToEndzone > 0 && yardsToEndzone <= 20) ||
    Boolean(p?.isRedZone);
  // Possession can change mid-drive (punt, turnover). ESPN tags the post-play
  // possession team on `end.team.id`; fall back to the drive team.
  const endTeamId = end?.team?.id != null ? String(end.team.id) : null;
  const possessionAbbrev = endTeamId ? abbrevByTeamId.get(endTeamId) ?? fallbackAbbrev : fallbackAbbrev;
  return {
    id: p?.id != null ? String(p.id) : `${p?.sequenceNumber ?? Math.random()}`,
    text: String(p?.text ?? p?.shortText ?? ''),
    typeText: str(p?.type?.text),
    typeAbbrev: str(p?.type?.abbreviation),
    abbrev: fallbackAbbrev,
    possessionAbbrev,
    period: toInt(p?.period?.number),
    clock: str(p?.clock?.displayValue),
    down: down && down > 0 ? down : null,
    distance: distance != null && distance >= 0 ? distance : null,
    yardLine,
    yardsToEndzone,
    downDistanceText: str(start?.downDistanceText),
    possessionText: str(start?.possessionText),
    isRedZone,
    isScoringPlay: Boolean(p?.scoringPlay),
    isTurnover: Boolean(p?.isTurnover) || /intercept|fumble/i.test(String(p?.text ?? '')),
    statYardage: toInt(p?.statYardage),
    homeScore: toInt(p?.homeScore),
    awayScore: toInt(p?.awayScore),
    wallclock: str(p?.wallclock),
    sequenceNumber: toInt(p?.sequenceNumber),
  };
}

function normalizeDrive(d: any, abbrevByTeamId: Map<string, string>): LiveGameDrive {
  const abbrev: string | null = d?.team?.abbreviation ?? null;
  const plays: LiveGamePlay[] = (d?.plays ?? []).map((p: any) =>
    normalizePlay(p, abbrev, abbrevByTeamId)
  );
  return {
    id: d?.id != null ? String(d.id) : `${Math.random()}`,
    teamAbbrev: abbrev,
    description: str(d?.description),
    startYardLine: toInt(d?.start?.yardLine),
    endYardLine: toInt(d?.end?.yardLine),
    startText: str(d?.start?.text),
    endText: str(d?.end?.text),
    isScore: Boolean(d?.isScore),
    result: str(d?.result),
    displayResult: str(d?.displayResult),
    offensivePlays: toInt(d?.offensivePlays),
    yards: toInt(d?.yards),
    timeElapsed: str(d?.timeElapsed?.displayValue ?? d?.timeElapsed),
    plays,
  };
}

function normalizeOdds(pickcenter: any): LiveGameOdds | null {
  const pc = Array.isArray(pickcenter) ? pickcenter[0] : pickcenter;
  if (!pc) return null;
  const home = pc?.homeTeamOdds ?? {};
  const away = pc?.awayTeamOdds ?? {};
  return {
    provider: str(pc?.provider?.name),
    providerLogo:
      pc?.provider?.logos?.find((l: any) => Array.isArray(l?.rel) && l.rel.includes('dark'))?.href ??
      pc?.provider?.logos?.[0]?.href ??
      null,
    details: str(pc?.details),
    spread: toInt(pc?.spread),
    overUnder: typeof pc?.overUnder === 'number' ? pc.overUnder : toInt(pc?.overUnder),
    homeMoneyLine: toInt(home?.moneyLine),
    awayMoneyLine: toInt(away?.moneyLine),
    homeSpreadOdds: toInt(home?.spreadOdds),
    awaySpreadOdds: toInt(away?.spreadOdds),
    overOdds: toInt(pc?.overOdds),
    underOdds: toInt(pc?.underOdds),
  };
}

function normalizeLinescores(comp: any): { label: string; home: number | null; away: number | null }[] {
  const competitors: any[] = comp?.competitors ?? [];
  const home = competitors.find((c) => c?.homeAway === 'home');
  const away = competitors.find((c) => c?.homeAway === 'away');
  const homeLs: any[] = home?.linescores ?? [];
  const awayLs: any[] = away?.linescores ?? [];
  const len = Math.max(homeLs.length, awayLs.length);
  const out: { label: string; home: number | null; away: number | null }[] = [];
  for (let i = 0; i < len; i++) {
    out.push({
      label: String(i + 1),
      home: toInt(homeLs[i]?.displayValue ?? homeLs[i]?.value),
      away: toInt(awayLs[i]?.displayValue ?? awayLs[i]?.value),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch + normalize a single game into a broadcast-style live graphic payload.
 * Returns null when the sport is unsupported or the event can't be loaded.
 */
export async function getLiveGameGraphic(
  sport: string,
  eventId: string
): Promise<LiveGameGraphic | null> {
  const path = espnPathForSport(sport);
  if (!path || !eventId) return null;

  const data = await fetchRawSummaryJson(path, eventId);
  if (!data?.header) return null;

  const header = data.header;
  const comp = header?.competitions?.[0] ?? {};
  const competitors: any[] = comp?.competitors ?? [];
  const homeC = competitors.find((c) => c?.homeAway === 'home') ?? competitors[0];
  const awayC = competitors.find((c) => c?.homeAway === 'away') ?? competitors[1];

  const state = stateOf(comp);
  const status = comp?.status ?? {};

  const mkTeam = (c: any, homeAway: 'home' | 'away'): LiveGameTeam => ({
    id: c?.team?.id != null ? String(c.team.id) : null,
    abbrev: c?.team?.abbreviation ?? '—',
    name: c?.team?.displayName ?? 'Unknown',
    shortName: c?.team?.shortDisplayName ?? c?.team?.name ?? 'Unknown',
    logo: logoOf(c?.team),
    color: str(c?.team?.color),
    altColor: str(c?.team?.alternateColor),
    score: num(c?.score, 0),
    record: str(c?.record?.[0]?.summary),
    homeAway,
  });

  const home = mkTeam(homeC, 'home');
  const away = mkTeam(awayC, 'away');

  // teamId → abbreviation, so plays can resolve post-play possession.
  const abbrevByTeamId = new Map<string, string>();
  for (const c of competitors) {
    if (c?.team?.id != null && c?.team?.abbreviation) {
      abbrevByTeamId.set(String(c.team.id), String(c.team.abbreviation));
    }
  }

  // Broadcast network (prefer the national TV listing).
  const broadcasts: any[] = comp?.broadcasts ?? [];
  const broadcast =
    broadcasts.find((b) => b?.isNational)?.media?.shortName ??
    broadcasts[0]?.media?.shortName ??
    null;

  // Drives — previous (chronological) + current.
  const rawDrives: any[] = [...(data?.drives?.previous ?? [])];
  const currentRaw = data?.drives?.current ?? null;
  const drives: LiveGameDrive[] = rawDrives.map((d) => normalizeDrive(d, abbrevByTeamId));
  const currentDrive = currentRaw ? normalizeDrive(currentRaw, abbrevByTeamId) : null;

  // Recent plays, newest first — flatten drives then sort by sequence.
  // ESPN repeats some plays across adjacent drives (a play can be the last
  // snap of one drive and the first of the next), so de-dupe by play id.
  const allPlays: LiveGamePlay[] = [];
  for (const d of drives) allPlays.push(...d.plays);
  if (currentDrive) allPlays.push(...currentDrive.plays);
  const byId = new Map<string, LiveGamePlay>();
  for (const p of allPlays) {
    if (!p.id) continue;
    const existing = byId.get(p.id);
    // Prefer the copy that carries down/distance + possession context.
    if (!existing || (existing.down == null && p.down != null)) byId.set(p.id, p);
  }
  const orderedPlays = [...byId.values()].sort((a, b) => {
    const sa = a.sequenceNumber ?? 0;
    const sb = b.sequenceNumber ?? 0;
    if (sa !== sb) return sb - sa;
    const ta = a.wallclock ? Date.parse(a.wallclock) : 0;
    const tb = b.wallclock ? Date.parse(b.wallclock) : 0;
    return tb - ta;
  });
  const plays = orderedPlays.slice(0, 60);
  const lastPlay = orderedPlays[0] ?? null;

  // Scoring plays (from the dedicated array when present, else derived).
  const scoringRaw: any[] = data?.scoringPlays ?? [];
  const scoringPlays: LiveGamePlay[] =
    scoringRaw.length > 0
      ? scoringRaw
          .map((p) => normalizePlay(p, p?.team?.abbreviation ?? null, abbrevByTeamId))
          .reverse()
      : orderedPlays.filter((p) => p.isScoringPlay);

  // Situation — the state going into the NEXT snap. ESPN exposes it on the
  // END of the most recent real snap (down 1–4). Administrative events
  // (timeouts, end of quarter) and scoring plays that end a drive carry
  // down = -1, so we skip those and walk backwards to the last live snap.
  const rawCurrentPlays: any[] = currentRaw?.plays ?? [];
  let sitRaw: any = null;
  for (let i = rawCurrentPlays.length - 1; i >= 0; i--) {
    const d = toInt(rawCurrentPlays[i]?.end?.down);
    if (d != null && d >= 1 && d <= 4) {
      sitRaw = rawCurrentPlays[i];
      break;
    }
  }
  const sitEnd = sitRaw?.end ?? {};
  const sitYardsToEndzone = toInt(sitEnd?.yardsToEndzone);
  const sitPossessionAbbrev = (() => {
    const id = sitEnd?.team?.id != null ? String(sitEnd.team.id) : null;
    return (id ? abbrevByTeamId.get(id) : null) ?? currentDrive?.teamAbbrev ?? null;
  })();
  const situation: LiveGameSituation | null = sitRaw
    ? {
        down: toInt(sitEnd?.down),
        distance: toInt(sitEnd?.distance),
        yardLine: toInt(sitEnd?.yardLine),
        yardsToEndzone: sitYardsToEndzone,
        downDistanceText: str(sitEnd?.downDistanceText),
        possessionText: str(sitEnd?.possessionText),
        isRedZone: sitYardsToEndzone !== null && sitYardsToEndzone > 0 && sitYardsToEndzone <= 20,
        possessionAbbrev: sitPossessionAbbrev,
      }
    : (() => {
        // Fallback: derive from the most recent normalized play with a down.
        const src =
          (currentDrive?.plays ?? []).slice().reverse().find((p) => p.down != null) ??
          orderedPlays.find((p) => p.down != null) ??
          null;
        if (!src) return null;
        return {
          down: src.down,
          distance: src.distance,
          yardLine: src.yardLine,
          yardsToEndzone: src.yardsToEndzone,
          downDistanceText: src.downDistanceText,
          possessionText: src.possessionText,
          isRedZone: src.isRedZone,
          possessionAbbrev: src.possessionAbbrev ?? currentDrive?.teamAbbrev ?? null,
        };
      })();

  const possessionAbbrev = situation?.possessionAbbrev ?? currentDrive?.teamAbbrev ?? null;

  const possession: 'home' | 'away' | null =
    possessionAbbrev === home.abbrev ? 'home' : possessionAbbrev === away.abbrev ? 'away' : null;

  // Win probability — latest value + a downsampled series for the chart.
  const wpRaw: any[] = data?.winprobability ?? [];
  let winProbability: { home: number; away: number; tie: number } | null = null;
  const winProbabilitySeries: { playId: string; home: number; away: number }[] = [];
  if (wpRaw.length) {
    const last = wpRaw[wpRaw.length - 1];
    const homePct = typeof last?.homeWinPercentage === 'number' ? last.homeWinPercentage : 0;
    const tiePct = typeof last?.tiePercentage === 'number' ? last.tiePercentage : 0;
    winProbability = {
      home: homePct,
      away: Math.max(0, 1 - homePct - tiePct),
      tie: tiePct,
    };
    // Downsample to at most ~48 points so the chart stays smooth and small.
    const step = Math.max(1, Math.ceil(wpRaw.length / 48));
    for (let i = 0; i < wpRaw.length; i += step) {
      const e = wpRaw[i];
      const h = typeof e?.homeWinPercentage === 'number' ? e.homeWinPercentage : 0;
      const t = typeof e?.tiePercentage === 'number' ? e.tiePercentage : 0;
      winProbabilitySeries.push({
        playId: e?.playId != null ? String(e.playId) : `${i}`,
        home: h,
        away: Math.max(0, 1 - h - t),
      });
    }
    // Always include the final point.
    const lastH = winProbability.home;
    const lastA = winProbability.away;
    const tail = winProbabilitySeries[winProbabilitySeries.length - 1];
    if (!tail || tail.home !== lastH) {
      winProbabilitySeries.push({ playId: 'latest', home: lastH, away: lastA });
    }
  }

  return {
    eventId: String(header?.id ?? eventId),
    sport: sport.toUpperCase(),
    state,
    isLive: state === 'in',
    isFinal: state === 'post' || Boolean(status?.type?.completed),
    statusDetail: str(status?.type?.shortDetail ?? status?.type?.detail),
    period: num(status?.period, 0),
    clock: str(status?.displayClock),
    venue: str(data?.gameInfo?.venue?.fullName ?? data?.gameInfo?.venue?.name),
    broadcast,
    home,
    away,
    possession,
    situation,
    drives,
    currentDrive,
    lastPlay,
    plays,
    scoringPlays,
    winProbability,
    winProbabilitySeries,
    odds: normalizeOdds(data?.pickcenter),
    linescores: normalizeLinescores(comp),
  };
}
