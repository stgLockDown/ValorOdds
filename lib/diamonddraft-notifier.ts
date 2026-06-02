/**
 * Outbound notifier for DiamondDraft entitlement changes.
 *
 * When a ValorOdds subscription is created, updated or cancelled we POST
 * the user's new tier to DiamondDraft so it can update the shared
 * entitlement (DD Pro / Commissioner+) without waiting for the user to
 * re-SSO.
 *
 * The call is fire-and-forget with a short timeout: it MUST NOT block
 * or fail the Stripe webhook. If DiamondDraft is down the next SSO
 * handoff will reconcile the tier on its own.
 */
import crypto from 'crypto';
import { env } from './env';

export async function notifyDiamondDraftEntitlement(params: {
  userId: string;
  email: string | null;
  tier: string;
}): Promise<void> {
  const url = env.diamondDraftEntitlementUrl();
  const secret = env.diamondDraftSsoSecret();
  if (!url || !secret || secret.startsWith('__buildtime_placeholder')) {
    // Not configured — silently skip.
    return;
  }

  const payload = JSON.stringify({
    valorOddsUserId: params.userId,
    email: params.email || null,
    tier: params.tier,
  });
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Valorodds-Signature': signature,
      },
      body: payload,
      signal: ctrl.signal,
    });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.warn('[diamonddraft notifier] failed:', err?.message || err);
  } finally {
    clearTimeout(timer);
  }
}