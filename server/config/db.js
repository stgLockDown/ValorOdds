const { Pool } = require('pg');

// Railway can inject the connection string under several variable names
const connectionString =
  process.env.DATABASE_URL ||
  process.env.DATABASE_PRIVATE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRIVATE_URL ||
  process.env.DATABASE_PUBLIC_URL ||
  process.env.POSTGRES_PUBLIC_URL;

if (!connectionString) {
  console.warn('WARNING: No DATABASE_URL (or similar) found. Database operations will fail.');
  console.warn(
    'Available env vars:',
    Object.keys(process.env)
      .filter((k) => k.includes('DATABASE') || k.includes('POSTGRES') || k.includes('PG'))
      .join(', ') || '(none)'
  );
}

const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 10000,
      max: 20,
    })
  : null;

if (pool) {
  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err);
  });
}

const initDB = async () => {
  if (!pool) {
    throw new Error(
      'No database connection string configured. Set DATABASE_URL in Railway environment variables.'
    );
  }

  const client = await pool.connect();
  try {
    console.log('🔌 Connected to PostgreSQL');

    // ── Users table ────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL DEFAULT '',
        role VARCHAR(50) NOT NULL DEFAULT 'user',
        plan VARCHAR(50) NOT NULL DEFAULT 'free',
        stripe_customer_id VARCHAR(255),
        stripe_subscription_id VARCHAR(255),
        subscription_status VARCHAR(50) DEFAULT 'inactive',
        subscription_end TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // ── Add columns if they don't exist (migration-safe) ──
    const colMigrations = [
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(50) NOT NULL DEFAULT 'free'",
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255)',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255)',
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'inactive'",
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_end TIMESTAMP WITH TIME ZONE',
    ];
    for (const q of colMigrations) {
      await client.query(q).catch(() => {});  // ignore if already exists
    }

    // ── Sessions table ─────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL
      )
    `);

    // ── Payments table (Stripe records) ────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        stripe_payment_id VARCHAR(255) UNIQUE,
        stripe_subscription_id VARCHAR(255),
        amount INTEGER NOT NULL DEFAULT 0,
        currency VARCHAR(10) NOT NULL DEFAULT 'usd',
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        plan VARCHAR(50),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // ── Auto-create default admin ──────────────────────
    const adminCheck = await client.query(
      "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
    );
    if (adminCheck.rows.length === 0) {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('admin123', 10);
      await client.query(
        `INSERT INTO users (email, password, name, role, plan, subscription_status)
         VALUES ($1, $2, $3, 'admin', 'vip', 'active')
         ON CONFLICT (email) DO NOTHING`,
        ['admin@valorodds.com', hash, 'Admin']
      );
      console.log('👤 Default admin created → admin@valorodds.com / admin123');
    }

    console.log('✅ Database tables ready');
  } catch (err) {
    console.error('❌ Database init error:', err.message);
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { pool, initDB };