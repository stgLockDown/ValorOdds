import { NextResponse } from 'next/server';
import { buildEspnScoreIndex } from '@/lib/espn-scores';
import { syncLiveFeed, getLiveFeed } from '@/lib/live-feed';
import { voterFingerprint, getClientIp } from '@/lib/polls';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/public/live-feed?sport=&home=&away=&event=
 *
 * Public, anonymous-safe. Resolves the ESPN event id the same way
 * /api/public/games/boxscore does, syncs the latest plays from ESPN into
 * `live_feed_events` (cheap — ingestion itself caches the ESPN summary
 * fetch for 30s via lib/espn-summary's fetch layer), then returns the
 * normalized feed newest-first with reaction tallies. Comments require
 * login and are fetched separately per-event (see /api/live-feed/comments)
 * so the main feed payload stays small.
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

  await syncLiveFeed(sport, eventId).catch(() => null);

  const ip = getClientIp(req);
  const ua = req.headers.get('user-agent') ?? '';
  const fp = voterFingerprint(ip, ua);

  const events = await getLiveFeed(sport, eventId, { fingerprint: fp });

  return NextResponse.json(
    { eventId, events },
    { headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=15' } },
  );
}
