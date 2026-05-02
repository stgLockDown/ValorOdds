import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { getStripe, getPriceId } from '@/lib/stripe';
import { env } from '@/lib/env';
import { logEvent } from '@/lib/analytics';
import { queryOne } from '@/lib/db';

export const runtime = 'nodejs';

const Body = z.object({
  tier: z.enum(['premium', 'vip', 'beta']),
});

export async function POST(req: Request) {
  try {
    // 1. Authentication
    const session = await auth();
    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json(
        { error: 'You must be signed in to start checkout.' },
        { status: 401 },
      );
    }

    // 2. Input validation
    let input: z.infer<typeof Body>;
    try {
      input = Body.parse(await req.json());
    } catch {
      return NextResponse.json(
        { error: 'Invalid tier. Choose premium, vip, or beta.' },
        { status: 400 },
      );
    }

    // 3. Preflight: check that the server actually has Stripe configured.
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('[stripe/checkout] STRIPE_SECRET_KEY is not set in the environment.');
      return NextResponse.json(
        {
          error:
            'Billing is not configured yet. Please contact support at support@valorodds.com and try again later.',
          code: 'stripe_not_configured',
        },
        { status: 503 },
      );
    }

    const stripe = getStripe();

    // 4. Resolve price — catches missing product env vars gracefully.
    let priceId: string;
    try {
      priceId = await getPriceId(input.tier);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[stripe/checkout] Failed to resolve price for tier', input.tier, msg);
      return NextResponse.json(
        {
          error: `Unable to load pricing for the ${input.tier} tier. Please try again shortly.`,
          code: 'price_resolve_failed',
        },
        { status: 503 },
      );
    }

    // 5. Find existing Stripe customer (optional).
    let existingSub: { stripe_customer_id: string } | null = null;
    try {
      existingSub = await queryOne<{ stripe_customer_id: string }>(
        `SELECT stripe_customer_id FROM web_subscriptions
         WHERE user_id = $1::bigint ORDER BY id DESC LIMIT 1`,
        [session.user.id],
      );
    } catch (err) {
      // DB failure is non-fatal here — we'll just let Stripe create a new customer.
      console.warn('[stripe/checkout] Could not look up existing subscription:', err);
    }

    // 6. Create checkout session.
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: session.user.id,
      customer: existingSub?.stripe_customer_id ?? undefined,
      customer_email: existingSub?.stripe_customer_id ? undefined : session.user.email,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      success_url: `${env.appUrl}/account?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.appUrl}/pricing?checkout=cancelled`,
      metadata: {
        webUserId: session.user.id,
        discordId: session.user.discordId ?? '',
        tier: input.tier,
      },
      subscription_data: {
        metadata: {
          webUserId: session.user.id,
          discordId: session.user.discordId ?? '',
          tier: input.tier,
        },
      },
    });

    // 7. Log analytics (best-effort).
    try {
      await logEvent({
        userId: session.user.id,
        discordId: session.user.discordId ?? null,
        eventType: 'checkout_started',
        metadata: { tier: input.tier, sessionId: checkoutSession.id },
      });
    } catch (err) {
      console.warn('[stripe/checkout] analytics logEvent failed (non-fatal):', err);
    }

    if (!checkoutSession.url) {
      return NextResponse.json(
        { error: 'Stripe did not return a checkout URL. Please try again.' },
        { status: 502 },
      );
    }

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown server error';
    console.error('[stripe/checkout] Unhandled error:', err);
    return NextResponse.json(
      {
        error: `Checkout failed: ${msg}. Please try again or contact support.`,
        code: 'checkout_unhandled',
      },
      { status: 500 },
    );
  }
}