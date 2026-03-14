const express = require('express');
const router = express.Router();
const { sb, an, sportKey, espnLeague } = require('../lib/apis');

// GET /api/games — list games with optional sport filter
router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const sport = req.query.sport;

  try {
    let allGames = [];

    if (sport) {
      // Fetch from ESPN scoreboard for specific league
      const league = espnLeague(sport);
      const data = await an.scoreboard(league);
      if (data) {
        const events = data.events || data.games || (Array.isArray(data) ? data : []);
        events.forEach(ev => {
          const comp = ev.competitions?.[0];
          const home = comp?.competitors?.find(c => c.homeAway === 'home');
          const away = comp?.competitors?.find(c => c.homeAway === 'away');
          allGames.push({
            id: ev.id,
            game_id: ev.id,
            sport_key: league,
            home_team: home?.team?.displayName || home?.team?.name || '',
            away_team: away?.team?.displayName || away?.team?.name || '',
            home_score: home?.score || null,
            away_score: away?.score || null,
            status: ev.status?.type?.description || comp?.status?.type?.description || 'scheduled',
            status_detail: ev.status?.type?.detail || comp?.status?.type?.detail || '',
            is_live: ev.status?.type?.state === 'in' || false,
            is_final: ev.status?.type?.completed || false,
            commence_time: ev.date || ev.startDate || '',
            venue: comp?.venue?.fullName || '',
          });
        });
      }

      // Also try sportsbook events for odds data
      const sbKey = sportKey(sport);
      const sbData = await sb.events(sbKey);
      if (sbData && Array.isArray(sbData)) {
        sbData.forEach(ev => {
          // Only add if not already present from ESPN
          const exists = allGames.find(g =>
            g.home_team.toLowerCase().includes((ev.home_team || '').toLowerCase().slice(0, 6))
          );
          if (!exists) {
            allGames.push({
              id: ev.id || ev.event_id,
              game_id: ev.id || ev.event_id,
              sport_key: ev.sport_key || sbKey,
              home_team: ev.home_team || '',
              away_team: ev.away_team || '',
              commence_time: ev.commence_time || '',
              status: 'scheduled',
              is_live: false,
              bookmakers: ev.bookmakers || [],
            });
          }
        });
      }
    } else {
      // No sport filter — get today's games from ESPN
      const data = await an.today();
      if (data) {
        if (Array.isArray(data)) {
          allGames = data.map(g => normalizeGame(g));
        } else if (data.games) {
          allGames = (Array.isArray(data.games) ? data.games : []).map(g => normalizeGame(g));
        } else {
          Object.entries(data).forEach(([league, games]) => {
            if (Array.isArray(games)) {
              games.forEach(g => allGames.push(normalizeGame({ ...g, league })));
            }
          });
        }
      }
    }

    res.json(allGames.slice(0, limit));
  } catch (err) {
    console.error('Games list error:', err.message);
    res.json([]);
  }
});

// GET /api/games/scores — live scores
router.get('/scores', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const sport = req.query.sport;

  try {
    const leagues = sport
      ? [espnLeague(sport)]
      : ['nba', 'mlb', 'nfl', 'nhl'];

    const allScores = [];
    for (const league of leagues) {
      const data = await an.scoreboard(league);
      if (!data) continue;

      const events = data.events || data.games || (Array.isArray(data) ? data : []);
      events.forEach(ev => {
        const comp = ev.competitions?.[0];
        const home = comp?.competitors?.find(c => c.homeAway === 'home');
        const away = comp?.competitors?.find(c => c.homeAway === 'away');
        allScores.push({
          id: ev.id,
          sport_key: league,
          home_team: home?.team?.displayName || home?.team?.name || '',
          away_team: away?.team?.displayName || away?.team?.name || '',
          home_score: home?.score || '0',
          away_score: away?.score || '0',
          status: ev.status?.type?.description || 'scheduled',
          status_detail: ev.status?.type?.detail || '',
          is_live: ev.status?.type?.state === 'in',
          is_final: ev.status?.type?.completed || false,
          period: ev.status?.period || null,
          clock: ev.status?.displayClock || null,
          last_update: ev.date || new Date().toISOString(),
          venue: comp?.venue?.fullName || '',
          broadcast: comp?.broadcasts?.[0]?.names?.[0] || '',
        });
      });
    }

    res.json(allScores.slice(0, limit));
  } catch (err) {
    console.error('Scores error:', err.message);
    res.json([]);
  }
});

// GET /api/games/news — latest sports news
router.get('/news', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const sport = req.query.sport;

  try {
    const leagues = sport
      ? [espnLeague(sport)]
      : ['nba', 'mlb', 'nfl', 'nhl'];

    const allNews = [];
    for (const league of leagues) {
      const data = await an.news(league);
      if (!data) continue;

      const articles = data.articles || (Array.isArray(data) ? data : []);
      articles.forEach(a => {
        allNews.push({
          id: a.id || Math.random().toString(36).slice(2),
          sport_key: league,
          headline: a.headline || a.title || '',
          description: a.description || a.summary || '',
          link: a.links?.web?.href || a.link || a.url || '',
          image: a.images?.[0]?.url || a.image || '',
          published_at: a.published || a.date || new Date().toISOString(),
          source: a.source || 'ESPN',
        });
      });
    }

    allNews.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
    res.json(allNews.slice(0, limit));
  } catch (err) {
    console.error('News error:', err.message);
    res.json([]);
  }
});

// GET /api/games/injuries — not available from these APIs, return empty
router.get('/injuries', async (_req, res) => {
  res.json([]);
});

// GET /api/games/weather — not available from these APIs, return empty
router.get('/weather', async (_req, res) => {
  res.json([]);
});

// GET /api/games/bookmakers — list all sportsbooks
router.get('/bookmakers', async (_req, res) => {
  try {
    const data = await sb.sportsbooks();
    if (Array.isArray(data)) {
      res.json(data.map(b => ({
        id: b.key || b.id || b.name,
        name: b.title || b.name || b.key || '',
        key: b.key || '',
        active: true,
      })));
    } else if (data && data.sportsbooks) {
      res.json(data.sportsbooks.map(b => ({
        id: b.key || b.id || b.name,
        name: b.title || b.name || b.key || '',
        key: b.key || '',
        active: true,
      })));
    } else {
      res.json([]);
    }
  } catch (err) {
    console.error('Bookmakers error:', err.message);
    res.json([]);
  }
});

// Helper: normalise various game formats to a standard shape
function normalizeGame(g) {
  // ESPN event format
  if (g.competitions) {
    const comp = g.competitions[0];
    const home = comp?.competitors?.find(c => c.homeAway === 'home');
    const away = comp?.competitors?.find(c => c.homeAway === 'away');
    return {
      id: g.id,
      game_id: g.id,
      sport_key: g.league || g.sport || '',
      home_team: home?.team?.displayName || '',
      away_team: away?.team?.displayName || '',
      home_score: home?.score || null,
      away_score: away?.score || null,
      status: g.status?.type?.description || 'scheduled',
      status_detail: g.status?.type?.detail || '',
      is_live: g.status?.type?.state === 'in',
      is_final: g.status?.type?.completed || false,
      commence_time: g.date || '',
      venue: comp?.venue?.fullName || '',
    };
  }
  // Simple flat format
  return {
    id: g.id || g.game_id || Math.random().toString(36).slice(2),
    game_id: g.id || g.game_id || '',
    sport_key: g.league || g.sport || g.sport_key || '',
    home_team: g.home_team || g.homeTeam || g.home || '',
    away_team: g.away_team || g.awayTeam || g.away || '',
    home_score: g.home_score || g.homeScore || null,
    away_score: g.away_score || g.awayScore || null,
    status: g.status || g.state || 'scheduled',
    status_detail: g.status_detail || '',
    is_live: g.is_live || g.isLive || false,
    is_final: g.is_final || g.isFinal || false,
    commence_time: g.commence_time || g.date || g.start_time || '',
    venue: g.venue || '',
  };
}

module.exports = router;