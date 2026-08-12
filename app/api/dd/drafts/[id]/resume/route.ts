import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { queryOne } from '@/lib/db';

// ─── POST /api/dd/drafts/[id]/resume ── Commissioner resumes paused draft ─────
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = BigInt(session.user.id);
  const draftId = BigInt(params.id);

  const draft = await queryOne<{
    id: string; status: string; commissioner_id: string;
  }>(
    `SELECT d.id::text, d.status, l.commissioner_id::text
     FROM dd_drafts d
     JOIN dd_leagues l ON l.id = d.league_id
     WHERE d.id = $1`,
    [draftId]
  );

  if (!draft) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  }

  const isComm =
    draft.commissioner_id === String(userId) ||
    (await queryOne<{ id: string }>(
      `SELECT m.id::text FROM dd_league_members m
       JOIN dd_drafts d ON d.league_id = m.league_id
       WHERE d.id = $1 AND m.user_id = $2 AND m.is_commissioner = true`,
      [draftId, userId]
    )) != null;

  if (!isComm) {
    return NextResponse.json({ error: 'Only the commissioner can resume the draft' }, { status: 403 });
  }

  if (draft.status !== 'paused') {
    return NextResponse.json({ error: `Draft is ${draft.status}, cannot resume` }, { status: 409 });
  }

  await queryOne<{ id: string }>(
    `UPDATE dd_drafts SET status = 'in_progress' WHERE id = $1 RETURNING id::text`,
    [draftId]
  );

  return NextResponse.json({ success: true, status: 'in_progress' });
}
