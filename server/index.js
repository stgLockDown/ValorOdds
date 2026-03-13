require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./config/db');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ──────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── API Routes ─────────────────────────────────────────
app.use('/api/auth', authRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
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

// ── Start ──────────────────────────────────────────────
(async () => {
  try {
    await initDB();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`⚡ Valor Odds server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();