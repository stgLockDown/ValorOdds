import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Pin a game to the user's phone pull-down shade. The dispatcher will push
 * live box scores + big plays for pinned games as persistent notifications.
 *
 * Body: { sport, home_team, away_team, home_abbrev?, away_abbrev?,
 *         espn_event_id?, game_date?, notify_score?, notify_big_plays? }
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const gameId = params.id;
  const body = await req.json().catch(() => ({}));

  const sport = body?.sport;
  const homeTeam = body?.home_team;
  const awayTeam = body?.away_team;
  if (!sport || !homeTeam || !awayTeam) {
    return NextResponse.json({ error: 'sport, home_team and away_team are required' }, { status: 400 });
  }

  await query(
    `INSERT INTO pinned_games
       (user_id, game_id, espn_event_id, sport, home_team, away_team,
        home_abbrev, away_abbrev, game_date, notify_score, notify_big_plays)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (user_id, game_id) DO UPDATE SET
       espn_event_id   = EXCLUDED.espn_event_id,
       sport           = EXCLUDED.sport,
       home_team       = EXCLUDED.home_team,
       away_team       = EXCLUDED.away_team,
       home_abbrev     = EXCLUDED.home_abbrev,
       away_abbrev     = EXCLUDED.away_abbrev,
       game_date       = EXCLUDED.game_date,
       notify_score    = EXCLUDED.notify_score,
       notify_big_plays = EXCLUDED.notify_big_plays,
       updated_at      = NOW()`,
    [
      session.user.id,
      gameId,
      body?.espn_event_id ?? null,
      String(sport).toUpperCase(),
      homeTeam,
      awayTeam,
      body?.home_abbrev ?? null,
      body?.away_abbrev ?? null,
      body?.game_date ?? null,
      body?.notify_score ?? true,
      body?.notify_big_plays ?? true,
    ],
  );

  return NextResponse.json({ ok: true, pinned: true });
}

/** Unpin a game. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await query('DELETE FROM pinned_games WHERE user_id = $1 AND game_id = $2', [
    session.user.id,
    params.id,
  ]);

  return NextResponse.json({ ok: true, pinned: false });
}
