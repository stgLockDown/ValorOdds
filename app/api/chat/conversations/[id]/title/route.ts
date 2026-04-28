import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = params;
  const body = await req.json();
  const { title } = body;

  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });

  const checkResult = await query(
    `SELECT id FROM web_chat_conversations WHERE id = $1 AND user_id = $2`,
    [id, session.user.id]
  );

  if (checkResult.rows.length === 0) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  await query(
    `UPDATE web_chat_conversations SET title = $1 WHERE id = $2 AND user_id = $3`,
    [title, id, session.user.id]
  );

  return NextResponse.json({ success: true });
}