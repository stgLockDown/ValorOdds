import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await query(
    `SELECT DISTINCT ON (bookmaker_key)
       bookmaker_key, bookmaker_name, avg_clv, lines_tracked,
       arb_appearances, avg_hold_percent, line_freshness_score,
       best_market_count, rank_position, week_starting, created_at
     FROM sportsbook_reviews
     ORDER BY bookmaker_key, created_at DESC`,
    []
  );

  return NextResponse.json({ data: result.rows.sort((a: any, b: any) => (a.rank_position || 99) - (b.rank_position || 99)) });
}