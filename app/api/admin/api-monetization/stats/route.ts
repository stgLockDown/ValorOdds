import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import {
  PING_TIERS,
  ALL_ACCESS_PRICE_CENTS,
  SPORT_ADDON_PRICE_CENTS,
  ODDS_PRODUCT,
  INTELLIGENCE_PRODUCTS,
} from '@/lib/api-monetization/pricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin-only overview metrics for the API monetization platform.
 * Returns aggregate stats: plan counts, active keys, estimated MRR,
 * total pings used this month, overage revenue, and per-tier breakdown.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // --- Plan counts by status ---
  const planCounts = await query<{ status: string; c: string }>(
    `SELECT status, COUNT(*)::text AS c
     FROM customer_api_plans
     GROUP BY status ORDER BY c DESC`
  );

  // --- Active keys count ---
  const activeKeys = await queryOne<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM customer_api_keys WHERE active = true`
  );

  // --- All active/trialing/past_due plans for MRR + usage calc ---
  const plans = await query<{
    id: string;
    plan_type: string;
    ping_tier_code: string | null;
    all_access: boolean;
    odds_addon: boolean;
    monthly_ping_quota: string;
    overage_price_cents_per_1k: number;
    user_id: string;
    email: string;
  }>(
    `SELECT p.id::text, p.plan_type, p.ping_tier_code, p.all_access, p.odds_addon,
            p.monthly_ping_quota::text, p.overage_price_cents_per_1k,
            p.user_id::text, u.email
     FROM customer_api_plans p
     JOIN web_users u ON u.id = p.user_id
     WHERE p.status IN ('active','trialing','past_due')`
  );

  // --- Compute estimated MRR from plan configurations ---
  const tierByCode = new Map<string, number>(PING_TIERS.map((t) => [t.code, t.priceCents]));
  const intelByCode = new Map<string, typeof INTELLIGENCE_PRODUCTS[number]>(INTELLIGENCE_PRODUCTS.map((i) => [i.code, i]));
  let estimatedMrrCents = 0;

  for (const p of plans.rows) {
    let planMrr = 0;
    if (p.plan_type === 'odds_standalone') {
      planMrr += ODDS_PRODUCT.standaloneMonthlyPriceCents;
    } else {
      // bundle: ping tier + per-sport or all-access + odds/intel add-ons
      if (p.ping_tier_code) planMrr += tierByCode.get(p.ping_tier_code) ?? 0;
      if (p.all_access) {
        planMrr += ALL_ACCESS_PRICE_CENTS;
      } else {
        // count sport products
        const prods = await query<{ product_code: string }>(
          `SELECT product_code FROM customer_api_plan_products WHERE plan_id = $1::bigint`,
          [p.id]
        );
        const sportCount = prods.rows.filter(
          (r) => r.product_code !== 'odds' && !intelByCode.has(r.product_code)
        ).length;
        planMrr += sportCount * SPORT_ADDON_PRICE_CENTS;
        // intel add-ons
        for (const r of prods.rows) {
          const intel = intelByCode.get(r.product_code);
          if (intel) planMrr += intel.addonMonthlyPriceCents;
        }
      }
      if (p.odds_addon) planMrr += ODDS_PRODUCT.addonMonthlyPriceCents;
    }
    estimatedMrrCents += planMrr;
  }

  // --- Total pings used this month across all plans ---
  const monthUsage = await queryOne<{ total_pings: string; total_calls: string }>(
    `SELECT COALESCE(SUM(weight), 0)::text AS total_pings,
            COUNT(*)::text AS total_calls
     FROM api_key_usage_events
     WHERE called_at >= date_trunc('month', now())`
  );

  // --- Overage revenue this month ---
  const overageMonth = await queryOne<{ pings: string; cost_cents: string }>(
    `SELECT COALESCE(SUM(overage_pings), 0)::text AS pings,
            COALESCE(SUM(overage_cost_cents), 0)::text AS cost_cents
     FROM api_key_usage_periods
     WHERE period_start = date_trunc('month', now())::date`
  );

  // --- Per-tier active plan breakdown ---
  const tierBreakdown = await query<{ tier: string; c: string }>(
    `SELECT COALESCE(ping_tier_code, plan_type) AS tier, COUNT(*)::text AS c
     FROM customer_api_plans
     WHERE status IN ('active','trialing','past_due')
     GROUP BY COALESCE(ping_tier_code, plan_type)
     ORDER BY c DESC`
  );

  // --- Top products by usage this month ---
  const topProducts = await query<{ product_code: string; calls: string; pings: string }>(
    `SELECT product_code, COUNT(*)::text AS calls, COALESCE(SUM(weight), 0)::text AS pings
     FROM api_key_usage_events
     WHERE called_at >= date_trunc('month', now())
     GROUP BY product_code ORDER BY pings DESC LIMIT 10`
  );

  return NextResponse.json({
    planCounts: planCounts.rows,
    activeKeyCount: activeKeys?.c ?? '0',
    activePlanCount: String(plans.rows.length),
    estimatedMrrCents,
    monthPingsUsed: monthUsage?.total_pings ?? '0',
    monthCalls: monthUsage?.total_calls ?? '0',
    monthOveragePings: overageMonth?.pings ?? '0',
    monthOverageCents: overageMonth?.cost_cents ?? '0',
    tierBreakdown: tierBreakdown.rows,
    topProducts: topProducts.rows,
  });
}
