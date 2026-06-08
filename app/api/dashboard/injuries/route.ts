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
  const team = searchParams.get('team') || '';
  const statusRaw = searchParams.get('status') || '';
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

  // The provider only ever writes a handful of distinct statuses
  // (e.g. "Out", "Day-To-Day", "Injured Reserve"). The UI used to offer
  // "Doubtful"/"Questionable" buttons that never matched anything in the
  // DB, so filtering by them silently returned zero rows. Map common
  // aliases to the set of values that actually exist so a status filter
  // always behaves sensibly.
  const STATUS_ALIASES: Record<string, string[]> = {
    out: ['Out', 'Injured Reserve', 'IR', 'Suspended'],
    'day-to-day': ['Day-To-Day', 'Day to Day', 'DTD', 'Questionable', 'Doubtful', 'Probable', 'Game-Time Decision'],
  };

  const conditions: string[] = [`fetched_at > NOW() - INTERVAL '72 hours'`];
  const params: any[] = [];

  if (sport) { params.push(sport.toUpperCase()); conditions.push(`UPPER(sport) = $${params.length}`); }
  if (team) { params.push(`%${team}%`); conditions.push(`team ILIKE $${params.length}`); }
  if (statusRaw) {
    const key = statusRaw.trim().toLowerCase();
    const variants = STATUS_ALIASES[key] || [statusRaw];
    params.push(variants);
    conditions.push(`status = ANY($${params.length})`);
  }

  params.push(limit);

  const result = await query(
    `SELECT DISTINCT ON (player_name, team, sport)
       player_name, team, sport, position, status, injury_type, description, reported_date, fetched_at
     FROM injuries
     WHERE ${conditions.join(' AND ')}
     ORDER BY player_name, team, sport, fetched_at DESC
     LIMIT $${params.length}`,
    params
  );

  return NextResponse.json({ data: result.rows });
}