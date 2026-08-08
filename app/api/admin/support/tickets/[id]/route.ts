import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { getTicketMessages, adminUpdateTicketStatus } from '@/lib/support-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — get a single ticket with full message thread (admin)
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const ticket = await queryOne(
    `SELECT t.id, t.user_id, t.subject, t.category, t.priority, t.status,
            t.ai_triaged, t.ai_response, t.ai_category, t.ai_priority, t.ai_confidence,
            t.escalated, t.created_at, t.updated_at, t.resolved_at,
            u.display_name AS username, u.email, u.discord_id
     FROM web_support_tickets t
     LEFT JOIN web_users u ON u.id = t.user_id
     WHERE t.id = $1`,
    [params.id]
  );

  if (!ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
  }

  const messages = await getTicketMessages(params.id);
  return NextResponse.json({ ticket, messages });
}

// PATCH — update ticket status (admin)
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const status = (body.status || '').trim();
  try {
    await adminUpdateTicketStatus(params.id, status);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
