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
  const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 100);

  const params: any[] = [limit];
  const sportFilter = sport ? `AND LOWER(sport) = LOWER($2)` : '';
  if (sport) params.push(sport);

  const result = await query(
    `SELECT sport, league, market_type, team, opponent,
            outcome, event_date, event_name, final_score, created_at
     FROM betting_trends
     WHERE 1=1 ${sportFilter}
     ORDER BY event_date DESC
     LIMIT $1`,
    params
  );

  return NextResponse.json({ data: result.rows });
}