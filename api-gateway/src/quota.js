const crypto = require('crypto');
const { query, queryOne } = require('./db');

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

/**
 * Resolve a raw customer API key to its plan + key row.
 * Returns null if not found / inactive / plan not active.
 */
async function authenticateKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') return null;
  const hash = sha256Hex(rawKey.trim());
  const row = await queryOne(
    `SELECT k.id AS key_id, k.active AS key_active, k.plan_id,
            p.plan_type, p.ping_tier_code, p.all_access, p.odds_addon,
            p.overage_enabled, p.overage_price_cents_per_1k,
            p.monthly_ping_quota, p.status AS plan_status
     FROM customer_api_keys k
     JOIN customer_api_plans p ON p.id = k.plan_id
     WHERE k.key_hash = $1
     LIMIT 1`,
    [hash]
  );
  if (!row) return null;
  if (!row.key_active) return null;
  if (!['active', 'trialing', 'past_due'].includes(row.plan_status)) return null;
  return row;
}

/** True if this plan grants access to productCode. */
async function planHasProduct(plan, productCode) {
  if (productCode === 'odds') {
    if (plan.plan_type === 'odds_standalone') return true;
    if (plan.plan_type === 'bundle' && plan.odds_addon) return true;
    return false;
  }
  // sport product
  if (plan.plan_type === 'odds_standalone') return false; // odds-only plan grants nothing else
  if (plan.all_access) return true;
  const row = await queryOne(
    `SELECT 1 FROM customer_api_plan_products WHERE plan_id = $1 AND product_code = $2`,
    [plan.plan_id, productCode]
  );
  return !!row;
}

function currentPeriodBounds(d = new Date()) {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  const fmt = (x) => x.toISOString().slice(0, 10);
  return { periodStart: fmt(start), periodEnd: fmt(end) };
}

/** Effective monthly quota pool for a plan (bundle pool or odds-standalone pool). */
async function effectiveMonthlyQuota(plan) {
  if (plan.plan_type === 'odds_standalone') {
    const p = await queryOne(`SELECT standalone_monthly_pings FROM api_products WHERE code = 'odds'`);
    return Number(p?.standalone_monthly_pings || 0);
  }
  return Number(plan.monthly_ping_quota || 0);
}

/** Get or create this plan's usage period row for the current month. */
async function getOrCreatePeriod(plan) {
  const { periodStart, periodEnd } = currentPeriodBounds();
  const quota = await effectiveMonthlyQuota(plan);
  await query(
    `INSERT INTO api_key_usage_periods (plan_id, period_start, period_end, pings_included, pings_used)
     VALUES ($1, $2, $3, $4, 0)
     ON CONFLICT (plan_id, period_start) DO NOTHING`,
    [plan.plan_id, periodStart, periodEnd, quota]
  );
  return queryOne(
    `SELECT * FROM api_key_usage_periods WHERE plan_id = $1 AND period_start = $2`,
    [plan.plan_id, periodStart]
  );
}

/**
 * Atomically attempt to consume `weight` pings from the plan's current period.
 * Returns { allowed, overage, period } — allowed=false means hard-cutoff (429).
 */
async function consumePings(plan, weight) {
  const period = await getOrCreatePeriod(plan);
  const overageEnabled = !!plan.overage_enabled;
  const overagePricePer1k = plan.overage_price_cents_per_1k || 150;

  // NOTE: overage_cost_cents is recomputed from the *cumulative* overage_pings
  // total each time (ROUND applied once to the running total), not accumulated
  // per-call. Rounding a fractional cent on every single-ping call and summing
  // those rounded values would silently lose money (e.g. 1 ping * $1.50/1000
  // = $0.0015 rounds to 0 every time, so 1000 overage pings would show $0
  // owed instead of $1.50). Recomputing from the running total each write
  // keeps it exact regardless of call granularity.
  const result = await query(
    `UPDATE api_key_usage_periods
     SET pings_used = pings_used + $2,
         overage_pings = overage_pings + (
           CASE WHEN pings_used >= pings_included THEN $2
                ELSE GREATEST(0, pings_used + $2 - pings_included) END
         ),
         status = CASE WHEN pings_used + $2 >= pings_included THEN 'exhausted' ELSE status END
     WHERE id = $1 AND (pings_used + $2 <= pings_included OR $3 = true)
     RETURNING *`,
    [period.id, weight, overageEnabled]
  );

  if (result.rowCount > 0) {
    const row = result.rows[0];
    const newCostCents = Math.round((Number(row.overage_pings) * overagePricePer1k) / 1000);
    await query(`UPDATE api_key_usage_periods SET overage_cost_cents = $2 WHERE id = $1`, [
      period.id,
      newCostCents,
    ]);
    row.overage_cost_cents = newCostCents;
    result.rows[0] = row;
  }

  if (result.rowCount === 0) {
    return { allowed: false, overage: false, period };
  }
  const updated = result.rows[0];
  const wasOverage = Number(updated.pings_used) > Number(updated.pings_included);
  return { allowed: true, overage: wasOverage, period: updated };
}

async function logUsageEvent({ keyId, planId, productCode, endpoint, weight, statusCode }) {
  try {
    await query(
      `INSERT INTO api_key_usage_events (key_id, plan_id, product_code, endpoint, weight, status_code)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [keyId, planId, productCode, endpoint, weight, statusCode]
    );
  } catch (err) {
    console.error('[quota] failed to log usage event', err.message);
  }
}

module.exports = {
  sha256Hex,
  authenticateKey,
  planHasProduct,
  getOrCreatePeriod,
  consumePings,
  logUsageEvent,
  currentPeriodBounds,
};
