const express = require('express');
const router = express.Router();
const { sb, an, sportKey, espnLeague } = require('../lib/apis');

// GET /api/dashboard/stats — aggregate stats for dashboard cards
router.get('/stats', async (req, res) => {
  try {
    const [todayData, sportsData, sbHealth] = await Promise.all([
      an.today(),
      sb.sports(),
      sb.health(),
    ]);

    // Count games today across all leagues
    let gamesToday = 0;
    if (todayData && typeof todayData === 'object') {
      // todayData might be { nba: [...], mlb: [...], ... } or { games: [...] }
      if (Array.isArray(todayData)) {
        gamesToday = todayData.length;
      } else if (todayData.games) {
        gamesToday = Array.isArray(todayData.games) ? todayData.games.length : 0;
      } else {
        // Count across all league keys
        Object.values(todayData).forEach(v => {
          if (Array.isArray(v)) gamesToday += v.length;
        });
      }
    }

    // Count sports covered
    let sportsCovered = 0;
    if (Array.isArray(sportsData)) {
      sportsCovered = sportsData.length;
    } else if (sportsData && sportsData.sports) {
      sportsCovered = Array.isArray(sportsData.sports) ? sportsData.sports.length : 0;
    }

    // Try to get arb-like stats from compare for a popular sport
    let activeArbs = 0;
    let avgProfit = 0;
    let topProfit = 0;
    let lowRiskArbs = 0;

    // Fetch compare data for NBA and MLB to find line discrepancies
    const leagues = ['basketball_nba', 'baseball_mlb', 'americanfootball_nfl', 'icehockey_nhl'];
    for (const league of leagues) {
      const compareData = await sb.compare(league);
      if (compareData && Array.isArray(compareData)) {
        compareData.forEach(ev => {
          if (ev.best_lines || ev.bestLines || ev.opportunities) {
            activeArbs++;
          }
        });
      } else if (compareData && compareData.events) {
        activeArbs += Array.isArray(compareData.events) ? compareData.events.length : 0;
      }
    }

    // Sportsbook count from health endpoint
    let totalSportsbooks = 0;
    if (sbHealth && sbHealth.sportsbook_count) {
      totalSportsbooks = sbHealth.sportsbook_count;
    } else if (sbHealth && sbHealth.sportsbooks) {
      totalSportsbooks = sbHealth.sportsbooks;
    }

    res.json({
      activeArbs,
      avgProfit,
      lowRiskArbs,
      gamesToday,
      aiAnalyses: 0, // Will increment as users use AI features
      totalMembers: 0, // Can still come from local DB if needed
      sportsCovered,
      topProfit,
      totalSportsbooks,
    });
  } catch (err) {
    console.error('Dashboard stats error:', err.message);
    res.json({
      activeArbs: 0, avgProfit: 0, lowRiskArbs: 0,
      gamesToday: 0, aiAnalyses: 0, totalMembers: 0,
      sportsCovered: 0, topProfit: 0, totalSportsbooks: 0,
    });
  }
});

// GET /api/dashboard/recent-activity — recent events mixed feed
router.get('/recent-activity', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 30);

  try {
    const items = [];

    // Get today's ESPN data for recent activity
    const todayData = await an.today();
    if (todayData) {
      const allGames = [];
      if (Array.isArray(todayData)) {
        allGames.push(...todayData);
      } else if (todayData.games) {
        allGames.push(...(Array.isArray(todayData.games) ? todayData.games : []));
      } else {
        Object.entries(todayData).forEach(([league, games]) => {
          if (Array.isArray(games)) {
            games.forEach(g => allGames.push({ ...g, league }));
          }
        });
      }

      allGames.slice(0, limit).forEach(g => {
        items.push({
          type: 'game',
          id: g.id || g.game_id || Math.random().toString(36).slice(2),
          sport_key: g.league || g.sport || 'sports',
          home_team: g.home_team || g.homeTeam || g.home || '',
          away_team: g.away_team || g.awayTeam || g.away || '',
          status: g.status || g.state || 'scheduled',
          home_score: g.home_score || g.homeScore || null,
          away_score: g.away_score || g.awayScore || null,
          created_at: g.date || g.start_time || new Date().toISOString(),
        });
      });
    }

    // Get latest news from ESPN
    const newsLeagues = ['nba', 'mlb', 'nfl', 'nhl'];
    for (const league of newsLeagues.slice(0, 2)) {
      const newsData = await an.news(league);
      if (newsData && Array.isArray(newsData)) {
        newsData.slice(0, 3).forEach(n => {
          items.push({
            type: 'news',
            id: n.id || Math.random().toString(36).slice(2),
            sport_key: league,
            headline: n.headline || n.title || '',
            summary: n.description || n.summary || '',
            link: n.link || n.url || '',
            created_at: n.published || n.date || new Date().toISOString(),
          });
        });
      } else if (newsData && newsData.articles) {
        newsData.articles.slice(0, 3).forEach(n => {
          items.push({
            type: 'news',
            id: n.id || Math.random().toString(36).slice(2),
            sport_key: league,
            headline: n.headline || n.title || '',
            summary: n.description || n.summary || '',
            link: n.link || n.url || '',
            created_at: n.published || n.date || new Date().toISOString(),
          });
        });
      }
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