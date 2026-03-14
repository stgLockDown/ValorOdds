const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { JWT_SECRET, authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Helper: check pool is available
const requireDB = (_req, res) => {
  if (!pool) {
    res.status(503).json({ error: 'Database is not connected. Please try again shortly.' });
    return false;
  }
  return true;
};

// POST /api/auth/register
router.post('/register', async (req, res) => {
  if (!requireDB(req, res)) return;

  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [
      email.toLowerCase(),
    ]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password, name, role, plan, subscription_status)
       VALUES ($1, $2, $3, 'user', 'free', 'inactive')
       RETURNING id, email, name, role, plan, subscription_status, created_at`,
      [email.toLowerCase(), hash, name]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    console.log(`✅ New user registered: ${user.email} (id: ${user.id})`);

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        plan: user.plan,
        subscription_status: user.subscription_status,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  if (!requireDB(req, res)) return;

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [
      email.toLowerCase(),
    ]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    console.log(`✅ User logged in: ${user.email}`);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        plan: user.plan,
        subscription_status: user.subscription_status,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  if (!requireDB(req, res)) return;

  try {
    const result = await pool.query(
      'SELECT id, email, name, role, plan, subscription_status, subscription_end, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// PUT /api/auth/profile  – update name / password
router.put('/profile', authMiddleware, async (req, res) => {
  if (!requireDB(req, res)) return;

  try {
    const { name, currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

    // If changing password, verify current one
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required to set a new one' });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
      }
      const userResult = await pool.query('SELECT password FROM users WHERE id = $1', [userId]);
      const valid = await bcrypt.compare(currentPassword, userResult.rows[0].password);
      if (!valid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
      const hash = await bcrypt.hash(newPassword, 10);
      await pool.query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [
        hash,
        userId,
      ]);
    }

    if (name) {
      await pool.query('UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2', [
        name,
        userId,
      ]);
    }

    const result = await pool.query(
      'SELECT id, email, name, role, plan, subscription_status, subscription_end FROM users WHERE id = $1',
      [userId]
    );

    res.json({ user: result.rows[0], message: 'Profile updated successfully' });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;