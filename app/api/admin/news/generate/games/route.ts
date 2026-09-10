import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { listArticleGames } from '@/lib/game-article-generator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin-only game picker for game-coverage articles in News Studio.
 *
 * GET /api/admin/news/generate/games          → all hub sports
 * GET /api/admin/news/generate/games?sport=NFL
 *      → live games first, then soonest upcoming, then newest finals.
 *        Each entry carries the ESPN event id used as gameId on generate,
 *        plus an odds book count so the editor can see market coverage.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const sportParam = url.searchParams.get('sport')?.trim();
  const sport =
    sportParam && sportParam.length >= 2 && sportParam.length <= 12
      ? sportParam.toUpperCase()
      : undefined;

  try {
    const games = await listArticleGames(sport);
    return NextResponse.json({ games });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Game list failed';
    console.error('[admin-news] game list failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
