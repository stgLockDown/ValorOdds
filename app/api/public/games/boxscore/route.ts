import { NextResponse } from 'next/server';
import { fetchGameSummary } from '@/lib/espn-summary';
import { buildEspnScoreIndex } from '@/lib/espn-scores';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public (anonymous-safe) mirror of /api/games/[id]/boxscore.
 *
 * Powers the Box Score tab on the public /games/[sport]/[gameSlug]/box-score
 * page — same normalized GameSummary payload, same <BoxScore> client
 * component, but with no session requirement since box scores are public
 * information (ESPN publishes them openly). Resolves the ESPN event id via
 * the scoreboard matchup lookup only (no pinned-game shortcut, since there's
 * no authenticated user here).
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
    return NextResponse.json({ error: 'Could not resolve ESPN event for this matchup.' }, { status: 404 });
  }

  const summary = await fetchGameSummary(sport, eventId);
  if (!summary) {
    return NextResponse.json({ error: 'Box score unavailable' }, { status: 502 });
  }

  return NextResponse.json({ data: summary });
}
