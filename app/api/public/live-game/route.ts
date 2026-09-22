import { NextResponse } from 'next/server';
import { getLiveGameGraphic } from '@/lib/live-game-graphic';
import { buildEspnScoreIndex } from '@/lib/espn-scores';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/public/live-game?sport=&home=&away=&event=
 *
 * Public, anonymous-safe. Returns the broadcast-style live game graphic
 * payload for a single game: both teams (logos/colors/records/scores),
 * game status, the current situation (down & distance, ball on, red zone),
 * every drive, the recent play-by-play with field position, the
 * win-probability series, and the betting odds.
 *
 * Resolves the ESPN event id from the scoreboard matchup when not supplied,
 * so the Games Hub can call it with just sport + team names.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sport = (url.searchParams.get('sport') || '').toUpperCase();
  const home = url.searchParams.get('home');
  const away = url.searchParams.get('away');
  let eventId = url.searchParams.get('event');

  if (!sport || !home || !away) {
    return NextResponse.json({ error: 'Missing sport/home/away' }, { status: 400 });
  }

  if (!eventId) {
    const index = await buildEspnScoreIndex([sport]);
    const match = index.match(home, away);
    if (match?.eventId) eventId = match.eventId;
  }

  if (!eventId) {
    return NextResponse.json(
      { error: 'Could not resolve ESPN event for this matchup.' },
      { status: 404 }
    );
  }

  const graphic = await getLiveGameGraphic(sport, eventId);
  if (!graphic) {
    return NextResponse.json({ error: 'Live game data unavailable' }, { status: 502 });
  }

  return NextResponse.json(
    { data: graphic },
    { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' } }
  );
}
