import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { query } from '@/lib/db';

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
  category: 'Sport Data' | 'Odds API' | 'Intelligence';
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
// Intelligence product samples (DB-sourced)
// ---------------------------------------------------------------------------

async function collectArbitrageSample(): Promise<SampleTab> {
  const result = await query(
    `SELECT id, sport, home_team, away_team,
            best_home_odds, best_home_book,
            best_away_odds, best_away_book,
            profit_percentage, implied_total, fetched_at
     FROM custom_api_compare
     WHERE is_arbitrage = TRUE
       AND fetched_at > NOW() - INTERVAL '35 minutes'
     ORDER BY profit_percentage DESC NULLS LAST
     LIMIT 3`
  );
  return {
    id: 'intel-arbitrage',
    label: 'Arbitrage',
    category: 'Intelligence',
    endpoint: 'GET /v1/intelligence/arbitrage',
    method: 'GET',
    description:
      'Live sure-bet opportunities across 20+ sportsbooks. Each row shows the best odds on each side, the sportsbook offering them, and the guaranteed profit percentage. Updated every 60 seconds.',
    pingCost: 5,
    status: 200,
    json: { count: result.rows.length, data: result.rows },
  };
}

async function collectSteamMovesSample(): Promise<SampleTab> {
  const result = await query(
    `SELECT id, sport, home_team, away_team, market_type, outcome_name,
            before_avg_price, after_avg_price, books_moved, total_books,
            direction, detected_at
     FROM steam_moves
     WHERE detected_at > NOW() - INTERVAL '60 minutes'
     ORDER BY detected_at DESC
     LIMIT 5`
  );
  return {
    id: 'intel-steam',
    label: 'Steam Moves',
    category: 'Intelligence',
    endpoint: 'GET /v1/intelligence/steam-moves',
    method: 'GET',
    description:
      'Real-time line-movement alerts. When 3+ sportsbooks move a line in the same direction within a short window, we flag it — the sharpest signal in the market. Shows before/after prices, books moved, and direction.',
    pingCost: 5,
    status: 200,
    json: { count: result.rows.length, data: result.rows },
  };
}

async function collectInjuriesSample(): Promise<SampleTab> {
  const result = await query(
    `SELECT id, sport, player_name, team, position, status,
            injury_type, description, source, reported_date, fetched_at
     FROM injuries
     WHERE fetched_at > NOW() - INTERVAL '48 hours'
     ORDER BY fetched_at DESC
     LIMIT 5`
  );
  return {
    id: 'intel-injuries',
    label: 'Injuries',
    category: 'Intelligence',
    endpoint: 'GET /v1/intelligence/injuries',
    method: 'GET',
    description:
      'Standardized injury reports aggregated from ESPN and other sources. Each report includes player, team, position, status (Day-To-Day / IL / Out), injury type, and a full description.',
    pingCost: 2,
    status: 200,
    json: { count: result.rows.length, data: result.rows },
  };
}

async function collectAiAnalysisSample(): Promise<SampleTab> {
  const result = await query(
    `SELECT id, analysis_type, model,
            LEFT(content, 1200) as content_preview,
            confidence, generated_at
     FROM ai_analysis
     WHERE analysis_type = 'depthAnalysis'
     ORDER BY generated_at DESC
     LIMIT 2`
  );
  return {
    id: 'intel-ai',
    label: 'AI Analysis',
    category: 'Intelligence',
    endpoint: 'GET /v1/intelligence/ai-analysis',
    method: 'GET',
    description:
      'GPT-4o-powered depth analysis for every game across all supported sports. Each report includes a recommended pick, confidence assessment, odds breakdown, and full reasoning in markdown. Content trimmed to 1,200 chars for preview.',
    pingCost: 10,
    status: 200,
    json: { count: result.rows.length, data: result.rows },
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
  // Sport + Odds samples fetch from backend services; intelligence samples
  // query the DB directly (no network hop).
  const remoteCollectors = [
    collectBaseballLeagues,
    collectBaseballGames,
    collectBaseballTeam,
    collectBaseballRoster,
    collectOddsSports,
    collectOddsSportsbooks,
    collectOddsSnapshot,
  ];

  const results = await Promise.allSettled([
    ...remoteCollectors.map((c) => c(key)),
    collectArbitrageSample(),
    collectSteamMovesSample(),
    collectInjuriesSample(),
    collectAiAnalysisSample(),
  ]);

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
