require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./config/db');
const authRoutes = require('./routes/auth');
const stripeRoutes = require('./routes/stripe');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ──────────────────────────────────────────
app.use(cors());

// Stripe webhook needs raw body – must come BEFORE express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

// JSON body parser for everything else
app.use(express.json());

// ── API Routes ─────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/stripe', stripeRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// Debug endpoint to check DB status (remove in production if desired)
app.get('/api/debug/db', async (_req, res) => {
  const { pool } = require('./config/db');
  if (!pool) {
    return res.json({ connected: false, reason: 'No connection string' });
  }
  try {
    const result = await pool.query('SELECT NOW() as time, current_database() as db');
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' ORDER BY table_name
    `);
    const userCount = await pool.query('SELECT COUNT(*) as count FROM users').catch(() => ({ rows: [{ count: 'table not found' }] }));
    res.json({
      connected: true,
      time: result.rows[0].time,
      database: result.rows[0].db,
      tables: tables.rows.map(r => r.table_name),
      userCount: userCount.rows[0].count,
    });
  } catch (err) {
    res.json({ connected: false, error: err.message });
  }
});

// ── Serve React build in production ────────────────────
const buildPath = path.join(__dirname, '..', 'build');
app.use(express.static(buildPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

// ── Error handler ──────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start server FIRST, then initialise DB ─────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`⚡ Valor Odds server listening on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Health check: http://0.0.0.0:${PORT}/api/health`);

  // Initialise DB in the background – don't block the server
  console.log('🔄 Starting database initialisation...');
  initDB()
    .then(() => console.log('✅ Database initialised successfully'))
    .catch((err) => {
      console.error('⚠️  Database init failed (server still running):', err.message);
      console.error('   Auth/payment endpoints will fail until database is properly connected.');
      console.error('   Check your DATABASE_URL environment variable in Railway.');
    });
});