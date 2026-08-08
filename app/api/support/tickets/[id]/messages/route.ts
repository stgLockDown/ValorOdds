import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getTicketForUser, addMessage } from '@/lib/support-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — user adds a reply to their ticket
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ticket = await getTicketForUser(params.id, session.user.id);
  if (!ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
  }

  if (ticket.status === 'closed') {
    return NextResponse.json({ error: 'This ticket is closed' }, { status: 400 });
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
    return NextResponse.json({ error: 'Message is too long (max 5000 characters)' }, { status: 400 });
  }

  await addMessage(params.id, session.user.id, 'user', message);
  return NextResponse.json({ success: true });
}
