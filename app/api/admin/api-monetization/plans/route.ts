import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin-only: list all customer API plans with joined user info and
 * current-month usage. Supports optional status filter and pagination.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || 'all';
  const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  const statusFilter = status !== 'all' ? status : null;
  const where = statusFilter ? 'WHERE p.status = $3' : '';
  const params: unknown[] = statusFilter ? [limit, offset, statusFilter] : [limit, offset];

  const plans = await query<{
    id: string;
    user_id: string;
    email: string;
    display_name: string | null;
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
    created_at: string;
    key_prefix: string | null;
    key_active: boolean | null;
    pings_used: string | null;
    overage_pings: string | null;
    product_count: string | null;
  }>(
    `SELECT p.id::text, p.user_id::text, u.email, u.display_name,
            p.plan_type, p.ping_tier_code, p.all_access, p.odds_addon,
            p.overage_enabled, p.overage_price_cents_per_1k,
            p.monthly_ping_quota::text, p.status,
            p.current_period_start, p.current_period_end,
            p.cancel_at_period_end, p.created_at,
            k.key_prefix, k.active AS key_active,
            up.pings_used::text, up.overage_pings::text,
            (SELECT COUNT(*)::text FROM customer_api_plan_products pp WHERE pp.plan_id = p.id) AS product_count
     FROM customer_api_plans p
     JOIN web_users u ON u.id = p.user_id
     LEFT JOIN customer_api_keys k ON k.plan_id = p.id AND k.active = true
     LEFT JOIN api_key_usage_periods up
       ON up.plan_id = p.id AND up.period_start = date_trunc('month', now())::date
     ${where}
     ORDER BY p.created_at DESC
     LIMIT $1 OFFSET $2`,
    params
  );

  // Total count for pagination
  const countWhere = statusFilter ? 'WHERE status = $1' : '';
  const countParams: unknown[] = statusFilter ? [statusFilter] : [];
  const countResult = await query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM customer_api_plans ${countWhere}`,
    countParams
  );

  // Fetch product codes for each plan (batch query with string-to-bigint cast)
  const planIds = plans.rows.map((p) => p.id);
  let productMap = new Map<string, string[]>();
  if (planIds.length > 0) {
    // Use ANY(array[...]) with text values cast to bigint inside SQL to avoid driver type issues.
    const products = await query<{ plan_id: string; product_code: string }>(
      `SELECT plan_id::text, product_code
       FROM customer_api_plan_products
       WHERE plan_id = ANY(ARRAY[${planIds.map((_, i) => `$${i + 1}::bigint`).join(', ')}])`,
      planIds
    );
    for (const row of products.rows) {
      const arr = productMap.get(row.plan_id) ?? [];
      arr.push(row.product_code);
      productMap.set(row.plan_id, arr);
    }
  }

  const results = plans.rows.map((p) => ({
    ...p,
    products: productMap.get(p.id) ?? [],
  }));

  return NextResponse.json({ plans: results, total: countResult.rows[0]?.c ?? '0' });
}
