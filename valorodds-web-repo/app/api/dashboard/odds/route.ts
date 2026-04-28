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
  const market = searchParams.get('market') || 'h2h';
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

  // Get latest odds per game/bookmaker grouped nicely
  const params: any[] = [market, limit];
  const sportFilter = sport ? `AND UPPER(sport) = UPPER($3)` : '';
  if (sport) params.push(sport);

  const result = await query(
    `SELECT DISTINCT ON (game_id, bookmaker_key, outcome_name)
       game_id, sport, home_team, away_team, commence_time,
       bookmaker_key, bookmaker_name, market_type,
       outcome_name, outcome_price, outcome_point, snapshot_time
     FROM odds_snapshots
     WHERE market_type = $1
       ${sportFilter}
       AND commence_time > NOW()
     ORDER BY game_id, bookmaker_key, outcome_name, snapshot_time DESC
     LIMIT $2`,
    params
  );

  // Group by game
  const games: Record<string, any> = {};
  for (const row of result.rows) {
    if (!games[row.game_id]) {
      games[row.game_id] = {
        game_id: row.game_id,
        sport: row.sport,
        home_team: row.home_team,
        away_team: row.away_team,
        commence_time: row.commence_time,
        books: {},
      };
    }
    if (!games[row.game_id].books[row.bookmaker_key]) {
      games[row.game_id].books[row.bookmaker_key] = {
        key: row.bookmaker_key,
        name: row.bookmaker_name,
        outcomes: [],
      };
    }
    games[row.game_id].books[row.bookmaker_key].outcomes.push({
      name: row.outcome_name,
      price: row.outcome_price,
      point: row.outcome_point,
    });
  }

  return NextResponse.json({ data: Object.values(games) });
}