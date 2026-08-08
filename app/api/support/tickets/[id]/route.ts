import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getTicketForUser, getTicketMessages } from '@/lib/support-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — get a single ticket with its message thread
export async function GET(
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

  const messages = await getTicketMessages(params.id);
  return NextResponse.json({ ticket, messages });
}
