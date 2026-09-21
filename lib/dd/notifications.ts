/**
 * DiamondDraft — In-app notification feed.
 *
 * Powers the popup/toast notifications and the notification bell. Every league
 * event (a matchup going final, a waiver claim being processed, a trade being
 * proposed) is written to `dd_notifications` as one row per recipient, so the
 * read path is a single indexed scan and each manager keeps their own
 * read/unread state.
 *
 * Emits are idempotent: pass a `dedupeKey` and re-running a scorer or the
 * waiver processor will never double-notify. The partial unique index
 * `uq_ddnotif_dedupe` enforces this at the database level.
 */
import { query, queryOne } from '@/lib/db';

export type NotificationKind =
  | 'score'
  | 'matchup'
  | 'waiver'
  | 'trade'
  | 'draft'
  | 'league';

export interface EmitNotificationInput {
  leagueId: bigint;
  /** Recipient member id. `null` broadcasts to the whole league. */
  memberId: bigint | null;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  url?: string | null;
  data?: Record<string, unknown>;
  /** Stable key that makes this emit idempotent. */
  dedupeKey?: string | null;
}

export interface NotificationRow {
  id: string;
  leagueId: string;
  memberId: string | null;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

/**
 * Write a single notification. Idempotent when `dedupeKey` is supplied.
 * Returns the new row id, or null when the emit was deduped.
 */
export async function emitNotification(
  input: EmitNotificationInput
): Promise<string | null> {
  const res = await query<{ id: string }>(
    `INSERT INTO dd_notifications
       (league_id, member_id, kind, title, body, url, data, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
     ON CONFLICT (league_id, dedupe_key) WHERE dedupe_key IS NOT NULL
     DO NOTHING
     RETURNING id::text`,
    [
      input.leagueId,
      input.memberId,
      input.kind,
      input.title,
      input.body ?? null,
      input.url ?? null,
      JSON.stringify(input.data ?? {}),
      input.dedupeKey ?? null,
    ]
  );
  return res.rows[0]?.id ?? null;
}

/**
 * Broadcast a notification to every member of a league. Each member gets their
 * own row (so they can read/dismiss independently). The dedupe key is suffixed
 * with the member id to keep the unique index happy.
 */
export async function emitLeagueNotification(
  input: Omit<EmitNotificationInput, 'memberId'> & { memberId?: never }
): Promise<number> {
  const members = await query<{ id: string }>(
    `SELECT id::text FROM dd_league_members WHERE league_id = $1`,
    [input.leagueId]
  );

  let written = 0;
  for (const m of members.rows) {
    const id = await emitNotification({
      ...input,
      memberId: BigInt(m.id),
      dedupeKey: input.dedupeKey ? `${input.dedupeKey}:m${m.id}` : null,
    });
    if (id) written++;
  }
  return written;
}

/**
 * Read a member's feed: their own notifications plus league-wide broadcasts.
 * Pass `sinceId` to poll for only what's new (used by the toast poller).
 */
export async function getNotifications(
  leagueId: bigint,
  memberId: bigint,
  opts: { sinceId?: bigint | null; limit?: number } = {}
): Promise<NotificationRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const params: unknown[] = [leagueId, memberId];
  let cursor = '';
  if (opts.sinceId != null) {
    params.push(opts.sinceId);
    cursor = `AND n.id > $${params.length}`;
  }
  params.push(limit);

  const res = await query<any>(
    `SELECT n.id::text, n.league_id::text, n.member_id::text, n.kind, n.title,
            n.body, n.url, n.data, n.read_at, n.created_at
     FROM dd_notifications n
     WHERE n.league_id = $1
       AND (n.member_id = $2 OR n.member_id IS NULL)
       ${cursor}
     ORDER BY n.id DESC
     LIMIT $${params.length}`,
    params
  );

  return res.rows.map((r: any) => ({
    id: r.id,
    leagueId: r.league_id,
    memberId: r.member_id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    url: r.url,
    data: r.data ?? {},
    readAt: r.read_at ? new Date(r.read_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

/** Count unread notifications for the bell badge. */
export async function unreadCount(
  leagueId: bigint,
  memberId: bigint
): Promise<number> {
  const row = await queryOne<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM dd_notifications
     WHERE league_id = $1
       AND (member_id = $2 OR member_id IS NULL)
       AND read_at IS NULL`,
    [leagueId, memberId]
  );
  return Number(row?.cnt ?? '0');
}

/** Mark specific notifications read (or all, when `ids` is omitted). */
export async function markRead(
  leagueId: bigint,
  memberId: bigint,
  ids?: string[]
): Promise<number> {
  if (ids && ids.length) {
    const res = await query(
      `UPDATE dd_notifications SET read_at = NOW()
       WHERE league_id = $1
         AND (member_id = $2 OR member_id IS NULL)
         AND read_at IS NULL
         AND id = ANY($3::bigint[])`,
      [leagueId, memberId, ids]
    );
    return res.rowCount ?? 0;
  }
  const res = await query(
    `UPDATE dd_notifications SET read_at = NOW()
     WHERE league_id = $1
       AND (member_id = $2 OR member_id IS NULL)
       AND read_at IS NULL`,
    [leagueId, memberId]
  );
  return res.rowCount ?? 0;
}
