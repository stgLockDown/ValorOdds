import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { env } from '@/lib/env';
import { isPushConfigured, sendPushToUser } from '@/lib/push';
import { runDispatch } from '@/lib/notify-dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin-only test endpoint for the notification system. Unlike the cron
 * dispatcher (which needs the internal API key), this is gated by the signed-in
 * admin's session so it can be driven from the in-page test console.
 *
 *   GET  /api/notifications/test
 *     → status snapshot: push configured, this admin's subscription count,
 *       total subscriptions, pinned-game count.
 *
 *   POST /api/notifications/test   { action: 'send-test' }
 *     → send a test push to the current admin's subscribed devices.
 *
 *   POST /api/notifications/test   { action: 'run-dispatch' }
 *     → run the full dispatcher pass inline and return per-event results.
 */
async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!session.user.isAdmin) {
    return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  return { session };
}

export async function GET() {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const [mySubs, allSubs, pinned] = await Promise.all([
    query<{ c: string }>('SELECT COUNT(*)::text AS c FROM push_subscriptions WHERE user_id = $1', [
      session!.user.id,
    ]),
    query<{ c: string }>('SELECT COUNT(*)::text AS c FROM push_subscriptions'),
    query<{ c: string }>('SELECT COUNT(*)::text AS c FROM pinned_games'),
  ]);

  return NextResponse.json({
    ok: true,
    pushConfigured: isPushConfigured(),
    vapidPublicKeyPresent: Boolean(env.vapidPublicKey()),
    mySubscriptions: Number(mySubs.rows[0]?.c ?? 0),
    totalSubscriptions: Number(allSubs.rows[0]?.c ?? 0),
    pinnedGames: Number(pinned.rows[0]?.c ?? 0),
  });
}

export async function POST(req: Request) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  if (!isPushConfigured()) {
    return NextResponse.json({ error: 'Push not configured (VAPID keys missing)' }, { status: 503 });
  }

  let action = 'send-test';
  try {
    const body = await req.json();
    if (body && typeof body.action === 'string') action = body.action;
  } catch {
    // no body → default action
  }

  if (action === 'send-test') {
    const delivered = await sendPushToUser(session!.user.id, {
      title: 'ValorOdds — Test notification',
      body: 'If you can see this, web push is working end-to-end. 🎉',
      url: '/admin/notifications',
      tag: 'admin-test',
      data: { url: '/admin/notifications', test: true },
    });
    return NextResponse.json({
      ok: true,
      action,
      delivered,
      message:
        delivered > 0
          ? `Test push delivered to ${delivered} device${delivered === 1 ? '' : 's'}.`
          : 'No subscribed devices for your account — subscribe to push first.',
    });
  }

  if (action === 'run-dispatch') {
    const result = await runDispatch();
    return NextResponse.json({ action, ...result });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
