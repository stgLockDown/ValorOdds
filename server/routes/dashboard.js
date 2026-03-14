const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

// GET /api/dashboard/stats — aggregate stats for dashboard cards
router.get('/stats', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    const results = {};

    // Active arbitrage count
    try {
      const arbRes = await pool.query(
        `SELECT COUNT(*) as cnt FROM arbitrage_opportunities WHERE created_at > NOW() - INTERVAL '24 hours'`
      );
      results.activeArbs = parseInt(arbRes.rows[0]?.cnt || 0);
    } catch { results.activeArbs = 0; }

    // Average profit %
    try {
      const avgRes = await pool.query(
        `SELECT COALESCE(AVG(profit_percentage), 0) as avg_profit FROM arbitrage_opportunities WHERE created_at > NOW() - INTERVAL '24 hours' AND profit_percentage > 0`
      );
      results.avgProfit = parseFloat(parseFloat(avgRes.rows[0]?.avg_profit || 0).toFixed(2));
    } catch { results.avgProfit = 0; }

    // Low risk count
    try {
      const lowRes = await pool.query(
        `SELECT COUNT(*) as cnt FROM arbitrage_opportunities WHERE created_at > NOW() - INTERVAL '24 hours' AND (risk_level = 'low' OR risk_level = 'ideal' OR profit_percentage BETWEEN 0.5 AND 3.0)`
      );
      results.lowRiskArbs = parseInt(lowRes.rows[0]?.cnt || 0);
    } catch { results.lowRiskArbs = 0; }

    // Games today
    try {
      const gamesRes = await pool.query(
        `SELECT COUNT(*) as cnt FROM games WHERE commence_time::date = CURRENT_DATE OR updated_at > NOW() - INTERVAL '24 hours'`
      );
      results.gamesToday = parseInt(gamesRes.rows[0]?.cnt || 0);
    } catch { results.gamesToday = 0; }

    // AI analyses today
    try {
      const aiRes = await pool.query(
        `SELECT COUNT(*) as cnt FROM ai_analysis WHERE created_at > NOW() - INTERVAL '24 hours'`
      );
      results.aiAnalyses = parseInt(aiRes.rows[0]?.cnt || 0);
    } catch { results.aiAnalyses = 0; }

    // Total members (users)
    try {
      const usersRes = await pool.query(`SELECT COUNT(*) as cnt FROM users`);
      results.totalMembers = parseInt(usersRes.rows[0]?.cnt || 0);
    } catch { results.totalMembers = 0; }

    // Sports covered
    try {
      const sportsRes = await pool.query(
        `SELECT COUNT(DISTINCT sport_key) as cnt FROM games`
      );
      results.sportsCovered = parseInt(sportsRes.rows[0]?.cnt || 0);
    } catch { results.sportsCovered = 0; }

    // Top profit arb
    try {
      const topRes = await pool.query(
        `SELECT MAX(profit_percentage) as top FROM arbitrage_opportunities WHERE created_at > NOW() - INTERVAL '24 hours'`
      );
      results.topProfit = parseFloat(parseFloat(topRes.rows[0]?.top || 0).toFixed(2));
    } catch { results.topProfit = 0; }

    res.json(results);
  } catch (err) {
    console.error('Dashboard stats error:', err.message);
    res.json({
      activeArbs: 0, avgProfit: 0, lowRiskArbs: 0,
      gamesToday: 0, aiAnalyses: 0, totalMembers: 0,
      sportsCovered: 0, topProfit: 0,
    });
  }
});

// GET /api/dashboard/recent-activity — recent arbs + analysis mixed
router.get('/recent-activity', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const limit = Math.min(parseInt(req.query.limit) || 10, 30);

  try {
    const items = [];

    try {
      const arbRes = await pool.query(
        `SELECT id, sport_key, home_team, away_team, profit_percentage, bookmaker_home, bookmaker_away, created_at
         FROM arbitrage_opportunities ORDER BY created_at DESC LIMIT $1`, [limit]
      );
      arbRes.rows.forEach(r => items.push({ type: 'arbitrage', ...r }));
    } catch {}

    try {
      const aiRes = await pool.query(
        `SELECT id, sport, analysis_type, summary, confidence_score, created_at
         FROM ai_analysis ORDER BY created_at DESC LIMIT $1`, [limit]
      );
      aiRes.rows.forEach(r => items.push({ type: 'ai_analysis', ...r }));
    } catch {}

    items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(items.slice(0, limit));
  } catch (err) {
    console.error('Recent activity error:', err.message);
    res.json([]);
  }
});

module.exports = router;