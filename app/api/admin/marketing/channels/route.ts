import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getMarketingChannels } from '@/lib/bot-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/marketing/channels
 *   → Discord channels the bot allowlists for marketing posts.
 *     Empty list when the bot is unreachable (posting disabled, everything
 *     else in the studio keeps working).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const channels = await getMarketingChannels();
    return NextResponse.json({ channels, botReachable: channels.length > 0 });
  } catch (err) {
    // Bot down / not deployed yet — degrade, don't 500 the whole studio.
    console.error('[admin/marketing/channels]', err);
    return NextResponse.json({ channels: [], botReachable: false });
  }
}
