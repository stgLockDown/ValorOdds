import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { env } from '@/lib/env';
import { logEvent } from '@/lib/analytics';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const url = new URL(req.url);
  const format = (url.searchParams.get('format') || 'json').toLowerCase();

  const upstream = await fetch(
    `${env.botApiBaseUrl().replace(/\/$/, '')}/api/internal/chat/export?format=${encodeURIComponent(format)}`,
    {
      headers: {
        'Authorization': `Bearer ${env.internalApiKey()}`,
        'X-Web-User-Id': session.user.id,
        'X-Web-Discord-Id': session.user.discordId ?? '',
      },
    }
  );

  logEvent({
    userId: session.user.id,
    discordId: session.user.discordId ?? null,
    eventType: 'chat_export',
    metadata: { format },
  }).catch(() => {});

  if (!upstream.ok) {
    const msg = await upstream.text();
    return NextResponse.json({ error: msg || `Upstream ${upstream.status}` }, { status: upstream.status });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition':
        upstream.headers.get('content-disposition') ?? `attachment; filename="valor-odds-chat.${format}"`,
    },
  });
}