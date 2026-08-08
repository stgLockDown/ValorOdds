import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAllTickets } from '@/lib/support-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — list all tickets (admin only), with optional status filter
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || 'all';
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  const { tickets, total } = await getAllTickets({ status, limit, offset });
  return NextResponse.json({ tickets, total });
}
