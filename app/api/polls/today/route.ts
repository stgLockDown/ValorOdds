import { NextResponse, type NextRequest } from 'next/server';
import { getTodaysPolls, voterFingerprint, getClientIp } from '@/lib/polls';

/**
 * GET /api/polls/today
 *
 * Returns today's community polls with live vote tallies.
 * If the caller has a fingerprint cookie, their existing vote is
 * included so the UI can show their selection.
 *
 * Public, cacheable for 30s (vote counts refresh quickly enough for
 * a fun community poll without hammering the DB).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const ua = req.headers.get('user-agent') ?? '';
    const fp = voterFingerprint(ip, ua);

    const polls = await getTodaysPolls(fp);

    return NextResponse.json(
      { polls },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30',
        },
      },
    );
  } catch {
    return NextResponse.json({ polls: [] }, { status: 200 });
  }
}
