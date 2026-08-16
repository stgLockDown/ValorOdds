import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { isPushConfigured } from '@/lib/push';
import { runDispatch } from '@/lib/notify-dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Notification dispatcher. Intended to be called on a schedule (cron / the
 * Discord bot's scheduler) with the internal API key.
 *
 *   POST /api/notifications/dispatch
 *     Headers: X-Cron-Secret: <INTERNAL_API_KEY>
 *              (or Authorization: Bearer <INTERNAL_API_KEY>)
 *
 * For every pinned game it fetches the live ESPN summary and pushes a
 * persistent notification with the current score + big plays to each user who
 * pinned it. Only live and recently-final games produce a push.
 *
 * The actual work lives in `runDispatch()` (lib/notify-dispatch.ts) so the
 * admin test console can run the exact same pass on-demand.
 */
export async function POST(req: Request) {
  const expected = env.internalApiKey();
  if (!expected || expected.startsWith('__buildtime_placeholder')) {
    return NextResponse.json({ error: 'Internal API key not configured' }, { status: 503 });
  }
  const cronSecret = req.headers.get('x-cron-secret') ?? '';
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (cronSecret !== expected && bearer !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isPushConfigured()) {
    return NextResponse.json({ error: 'Push not configured (VAPID keys missing)' }, { status: 503 });
  }

  const result = await runDispatch();
  return NextResponse.json(result);
}
