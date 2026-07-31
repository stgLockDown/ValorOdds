import { NextResponse } from 'next/server';
import { getLiveMarketStats } from '@/lib/public-data';

/**
 * Public endpoint for the live stats bar on /market-intelligence.
 * Returns aggregate counts only — no specific plays or actionable data.
 * Cached at the public-data layer (120s) with per-request freshness.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const stats = await getLiveMarketStats();
    return NextResponse.json(stats, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch {
    return NextResponse.json(
      {
        liveArbCount: 0,
        arbSports: [],
        steamMoves24h: 0,
        steamMoveSports: [],
        injuries24h: 0,
        booksTracked: 0,
        gamesToday: 0,
        newsToday: 0,
        weatherAlerts: 0,
        lastUpdated: new Date().toISOString(),
      },
      { status: 200 },
    );
  }
}
