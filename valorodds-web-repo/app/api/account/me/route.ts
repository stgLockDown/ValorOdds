import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { getActiveSubscriptionForUser } from '@/lib/subscriptions';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const userRow = await queryOne<{
    email: string;
    display_name: string | null;
    avatar_url: string | null;
    discord_id: string | null;
    email_verified_at: Date | null;
    created_at: Date;
  }>(
    `SELECT email, display_name, avatar_url, discord_id, email_verified_at, created_at
     FROM web_users WHERE id = $1::bigint`,
    [session.user.id]
  );
  const sub = await getActiveSubscriptionForUser(session.user.id, session.user.discordId ?? null);
  return NextResponse.json({
    user: userRow,
    tier: session.user.tier,
    isAdmin: session.user.isAdmin,
    subscription: sub,
  });
}