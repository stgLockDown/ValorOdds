import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import {
  getNotifications,
  unreadCount,
  markRead,
} from '@/lib/dd/notifications';

// ──────────────────────────────────────────────────────────────────────────────
// /api/dd/leagues/[id]/notifications
//
//   GET  → the caller's notification feed (+ unread count).
//          ?since=<id>  → only notifications newer than that id (toast poller)
//          ?limit=<n>   → page size (default 30, max 100)
//   POST → mark notifications read. Body: { ids?: string[] } (omit for all).
// ──────────────────────────────────────────────────────────────────────────────

async function resolveMembership(leagueId: bigint, userId: string) {
  return queryOne<{ id: string }>(
    `SELECT id::text FROM dd_league_members WHERE league_id = $1 AND user_id = $2`,
    [leagueId, BigInt(userId)]
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const leagueId = BigInt(params.id);
  const membership = await resolveMembership(leagueId, session.user.id);
  if (!membership) {
    return NextResponse.json({ error: 'You are not in this league' }, { status: 403 });
  }

  const url = new URL(req.url);
  const sinceParam = url.searchParams.get('since');
  const limitParam = url.searchParams.get('limit');

  const sinceId = sinceParam && /^\d+$/.test(sinceParam) ? BigInt(sinceParam) : null;
  const limit = limitParam ? Number(limitParam) : 30;

  const [items, unread] = await Promise.all([
    getNotifications(leagueId, BigInt(membership.id), { sinceId, limit }),
    unreadCount(leagueId, BigInt(membership.id)),
  ]);

  return NextResponse.json({ notifications: items, unread });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const leagueId = BigInt(params.id);
  const membership = await resolveMembership(leagueId, session.user.id);
  if (!membership) {
    return NextResponse.json({ error: 'You are not in this league' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const ids: string[] | undefined = Array.isArray(body?.ids) ? body.ids : undefined;

  const updated = await markRead(leagueId, BigInt(membership.id), ids);
  return NextResponse.json({ ok: true, updated });
}
