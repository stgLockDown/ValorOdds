import { NextResponse } from 'next/server';
import { countPublished, getPublishedFeed } from '@/lib/news-platform';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public news feed — published ValorOdds articles.
 *
 * GET /api/news?limit=24&offset=0&sport=nfl
 *   → { articles: Article[], total: number }
 *
 * No auth; only 'published' rows are ever returned. Responses are safe to
 * cache at the edge for a minute.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const limitRaw = Number(searchParams.get('limit') ?? 24);
  const offsetRaw = Number(searchParams.get('offset') ?? 0);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 48) : 24;
  const offset = Number.isFinite(offsetRaw) ? Math.max(Math.trunc(offsetRaw), 0) : 0;

  const sportRaw = searchParams.get('sport');
  const sport = sportRaw && sportRaw.trim() ? sportRaw.trim().slice(0, 50) : null;

  const [articles, total] = await Promise.all([
    getPublishedFeed({ limit, offset, sport }),
    countPublished(sport),
  ]);

  return NextResponse.json(
    { articles, total },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
  );
}
