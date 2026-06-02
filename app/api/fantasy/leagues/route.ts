import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { auth } from '@/lib/auth';
import { env } from '@/lib/env';

/**
 * Returns the signed-in user's DiamondDraft leagues so the ValorOdds
 * dashboard can render a Fantasy tab without a second full page load.
 *
 * Implementation: mint an SSO handoff token for this user, POST it to
 * DiamondDraft's SSO endpoint to exchange for a DD JWT, then use that
 * JWT to pull /api/leagues. All done server-side so we never expose
 * the DD token to the browser.
 *
 * Caches nothing (leagues change often). Short timeouts so the dashboard
 * never hangs on a slow upstream.
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

function mintSsoToken(
  userId: string,
  email: string,
  displayName: string,
  tier: string,
  secret: string,
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userId,
    email,
    displayName,
    tier,
    iat: now,
    exp: now + 120, // 2 minutes — just needs to survive the round-trip
    aud: 'diamonddraft',
    iss: 'valorodds',
    jti: crypto.randomBytes(16).toString('hex'),
  };
  const header = { alg: 'HS256', typ: 'JWT' };
  const h = base64url(JSON.stringify(header));
  const p = base64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest();
  return `${h}.${p}.${base64url(sig)}`;
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 4000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Not authenticated', code: 'not_authenticated' },
      { status: 401 },
    );
  }

  const secret = env.diamondDraftSsoSecret();
  const ddApi = env.diamondDraftApiUrl().replace(/\/$/, '');
  if (!secret || !ddApi || secret.startsWith('__buildtime_placeholder')) {
    // Not configured — return empty success so the dashboard shows a
    // "Connect Fantasy" CTA instead of an error.
    return NextResponse.json({
      configured: false,
      leagues: [],
      ddTier: null,
      ssoUrl: null,
    });
  }

  const handoff = mintSsoToken(
    session.user.id,
    session.user.email || '',
    session.user.name || session.user.email?.split('@')[0] || 'User',
    session.user.tier || 'free',
    secret,
  );

  // Exchange the handoff for a real DD JWT
  let ddToken: string | null = null;
  let ddTier: string | null = null;
  try {
    const res = await fetchWithTimeout(`${ddApi}/api/auth/sso/valorodds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: handoff }),
    });
    if (res.ok) {
      const data = await res.json();
      ddToken = data.token;
      ddTier = data.user?.tier || data.entitlement?.ddTier || null;
    }
  } catch {
    // swallow — we'll fall through to the unconfigured-style response
  }

  if (!ddToken) {
    return NextResponse.json({
      configured: true,
      leagues: [],
      ddTier: null,
      error: 'fantasy_unavailable',
    });
  }

  // Pull leagues with the DD JWT
  let leagues: any[] = [];
  try {
    const res = await fetchWithTimeout(`${ddApi}/api/leagues`, {
      headers: { Authorization: `Bearer ${ddToken}` },
    });
    if (res.ok) {
      const data = await res.json();
      leagues = Array.isArray(data) ? data : data.leagues || [];
    }
  } catch {
    // swallow
  }

  // Build a public SSO URL for the "Open DiamondDraft" button.
  const appUrl = env.diamondDraftAppUrl().replace(/\/$/, '');
  const publicHandoff = mintSsoToken(
    session.user.id,
    session.user.email || '',
    session.user.name || session.user.email?.split('@')[0] || 'User',
    session.user.tier || 'free',
    secret,
  );
  const ssoUrl = `${appUrl}/sso?token=${encodeURIComponent(publicHandoff)}&redirect=/dashboard`;

  return NextResponse.json({
    configured: true,
    leagues,
    ddTier,
    ssoUrl,
  });
}