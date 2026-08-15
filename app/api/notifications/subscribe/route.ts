import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Save a browser Web Push subscription for the signed-in user.
 * Body: the PushSubscription JSON ({ endpoint, keys: { p256dh, auth } }).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const endpoint: string | undefined = body?.endpoint;
  const p256dh: string | undefined = body?.keys?.p256dh ?? body?.p256dh;
  const authKey: string | undefined = body?.keys?.auth ?? body?.auth;

  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  }

  const userAgent = req.headers.get('user-agent') ?? null;

  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id    = EXCLUDED.user_id,
       p256dh     = EXCLUDED.p256dh,
       auth       = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent,
       updated_at = NOW()`,
    [session.user.id, endpoint, p256dh, authKey, userAgent],
  );

  return NextResponse.json({ ok: true });
}

/**
 * Remove a subscription. Body: { endpoint }.
 */
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const endpoint: string | undefined = body?.endpoint;
  if (!endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 });

  await query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [
    session.user.id,
    endpoint,
  ]);

  return NextResponse.json({ ok: true });
}
