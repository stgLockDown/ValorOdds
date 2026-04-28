import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Get all conversations for current user
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await query(
    `SELECT id, title, created_at, updated_at
     FROM web_chat_conversations
     WHERE user_id = $1
     ORDER BY updated_at DESC
     LIMIT 50`,
    [session.user.id]
  );

  return NextResponse.json({ data: result.rows });
}

// Create new conversation
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Generate auto title
  const title = 'New Chat';
  
  const result = await query(
    `INSERT INTO web_chat_conversations (user_id, title)
     VALUES ($1, $2)
     RETURNING id, title, created_at, updated_at`,
    [session.user.id, title]
  );

  return NextResponse.json({ data: result.rows[0] });
}

// Delete conversation
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'Conversation ID required' }, { status: 400 });

  await query(
    `DELETE FROM web_chat_conversations
     WHERE id = $1 AND user_id = $2`,
    [id, session.user.id]
  );

  return NextResponse.json({ success: true });
}