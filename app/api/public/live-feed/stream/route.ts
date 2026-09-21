import { NextRequest } from 'next/server';
import { buildEspnScoreIndex } from '@/lib/espn-scores';
import { syncLiveFeed, getLiveFeed, type LiveFeedEvent } from '@/lib/live-feed';
import { voterFingerprint, getClientIp } from '@/lib/polls';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ── GET /api/public/live-feed/stream?sport=&home=&away=&event= ──
// Server-Sent Events for the Live Zone feed. Mirrors the pattern proven in
// app/api/dd/drafts/[id]/stream/route.ts: no WebSocket infra, just a
// ReadableStream that polls ESPN + the DB every few seconds and pushes a
// diff-based event only when something changed. Public/anonymous — the
// feed itself requires no login (only posting a comment does).
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sport = (url.searchParams.get('sport') || '').toUpperCase();
  const home = url.searchParams.get('home');
  const away = url.searchParams.get('away');
  let eventId = url.searchParams.get('event');

  if (!sport || !home || !away) {
    return new Response('Missing sport/home/away', { status: 400 });
  }

  if (!eventId) {
    const index = await buildEspnScoreIndex([sport]);
    const match = index.match(home, away);
    if (match?.eventId) eventId = match.eventId;
  }
  if (!eventId) {
    return new Response('Could not resolve ESPN event for this matchup.', { status: 404 });
  }

  const resolvedEventId = eventId;
  const ip = getClientIp(req);
  const ua = req.headers.get('user-agent') ?? '';
  const fp = voterFingerprint(ip, ua);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let lastHash = '';
      let closed = false;

      const sendEvent = (data: unknown) => {
        if (closed) return;
        const json = JSON.stringify(data);
        try {
          controller.enqueue(encoder.encode(`data: ${json}\n\n`));
        } catch {
          // Stream already closed client-side; ignore.
        }
      };

      const sendHeartbeat = () => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          // ignore
        }
      };

      const tick = async () => {
        try {
          await syncLiveFeed(sport, resolvedEventId);
          const events: LiveFeedEvent[] = await getLiveFeed(sport, resolvedEventId, { fingerprint: fp });

          // Hash on id+version+reaction totals+comment counts so any
          // meaningful change (new play, corrected play, new reaction,
          // new comment) triggers a push — but a no-op poll tick doesn't.
          const hash = JSON.stringify(
            events.map((e) => [
              e.id,
              e.version,
              e.commentCount,
              Object.values(e.reactions).reduce((a, b) => a + b, 0),
            ]),
          );

          if (hash !== lastHash) {
            lastHash = hash;
            sendEvent({ type: 'feed', eventId: resolvedEventId, events });
          }
        } catch {
          // Non-fatal — skip this cycle, try again on the next tick.
        }
      };

      await tick();
      const pollInterval = setInterval(tick, 4000);
      const heartbeatInterval = setInterval(sendHeartbeat, 15000);

      const cleanup = () => {
        closed = true;
        clearInterval(pollInterval);
        clearInterval(heartbeatInterval);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      req.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      // Consumer cancelled — interval cleanup handled by the abort listener above.
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
