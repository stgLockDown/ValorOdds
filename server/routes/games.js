const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

// GET /api/games — list games with optional filters
router.get('/', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const sport = req.query.sport;
  const live = req.query.live === 'true';

  try {
    let query, params;
    if (sport) {
      query = `SELECT * FROM games WHERE LOWER(sport_key) LIKE $1 ORDER BY commence_time DESC LIMIT $2`;
      params = [`%${sport.toLowerCase()}%`, limit];
    } else {
      query = `SELECT * FROM games ORDER BY commence_time DESC LIMIT $1`;
      params = [limit];
    }
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Games list error:', err.message);
    res.json([]);
  }
});

// GET /api/games/scores — live scores
router.get('/scores', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const sport = req.query.sport;

  try {
    // Try live_scores first
    let rows = [];
    try {
      let q = `SELECT * FROM live_scores ORDER BY last_update DESC LIMIT $1`;
      let p = [limit];
      if (sport) {
        q = `SELECT * FROM live_scores WHERE LOWER(sport_key) LIKE $1 ORDER BY last_update DESC LIMIT $2`;
        p = [`%${sport.toLowerCase()}%`, limit];
      }
      const result = await pool.query(q, p);
      rows = result.rows;
    } catch {
      // Fallback: games table
      let q = `SELECT *, updated_at as last_update FROM games ORDER BY commence_time DESC LIMIT $1`;
      let p = [limit];
      if (sport) {
        q = `SELECT *, updated_at as last_update FROM games WHERE LOWER(sport_key) LIKE $1 ORDER BY commence_time DESC LIMIT $2`;
        p = [`%${sport.toLowerCase()}%`, limit];
      }
      const result = await pool.query(q, p);
      rows = result.rows;
    }
    res.json(rows);
  } catch (err) {
    console.error('Scores error:', err.message);
    res.json([]);
  }
});

// GET /api/games/injuries
router.get('/injuries', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM injuries ORDER BY reported_date DESC LIMIT $1`, [limit]
    );
    res.json(rows);
  } catch (err) {
    console.error('Injuries error:', err.message);
    res.json([]);
  }
});

// GET /api/games/news
router.get('/news', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM news ORDER BY published_at DESC LIMIT $1`, [limit]
    );
    res.json(rows);
  } catch (err) {
    console.error('News error:', err.message);
    res.json([]);
  }
});

// GET /api/games/weather
router.get('/weather', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM weather_alerts ORDER BY created_at DESC LIMIT $1`, [limit]
    );
    res.json(rows);
  } catch (err) {
    console.error('Weather error:', err.message);
    res.json([]);
  }
});

// GET /api/games/bookmakers
router.get('/bookmakers', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  try {
    const { rows } = await pool.query(
      `SELECT * FROM bookmakers ORDER BY name ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error('Bookmakers error:', err.message);
    res.json([]);
  }
});

module.exports = router;