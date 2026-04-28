import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const sport = searchParams.get('sport') || '';
  const hours = Math.min(parseInt(searchParams.get('hours') || '24'), 168);
  const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 100);

  const params: any[] = [hours, limit];
  const sportFilter = sport ? `AND UPPER(sport) = UPPER($3)` : '';
  if (sport) params.push(sport);

  const result = await query(
    `SELECT id, sport, home_team, away_team, market_type, outcome_name,
            before_avg_price, after_avg_price, before_avg_point, after_avg_point,
            books_moved, total_books, direction, detected_at
     FROM steam_moves
     WHERE detected_at > NOW() - ($1 || ' hours')::INTERVAL
       ${sportFilter}
     ORDER BY detected_at DESC
     LIMIT $2`,
    params
  );

  return NextResponse.json({ data: result.rows });
}