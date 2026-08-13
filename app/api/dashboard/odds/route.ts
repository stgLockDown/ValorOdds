import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { sportFilterClause } from '@/lib/sport-filter';
import { formatBookmakerName } from '@/lib/sportsbooks';
import { normalizeTeam } from '@/lib/espn-scores';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const sport = searchParams.get('sport') || '';
  const market = searchParams.get('market') || 'h2h';
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

  // Compose the WHERE clause. The bot writes `sport='BASKETBALL'`,
  // `sport_key='basketball_nba'` so we filter on `sport_key` to
  // disambiguate NBA / NCAAB / WNBA which all share the same `sport`.
  const params: any[] = [market];
  let sportClause = '';
  if (sport) {
    const filter = sportFilterClause(sport, params.length + 1);
    if (filter) {
      sportClause = `AND ${filter.clause}`;
      params.push(...filter.params);
    } else {
      // Unknown sport — return empty rather than spilling all sports.
      return NextResponse.json({ data: [] });
    }
  }
  params.push(limit);
  const limitParamIdx = params.length;

  const result = await query(
    `SELECT DISTINCT ON (game_id, bookmaker_key, outcome_name)
       game_id, sport, home_team, away_team, commence_time,
       bookmaker_key, bookmaker_name, market_type,
       outcome_name, outcome_price, outcome_point, snapshot_time
     FROM odds_snapshots
     WHERE market_type = $1
       ${sportClause}
       AND commence_time > NOW()
       AND outcome_price != 0
       AND ABS(outcome_price) <= 100000
     ORDER BY game_id, bookmaker_key, outcome_name, snapshot_time DESC
     LIMIT $${limitParamIdx}`,
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
        // Raw bookmaker_name occasionally holds an internal identifier
        // (e.g. "fanduel_an") instead of a clean label — always format it
        // (QA audit: "Raw sportsbook key shown instead of formatted name").
        name: formatBookmakerName(row.bookmaker_key, row.bookmaker_name),
        outcomes: [],
      };
    }
    games[row.game_id].books[row.bookmaker_key].outcomes.push({
      name: row.outcome_name,
      price: row.outcome_price,
      point: row.outcome_point,
    });
  }

  // Two upstream feed providers occasionally mint different game_ids for the
  // same real-world matchup, which without this collapse would render as
  // duplicate game cards on the dashboard (QA audit: "Duplicate game
  // listing"). Collapse by normalized matchup signature, keeping whichever
  // game_id has more bookmaker coverage.
  const bySignature = new Map<string, any>();
  for (const game of Object.values(games) as any[]) {
    const sig = [
      normalizeTeam(game.home_team),
      normalizeTeam(game.away_team),
      game.commence_time ? new Date(game.commence_time).toISOString() : '',
    ].join('|');
    const existing = bySignature.get(sig);
    const bookCount = Object.keys(game.books).length;
    const existingBookCount = existing ? Object.keys(existing.books).length : -1;
    if (!existing || bookCount > existingBookCount) {
      bySignature.set(sig, game);
    }
  }

  return NextResponse.json({ data: Array.from(bySignature.values()) });
}
