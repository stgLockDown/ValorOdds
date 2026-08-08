import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { addMessage } from '@/lib/support-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — admin replies to a ticket
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const message = (body.message || '').trim();
  if (!message || message.length < 1) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }
  if (message.length > 5000) {
    return NextResponse.json({ error: 'Message is too long' }, { status: 400 });
  }

  // Use admin's user_id for the message record
  await addMessage(params.id, session.user.id, 'admin', message);
  return NextResponse.json({ success: true });
}
