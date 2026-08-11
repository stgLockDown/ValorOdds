import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin-only: Real-time API activity monitor.
 *
 * GET /api/admin/api-monitor?limit=50&since=<iso>
 *   Returns the most recent API call events (api_key_usage_events) joined
 *   with plan + user info, plus aggregate stats. Designed for polling
 *   every 3-5 seconds from the admin dashboard.
 *
 * Query params:
 *   limit  — max events to return (default 50, max 200)
 *   since  — ISO timestamp; only return events after this (for incremental polling)
 *   filter — 'all' | 'errors' | 'success' (default 'all')
 *
 * Response:
 *   {
 *     events: [{ id, called_at, product_code, endpoint, weight, status_code,
 *                is_error, plan_id, email, key_prefix }],
 *     stats: { total_calls_24h, total_calls_1h, error_count_24h, error_count_1h,
 *              avg_weight, unique_endpoints, unique_plans },
 *     byProduct: [{ product_code, calls, errors, pings }],
 *     byStatusCode: [{ status_code, count }],
 *     serverTime: <iso>
 *   }
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 200);
  const since = searchParams.get('since'); // ISO timestamp for incremental polling
  const filter = searchParams.get('filter') ?? 'all'; // all | errors | success

  // Build the WHERE clause for the event query
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (since) {
    conditions.push(`e.called_at > $${paramIdx}::timestamptz`);
    params.push(since);
    paramIdx++;
  }

  if (filter === 'errors') {
    conditions.push(`(e.status_code IS NULL OR e.status_code >= 400)`);
  } else if (filter === 'success') {
    conditions.push(`e.status_code IS NOT NULL AND e.status_code < 400`);
  }

  const whereClause = conditions.length > 0
    ? 'WHERE ' + conditions.join(' AND ')
    : '';

  // Fetch recent events with user/plan info
  const events = await query<{
    id: string;
    called_at: string;
    product_code: string;
    endpoint: string;
    weight: number;
    status_code: number | null;
    is_error: boolean;
    plan_id: string;
    email: string;
    key_prefix: string | null;
  }>(
    `SELECT e.id::text,
            e.called_at,
            e.product_code,
            e.endpoint,
            e.weight,
            e.status_code,
            (e.status_code IS NULL OR e.status_code >= 400) AS is_error,
            e.plan_id::text,
            u.email,
            k.key_prefix
     FROM api_key_usage_events e
     LEFT JOIN customer_api_plans p ON p.id = e.plan_id
     LEFT JOIN web_users u ON u.id = p.user_id
     LEFT JOIN customer_api_keys k ON k.id = e.key_id
     ${whereClause}
     ORDER BY e.called_at DESC
     LIMIT $${paramIdx}`,
    [...params, limit]
  );

  // Aggregate stats for last 24h and last 1h
  const [stats24h, stats1h, byProduct, byStatusCode] = await Promise.all([
    queryOne<{
      total_calls: string;
      error_count: string;
      total_pings: string;
      unique_endpoints: string;
      unique_plans: string;
    }>(
      `SELECT
         COUNT(*)::text AS total_calls,
         SUM(CASE WHEN status_code IS NULL OR status_code >= 400 THEN 1 ELSE 0 END)::text AS error_count,
         COALESCE(SUM(weight), 0)::text AS total_pings,
         COUNT(DISTINCT endpoint)::text AS unique_endpoints,
         COUNT(DISTINCT plan_id)::text AS unique_plans
       FROM api_key_usage_events
       WHERE called_at > NOW() - INTERVAL '24 hours'`
    ),
    queryOne<{
      total_calls: string;
      error_count: string;
      total_pings: string;
    }>(
      `SELECT
         COUNT(*)::text AS total_calls,
         SUM(CASE WHEN status_code IS NULL OR status_code >= 400 THEN 1 ELSE 0 END)::text AS error_count,
         COALESCE(SUM(weight), 0)::text AS total_pings
       FROM api_key_usage_events
       WHERE called_at > NOW() - INTERVAL '1 hour'`
    ),
    query<{
      product_code: string;
      calls: string;
      errors: string;
      pings: string;
    }>(
      `SELECT product_code,
              COUNT(*)::text AS calls,
              SUM(CASE WHEN status_code IS NULL OR status_code >= 400 THEN 1 ELSE 0 END)::text AS errors,
              COALESCE(SUM(weight), 0)::text AS pings
       FROM api_key_usage_events
       WHERE called_at > NOW() - INTERVAL '24 hours'
       GROUP BY product_code
       ORDER BY calls DESC
       LIMIT 20`
    ),
    query<{
      status_code: string | null;
      count: string;
    }>(
      `SELECT status_code::text,
              COUNT(*)::text AS count
       FROM api_key_usage_events
       WHERE called_at > NOW() - INTERVAL '24 hours'
       GROUP BY status_code
       ORDER BY count DESC`
    ),
  ]);

  const s24 = stats24h ?? { total_calls: '0', error_count: '0', total_pings: '0', unique_endpoints: '0', unique_plans: '0' };
  const s1 = stats1h ?? { total_calls: '0', error_count: '0', total_pings: '0' };

  return NextResponse.json({
    events: events.rows,
    stats: {
      total_calls_24h: s24.total_calls,
      total_calls_1h: s1.total_calls,
      error_count_24h: s24.error_count,
      error_count_1h: s1.error_count,
      total_pings_24h: s24.total_pings,
      total_pings_1h: s1.total_pings,
      unique_endpoints_24h: s24.unique_endpoints,
      unique_plans_24h: s24.unique_plans,
      error_rate_24h: Number(s24.total_calls) > 0
        ? ((Number(s24.error_count) / Number(s24.total_calls)) * 100).toFixed(2)
        : '0.00',
      error_rate_1h: Number(s1.total_calls) > 0
        ? ((Number(s1.error_count) / Number(s1.total_calls)) * 100).toFixed(2)
        : '0.00',
    },
    byProduct: byProduct.rows,
    byStatusCode: byStatusCode.rows,
    serverTime: new Date().toISOString(),
  });
}
