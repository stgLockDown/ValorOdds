/**
 * Live Zone — real-time play-by-play event feed.
 *
 * v1 scope: NFL only. Architecture is sport-agnostic (the `live_feed_events`
 * table and `LiveFeedEvent` type carry every field needed for MLB/NHL too),
 * but only `extractNflEvents()` exists today. Adding MLB/NHL later means
 * writing `extractMlbEvents()` / `extractNhlEvents()` siblings and adding a
 * dispatch branch in `syncLiveFeed()` — no schema or API changes required.
 *
 * Pipeline:
 *   1. `syncLiveFeed(sport, espnEventId)` fetches the raw ESPN summary
 *      (via the same host-fallback fetcher as lib/espn-summary.ts),
 *      extracts ALL plays/timeouts/quarter-ends (not just "big" ones),
 *      and upserts them into `live_feed_events`. A play that ESPN later
 *      corrects (stat correction) gets its `version` bumped and fields
 *      overwritten in place — the row's primary key/source_play_id stays
 *      stable so client-side diffing sees an EVENT_UPDATED, not a dupe.
 *   2. `getLiveFeed(sport, espnEventId, opts)` reads back the normalized
 *      feed (newest-first) with live reaction counts attached, for both
 *      the initial page load and each SSE poll tick.
 */

import { query } from './db';
import { espnPathForSport, fetchRawSummaryJson } from './espn-summary';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LiveFeedEventType = 'play' | 'tv_timeout' | 'team_timeout' | 'quarter_end' | 'game_status';

export type LiveFeedEvent = {
  id: string;
  sport: string;
  espnEventId: string;
  sourcePlayId: string;
  version: number;
  eventType: LiveFeedEventType;
  playTypeText: string | null;
  text: string | null;
  teamAbbrev: string | null;
  homeScore: number | null;
  awayScore: number | null;
  period: number | null;
  clockDisplay: string | null;
  down: number | null;
  distance: number | null;
  yardLine: number | null;
  yardsToEndzone: number | null;
  possessionText: string | null;
  downDistanceText: string | null;
  isRedZone: boolean;
  fieldPosition: number | null;
  isScoringPlay: boolean;
  scoringType: string | null;
  isTurnover: boolean;
  statYardage: number | null;
  wallclock: string | null;
  reactions: Record<string, number>;
  myReactions: string[];
  commentCount: number;
};

const REACTION_EMOJIS = ['🔥', '😂', '👏', '😱', '💀'];

// ---------------------------------------------------------------------------
// Ingestion — NFL
// ---------------------------------------------------------------------------

type RawPlay = any;

function toInt(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

/** Parse "MM:SS" into total seconds remaining in the period, for sort keys. */
function clockToSeconds(display: string | null | undefined): number | null {
  if (!display) return null;
  const m = /^(\d+):(\d{2})$/.exec(display.trim());
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** Build a teamId -> abbreviation map from the raw summary header. */
function buildAbbrevMap(header: any): Map<string, string> {
  const map = new Map<string, string>();
  const competitors = header?.competitions?.[0]?.competitors ?? [];
  for (const c of competitors) {
    const id = c?.team?.id != null ? String(c.team.id) : null;
    const ab = c?.team?.abbreviation ?? null;
    if (id && ab) map.set(id, ab);
  }
  return map;
}

/**
 * Normalize field position to 0.0 (own end zone) .. 1.0 (opponent end zone),
 * from the offense's perspective, using `yardsToEndzone` (0 = in the end
 * zone about to score, 100 = pinned at own goal line).
 */
function fieldPositionFrom(yardsToEndzone: number | null): number | null {
  if (yardsToEndzone === null) return null;
  const clamped = Math.max(0, Math.min(100, yardsToEndzone));
  return Math.round((1 - clamped / 100) * 1000) / 1000;
}

type ExtractedEvent = {
  sourcePlayId: string;
  eventType: LiveFeedEventType;
  playTypeText: string | null;
  text: string | null;
  teamAbbrev: string | null;
  homeScore: number | null;
  awayScore: number | null;
  period: number | null;
  clockDisplay: string | null;
  clockSeconds: number | null;
  down: number | null;
  distance: number | null;
  yardLine: number | null;
  yardsToEndzone: number | null;
  possessionText: string | null;
  downDistanceText: string | null;
  isRedZone: boolean | null;
  fieldPosition: number | null;
  isScoringPlay: boolean;
  scoringType: string | null;
  isTurnover: boolean;
  statYardage: number | null;
  wallclock: string | null;
};

function classifyNflPlayType(typeText: string): LiveFeedEventType {
  if (typeText === 'Official Timeout') return 'tv_timeout';
  if (typeText === 'Timeout') return 'team_timeout';
  if (typeText === 'End Period' || typeText === 'End of Half' || typeText === 'End of Game') return 'quarter_end';
  return 'play';
}

/**
 * Extract ALL plays (not just "big" ones) from an NFL ESPN summary payload,
 * with full situational data. This is the "Sleeper Zone"-equivalent feed —
 * a superset of lib/espn-summary.ts's `nflBigPlays()`, which intentionally
 * discards down/distance/situation to keep the box-score page lightweight.
 */
export function extractNflEvents(summary: any): ExtractedEvent[] {
  const header = summary?.header ?? {};
  const abbrevMap = buildAbbrevMap(header);
  const drives = summary?.drives ?? {};
  const allDrives: any[] = [...(drives.previous ?? [])];
  if (drives.current) allDrives.push(drives.current);

  const out: ExtractedEvent[] = [];
  for (const drive of allDrives) {
    const driveAbbrev: string | null = drive?.team?.abbreviation ?? null;
    const plays: RawPlay[] = drive?.plays ?? [];
    for (const p of plays) {
      const typeText: string = p?.type?.text ?? '';
      const eventType = classifyNflPlayType(typeText);

      const start = p?.start ?? {};
      const yardsToEndzone: number | null = toInt(start?.yardsToEndzone);
      const down: number | null = toInt(start?.down);
      const distance: number | null = toInt(start?.distance);
      const yardLine: number | null = toInt(start?.yardLine);
      // Prefer the play's own team abbreviation from teamParticipants
      // (offense side) when present, falling back to the drive's team.
      let playTeamAbbrev = driveAbbrev;
      const offenseParticipant = (p?.teamParticipants ?? []).find((tp: any) => tp?.type === 'offense');
      if (offenseParticipant?.id) {
        playTeamAbbrev = abbrevMap.get(String(offenseParticipant.id)) ?? playTeamAbbrev;
      }

      out.push({
        sourcePlayId: p?.id != null ? String(p.id) : `${drive?.id ?? 'd'}-${out.length}`,
        eventType,
        playTypeText: typeText || null,
        text: p?.text ?? null,
        teamAbbrev: playTeamAbbrev,
        homeScore: toInt(p?.homeScore),
        awayScore: toInt(p?.awayScore),
        period: toInt(p?.period?.number),
        clockDisplay: p?.clock?.displayValue ?? null,
        clockSeconds: clockToSeconds(p?.clock?.displayValue),
        down: down !== null && down >= 1 ? down : null,
        distance: distance !== null && distance >= 0 ? distance : null,
        yardLine,
        yardsToEndzone,
        possessionText: start?.possessionText ?? null,
        downDistanceText: start?.downDistanceText ?? null,
        isRedZone: yardsToEndzone !== null ? yardsToEndzone <= 20 : null,
        fieldPosition: fieldPositionFrom(yardsToEndzone),
        isScoringPlay: Boolean(p?.scoringPlay),
        scoringType: p?.scoringType?.displayName ?? p?.scoringType?.name ?? null,
        isTurnover: Boolean(p?.isTurnover) || /intercept|fumble/i.test(p?.text ?? ''),
        statYardage: toInt(p?.statYardage),
        wallclock: p?.wallclock ?? null,
      });
    }
  }
  return out;
}

/** Dispatch extraction by sport. Only NFL implemented in v1. */
function extractEvents(sport: string, summary: any): ExtractedEvent[] {
  const key = sport.toUpperCase();
  if (key === 'NFL' || key === 'NCAAF') return extractNflEvents(summary);
  // MLB/NHL: not implemented yet — return empty so callers fail soft
  // instead of throwing. See module docstring for the extension plan.
  return [];
}

// ---------------------------------------------------------------------------
// Sync throttling / dedup
// ---------------------------------------------------------------------------
//
// Every open browser tab on a game's Live tab runs its own SSE loop that
// calls syncLiveFeed() every 4s (plus the initial-snapshot GET route calls
// it once per page load). With no coordination, N concurrent viewers of the
// same popular game means N independent "fetch ESPN + upsert ~20 rows"
// cycles running in parallel every few seconds, each burning multiple
// round trips against the shared Postgres pool (max: 10 connections for
// the whole app, shared with odds ingestion, auth enrichment, admin tools,
// etc). Under real traffic on a live game this starves the pool for
// everything else in the app (observed in production logs as
// "timeout exceeded when trying to connect" across totally unrelated
// endpoints while a live game was being viewed).
//
// Fix: coordinate syncs per (sport, espnEventId) so that regardless of how
// many viewers are polling, at most one sync actually runs at a time and
// results are shared/throttled to a minimum interval.
const SYNC_THROTTLE_MS = 3000;
const syncInFlight = new Map<string, Promise<{ synced: number } | null>>();
const lastSyncedAt = new Map<string, number>();

/**
 * Fetch the latest ESPN summary for a game and upsert every play/timeout/
 * quarter-end into `live_feed_events`. Idempotent — safe to call on every
 * poll tick. Corrected plays (same source_play_id, changed content) get
 * their `version` bumped in place.
 *
 * Coordinated across concurrent callers (see module notes above): if a
 * sync for this game is already in flight, callers await that same
 * promise instead of starting a duplicate one; if a sync completed very
 * recently, callers get an immediate no-op instead of hitting ESPN/DB
 * again.
 */
export async function syncLiveFeed(sport: string, espnEventId: string): Promise<{ synced: number } | null> {
  const path = espnPathForSport(sport);
  if (!path || !espnEventId) return null;

  const key = `${sport.toUpperCase()}:${espnEventId}`;

  const inFlight = syncInFlight.get(key);
  if (inFlight) return inFlight;

  const last = lastSyncedAt.get(key) ?? 0;
  if (Date.now() - last < SYNC_THROTTLE_MS) {
    return { synced: 0 };
  }

  const promise = (async (): Promise<{ synced: number } | null> => {
    try {
      const summary = await fetchRawSummaryJson(path, espnEventId);
      if (!summary) return null;

      const events = extractEvents(sport, summary);
      if (events.length === 0) return { synced: 0 };

      const sportUp = sport.toUpperCase();

      // Batch every play into a single multi-row upsert instead of N
      // sequential round trips — this is the change that matters most
      // for pool pressure under concurrent viewers. Each row supplies 25
      // bound params (version=1 and updated_at=NOW() are literals, not
      // params), so the stride between rows' placeholder indices is 25.
      const paramsPerRow = 25;
      const values: string[] = [];
      const params: unknown[] = [];
      events.forEach((e, i) => {
        const b = i * paramsPerRow;
        values.push(
          `($${b + 1},$${b + 2},$${b + 3},1,$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14},$${b + 15},$${b + 16},$${b + 17},$${b + 18},$${b + 19},$${b + 20},$${b + 21},$${b + 22},$${b + 23},$${b + 24},$${b + 25},NOW())`,
        );
        params.push(
          sportUp,
          String(espnEventId),
          e.sourcePlayId,
          e.eventType,
          e.playTypeText,
          e.text,
          e.teamAbbrev,
          e.homeScore,
          e.awayScore,
          e.period,
          e.clockDisplay,
          e.clockSeconds,
          e.down,
          e.distance,
          e.yardLine,
          e.yardsToEndzone,
          e.possessionText,
          e.downDistanceText,
          e.isRedZone,
          e.fieldPosition,
          e.isScoringPlay,
          e.scoringType,
          e.isTurnover,
          e.statYardage,
          e.wallclock,
        );
      });

      await query(
        `INSERT INTO live_feed_events (
           sport, espn_event_id, source_play_id, version, event_type, play_type_text, text,
           team_abbrev, home_score, away_score, period, clock_display, clock_seconds,
           down, distance, yard_line, yards_to_endzone, possession_text, down_distance_text,
           is_red_zone, field_position, is_scoring_play, scoring_type, is_turnover, stat_yardage,
           wallclock, updated_at
         ) VALUES ${values.join(', ')}
         ON CONFLICT (sport, espn_event_id, source_play_id) DO UPDATE SET
           version        = live_feed_events.version + CASE WHEN live_feed_events.text IS DISTINCT FROM EXCLUDED.text
                                                               OR live_feed_events.home_score IS DISTINCT FROM EXCLUDED.home_score
                                                               OR live_feed_events.away_score IS DISTINCT FROM EXCLUDED.away_score
                                                          THEN 1 ELSE 0 END,
           event_type      = EXCLUDED.event_type,
           play_type_text  = EXCLUDED.play_type_text,
           text            = EXCLUDED.text,
           team_abbrev     = EXCLUDED.team_abbrev,
           home_score      = EXCLUDED.home_score,
           away_score      = EXCLUDED.away_score,
           period          = EXCLUDED.period,
           clock_display   = EXCLUDED.clock_display,
           clock_seconds   = EXCLUDED.clock_seconds,
           down            = EXCLUDED.down,
           distance        = EXCLUDED.distance,
           yard_line       = EXCLUDED.yard_line,
           yards_to_endzone = EXCLUDED.yards_to_endzone,
           possession_text = EXCLUDED.possession_text,
           down_distance_text = EXCLUDED.down_distance_text,
           is_red_zone     = EXCLUDED.is_red_zone,
           field_position  = EXCLUDED.field_position,
           is_scoring_play = EXCLUDED.is_scoring_play,
           scoring_type    = EXCLUDED.scoring_type,
           is_turnover     = EXCLUDED.is_turnover,
           stat_yardage    = EXCLUDED.stat_yardage,
           wallclock       = EXCLUDED.wallclock,
           updated_at      = NOW()`,
        params,
      );

      lastSyncedAt.set(key, Date.now());
      return { synced: events.length };
    } finally {
      syncInFlight.delete(key);
    }
  })();

  syncInFlight.set(key, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

type EventRow = {
  id: string;
  sport: string;
  espn_event_id: string;
  source_play_id: string;
  version: number;
  event_type: LiveFeedEventType;
  play_type_text: string | null;
  text: string | null;
  team_abbrev: string | null;
  home_score: number | null;
  away_score: number | null;
  period: number | null;
  clock_display: string | null;
  down: number | null;
  distance: number | null;
  yard_line: number | null;
  yards_to_endzone: number | null;
  possession_text: string | null;
  down_distance_text: string | null;
  is_red_zone: boolean | null;
  field_position: string | null;
  is_scoring_play: boolean;
  scoring_type: string | null;
  is_turnover: boolean;
  stat_yardage: number | null;
  wallclock: string | null;
  comment_count: string;
};

/**
 * Read the live feed for a game, newest-first, with reaction tallies and
 * (if a voter fingerprint is supplied) that visitor's own reactions.
 */
export async function getLiveFeed(
  sport: string,
  espnEventId: string,
  opts: { fingerprint?: string; limit?: number } = {},
): Promise<LiveFeedEvent[]> {
  const limit = opts.limit ?? 200;
  const r = await query<EventRow>(
    `SELECT
       e.id::text, e.sport, e.espn_event_id, e.source_play_id, e.version, e.event_type,
       e.play_type_text, e.text, e.team_abbrev, e.home_score, e.away_score, e.period,
       e.clock_display, e.down, e.distance, e.yard_line, e.yards_to_endzone,
       e.possession_text, e.down_distance_text, e.is_red_zone, e.field_position::text,
       e.is_scoring_play, e.scoring_type, e.is_turnover, e.stat_yardage, e.wallclock::text,
       (SELECT COUNT(*)::text FROM live_feed_comments c WHERE c.event_id = e.id AND NOT c.is_deleted) AS comment_count
     FROM live_feed_events e
     WHERE e.sport = $1 AND e.espn_event_id = $2
     ORDER BY e.wallclock DESC NULLS LAST, e.id DESC
     LIMIT $3`,
    [sport.toUpperCase(), String(espnEventId), limit],
  );

  if (r.rows.length === 0) return [];

  const ids = r.rows.map((row) => row.id);
  const reactionCounts = new Map<string, Record<string, number>>();
  const myReactions = new Map<string, string[]>();

  const rc = await query<{ event_id: string; emoji: string; cnt: string }>(
    `SELECT event_id::text, emoji, COUNT(*)::text AS cnt
     FROM live_feed_reactions
     WHERE event_id = ANY($1::bigint[])
     GROUP BY event_id, emoji`,
    [ids],
  );
  for (const row of rc.rows) {
    const map = reactionCounts.get(row.event_id) ?? {};
    map[row.emoji] = parseInt(row.cnt, 10);
    reactionCounts.set(row.event_id, map);
  }

  if (opts.fingerprint) {
    const mine = await query<{ event_id: string; emoji: string }>(
      `SELECT event_id::text, emoji FROM live_feed_reactions
       WHERE event_id = ANY($1::bigint[]) AND voter_fingerprint = $2`,
      [ids, opts.fingerprint],
    );
    for (const row of mine.rows) {
      const list = myReactions.get(row.event_id) ?? [];
      list.push(row.emoji);
      myReactions.set(row.event_id, list);
    }
  }

  return r.rows.map((row) => ({
    id: row.id,
    sport: row.sport,
    espnEventId: row.espn_event_id,
    sourcePlayId: row.source_play_id,
    version: row.version,
    eventType: row.event_type,
    playTypeText: row.play_type_text,
    text: row.text,
    teamAbbrev: row.team_abbrev,
    homeScore: row.home_score,
    awayScore: row.away_score,
    period: row.period,
    clockDisplay: row.clock_display,
    down: row.down,
    distance: row.distance,
    yardLine: row.yard_line,
    yardsToEndzone: row.yards_to_endzone,
    possessionText: row.possession_text,
    downDistanceText: row.down_distance_text,
    isRedZone: Boolean(row.is_red_zone),
    fieldPosition: row.field_position !== null ? parseFloat(row.field_position) : null,
    isScoringPlay: row.is_scoring_play,
    scoringType: row.scoring_type,
    isTurnover: row.is_turnover,
    statYardage: row.stat_yardage,
    wallclock: row.wallclock,
    reactions: reactionCounts.get(row.id) ?? {},
    myReactions: myReactions.get(row.id) ?? [],
    commentCount: parseInt(row.comment_count, 10) || 0,
  }));
}

export function isValidReactionEmoji(emoji: string): boolean {
  return REACTION_EMOJIS.includes(emoji);
}

export { REACTION_EMOJIS };

/** Toggle a reaction on/off for a given voter fingerprint. Returns new count. */
export async function toggleReaction(
  eventId: string,
  emoji: string,
  fingerprint: string,
): Promise<{ added: boolean; count: number } | null> {
  if (!isValidReactionEmoji(emoji)) return null;

  const existing = await query<{ id: string }>(
    `SELECT id::text FROM live_feed_reactions WHERE event_id = $1 AND emoji = $2 AND voter_fingerprint = $3`,
    [eventId, emoji, fingerprint],
  );

  let added: boolean;
  if (existing.rows.length > 0) {
    await query(`DELETE FROM live_feed_reactions WHERE id = $1`, [existing.rows[0].id]);
    added = false;
  } else {
    await query(
      `INSERT INTO live_feed_reactions (event_id, emoji, voter_fingerprint) VALUES ($1,$2,$3)
       ON CONFLICT (event_id, emoji, voter_fingerprint) DO NOTHING`,
      [eventId, emoji, fingerprint],
    );
    added = true;
  }

  const countRes = await query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM live_feed_reactions WHERE event_id = $1 AND emoji = $2`,
    [eventId, emoji],
  );
  return { added, count: parseInt(countRes.rows[0]?.cnt ?? '0', 10) };
}

// ---------------------------------------------------------------------------
// Comments (require login — see app/api/live-feed/comments routes)
// ---------------------------------------------------------------------------

export type LiveFeedComment = {
  id: string;
  eventId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  parentId: string | null;
  body: string;
  createdAt: string;
};

export async function getComments(eventId: string): Promise<LiveFeedComment[]> {
  const r = await query<{
    id: string;
    event_id: string;
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    parent_id: string | null;
    body: string;
    created_at: string;
  }>(
    `SELECT c.id::text, c.event_id::text, c.user_id::text,
            u.display_name, u.avatar_url, c.parent_id::text, c.body, c.created_at::text
     FROM live_feed_comments c
     JOIN web_users u ON u.id = c.user_id
     WHERE c.event_id = $1 AND NOT c.is_deleted
     ORDER BY c.created_at ASC`,
    [eventId],
  );
  return r.rows.map((row) => ({
    id: row.id,
    eventId: row.event_id,
    userId: row.user_id,
    displayName: row.display_name || 'Fan',
    avatarUrl: row.avatar_url,
    parentId: row.parent_id,
    body: row.body,
    createdAt: row.created_at,
  }));
}

const MAX_COMMENT_LENGTH = 500;

export async function postComment(
  eventId: string,
  userId: string,
  body: string,
  parentId?: string | null,
): Promise<LiveFeedComment | null> {
  const trimmed = body.trim().slice(0, MAX_COMMENT_LENGTH);
  if (!trimmed) return null;

  const r = await query<{ id: string; created_at: string }>(
    `INSERT INTO live_feed_comments (event_id, user_id, parent_id, body)
     VALUES ($1, $2, $3, $4)
     RETURNING id::text, created_at::text`,
    [eventId, userId, parentId ?? null, trimmed],
  );

  const row = r.rows[0];
  const userRes = await query<{ display_name: string | null; avatar_url: string | null }>(
    `SELECT display_name, avatar_url FROM web_users WHERE id = $1`,
    [userId],
  );

  return {
    id: row.id,
    eventId,
    userId,
    displayName: userRes.rows[0]?.display_name || 'Fan',
    avatarUrl: userRes.rows[0]?.avatar_url ?? null,
    parentId: parentId ?? null,
    body: trimmed,
    createdAt: row.created_at,
  };
}
