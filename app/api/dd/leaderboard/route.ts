import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getLeaderboard } from '@/lib/dd/gamification';

// ─── GET /api/dd/leaderboard ── Global XP leaderboard ─────────────────────────
// ?limit=50
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') ?? '50', 10);

  const leaderboard = await getLeaderboard(limit);

  return NextResponse.json({ leaderboard });
}
