const express = require('express');
const router = express.Router();
const {
  sb, an, sportKey,
  extractTodayGames, extractNewsArticles, normalizeGame,
} = require('../lib/apis');

// GET /api/dashboard/stats — aggregate stats for dashboard cards
router.get('/stats', async (req, res) => {
  try {
    const [todayData, sportsData, sbHealth] = await Promise.all([
      an.today(),
      sb.sports(),
      sb.health(),
    ]);

    // Count games today from { leagues: { NBA: { games: [...] }, ... } }
    const allGames = extractTodayGames(todayData);
    const gamesToday = allGames.length;
    const liveGames = allGames.filter(g => g.status === 'In Progress' || g.status === 'Halftime').length;

    // Count sports covered from { total_sports, sports: [{ key, ... }] }
    let sportsCovered = 0;
    if (sportsData && sportsData.sports && Array.isArray(sportsData.sports)) {
      sportsCovered = sportsData.sports.length;
    } else if (sportsData && sportsData.total_sports) {
      sportsCovered = sportsData.total_sports;
    }

    // Try to get arb-like stats from compare for popular sports
    // Sportsbook uses SIMPLE keys: nba, mlb, nfl, nhl
    let activeArbs = 0;
    const leagues = ['nba', 'mlb', 'nfl', 'nhl'];
    for (const league of leagues) {
      const compareData = await sb.compare(league);
      if (compareData && Array.isArray(compareData.comparisons)) {
        activeArbs += compareData.comparisons.length;
      }
    }

    // Sportsbook count from health endpoint
    let totalSportsbooks = 0;
    if (sbHealth && sbHealth.sportsbook_count) {
      totalSportsbooks = sbHealth.sportsbook_count;
    }

    res.json({
      activeArbs,
      avgProfit: 0,
      lowRiskArbs: 0,
      gamesToday,
      liveGames,
      aiAnalyses: 0,
      totalMembers: 0,
      sportsCovered,
      topProfit: 0,
      totalSportsbooks,
    });
  } catch (err) {
    console.error('Dashboard stats error:', err.message);
    res.json({
      activeArbs: 0, avgProfit: 0, lowRiskArbs: 0,
      gamesToday: 0, liveGames: 0, aiAnalyses: 0, totalMembers: 0,
      sportsCovered: 0, topProfit: 0, totalSportsbooks: 0,
    });
  }
});

// GET /api/dashboard/recent-activity — recent events mixed feed
router.get('/recent-activity', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 30);

  try {
    const items = [];

    // Get today's games
    const todayData = await an.today();
    const allGames = extractTodayGames(todayData);

    allGames.slice(0, limit).forEach(g => {
      const home = g.home || {};
      const away = g.away || {};
      items.push({
        type: 'game',
        id: g.id || Math.random().toString(36).slice(2),
        sport_key: (g.league || '').toLowerCase(),
        league: g.league || '',
        home_team: home.team || '',
        away_team: away.team || '',
        home_abbreviation: home.abbreviation || '',
        away_abbreviation: away.abbreviation || '',
        home_logo: home.logo || '',
        away_logo: away.logo || '',
        status: g.status || 'Scheduled',
        home_score: home.score || null,
        away_score: away.score || null,
        venue: g.venue || '',
        created_at: g.date || new Date().toISOString(),
      });
    });

    // Get latest news from a couple of leagues
    const newsLeagues = ['nba', 'mlb'];
    for (const league of newsLeagues) {
      const newsData = await an.news(league);
      const articles = extractNewsArticles(newsData);
      articles.slice(0, 3).forEach(a => {
        items.push({
          type: 'news',
          id: Math.random().toString(36).slice(2),
          sport_key: league,
          headline: a.headline || '',
          summary: a.description || '',
          link: a.url || '',
          author: a.author || '',
          categories: a.categories || [],
          created_at: a.published || new Date().toISOString(),
        });
      });
    }

    // Sort by date descending
    items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(items.slice(0, limit));
  } catch (err) {
    console.error('Recent activity error:', err.message);
    res.json([]);
  }
});

module.exports = router;