import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Get all messages for a conversation
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = params;

  // Verify user owns this conversation
  const checkResult = await query(
    `SELECT id FROM web_chat_conversations WHERE id = $1 AND user_id = $2`,
    [id, session.user.id]
  );

  if (checkResult.rows.length === 0) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const result = await query(
    `SELECT id, role, content, created_at
     FROM web_chat_messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC`,
    [id]
  );

  return NextResponse.json({ data: result.rows });
}

// Save messages for a conversation
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = params;
  const body = await req.json();
  const { messages } = body;

  if (!Array.isArray(messages)) {
    return NextResponse.json({ error: 'Messages array required' }, { status: 400 });
  }

  // Verify user owns this conversation
  const checkResult = await query(
    `SELECT id FROM web_chat_conversations WHERE id = $1 AND user_id = $2`,
    [id, session.user.id]
  );

  if (checkResult.rows.length === 0) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  // Clear existing messages and insert new ones
  await query(
    `DELETE FROM web_chat_messages WHERE conversation_id = $1`,
    [id]
  );

  for (const msg of messages) {
    await query(
      `INSERT INTO web_chat_messages (conversation_id, role, content)
       VALUES ($1, $2, $3)`,
      [id, msg.role, msg.content]
    );
  }

  return NextResponse.json({ success: true });
}