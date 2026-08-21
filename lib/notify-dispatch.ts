/**
 * Shared notification dispatcher.
 *
 * Extracted from the cron route so the same logic can be run both on a
 * schedule (via /api/notifications/dispatch with the internal key) and
 * on-demand by an admin (via /api/notifications/test). For every pinned game
 * it fetches the live ESPN summary and pushes a persistent notification with
 * the current score + big plays to each user who pinned it.
 */

import { query } from './db';
import { fetchGameSummary } from './espn-summary';
import { buildEspnScoreIndex } from './espn-scores';
import { sendPushToUser } from './push';

export type DispatchEventResult = {
  event: string;
  users: number;
  scoreLine?: string;
  status?: string;
};

export type DispatchPinInfo = {
  /** The pinned game id from pinned_games.id */
  pinId: number;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  /** What happened to this pin during the dispatch pass. */
  outcome: 'pushed' | 'pre_game' | 'no_espn_match' | 'no_summary' | 'no_subscriptions';
  /** The ESPN event id if resolved, otherwise null. */
  espnEventId: string | null;
  /** Score line or status if available. */
  detail?: string;
};

export type DispatchResult = {
  ok: boolean;
  dispatched: number;
  reason?: string;
  events: DispatchEventResult[];
  /** Per-pin diagnostics so the admin console can show exactly what happened. */
  pins?: DispatchPinInfo[];
};

type PinRow = {
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
};

/**
 * Run one dispatch pass over every pinned game.
 * Only live and recently-final games produce a push; pre-game pins stay quiet.
 */
export async function runDispatch(): Promise<DispatchResult> {
  // Load all pinned games.
  let pins: { rows: PinRow[] };
  try {
    pins = await query<PinRow>('SELECT * FROM pinned_games');
  } catch (err) {
    console.error('[dispatch] Failed to load pinned_games:', err);
    return { ok: false, dispatched: 0, reason: 'database_error', events: [], pins: [] };
  }

  if (pins.rows.length === 0) {
    return { ok: true, dispatched: 0, reason: 'no pinned games', events: [], pins: [] };
  }

  // Resolve missing ESPN event ids per sport via one scoreboard index each.
  const sports = [...new Set(pins.rows.map((p) => p.sport.toUpperCase()))];
  const indexes = new Map<string, Awaited<ReturnType<typeof buildEspnScoreIndex>>>();
  await Promise.all(
    sports.map(async (s) => {
      try {
        indexes.set(s, await buildEspnScoreIndex([s]));
      } catch (err) {
        console.error(`[dispatch] ESPN score index failed for ${s}:`, err);
        indexes.set(s, { size: 0, match: () => null });
      }
    }),
  );

  // Group pins by (sport, resolved event id) so we fetch each summary once.
  const byEvent = new Map<string, { sport: string; eventId: string; pins: PinRow[] }>();

  // Track per-pin outcomes for diagnostics.
  const pinInfos: DispatchPinInfo[] = [];

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

    const baseInfo: DispatchPinInfo = {
      pinId: pin.id,
      sport: pin.sport,
      homeTeam: pin.home_team,
      awayTeam: pin.away_team,
      outcome: 'no_espn_match',
      espnEventId: eventId,
    };

    if (!eventId) {
      pinInfos.push(baseInfo);
      continue;
    }

    const key = `${sport}:${eventId}`;
    const bucket = byEvent.get(key) ?? { sport, eventId, pins: [] };
    bucket.pins.push(pin);
    byEvent.set(key, bucket);
  }

  let dispatched = 0;
  const results: DispatchEventResult[] = [];

  await Promise.all(
    [...byEvent.values()].map(async ({ sport, eventId, pins: eventPins }) => {
      let summary;
      try {
        summary = await fetchGameSummary(sport, eventId);
      } catch (err) {
        console.error(`[dispatch] fetchGameSummary failed for ${sport}:${eventId}:`, err);
      }
      if (!summary) {
        // Mark all pins in this event as no_summary.
        for (const pin of eventPins) {
          pinInfos.push({
            pinId: pin.id,
            sport: pin.sport,
            homeTeam: pin.home_team,
            awayTeam: pin.away_team,
            outcome: 'no_summary',
            espnEventId: eventId,
          });
        }
        return;
      }

      // Only push for live or final games — pre-game pins stay quiet.
      if (summary.state === 'pre') {
        for (const pin of eventPins) {
          pinInfos.push({
            pinId: pin.id,
            sport: pin.sport,
            homeTeam: pin.home_team,
            awayTeam: pin.away_team,
            outcome: 'pre_game',
            espnEventId: eventId,
            detail: summary.statusDetail ?? 'Scheduled',
          });
        }
        return;
      }

      const scoreLine = `${summary.away.abbrev} ${summary.away.score}  @  ${summary.home.abbrev} ${summary.home.score}`;
      const status = summary.isFinal ? 'Final' : summary.statusDetail ?? 'Live';
      const bigPlays = summary.bigPlays.slice(0, 5);

      let users = 0;
      await Promise.all(
        eventPins.map(async (pin) => {
          const plays = pin.notify_big_plays ? bigPlays : [];
          let delivered = 0;
          try {
            delivered = await sendPushToUser(pin.user_id, {
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
          } catch (err) {
            console.error(`[dispatch] sendPushToUser failed for user ${pin.user_id}:`, err);
          }
          if (delivered > 0) {
            users += 1;
            pinInfos.push({
              pinId: pin.id,
              sport: pin.sport,
              homeTeam: pin.home_team,
              awayTeam: pin.away_team,
              outcome: 'pushed',
              espnEventId: eventId,
              detail: scoreLine,
            });
          } else {
            pinInfos.push({
              pinId: pin.id,
              sport: pin.sport,
              homeTeam: pin.home_team,
              awayTeam: pin.away_team,
              outcome: 'no_subscriptions',
              espnEventId: eventId,
              detail: scoreLine,
            });
          }
        }),
      );

      if (users > 0) {
        dispatched += users;
        results.push({ event: `${sport}:${eventId}`, users, scoreLine, status });
      }
    }),
  );

  // Build a human-readable reason when nothing was dispatched.
  let reason: string | undefined;
  if (dispatched === 0) {
    const counts = {
      no_espn_match: 0,
      pre_game: 0,
      no_summary: 0,
      no_subscriptions: 0,
      pushed: 0,
    };
    for (const pi of pinInfos) counts[pi.outcome]++;
    const parts: string[] = [];
    if (counts.no_espn_match > 0) parts.push(`${counts.no_espn_match} no ESPN match`);
    if (counts.pre_game > 0) parts.push(`${counts.pre_game} pre-game`);
    if (counts.no_summary > 0) parts.push(`${counts.no_summary} no summary`);
    if (counts.no_subscriptions > 0) parts.push(`${counts.no_subscriptions} no subscriptions`);
    reason = parts.length > 0 ? `0 pushed (${parts.join(', ')})` : '0 pushed';
  }

  return { ok: true, dispatched, reason, events: results, pins: pinInfos };
}
