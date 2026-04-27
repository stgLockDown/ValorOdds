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
  const player = searchParams.get('player') || '';
  const notable = searchParams.get('notable') === 'true';
  const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 100);

  const conditions: string[] = [`recorded_at > NOW() - INTERVAL '7 days'`];
  const params: any[] = [];

  if (sport) { params.push(sport.toUpperCase()); conditions.push(`UPPER(sport) = $${params.length}`); }
  if (player) { params.push(`%${player}%`); conditions.push(`player_name ILIKE $${params.length}`); }
  if (notable) { conditions.push(`is_notable = true`); }

  params.push(limit);

  const result = await query(
    `SELECT player_name, team, team_abbrev, sport, position,
            points, rebounds, assists, three_pointers_made,
            yards, touchdowns, goals, hits, home_runs, rbis,
            saves, strikeouts, is_notable, notable_reason,
            fantasy_score, recorded_at
     FROM player_stats
     WHERE ${conditions.join(' AND ')}
     ORDER BY recorded_at DESC
     LIMIT $${params.length}`,
    params
  );

  return NextResponse.json({ data: result.rows });
}