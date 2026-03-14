const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'valor-odds-secret-key-change-me';

// Auth middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
};

// GET /api/user/profile
router.get('/profile', auth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  try {
    const { rows } = await pool.query(
      `SELECT id, email, name, role, plan, subscription_status, created_at FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/user/profile — update name
router.put('/profile', auth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const { name } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE users SET name = $1 WHERE id = $2 RETURNING id, email, name, role, plan`,
      [name, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/user/password — change password
router.put('/password', auth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be 6+ chars' });

  try {
    const { rows } = await pool.query(`SELECT password_hash FROM users WHERE id = $1`, [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) return res.status(400).json({ error: 'Current password incorrect' });

    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, req.user.id]);
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/user/betting-history — placeholder for bet tracking
router.get('/betting-history', auth, async (req, res) => {
  // This will eventually tie into a bets table; for now return empty
  res.json([]);
});

module.exports = router;