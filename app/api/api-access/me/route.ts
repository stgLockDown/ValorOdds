import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

export const runtime = 'nodejs';

interface PlanRow {
  id: string;
  plan_type: string;
  ping_tier_code: string | null;
  all_access: boolean;
  odds_addon: boolean;
  overage_enabled: boolean;
  overage_price_cents_per_1k: number;
  monthly_ping_quota: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const plans = await query<PlanRow>(
    `SELECT id::text, plan_type, ping_tier_code, all_access, odds_addon, overage_enabled,
            overage_price_cents_per_1k, monthly_ping_quota::text, status,
            current_period_start, current_period_end, cancel_at_period_end
     FROM customer_api_plans
     WHERE user_id = $1::bigint AND status IN ('active','trialing','past_due')
     ORDER BY id DESC`,
    [session.user.id]
  );

  const results = [];
  for (const plan of plans.rows) {
    const key = await queryOne<{ key_prefix: string; created_at: string }>(
      `SELECT key_prefix, created_at FROM customer_api_keys WHERE plan_id = $1::bigint AND active = true LIMIT 1`,
      [plan.id]
    );
    const products =
      plan.plan_type === 'bundle' && !plan.all_access
        ? (
            await query<{ product_code: string }>(
              `SELECT product_code FROM customer_api_plan_products WHERE plan_id = $1::bigint`,
              [plan.id]
            )
          ).rows.map((r) => r.product_code)
        : [];

    results.push({ ...plan, key_prefix: key?.key_prefix ?? null, key_created_at: key?.created_at ?? null, products });
  }

  return NextResponse.json({ plans: results });
}
