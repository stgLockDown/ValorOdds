const { Pool } = require('pg');

// Railway injects DATABASE_URL automatically when a Postgres plugin is attached
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
  console.warn('WARNING: No DATABASE_URL found. Database operations will fail.');
}

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
  max: 20,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

const initDB = async () => {
  const client = await pool.connect();
  try {
    console.log('🔌 Connected to PostgreSQL');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL DEFAULT '',
        role VARCHAR(50) NOT NULL DEFAULT 'user',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL
      )
    `);

    // Check for admin
    const adminCheck = await client.query(
      "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
    );
    if (adminCheck.rows.length === 0) {
      // Auto-create default admin  (password: admin123)
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('admin123', 10);
      await client.query(
        `INSERT INTO users (email, password, name, role)
         VALUES ($1, $2, $3, 'admin')
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