import { NextResponse, type NextRequest } from 'next/server';
import { castVote, voterFingerprint, getClientIp } from '@/lib/polls';

/**
 * POST /api/polls/vote
 *
 * Body: { pollId: number, team: 'home' | 'away' }
 *
 * Records an anonymous vote, deduplicated by voter fingerprint (IP +
 * user-agent hash). If the voter already voted on this poll, their
 * choice is updated (they can change their mind).
 *
 * Returns the updated poll with new tallies.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.pollId !== 'number' || (body.team !== 'home' && body.team !== 'away')) {
      return NextResponse.json({ error: 'Invalid request. Expected { pollId, team }.' }, { status: 400 });
    }

    const ip = getClientIp(req);
    const ua = req.headers.get('user-agent') ?? '';
    const fp = voterFingerprint(ip, ua);

    const updated = await castVote(body.pollId, body.team, fp);

    if (!updated) {
      return NextResponse.json({ error: 'Poll not found.' }, { status: 404 });
    }

    return NextResponse.json({ poll: updated });
  } catch {
    return NextResponse.json({ error: 'Failed to record vote.' }, { status: 500 });
  }
}
