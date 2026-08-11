import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { query, queryOne, tx } from '@/lib/db';
import { issueApiKeyForPlan } from '@/lib/api-monetization/keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin-only endpoint to grant a user the highest API tier with everything
 * unlocked — for testing the platform.
 *
 * POST /api/admin/api-grant
 *   { email }  — grants full API access to that user
 *
 * Creates (or upgrades) a `customer_api_plans` row:
 *   - plan_type: 'bundle'
 *   - ping_tier: 't1m' (1,000,000 pings/mo — the highest tier)
 *   - all_access: true (all 26 sports)
 *   - odds_addon: true (Odds API as bundle add-on)
 *   - overage_enabled: true (no hard cutoff during testing)
 *   - monthly_ping_quota: 1,000,000
 *   - status: 'active'
 *   - Links all 4 intelligence products (arbitrage, steam_moves, injuries, ai_analysis)
 *   - Issues a fresh API key if none exists
 *
 * No Stripe subscription is created — this is a direct admin grant for testing.
 * The plan row will have NULL stripe_subscription_id / stripe_customer_id so it
 * is clearly identified as an admin-granted test plan.
 */
const Body = z.object({
  email: z.string().email().max(200).toLowerCase(),
});

const INTELLIGENCE_CODES = ['arbitrage', 'steam_moves', 'injuries', 'ai_analysis'] as const;
const HIGHEST_PING_TIER = 't1m';
const HIGHEST_PING_QUOTA = 1_000_000;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let input: z.infer<typeof Body>;
  try {
    input = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid input — email required' }, { status: 400 });
  }

  // Find the target user
  const target = await queryOne<{ id: string; email: string; display_name: string | null }>(
    `SELECT id::text, email, display_name FROM web_users WHERE lower(email) = lower($1)`,
    [input.email]
  );
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const actingAdmin = session.user.email ?? 'unknown';

  try {
    const result = await tx(async (client) => {
      // Check if the user already has an active bundle plan
      const existingRes = await client.query<{ id: string; status: string }>(
        `SELECT id::text, status FROM customer_api_plans
         WHERE user_id = $1::bigint AND plan_type = 'bundle'
           AND status IN ('active','trialing','past_due')
         LIMIT 1`,
        [target.id]
      );
      const existingPlan = existingRes.rows[0] ?? null;

      let planId: string;

      if (existingPlan) {
        // Upgrade the existing plan to the highest tier
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
           WHERE id = $3::bigint`,
          [HIGHEST_PING_TIER, HIGHEST_PING_QUOTA, existingPlan.id]
        );
        planId = existingPlan.id;
      } else {
        // Create a new plan — no Stripe IDs (admin-granted test plan)
        const createdRes = await client.query<{ id: string }>(
          `INSERT INTO customer_api_plans
             (user_id, plan_type, ping_tier_code, all_access, odds_addon,
              overage_enabled, overage_price_cents_per_1k, monthly_ping_quota,
              status, current_period_start, current_period_end)
           VALUES ($1::bigint, 'bundle', $2, TRUE, TRUE,
                   TRUE, 0, $3, 'active',
                   date_trunc('month', now()),
                   (date_trunc('month', now()) + interval '1 month')::date)
           RETURNING id::text`,
          [target.id, HIGHEST_PING_TIER, HIGHEST_PING_QUOTA]
        );
        planId = createdRes.rows[0]!.id;
      }

      // Ensure all 4 intelligence products are linked (all_access covers the 26 sports,
      // but intelligence products are always per-row links)
      for (const code of INTELLIGENCE_CODES) {
        await client.query(
          `INSERT INTO customer_api_plan_products (plan_id, product_code)
           VALUES ($1::bigint, $2)
           ON CONFLICT (plan_id, product_code) DO NOTHING`,
          [planId, code]
        );
      }

      // Create or refresh the usage period for this month
      const periodStart = new Date();
      const periodStartStr = new Date(
        Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth(), 1)
      ).toISOString().slice(0, 10);
      const periodEndStr = new Date(
        Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1)
      ).toISOString().slice(0, 10);

      await client.query(
        `INSERT INTO api_key_usage_periods
           (plan_id, period_start, period_end, pings_included, pings_used, overage_pings, overage_cost_cents, status)
         VALUES ($1::bigint, $2::date, $3::date, $4, 0, 0, 0, 'active')
         ON CONFLICT (plan_id, period_start) DO UPDATE SET
           pings_included = EXCLUDED.pings_included,
           status = 'active'`,
        [planId, periodStartStr, periodEndStr, HIGHEST_PING_QUOTA]
      );

      return planId;
    });

    // Issue a new API key (outside the transaction since it needs the plan ID)
    const rawKey = await issueApiKeyForPlan(Number(result), 'admin-grant');

    // Get the key prefix for display
    const keyInfo = await queryOne<{ key_prefix: string }>(
      `SELECT key_prefix FROM customer_api_keys WHERE plan_id = $1::bigint AND active = true ORDER BY id DESC LIMIT 1`,
      [result]
    );

    // eslint-disable-next-line no-console
    console.error(
      `[admin] ${actingAdmin} granted highest API tier to ${target.email} (plan #${result}, key ${keyInfo?.key_prefix})`
    );

    return NextResponse.json({
      ok: true,
      email: target.email,
      planId: result,
      details: {
        planType: 'bundle',
        pingTier: HIGHEST_PING_TIER,
        monthlyPingQuota: HIGHEST_PING_QUOTA,
        allAccess: true,
        oddsAddon: true,
        intelligenceProducts: [...INTELLIGENCE_CODES],
        overageEnabled: true,
        overagePricePer1k: 0,
        status: 'active',
        apiKey: rawKey,
        apiKeyPrefix: keyInfo?.key_prefix ?? null,
        note: 'Full API access granted by admin for testing. No Stripe subscription — this is a direct admin grant.',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    // eslint-disable-next-line no-console
    console.error(`[admin] grant failed for ${target.email}: ${message}`);
    return NextResponse.json(
      { error: `Failed to grant API access: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * GET — returns the current API plan status for a user (by email query param).
 * Useful for verifying the grant worked.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  if (!email) {
    return NextResponse.json({ error: 'email query param required' }, { status: 400 });
  }

  const target = await queryOne<{ id: string }>(
    `SELECT id::text FROM web_users WHERE lower(email) = lower($1)`,
    [email.toLowerCase()]
  );
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const plans = await query<{
    id: string;
    plan_type: string;
    ping_tier_code: string | null;
    all_access: boolean;
    odds_addon: boolean;
    overage_enabled: boolean;
    monthly_ping_quota: string;
    status: string;
    key_prefix: string | null;
    key_active: boolean | null;
  }>(
    `SELECT p.id::text, p.plan_type, p.ping_tier_code, p.all_access, p.odds_addon,
            p.overage_enabled, p.monthly_ping_quota::text, p.status,
            k.key_prefix, k.active AS key_active
     FROM customer_api_plans p
     LEFT JOIN customer_api_keys k ON k.plan_id = p.id AND k.active = true
     WHERE p.user_id = $1::bigint
     ORDER BY p.id DESC`,
    [target.id]
  );

  const products = await query<{ product_code: string }>(
    `SELECT pp.product_code
     FROM customer_api_plan_products pp
     JOIN customer_api_plans p ON p.id = pp.plan_id
     WHERE p.user_id = $1::bigint AND p.status IN ('active','trialing','past_due')`,
    [target.id]
  );

  return NextResponse.json({
    email: email.toLowerCase(),
    plans: plans.rows,
    products: products.rows.map((r) => r.product_code),
  });
}
