import { NextResponse, type NextRequest } from 'next/server';
import { getOrCreateGamePoll, voterFingerprint, getClientIp } from '@/lib/polls';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/polls/game?gameId=&sport=&home=&away=&commenceTime=
 *
 * Get-or-create a single game-scoped "who will win?" poll, independent of
 * the homepage's daily top-4 slate. Powers the community-voting widget
 * shown on each game's Live Zone tab. Anonymous (fingerprint-deduped) —
 * voting reuses the existing POST /api/polls/vote endpoint.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const gameId = url.searchParams.get('gameId');
  const sport = url.searchParams.get('sport');
  const home = url.searchParams.get('home');
  const away = url.searchParams.get('away');
  const commenceTime = url.searchParams.get('commenceTime');

  if (!gameId || !sport || !home || !away || !commenceTime) {
    return NextResponse.json(
      { error: 'Missing gameId/sport/home/away/commenceTime' },
      { status: 400 },
    );
  }

  const ip = getClientIp(req);
  const ua = req.headers.get('user-agent') ?? '';
  const fp = voterFingerprint(ip, ua);

  const poll = await getOrCreateGamePoll(gameId, sport, home, away, commenceTime, fp);
  if (!poll) return NextResponse.json({ error: 'Could not load poll.' }, { status: 500 });

  return NextResponse.json(
    { poll },
    { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' } },
  );
}
