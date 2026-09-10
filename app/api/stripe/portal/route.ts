import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getStripe, isStripeConfigured, StripeNotConfiguredError } from '@/lib/stripe';
import { env } from '@/lib/env';
import { queryOne } from '@/lib/db';
import type Stripe from 'stripe';

export const runtime = 'nodejs';

/**
 * The customer portal must be enabled in the Stripe dashboard before portal
 * sessions can be created. Rather than 500-ing forever until someone flips
 * that setting manually, self-heal: create a default active portal
 * configuration (card updates + cancel-at-period-end) on first use.
 */
async function ensurePortalEnabled(stripe: Stripe): Promise<void> {
  const existing = await stripe.billingPortal.configurations.list({ active: true, limit: 5 });
  if (existing.data.length > 0) return;
  await stripe.billingPortal.configurations.create({
    default_return_url: `${env.appUrl}/account`,
    business_profile: {
      privacy_policy_url: `${env.appUrl}/privacy`,
      terms_of_service_url: `${env.appUrl}/terms`,
    },
    features: {
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true },
      invoice_history: { enabled: true },
    },
  });
}

function isPortalDisabledError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return msg.includes('portal') && (msg.includes('not been enabled') || msg.includes('disabled') || msg.includes('not activated') || msg.includes('no configuration'));
}

export async function POST() {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      {
        error: 'Billing temporarily unavailable',
        detail:
          'Stripe is not configured on this deployment. Please contact support if this persists.',
      },
      { status: 503 },
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const row = await queryOne<{ stripe_customer_id: string }>(
    `SELECT stripe_customer_id FROM web_subscriptions WHERE user_id = $1::bigint ORDER BY id DESC LIMIT 1`,
    [session.user.id]
  );
  if (!row?.stripe_customer_id) {
    return NextResponse.json({ error: 'No subscription found' }, { status: 404 });
  }
  try {
    const stripe = getStripe();
    try {
      const portal = await stripe.billingPortal.sessions.create({
        customer: row.stripe_customer_id,
        return_url: `${env.appUrl}/account`,
      });
      return NextResponse.json({ url: portal.url });
    } catch (err) {
      if (isPortalDisabledError(err)) {
        // First-time setup: enable the portal, then retry once.
        await ensurePortalEnabled(stripe);
        const portal = await stripe.billingPortal.sessions.create({
          customer: row.stripe_customer_id,
          return_url: `${env.appUrl}/account`,
        });
        return NextResponse.json({ url: portal.url });
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return NextResponse.json(
        { error: 'Billing temporarily unavailable' },
        { status: 503 },
      );
    }
    console.error('[stripe/portal] failed:', err);
    return NextResponse.json(
      { error: 'Could not open billing portal. Please try again in a moment.' },
      { status: 500 },
    );
  }
}
