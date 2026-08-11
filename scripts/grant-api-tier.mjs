/**
 * Standalone script to grant the highest API tier to a user.
 * Replicates the logic from app/api/admin/api-grant/route.ts
 * but runs directly against the database (no auth session needed).
 *
 * Usage: node scripts/grant-api-tier.mjs <email>
 */
import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
const EMAIL = process.argv[2] || 'lme.twitch@gmail.com';

if (!DATABASE_URL) {
  console.error('DATABASE_URL env var required');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

const INTELLIGENCE_CODES = ['arbitrage', 'steam_moves', 'injuries', 'ai_analysis'];
const HIGHEST_PING_TIER = 't1m';
const HIGHEST_PING_QUOTA = 1_000_000;

function generateRawApiKey() {
  return 'vok_' + crypto.randomBytes(24).toString('base64url');
}

function hashApiKey(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function displayPrefix(raw) {
  return raw.slice(0, 12);
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find the user
    const userRes = await client.query(
      `SELECT id, email, display_name FROM web_users WHERE lower(email) = lower($1)`,
      [EMAIL.toLowerCase()]
    );
    if (userRes.rows.length === 0) {
      throw new Error(`User not found: ${EMAIL}`);
    }
    const user = userRes.rows[0];
    console.log(`Found user: ${user.email} (id=${user.id})`);

    // Check for existing active bundle plan
    const existingRes = await client.query(
      `SELECT id, status FROM customer_api_plans
       WHERE user_id = $1 AND plan_type = 'bundle'
         AND status IN ('active','trialing','past_due')
       LIMIT 1`,
      [user.id]
    );
    const existingPlan = existingRes.rows[0] || null;

    let planId;

    if (existingPlan) {
      console.log(`Upgrading existing plan #${existingPlan.id} (was ${existingPlan.status})`);
      await client.query(
        `UPDATE customer_api_plans SET
           ping_tier_code = $1,
           all_access = TRUE,
           odds_addon = TRUE,
           overage_enabled = TRUE,
           overage_price_cents_per_1k = 0,
           monthly_ping_quota = $2,
           status = 'active',
           cancel_at_period_end = FALSE,
           current_period_start = date_trunc('month', now()),
           current_period_end = (date_trunc('month', now()) + interval '1 month')::date,
           updated_at = NOW()
         WHERE id = $3`,
        [HIGHEST_PING_TIER, HIGHEST_PING_QUOTA, existingPlan.id]
      );
      planId = existingPlan.id;
    } else {
      console.log('Creating new bundle plan with highest tier...');
      const createdRes = await client.query(
        `INSERT INTO customer_api_plans
           (user_id, plan_type, ping_tier_code, all_access, odds_addon,
            overage_enabled, overage_price_cents_per_1k, monthly_ping_quota,
            status, current_period_start, current_period_end)
         VALUES ($1, 'bundle', $2, TRUE, TRUE,
                 TRUE, 0, $3, 'active',
                 date_trunc('month', now()),
                 (date_trunc('month', now()) + interval '1 month')::date)
         RETURNING id`,
        [user.id, HIGHEST_PING_TIER, HIGHEST_PING_QUOTA]
      );
      planId = createdRes.rows[0].id;
    }
    console.log(`Plan ID: ${planId}`);

    // Link all 4 intelligence products
    for (const code of INTELLIGENCE_CODES) {
      await client.query(
        `INSERT INTO customer_api_plan_products (plan_id, product_code)
         VALUES ($1, $2)
         ON CONFLICT (plan_id, product_code) DO NOTHING`,
        [planId, code]
      );
    }
    console.log(`Linked intelligence products: ${INTELLIGENCE_CODES.join(', ')}`);

    // Create/refresh usage period for this month
    const now = new Date();
    const periodStartStr = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const periodEndStr = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);

    await client.query(
      `INSERT INTO api_key_usage_periods
         (plan_id, period_start, period_end, pings_included, pings_used, overage_pings, overage_cost_cents, status)
       VALUES ($1, $2::date, $3::date, $4, 0, 0, 0, 'active')
       ON CONFLICT (plan_id, period_start) DO UPDATE SET
         pings_included = EXCLUDED.pings_included,
         status = 'active'`,
      [planId, periodStartStr, periodEndStr, HIGHEST_PING_QUOTA]
    );
    console.log(`Usage period created: ${periodStartStr} → ${periodEndStr} (${HIGHEST_PING_QUOTA} pings)`);

    // Issue a fresh API key — revoke old ones first
    await client.query(
      `UPDATE customer_api_keys SET active = FALSE, revoked_at = NOW() WHERE plan_id = $1 AND active = TRUE`,
      [planId]
    );

    const rawKey = generateRawApiKey();
    const keyHash = hashApiKey(rawKey);
    const keyPrefix = displayPrefix(rawKey);

    await client.query(
      `INSERT INTO customer_api_keys (plan_id, key_hash, key_prefix, label, active, created_at)
       VALUES ($1, $2, $3, 'admin-grant', TRUE, NOW())`,
      [planId, keyHash, keyPrefix]
    );

    await client.query('COMMIT');

    console.log('\n========================================');
    console.log('✅ API TIER GRANTED SUCCESSFULLY');
    console.log('========================================');
    console.log(`User:         ${user.email}`);
    console.log(`Plan ID:      ${planId}`);
    console.log(`Plan type:    bundle`);
    console.log(`Ping tier:    ${HIGHEST_PING_TIER} (${HIGHEST_PING_QUOTA.toLocaleString()} pings/mo)`);
    console.log(`All access:   true (all 26 sports)`);
    console.log(`Odds addon:   true`);
    console.log(`Overage:      enabled (price = $0)`);
    console.log(`Intelligence: ${INTELLIGENCE_CODES.join(', ')}`);
    console.log(`Status:       active`);
    console.log(`Key prefix:   ${keyPrefix}`);
    console.log(`\n🔑 RAW API KEY (save this — shown only once):`);
    console.log(`   ${rawKey}`);
    console.log('========================================\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Grant failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
