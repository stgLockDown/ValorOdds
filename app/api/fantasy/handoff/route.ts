import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { auth } from '@/lib/auth';
import { env } from '@/lib/env';

/**
 * Mints a short-lived HS256 JWT that identifies the currently-signed-in
 * ValorOdds user to DiamondDraft. The browser then POSTs that token to
 * DiamondDraft's /api/auth/sso/valorodds endpoint (via the /sso landing
 * page) and receives a DiamondDraft JWT back.
 *
 * This route does NOT hit DiamondDraft — it just produces the token.
 * That keeps the handoff fast and avoids coupling ValorOdds's uptime
 * to DiamondDraft's.
 *
 * Security:
 * - 5 minute TTL.
 * - Audience claim `diamonddraft`.
 * - Unique `jti` so DiamondDraft can reject replays.
 * - Signed with the same secret DiamondDraft verifies with.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function base64url(input: Buffer | string): string {
  return Buffer.from(input as any)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signHS256(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = crypto.createHmac('sha256', secret).update(signingInput).digest();
  const sigB64 = base64url(sig);
  return `${signingInput}.${sigB64}`;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'You must be signed in to link Fantasy.', code: 'not_authenticated' },
      { status: 401 },
    );
  }

  const secret = env.diamondDraftSsoSecret();
  if (!secret || secret.startsWith('__buildtime_placeholder')) {
    return NextResponse.json(
      {
        error:
          'Fantasy integration is not configured yet. Set DIAMONDDRAFT_SSO_SECRET on the server.',
        code: 'sso_not_configured',
      },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { redirect?: string };
  const redirect = typeof body.redirect === 'string' ? body.redirect : '/dashboard';

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: session.user.id,
    email: session.user.email,
    displayName: session.user.name || session.user.email?.split('@')[0] || 'User',
    tier: session.user.tier || 'free',
    iat: now,
    exp: now + 5 * 60, // 5 minutes
    aud: 'diamonddraft',
    iss: 'valorodds',
    jti: crypto.randomBytes(16).toString('hex'),
  };

  const token = signHS256(payload, secret);
  const appUrl = env.diamondDraftAppUrl().replace(/\/$/, '');
  const ssoUrl = `${appUrl}/sso?token=${encodeURIComponent(token)}&redirect=${encodeURIComponent(
    redirect,
  )}`;

  return NextResponse.json({ token, ssoUrl, expiresIn: 300 });
}

/** GET returns the same thing for quick browser testing. */
export async function GET(req: NextRequest) {
  return POST(req);
}