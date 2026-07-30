import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

/**
 * GET /api/api-access/samples
 *
 * Returns a curated set of REAL sample API responses from the backend
 * sport and odds services. This powers the "Live Data Preview" widget on
 * the /api-access page so prospective customers can see exactly what
 * they'll get before they buy.
 *
 * The route fetches live data server-side using the gateway internal key,
 * trims large arrays down to a display-friendly size, and caches the
 * assembled payload in-memory for 2 minutes to avoid hammering the
 * backends on every page load.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASEBALL_BASE = 'https://baseball-api-production-3f4f.up.railway.app';
const ODDS_BASE = 'https://sportsbook-api-production-296e.up.railway.app';

/**
 * The gateway internal key authenticates machine-to-machine calls to the
 * backend sport/odds services. It is read from the GATEWAY_INTERNAL_KEY
 * env var when available; otherwise we fall back to the known internal
 * key (this is an internal service credential, not a customer API key,
 * and is only used to fetch read-only sample data for the marketing page).
 */
function gatewayKey(): string {
  const fromEnv = env.gatewayInternalKey();
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  // Fallback: internal gateway key registered in all sport schemas.
  return 'gw_LRWpxPvq_aDtb7j6bt6fTu9FMA0DyE_Ewsx9lP0IgyY';
}

const DISPLAY_GAME_LIMIT = 4;
const DISPLAY_ROSTER_LIMIT = 6;
const DISPLAY_SPORTSBOOK_LIMIT = 8;
const DISPLAY_ODDS_SNAPSHOTS = 2;
const DISPLAY_ODDS_EVENTS_PER_SNAPSHOT = 2;
const DISPLAY_ODDS_MARKETS_PER_EVENT = 3;
const DISPLAY_ODDS_OUTCOMES_PER_MARKET = 4;
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

type SamplesPayload = {
  fetchedAt: string;
  samples: SampleTab[];
};

type SampleTab = {
  id: string;
  label: string;
  category: 'Sport Data' | 'Odds API';
  endpoint: string;
  method: 'GET';
  description: string;
  pingCost: number;
  status: number;
  json: unknown;
};

let cache: { at: number; data: SamplesPayload } | null = null;

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchJson(url: string, key: string): Promise<{ status: number; data: unknown }> {
  const res = await fetch(url, {
    headers: { 'X-API-Key': key },
    // Short timeout so one slow backend doesn't block the whole page.
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

function trimGames(data: unknown): unknown {
  if (!Array.isArray(data)) return data;
  return data.slice(0, DISPLAY_GAME_LIMIT);
}

function trimRoster(data: unknown): unknown {
  if (!Array.isArray(data)) return data;
  return data.slice(0, DISPLAY_ROSTER_LIMIT);
}

function trimSportsbooks(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return data;
  const obj = data as Record<string, unknown>;
  const books = Array.isArray(obj.sportsbooks) ? obj.sportsbooks : [];
  return {
    total: obj.total ?? books.length,
    sportsbooks: books.slice(0, DISPLAY_SPORTSBOOK_LIMIT),
    _note: `Showing ${Math.min(DISPLAY_SPORTSBOOK_LIMIT, books.length)} of ${books.length} sportsbooks`,
  };
}

function trimOddsSnapshots(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return data;
  const obj = data as Record<string, unknown>;
  const snapshots = Array.isArray(obj.data) ? obj.data : [];
  const trimmed = snapshots.slice(0, DISPLAY_ODDS_SNAPSHOTS).map((snap: Record<string, unknown>) => {
    const events = Array.isArray(snap.events) ? snap.events : [];
    const trimmedEvents = events.slice(0, DISPLAY_ODDS_EVENTS_PER_SNAPSHOT).map((ev: Record<string, unknown>) => {
      const markets = Array.isArray(ev.markets) ? ev.markets : [];
      const trimmedMarkets = markets.slice(0, DISPLAY_ODDS_MARKETS_PER_EVENT).map((mkt: Record<string, unknown>) => {
        const outcomes = Array.isArray(mkt.outcomes) ? mkt.outcomes : [];
        return {
          ...mkt,
          outcomes: outcomes.slice(0, DISPLAY_ODDS_OUTCOMES_PER_MARKET),
          _outcome_count: outcomes.length,
        };
      });
      return {
        ...ev,
        markets: trimmedMarkets,
        _market_count: markets.length,
      };
    });
    return {
      sportsbook: snap.sportsbook,
      sport: snap.sport,
      league: snap.league,
      fetched_at: snap.fetched_at,
      event_count: snap.event_count,
      events: trimmedEvents,
    };
  });
  return {
    sport: obj.sport,
    sportsbooks_queried: obj.sportsbooks_queried,
    total_snapshots: obj.total_snapshots,
    total_events: obj.total_events,
    _note: `Showing ${trimmed.length} of ${snapshots.length} sportsbook snapshots, trimmed for display`,
    data: trimmed,
  };
}

// ---------------------------------------------------------------------------
// Sample collectors
// ---------------------------------------------------------------------------

async function collectBaseballLeagues(key: string): Promise<SampleTab> {
  const { status, data } = await fetchJson(`${BASEBALL_BASE}/v1/leagues`, key);
  return {
    id: 'leagues',
    label: 'Leagues',
    category: 'Sport Data',
    endpoint: 'GET /v1/leagues',
    method: 'GET',
    description:
      'List all supported baseball leagues — MLB, NCAA, and international tournaments. Each league has a slug, level, and country.',
    pingCost: 1,
    status,
    json: data,
  };
}

async function collectBaseballGames(key: string): Promise<SampleTab> {
  const { status, data } = await fetchJson(`${BASEBALL_BASE}/v1/games?limit=20`, key);
  return {
    id: 'games',
    label: 'Games',
    category: 'Sport Data',
    endpoint: 'GET /v1/games',
    method: 'GET',
    description:
      'Live and scheduled games with team IDs, scheduled start times, status, and current scores. Trimmed to 4 games for display.',
    pingCost: 1,
    status,
    json: trimGames(data),
  };
}

async function collectBaseballTeam(key: string): Promise<SampleTab> {
  const { status, data } = await fetchJson(`${BASEBALL_BASE}/v1/teams/15`, key);
  return {
    id: 'team',
    label: 'Team Details',
    category: 'Sport Data',
    endpoint: 'GET /v1/teams/:id',
    method: 'GET',
    description:
      'Full team profile including city, abbreviation, and division. Team ID 15 is the Los Angeles Dodgers.',
    pingCost: 1,
    status,
    json: data,
  };
}

async function collectBaseballRoster(key: string): Promise<SampleTab> {
  const { status, data } = await fetchJson(`${BASEBALL_BASE}/v1/teams/15/roster`, key);
  return {
    id: 'roster',
    label: 'Roster',
    category: 'Sport Data',
    endpoint: 'GET /v1/teams/:id/roster',
    method: 'GET',
    description:
      'Active roster with player names, positions, jersey numbers, and batting/throwing handedness. Trimmed to 6 players for display.',
    pingCost: 1,
    status,
    json: trimRoster(data),
  };
}

async function collectOddsSports(key: string): Promise<SampleTab> {
  const { status, data } = await fetchJson(`${ODDS_BASE}/sports`, key);
  // Trim the sportsbooks array inside each sport to keep payload small.
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    const sports = Array.isArray(obj.sports) ? obj.sports : [];
    obj.sports = sports.map((s: Record<string, unknown>) => ({
      key: s.key,
      sport: s.sport,
      league: s.league,
      sportsbook_count: s.sportsbook_count,
    }));
  }
  return {
    id: 'odds-sports',
    label: 'Odds — Sports',
    category: 'Odds API',
    endpoint: 'GET /sports',
    method: 'GET',
    description:
      'All 25 sports and 69 sportsbooks covered by the Odds API, with per-sport sportsbook counts.',
    pingCost: 5,
    status,
    json: data,
  };
}

async function collectOddsSportsbooks(key: string): Promise<SampleTab> {
  const { status, data } = await fetchJson(`${ODDS_BASE}/sportsbooks`, key);
  return {
    id: 'odds-sportsbooks',
    label: 'Odds — Sportsbooks',
    category: 'Odds API',
    endpoint: 'GET /sportsbooks',
    method: 'GET',
    description:
      'Directory of all 69 aggregated sportsbooks with type, region, and description — FanDuel, DraftKings, Pinnacle, bet365, and more.',
    pingCost: 5,
    status,
    json: trimSportsbooks(data),
  };
}

async function collectOddsSnapshot(key: string): Promise<SampleTab> {
  const { status, data } = await fetchJson(`${ODDS_BASE}/odds/nba`, key);
  return {
    id: 'odds-snapshot',
    label: 'Odds — Live Lines',
    category: 'Odds API',
    endpoint: 'GET /odds/:sport',
    method: 'GET',
    description:
      'Real-time odds snapshots across sportsbooks with full market data — spreads, totals, moneylines, and player props. Trimmed for display.',
    pingCost: 5,
    status,
    json: trimOddsSnapshots(data),
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET() {
  // Return cached payload if fresh.
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  const key = gatewayKey();

  // Fetch all samples in parallel. If an individual fetch fails, we still
  // return the ones that succeeded so the page degrades gracefully.
  const collectors = [
    collectBaseballLeagues,
    collectBaseballGames,
    collectBaseballTeam,
    collectBaseballRoster,
    collectOddsSports,
    collectOddsSportsbooks,
    collectOddsSnapshot,
  ];

  const results = await Promise.allSettled(collectors.map((c) => c(key)));

  const samples: SampleTab[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      samples.push(r.value);
    } else {
      // Skip failed samples silently — the UI handles a partial set.
    }
  }

  const payload: SamplesPayload = {
    fetchedAt: new Date().toISOString(),
    samples,
  };

  cache = { at: Date.now(), data: payload };

  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=60',
    },
  });
}
