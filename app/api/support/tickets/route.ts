import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createTicket, getTicketsForUser, isSupportAIReady } from '@/lib/support-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — list current user's tickets
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tickets = await getTicketsForUser(session.user.id);
  return NextResponse.json({ tickets, aiEnabled: isSupportAIReady() });
}

// POST — create a new support ticket (AI-first triage)
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { subject?: string; message?: string; category?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const subject = (body.subject || '').trim();
  const message = (body.message || '').trim();
  const category = (body.category || 'general').trim();

  if (!subject || subject.length < 3) {
    return NextResponse.json({ error: 'Subject is required (min 3 characters)' }, { status: 400 });
  }
  if (!message || message.length < 10) {
    return NextResponse.json({ error: 'Message is required (min 10 characters)' }, { status: 400 });
  }
  if (subject.length > 200) {
    return NextResponse.json({ error: 'Subject is too long (max 200 characters)' }, { status: 400 });
  }
  if (message.length > 5000) {
    return NextResponse.json({ error: 'Message is too long (max 5000 characters)' }, { status: 400 });
  }

  try {
    const { ticket, triage } = await createTicket({
      userId: session.user.id,
      subject,
      category,
      message,
    });

    return NextResponse.json({
      ticket,
      aiTriaged: triage !== null,
      aiResponse: triage?.aiResponse ?? null,
      autoResolved: triage?.autoResolve ?? false,
      provider: triage?.provider ?? null,
    });
  } catch (err) {
    console.error('[support] createTicket error:', err);
    return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
  }
}
