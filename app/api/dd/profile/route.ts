import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getGamificationProfile } from '@/lib/dd/gamification';

// ─── GET /api/dd/profile ── Get the current user's gamification profile ───────
// Returns XP, level, title, badges, streak, xpToNext progress
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profile = await getGamificationProfile(session.user.id);

  return NextResponse.json(profile);
}
