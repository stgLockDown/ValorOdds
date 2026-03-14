/**
 * Shared helpers for fetching from the two external APIs.
 *
 * ANALYTICS_API  → sports-analytics-api-production.up.railway.app
 * SPORTSBOOK_API → sportsbook-api-production-296e.up.railway.app
 */

const ANALYTICS  = 'https://sports-analytics-api-production.up.railway.app';
const SPORTSBOOK = 'https://sportsbook-api-production-296e.up.railway.app';

async function fetchJSON(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    if (!res.ok) {
      console.error(`API ${res.status} → ${url}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`API fetch error → ${url}:`, err.message);
    return null;
  }
}

// ── SPORTSBOOK helpers ──────────────────────────────────────
const sb = {
  sports:        ()           => fetchJSON(`${SPORTSBOOK}/sports`),
  sportsbooks:   ()           => fetchJSON(`${SPORTSBOOK}/sportsbooks`),
  odds:          (sport)      => fetchJSON(`${SPORTSBOOK}/odds/${encodeURIComponent(sport)}`),
  compare:       (sport)      => fetchJSON(`${SPORTSBOOK}/compare/${encodeURIComponent(sport)}`),
  events:        (sport)      => fetchJSON(`${SPORTSBOOK}/events/${encodeURIComponent(sport)}`),
  live:          (sport)      => fetchJSON(`${SPORTSBOOK}/live/${encodeURIComponent(sport)}`),
  health:        ()           => fetchJSON(`${SPORTSBOOK}/health`),
};

// ── ANALYTICS helpers ───────────────────────────────────────
const an = {
  scoreboard:    (league)     => fetchJSON(`${ANALYTICS}/espn/scoreboard/${encodeURIComponent(league)}`),
  news:          (league)     => fetchJSON(`${ANALYTICS}/espn/news/${encodeURIComponent(league)}`),
  standings:     (league)     => fetchJSON(`${ANALYTICS}/espn/standings/${encodeURIComponent(league)}`),
  today:         ()           => fetchJSON(`${ANALYTICS}/espn/today`),
  // POST endpoints
  analyze:       (body)       => fetchJSON(`${ANALYTICS}/analyze`,    { method: 'POST', body: JSON.stringify(body) }),
  summarize:     (body)       => fetchJSON(`${ANALYTICS}/summarize`,  { method: 'POST', body: JSON.stringify(body) }),
  ask:           (body)       => fetchJSON(`${ANALYTICS}/ask`,        { method: 'POST', body: JSON.stringify(body) }),
  oddsAI:        (sport,body) => fetchJSON(`${ANALYTICS}/sportsbook/odds-ai/${encodeURIComponent(sport)}`,       { method: 'POST', body: JSON.stringify(body || {}) }),
  compareAI:     (sport,body) => fetchJSON(`${ANALYTICS}/sportsbook/compare-ai/${encodeURIComponent(sport)}`,    { method: 'POST', body: JSON.stringify(body || {}) }),
  liveAI:        (sport,body) => fetchJSON(`${ANALYTICS}/sportsbook/live-ai/${encodeURIComponent(sport)}`,       { method: 'POST', body: JSON.stringify(body || {}) }),
  bestBetsAI:    (sport,body) => fetchJSON(`${ANALYTICS}/sportsbook/best-bets-ai/${encodeURIComponent(sport)}`,  { method: 'POST', body: JSON.stringify(body || {}) }),
  bestBets:      (sport)      => fetchJSON(`${ANALYTICS}/sportsbook/best-bets/${encodeURIComponent(sport)}`),
};

// Map sport labels to API keys
const SPORT_MAP = {
  nfl: 'americanfootball_nfl',
  nba: 'basketball_nba',
  mlb: 'baseball_mlb',
  nhl: 'icehockey_nhl',
  ncaaf: 'americanfootball_ncaaf',
  ncaab: 'basketball_ncaab',
  mma: 'mma_mixed_martial_arts',
  soccer: 'soccer_usa_mls',
};

// Normalise a user-supplied sport string to a sportsbook API key
function sportKey(raw) {
  if (!raw) return 'basketball_nba';
  const lower = raw.toLowerCase().replace(/\s+/g, '_');
  return SPORT_MAP[lower] || lower;
}

// Normalise to ESPN league code
function espnLeague(raw) {
  if (!raw) return 'nba';
  const lower = raw.toLowerCase();
  if (lower.includes('nfl') || lower.includes('football'))   return 'nfl';
  if (lower.includes('nba') || lower.includes('basketball')) return 'nba';
  if (lower.includes('mlb') || lower.includes('baseball'))   return 'mlb';
  if (lower.includes('nhl') || lower.includes('hockey'))     return 'nhl';
  if (lower.includes('ncaa') && lower.includes('f'))         return 'college-football';
  if (lower.includes('ncaa') && lower.includes('b'))         return 'mens-college-basketball';
  if (lower.includes('soccer') || lower.includes('mls'))     return 'mls';
  return lower;
}

module.exports = { sb, an, sportKey, espnLeague, ANALYTICS, SPORTSBOOK, fetchJSON };