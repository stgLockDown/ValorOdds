/**
 * SSE passthrough to the Discord bot's existing /api/chat/stream endpoint.
 * Authenticates the web user, rebuilds identity headers, and pipes the event stream.
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { env } from '@/lib/env';
import { logEvent } from '@/lib/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const bodyText = await req.text();

  const upstream = await fetch(
    `${env.botApiBaseUrl().replace(/\/$/, '')}/api/internal/chat/stream`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.internalApiKey()}`,
        'X-Web-User-Id': session.user.id,
        'X-Web-User-Email': session.user.email ?? '',
        'X-Web-User-Tier': session.user.tier ?? 'free',
        'X-Web-Discord-Id': session.user.discordId ?? '',
      },
      body: bodyText,
    }
  );

  // Fire-and-forget analytics
  logEvent({
    userId: session.user.id,
    discordId: session.user.discordId ?? null,
    eventType: 'chat_sent',
    metadata: { source: 'web' },
  }).catch(() => {});

  if (!upstream.ok || !upstream.body) {
    const msg = await upstream.text().catch(() => '');
    return new Response(
      `event: error\ndata: ${JSON.stringify({ message: msg || `Upstream ${upstream.status}` })}\n\n`,
      {
        status: upstream.status,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      }
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}