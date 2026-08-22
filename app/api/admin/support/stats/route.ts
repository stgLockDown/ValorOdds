import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getTicketStats,
  isSupportAIReady,
  checkSupportAIHealth,
} from '@/lib/support-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — support ticket stats for admin dashboard
export async function GET() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const stats = await getTicketStats();
  const aiHealth = await checkSupportAIHealth();

  return NextResponse.json({
    ...stats,
    aiEnabled: isSupportAIReady(),
    aiHealth,
  });
}
