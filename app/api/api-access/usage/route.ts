import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

export const runtime = 'nodejs';

function currentPeriodStart(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const planId = searchParams.get('planId');
  if (!planId) {
    return NextResponse.json({ error: 'planId query param required' }, { status: 400 });
  }

  const plan = await queryOne<{ id: string }>(
    `SELECT id::text FROM customer_api_plans WHERE id = $1::bigint AND user_id = $2::bigint LIMIT 1`,
    [planId, session.user.id]
  );
  if (!plan) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
  }

  const period = await queryOne(
    `SELECT pings_included, pings_used, overage_pings, overage_cost_cents, status, period_start, period_end
     FROM api_key_usage_periods WHERE plan_id = $1::bigint AND period_start = $2::date`,
    [plan.id, currentPeriodStart()]
  );

  const recent = await query(
    `SELECT product_code, endpoint, weight, status_code, called_at
     FROM api_key_usage_events WHERE plan_id = $1::bigint
     ORDER BY called_at DESC LIMIT 50`,
    [plan.id]
  );

  const byProduct = await query(
    `SELECT product_code, COUNT(*)::int AS calls, SUM(weight)::int AS pings
     FROM api_key_usage_events
     WHERE plan_id = $1::bigint AND called_at >= (date_trunc('month', now()))
     GROUP BY product_code ORDER BY pings DESC`,
    [plan.id]
  );

  return NextResponse.json({
    period: period || { pings_included: 0, pings_used: 0, overage_pings: 0, overage_cost_cents: 0, status: 'active' },
    recentCalls: recent.rows,
    byProduct: byProduct.rows,
  });
}
