const express = require('express');
const router = express.Router();
const {
  sb, an, sportKey, espnLeague,
  extractTodayGames, extractScoreboardGames, extractNewsArticles, normalizeGame,
} = require('../lib/apis');

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
      const games = extractScoreboardGames(data);
      allGames = games.map(g => normalizeGame(g));

      // Also try sportsbook events for odds data
      const sbKey = sportKey(sport);
      const sbData = await sb.events(sbKey);
      if (sbData && Array.isArray(sbData.events)) {
        sbData.events.forEach(ev => {
          // Only add if not already present from ESPN
          const exists = allGames.find(g =>
            g.home_team.toLowerCase().includes((ev.home_team || '').toLowerCase().slice(0, 8))
          );
          if (!exists) {
            allGames.push({
              id: ev.event_id || Math.random().toString(36).slice(2),
              game_id: ev.event_id || '',
              sport_key: sbKey,
              league: ev.league || '',
              name: `${ev.away_team || ''} at ${ev.home_team || ''}`,
              short_name: '',
              home_team: ev.home_team || '',
              away_team: ev.away_team || '',
              home_abbreviation: '',
              away_abbreviation: '',
              home_score: null,
              away_score: null,
              home_record: '',
              away_record: '',
              home_logo: '',
              away_logo: '',
              status: ev.is_live ? 'In Progress' : 'Scheduled',
              completed: false,
              is_live: ev.is_live || false,
              is_final: false,
              period: null,
              clock: null,
              commence_time: ev.start_time || '',
              venue: '',
              broadcast: '',
              has_odds: true,
              num_sportsbooks: ev.num_sportsbooks || 0,
            });
          }
        });
      }
    } else {
      // No sport filter — get today's games from ESPN
      const data = await an.today();
      const games = extractTodayGames(data);
      allGames = games.map(g => normalizeGame(g));
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
      const games = extractScoreboardGames(data);
      games.forEach(g => {
        const home = g.home || {};
        const away = g.away || {};
        allScores.push({
          id: g.id,
          sport_key: league,
          league: g.league || league.toUpperCase(),
          name: g.name || '',
          short_name: g.short_name || '',
          home_team: home.team || '',
          away_team: away.team || '',
          home_abbreviation: home.abbreviation || '',
          away_abbreviation: away.abbreviation || '',
          home_score: home.score || '0',
          away_score: away.score || '0',
          home_record: home.record || '',
          away_record: away.record || '',
          home_logo: home.logo || '',
          away_logo: away.logo || '',
          status: g.status || 'Scheduled',
          is_live: g.status === 'In Progress' || g.status === 'Halftime',
          is_final: g.completed || g.status === 'Final',
          period: g.period || null,
          clock: g.clock || null,
          last_update: g.date || new Date().toISOString(),
          venue: g.venue || '',
          broadcast: Array.isArray(g.broadcast) ? g.broadcast.join(', ') : (g.broadcast || ''),
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
      const articles = extractNewsArticles(data);
      articles.forEach(a => {
        allNews.push({
          id: Math.random().toString(36).slice(2),
          sport_key: league,
          headline: a.headline || '',
          description: a.description || '',
          link: a.url || '',
          image: '',
          published_at: a.published || new Date().toISOString(),
          author: a.author || '',
          categories: a.categories || [],
          source: 'ESPN',
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
    // Response: { total, sportsbooks: [{ name, type, region, description }] }
    if (data && Array.isArray(data.sportsbooks)) {
      res.json(data.sportsbooks.map(b => ({
        id: b.name,
        name: b.name || '',
        type: b.type || '',
        region: b.region || '',
        description: b.description || '',
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

module.exports = router;