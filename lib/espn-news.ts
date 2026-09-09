/**
 * ESPN news fetchers — powers the homepage reel, games-section news, and
 * per-player relevant articles.
 *
 * Endpoints (verified):
 *  - https://site.web.api.espn.com/apis/site/v2/sports/{path}/news?limit=N
 *    Per-sport feed. Articles carry `categories[]` with typed entries —
 *    `type: 'athlete'` entries include `athleteId`, `type: 'team'` entries
 *    include a team description. This lets us filter news by player or team.
 *  - https://now.core.api.espn.com/v1/sports/news?limit=N — general feed
 *    across sports (top headlines).
 *  - The per-athlete news endpoint returns empty — player news is derived by
 *    filtering the sport feed on athlete id / name.
 *
 * Resilience: multi-host fallback, 8s timeout, UA spoof, soft-fail to [].
 */

import { SPORT_PATHS } from '@/lib/espn-scores';

const ESPN_NEWS_HOSTS = [
  'https://site.web.api.espn.com/apis/site/v2/sports',
  'https://site.api.espn.com/apis/site/v2/sports',
];
const ESPN_GENERAL_NEWS_URL = 'https://now.core.api.espn.com/v1/sports/news';
const FETCH_TIMEOUT_MS = 8000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Cache TTL — news changes a few times an hour; 5 min keeps it fresh without hammering ESPN. */
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface NewsArticle {
  id: string;
  headline: string;
  description: string;
  url: string;
  imageUrl: string | null;
  imageCredit: string | null;
  byline: string | null;
  publishedAt: string | null;
  premium: boolean;
  /** Athlete names tagged on the article (categories type='athlete'). */
  athletes: string[];
  /** Team names tagged on the article (categories type='team'). */
  teams: string[];
  /** athleteId → name map for precise player matching. */
  athleteIds: Record<string, string>;
  sport: string | null;
}

interface EspnArticle {
  id?: string | number;
  nowId?: string;
  headline?: string;
  description?: string;
  published?: string;
  lastModified?: string;
  premium?: boolean;
  byline?: string;
  images?: Array<{ url?: string; credit?: string; name?: string }>;
  links?: { web?: { href?: string }; mobile?: { href?: string } };
  categories?: Array<{
    type?: string;
    description?: string;
    athleteId?: number;
    athlete?: { id?: number; description?: string };
    teamId?: number;
    team?: { description?: string };
  }>;
}

// --------------------------------------------------------------------------- cache

interface CacheEntry {
  expires: number;
  articles: NewsArticle[];
}
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): NewsArticle[] | null {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.articles;
  if (hit) cache.delete(key);
  return null;
}
function cacheSet(key: string, articles: NewsArticle[]) {
  // Bounded cache — keep at most 40 entries (LRU-ish via insertion order).
  if (cache.size >= 40) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, articles });
}

// --------------------------------------------------------------------------- fetch

async function fetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        Referer: 'https://www.espn.com/',
      },
      // News pages use ISR; never let Next dedupe multiple sections.
      cache: 'no-store',
    });
    if (!res.ok) {
      console.warn(`[espn-news] ${url} → HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn(`[espn-news] ${url} → ${(e as Error).name}: ${(e as Error).message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeArticle(a: EspnArticle, sport: string | null): NewsArticle | null {
  const id = a.id != null ? String(a.id) : a.nowId;
  const url = a.links?.web?.href || a.links?.mobile?.href;
  const headline = a.headline?.trim();
  if (!id || !url || !headline) return null;

  const athletes: string[] = [];
  const teams: string[] = [];
  const athleteIds: Record<string, string> = {};
  for (const c of a.categories || []) {
    if (c.type === 'athlete') {
      const name = c.athlete?.description || c.description;
      if (name) {
        athletes.push(name);
        const aid = c.athlete?.id ?? c.athleteId;
        if (aid != null) athleteIds[String(aid)] = name;
      }
    } else if (c.type === 'team') {
      const name = c.team?.description || c.description;
      if (name) teams.push(name);
    }
  }

  const img = (a.images || []).find((i) => i.url);
  return {
    id,
    headline,
    description: (a.description || '').trim(),
    url,
    imageUrl: img?.url || null,
    imageCredit: img?.credit || null,
    byline: a.byline || null,
    publishedAt: a.published || a.lastModified || null,
    premium: Boolean(a.premium),
    athletes,
    teams,
    athleteIds,
    sport,
  };
}

function articlesFrom(data: unknown, sport: string | null): NewsArticle[] {
  if (!data || typeof data !== 'object') return [];
  const raw = (data as { articles?: EspnArticle[]; headlines?: EspnArticle[] }).articles
    || (data as { headlines?: EspnArticle[] }).headlines
    || [];
  const out: NewsArticle[] = [];
  for (const a of raw) {
    const n = normalizeArticle(a, sport);
    if (n) out.push(n);
  }
  return out;
}

/** Fetch the per-sport news feed for one ESPN path. */
async function fetchSportPathNews(path: string, limit: number, sport: string | null): Promise<NewsArticle[]> {
  const key = `sport:${path}:${limit}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  for (const base of ESPN_NEWS_HOSTS) {
    const url = `${base}/${path}/news?limit=${limit}`;
    const data = await fetchJson(url);
    const articles = articlesFrom(data, sport);
    if (articles.length > 0) {
      cacheSet(key, articles);
      return articles;
    }
  }
  cacheSet(key, []);
  return [];
}

/** Fetch the general (all-sports) top news feed. */
async function fetchGeneralNews(limit: number): Promise<NewsArticle[]> {
  const key = `general:${limit}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const data = await fetchJson(`${ESPN_GENERAL_NEWS_URL}?limit=${limit}`);
  const articles = articlesFrom(data, null);
  cacheSet(key, articles);
  return articles;
}

// --------------------------------------------------------------------------- public API

/**
 * Latest news for a sport code (NBA, NFL, MLB, ...). Uses SPORT_PATHS — for
 * multi-path sports (SOCCER) the paths are merged, newest-first.
 */
export async function getSportNews(sportCode: string, limit = 10): Promise<NewsArticle[]> {
  const paths = SPORT_PATHS[(sportCode || '').toUpperCase()];
  if (!paths || paths.length === 0) return [];

  // Pull enough per path that the merged list can fill `limit`.
  const perPath = Math.min(25, Math.max(limit, 10));
  const results = await Promise.all(paths.map((p) => fetchSportPathNews(p, perPath, sportCode.toUpperCase())));
  const merged = results.flat();

  merged.sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return tb - ta;
  });

  // De-dup by id across paths (some articles appear in multiple feeds).
  const seen = new Set<string>();
  const deduped: NewsArticle[] = [];
  for (const a of merged) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    deduped.push(a);
  }
  return deduped.slice(0, limit);
}

/** Top headlines across all sports — homepage reel. */
export async function getTopNews(limit = 10): Promise<NewsArticle[]> {
  return fetchGeneralNews(limit);
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** True if the article mentions the player — by ESPN athleteId (exact) or name. */
function articleMentionsPlayer(a: NewsArticle, espnId: string | null, playerName: string): boolean {
  if (espnId && a.athleteIds[espnId]) return true;
  const target = normalizeName(playerName);
  if (!target) return false;
  return a.athletes.some((n) => normalizeName(n) === target);
}

/**
 * News relevant to a player. Matches the sport feed by ESPN athleteId first,
 * then by exact name. Falls back to a broader search across adjacent sports'
 * feeds when the sport feed has no matches (e.g. NCAAB players tagged in NBA
 * draft coverage). Soft-fails to [].
 */
export async function getPlayerNews(
  playerName: string,
  sportCode: string,
  opts: { espnId?: string | number | null; limit?: number } = {}
): Promise<NewsArticle[]> {
  const limit = opts.limit ?? 6;
  const espnId = opts.espnId != null ? String(opts.espnId) : null;
  if (!playerName) return [];

  // Search depth: fetch more than `limit` so filtering still yields results.
  const depth = Math.max(limit * 5, 25);
  const primary = await getSportNews(sportCode, depth);
  const matched = primary.filter((a) => articleMentionsPlayer(a, espnId, playerName));

  if (matched.length > 0) return matched.slice(0, limit);

  // Fallback: cross-sport sweep (draft/trade coverage often lives in the
  // pro-league feed even for college players). Only for sports with paths.
  const sweepSports =
    sportCode.toUpperCase() === 'NCAAB' ? ['NBA', 'WNBA']
    : sportCode.toUpperCase() === 'NCAAF' ? ['NFL']
    : sportCode.toUpperCase() === 'SOCCER' ? ['SOCCER']
    : [];
  for (const s of sweepSports) {
    const articles = await getSportNews(s, depth);
    const hits = articles.filter((a) => articleMentionsPlayer(a, espnId, playerName));
    if (hits.length > 0) return hits.slice(0, limit);
  }

  return [];
}

/** News relevant to a game — articles tagged with either team (or both). */
export async function getGameNews(
  sportCode: string,
  homeTeam: string,
  awayTeam: string,
  limit = 8
): Promise<NewsArticle[]> {
  const home = normalizeName(homeTeam);
  const away = normalizeName(awayTeam);
  if (!home && !away) return [];

  const depth = Math.max(limit * 4, 25);
  const articles = await getSportNews(sportCode, depth);
  const matched = articles.filter(
    (a) =>
      a.teams.some((t) => normalizeName(t) === home) ||
      a.teams.some((t) => normalizeName(t) === away)
  );
  // Team-tagged articles first (most relevant), then newest.
  return matched.slice(0, limit);
}

