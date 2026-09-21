import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { getComments, postComment } from '@/lib/live-feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/live-feed/comments?eventId=
 *
 * Reading comments is public (no login required) — only posting requires
 * an account, per product decision. Threaded via `parentId`; the client
 * groups replies under their parent.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const eventId = url.searchParams.get('eventId');
  if (!eventId) return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });

  const comments = await getComments(eventId);
  return NextResponse.json({ comments });
}

/**
 * POST /api/live-feed/comments
 * Body: { eventId: string, body: string, parentId?: string }
 *
 * Requires a logged-in web_users session — comments are the one part of
 * Live Zone that's gated (reactions stay anonymous).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'You must be signed in to comment.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.eventId !== 'string' || typeof body.body !== 'string' || !body.body.trim()) {
    return NextResponse.json({ error: 'Invalid request. Expected { eventId, body }.' }, { status: 400 });
  }

  const comment = await postComment(body.eventId, session.user.id, body.body, body.parentId ?? null);
  if (!comment) return NextResponse.json({ error: 'Comment could not be posted.' }, { status: 400 });

  return NextResponse.json({ comment });
}
