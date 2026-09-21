import { NextResponse, type NextRequest } from 'next/server';
import { toggleReaction, isValidReactionEmoji } from '@/lib/live-feed';
import { voterFingerprint, getClientIp } from '@/lib/polls';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/public/live-feed/reactions
 * Body: { eventId: string, emoji: string }
 *
 * Anonymous, fingerprint-deduped (same IP+UA hash as community polls) —
 * reactions never require login per product decision. Toggles: tapping the
 * same emoji again removes your reaction.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.eventId !== 'string' || typeof body.emoji !== 'string') {
      return NextResponse.json({ error: 'Invalid request. Expected { eventId, emoji }.' }, { status: 400 });
    }
    if (!isValidReactionEmoji(body.emoji)) {
      return NextResponse.json({ error: 'Unsupported reaction.' }, { status: 400 });
    }

    const ip = getClientIp(req);
    const ua = req.headers.get('user-agent') ?? '';
    const fp = voterFingerprint(ip, ua);

    const result = await toggleReaction(body.eventId, body.emoji, fp);
    if (!result) return NextResponse.json({ error: 'Event not found.' }, { status: 404 });

    return NextResponse.json({ added: result.added, count: result.count });
  } catch {
    return NextResponse.json({ error: 'Failed to record reaction.' }, { status: 500 });
  }
}
