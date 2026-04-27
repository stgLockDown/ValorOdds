import { NextResponse } from 'next/server';
import { isDiscordConfigured } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public endpoint — tells the client which auth providers are available.
 * Used by SignInForm / SignUpForm to conditionally show the Discord button.
 */
export async function GET() {
  return NextResponse.json({
    discordEnabled: isDiscordConfigured(),
    emailEnabled: true,
  });
}