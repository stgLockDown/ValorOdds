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

// ── SPORTSBOOK helpers ──────────────────────────────────────────
// Sport keys are SIMPLE: nba, nfl, mlb, nhl (NOT basketball_nba)
const sb = {
  sports:        ()           => fetchJSON(`${SPORTSBOOK}/sports`),
  sportsbooks:   ()           => fetchJSON(`${SPORTSBOOK}/sportsbooks`),
  odds:          (sport)      => fetchJSON(`${SPORTSBOOK}/odds/${encodeURIComponent(sport)}`),
  compare:       (sport)      => fetchJSON(`${SPORTSBOOK}/compare/${encodeURIComponent(sport)}`),
  events:        (sport)      => fetchJSON(`${SPORTSBOOK}/events/${encodeURIComponent(sport)}`),
  live:          (sport)      => fetchJSON(`${SPORTSBOOK}/live/${encodeURIComponent(sport)}`),
  health:        ()           => fetchJSON(`${SPORTSBOOK}/health`),
};

// ── ANALYTICS helpers ───────────────────────────────────────────
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

// Map user-supplied sport strings to the SIMPLE sportsbook API keys
const SPORT_MAP = {
  nfl: 'nfl',
  nba: 'nba',
  mlb: 'mlb',
  nhl: 'nhl',
  ncaaf: 'ncaaf',
  ncaab: 'ncaab',
  mma: 'mma',
  soccer: 'soccer',
  // Also handle long-form keys that might be passed around
  americanfootball_nfl: 'nfl',
  basketball_nba: 'nba',
  baseball_mlb: 'mlb',
  icehockey_nhl: 'nhl',
  basketball_ncaab: 'ncaab',
  americanfootball_ncaaf: 'ncaaf',
  mma_mixed_martial_arts: 'mma',
  soccer_usa_mls: 'soccer',
};

// Normalise a user-supplied sport string to a sportsbook API key
function sportKey(raw) {
  if (!raw) return 'nba';
  const lower = raw.toLowerCase().replace(/\s+/g, '_');
  return SPORT_MAP[lower] || lower;
}

// Normalise to ESPN league code (used for analytics API)
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

/**
 * Extract all games from /espn/today response.
 * Response shape: { date, leagues: { NBA: { games: [...] }, MLB: { games: [...] }, ... }, total_games }
 * Each game: { id, name, short_name, date, status, completed, period, clock,
 *              home: { team, abbreviation, score, record, logo },
 *              away: { team, abbreviation, score, record, logo },
 *              venue, broadcast: [], league }
 */
function extractTodayGames(todayData) {
  const allGames = [];
  if (!todayData) return allGames;

  if (todayData.leagues && typeof todayData.leagues === 'object') {
    // Primary format: { leagues: { NBA: { games: [...] }, ... } }
    Object.values(todayData.leagues).forEach(leagueObj => {
      if (leagueObj && Array.isArray(leagueObj.games)) {
        leagueObj.games.forEach(g => allGames.push(g));
      }
    });
  } else if (Array.isArray(todayData.games)) {
    // Fallback: { games: [...] }
    todayData.games.forEach(g => allGames.push(g));
  } else if (Array.isArray(todayData)) {
    // Fallback: raw array
    todayData.forEach(g => allGames.push(g));
  }

  return allGames;
}

/**
 * Extract games from /espn/scoreboard/{league} response.
 * Response shape: { league, date, total_games, games: [...] }
 * Same game format as today.
 */
function extractScoreboardGames(data) {
  if (!data) return [];
  if (Array.isArray(data.games)) return data.games;
  if (Array.isArray(data)) return data;
  return [];
}

/**
 * Extract articles from /espn/news/{league} response.
 * Response shape: { league, total, articles: [{ headline, description, published, url, author, categories }] }
 */
function extractNewsArticles(data) {
  if (!data) return [];
  if (Array.isArray(data.articles)) return data.articles;
  if (Array.isArray(data)) return data;
  return [];
}

/**
 * Normalise a game object (from today or scoreboard) to a standard flat shape for the frontend.
 * Input: { id, name, short_name, date, status, completed, period, clock,
 *          home: { team, abbreviation, score, record, logo },
 *          away: { team, abbreviation, score, record, logo },
 *          venue, broadcast, league }
 */
function normalizeGame(g) {
  if (!g) return null;
  
  // The analytics API returns pre-processed flat games (not raw ESPN format)
  const home = g.home || {};
  const away = g.away || {};
  
  return {
    id: g.id || Math.random().toString(36).slice(2),
    game_id: g.id || '',
    sport_key: (g.league || '').toLowerCase(),
    league: g.league || '',
    name: g.name || `${away.team || ''} at ${home.team || ''}`,
    short_name: g.short_name || `${away.abbreviation || ''} @ ${home.abbreviation || ''}`,
    home_team: home.team || '',
    away_team: away.team || '',
    home_abbreviation: home.abbreviation || '',
    away_abbreviation: away.abbreviation || '',
    home_score: home.score || null,
    away_score: away.score || null,
    home_record: home.record || '',
    away_record: away.record || '',
    home_logo: home.logo || '',
    away_logo: away.logo || '',
    status: g.status || 'Scheduled',
    completed: g.completed || false,
    is_live: g.status === 'In Progress' || g.status === 'Halftime' || false,
    is_final: g.completed || g.status === 'Final' || false,
    period: g.period || null,
    clock: g.clock || null,
    commence_time: g.date || '',
    venue: g.venue || '',
    broadcast: Array.isArray(g.broadcast) ? g.broadcast.join(', ') : (g.broadcast || ''),
  };
}

module.exports = {
  sb, an, sportKey, espnLeague,
  ANALYTICS, SPORTSBOOK, fetchJSON,
  extractTodayGames, extractScoreboardGames, extractNewsArticles, normalizeGame,
};