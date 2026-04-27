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
  const minProfit = parseFloat(searchParams.get('min_profit') || '0');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

  const params: any[] = [minProfit, limit];
  const sportFilter = sport ? `AND UPPER(sport) = UPPER($3)` : '';
  if (sport) params.push(sport);

  const result = await query(
    `SELECT id, sport, home_team, away_team, commence_time,
            market_type, market_name,
            side1_bookmaker, side1_selection, side1_odds, side1_stake,
            side2_bookmaker, side2_selection, side2_odds, side2_stake,
            profit_percentage, guaranteed_profit, is_us_only, detected_at
     FROM arbitrage_opportunities
     WHERE profit_percentage >= $1
       ${sportFilter}
       AND commence_time > NOW()
     ORDER BY profit_percentage DESC
     LIMIT $2`,
    params
  );

  return NextResponse.json({ data: result.rows });
}