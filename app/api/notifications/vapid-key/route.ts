import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Returns the public VAPID key the browser needs to subscribe to push.
 * The key is not secret — it's safe to expose to clients.
 */
export async function GET() {
  const key = env.vapidPublicKey();
  if (!key) {
    return NextResponse.json({ error: 'Push not configured' }, { status: 503 });
  }
  return NextResponse.json({ key });
}
