import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { fetchGameSummary } from '@/lib/espn-summary';
import { buildEspnScoreIndex } from '@/lib/espn-scores';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Return the normalized box score + big-plays feed for a game.
 *
 * The ESPN event id is resolved in order:
 *   1. ?event= query param (explicit).
 *   2. The user's pinned_games row for this game (if pinned).
 *   3. A scoreboard matchup lookup using ?sport=&home=&away=.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const gameId = params.id;
  const url = new URL(req.url);
  let eventId = url.searchParams.get('event');
  const sport = url.searchParams.get('sport');
  const home = url.searchParams.get('home');
  const away = url.searchParams.get('away');

  // 2. Pinned row.
  if (!eventId) {
    const result = await query<{ espn_event_id: string | null; sport: string }>(
      'SELECT espn_event_id, sport FROM pinned_games WHERE user_id = $1 AND game_id = $2',
      [session.user.id, gameId],
    );
    if (result.rows[0]?.espn_event_id) eventId = result.rows[0].espn_event_id;
  }

  const resolvedSport = (sport ?? '').toUpperCase();

  // 3. Scoreboard matchup lookup.
  if (!eventId && resolvedSport && home && away) {
    const index = await buildEspnScoreIndex([resolvedSport]);
    const match = index.match(home, away);
    if (match?.eventId) eventId = match.eventId;
  }

  if (!eventId || !resolvedSport) {
    return NextResponse.json(
      { error: 'Could not resolve ESPN event. Provide ?event= and ?sport=.' },
      { status: 400 },
    );
  }

  const summary = await fetchGameSummary(resolvedSport, eventId);
  if (!summary) {
    return NextResponse.json({ error: 'Box score unavailable' }, { status: 502 });
  }

  return NextResponse.json({ data: summary });
}
