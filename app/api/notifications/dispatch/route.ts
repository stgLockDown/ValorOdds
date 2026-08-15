import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { env } from '@/lib/env';
import { fetchGameSummary } from '@/lib/espn-summary';
import { buildEspnScoreIndex } from '@/lib/espn-scores';
import { sendPushToUser, isPushConfigured } from '@/lib/push';

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

  // Load all pinned games.
  const pins = await query<{
    id: number;
    user_id: string;
    game_id: string;
    espn_event_id: string | null;
    sport: string;
    home_team: string;
    away_team: string;
    home_abbrev: string | null;
    away_abbrev: string | null;
    notify_score: boolean;
    notify_big_plays: boolean;
  }>('SELECT * FROM pinned_games');

  if (pins.rows.length === 0) {
    return NextResponse.json({ ok: true, dispatched: 0, reason: 'no pinned games' });
  }

  // Resolve missing ESPN event ids per sport via one scoreboard index each.
  const sports = [...new Set(pins.rows.map((p) => p.sport.toUpperCase()))];
  const indexes = new Map<string, Awaited<ReturnType<typeof buildEspnScoreIndex>>>();
  await Promise.all(
    sports.map(async (s) => {
      indexes.set(s, await buildEspnScoreIndex([s]));
    }),
  );

  // Group pins by (sport, resolved event id) so we fetch each summary once.
  type PinRow = (typeof pins.rows)[number];
  const byEvent = new Map<string, { sport: string; eventId: string; pins: PinRow[] }>();

  for (const pin of pins.rows) {
    const sport = pin.sport.toUpperCase();
    let eventId = pin.espn_event_id;
    if (!eventId) {
      const match = indexes.get(sport)?.match(pin.home_team, pin.away_team);
      eventId = match?.eventId ?? null;
      if (eventId) {
        // Persist the resolved id so future dispatches skip the lookup.
        query('UPDATE pinned_games SET espn_event_id = $1 WHERE id = $2', [eventId, pin.id]).catch(
          () => {},
        );
      }
    }
    if (!eventId) continue;
    const key = `${sport}:${eventId}`;
    const bucket = byEvent.get(key) ?? { sport, eventId, pins: [] };
    bucket.pins.push(pin);
    byEvent.set(key, bucket);
  }

  let dispatched = 0;
  const results: Array<{ event: string; users: number }> = [];

  await Promise.all(
    [...byEvent.values()].map(async ({ sport, eventId, pins: eventPins }) => {
      const summary = await fetchGameSummary(sport, eventId);
      if (!summary) return;

      // Only push for live or final games — pre-game pins stay quiet.
      if (summary.state === 'pre') return;

      const scoreLine = `${summary.away.abbrev} ${summary.away.score}  @  ${summary.home.abbrev} ${summary.home.score}`;
      const status = summary.isFinal ? 'Final' : summary.statusDetail ?? 'Live';
      const bigPlays = summary.bigPlays.slice(0, 5);

      let users = 0;
      await Promise.all(
        eventPins.map(async (pin) => {
          const plays = pin.notify_big_plays ? bigPlays : [];
          const delivered = await sendPushToUser(pin.user_id, {
            title: `${summary.away.abbrev} @ ${summary.home.abbrev} — ${status}`,
            body: pin.notify_score ? scoreLine : status,
            url: `/dashboard?game=${encodeURIComponent(pin.game_id)}`,
            tag: `game-${pin.game_id}`,
            data: {
              gameId: pin.game_id,
              pinned: true,
              url: `/dashboard?game=${encodeURIComponent(pin.game_id)}`,
              bigPlays: plays,
            },
          });
          if (delivered > 0) users += 1;
        }),
      );

      if (users > 0) {
        dispatched += users;
        results.push({ event: `${sport}:${eventId}`, users });
      }
    }),
  );

  return NextResponse.json({ ok: true, dispatched, events: results });
}
