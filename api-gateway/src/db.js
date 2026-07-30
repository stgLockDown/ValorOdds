const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('[db] unexpected pool error', err);
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function queryOne(text, params = []) {
  const r = await query(text, params);
  return r.rows[0] || null;
}

module.exports = { pool, query, queryOne };
