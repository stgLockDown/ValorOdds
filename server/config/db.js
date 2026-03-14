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
    'DB-related env vars available:',
    Object.keys(process.env)
      .filter((k) => k.includes('DATABASE') || k.includes('POSTGRES') || k.includes('PG'))
      .join(', ') || '(none)'
  );
} else {
  console.log('🔗 Database connection string found');
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

  let client;
  try {
    client = await pool.connect();
    console.log('🔌 Connected to PostgreSQL');
  } catch (err) {
    console.error('❌ Failed to connect to PostgreSQL:', err.message);
    throw err;
  }

  try {
    // ── 1. Drop and recreate if the table schema is wrong ──
    // Check if users table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'users'
      )
    `);
    
    const usersTableExists = tableCheck.rows[0].exists;
    console.log(`📋 Users table exists: ${usersTableExists}`);

    if (!usersTableExists) {
      // Create fresh users table with all columns
      console.log('📦 Creating users table...');
      await client.query(`
        CREATE TABLE users (
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
      console.log('✅ Users table created');
    } else {
      // Table exists – run migrations to add missing columns
      console.log('🔄 Running column migrations on existing users table...');
      const migrations = [
        { col: 'plan', sql: "ALTER TABLE users ADD COLUMN plan VARCHAR(50) NOT NULL DEFAULT 'free'" },
        { col: 'stripe_customer_id', sql: 'ALTER TABLE users ADD COLUMN stripe_customer_id VARCHAR(255)' },
        { col: 'stripe_subscription_id', sql: 'ALTER TABLE users ADD COLUMN stripe_subscription_id VARCHAR(255)' },
        { col: 'subscription_status', sql: "ALTER TABLE users ADD COLUMN subscription_status VARCHAR(50) DEFAULT 'inactive'" },
        { col: 'subscription_end', sql: 'ALTER TABLE users ADD COLUMN subscription_end TIMESTAMP WITH TIME ZONE' },
        { col: 'updated_at', sql: 'ALTER TABLE users ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()' },
      ];

      for (const m of migrations) {
        // Check if column exists first
        const colCheck = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'users' AND column_name = $1
          )
        `, [m.col]);

        if (!colCheck.rows[0].exists) {
          try {
            await client.query(m.sql);
            console.log(`  ✅ Added column: ${m.col}`);
          } catch (err) {
            console.error(`  ⚠️  Failed to add column ${m.col}:`, err.message);
          }
        } else {
          console.log(`  ✓ Column exists: ${m.col}`);
        }
      }
    }

    // ── 2. Sessions table ──────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL
      )
    `);
    console.log('✅ user_sessions table ready');

    // ── 3. Payments table ──────────────────────────────
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
    console.log('✅ payments table ready');

    // ── 4. Auto-create default admin ───────────────────
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
    } else {
      console.log('👤 Admin user already exists');
    }

    // ── 5. Log current users count ─────────────────────
    const countResult = await client.query('SELECT COUNT(*) as count FROM users');
    console.log(`📊 Total users in database: ${countResult.rows[0].count}`);

    console.log('✅ Database fully initialised');
  } catch (err) {
    console.error('❌ Database init error:', err.message);
    console.error('   Full error:', err);
    throw err;
  } finally {
    if (client) client.release();
  }
};

module.exports = { pool, initDB };