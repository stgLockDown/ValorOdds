import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createAccountLinkCode } from '@/lib/tokens';

export const runtime = 'nodejs';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { code, expiresAt } = await createAccountLinkCode(session.user.id);
  return NextResponse.json({ code, expiresAt: expiresAt.toISOString() });
}