import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { getStripe, getPriceId, isStripeConfigured, StripeNotConfiguredError } from '@/lib/stripe';
import { env } from '@/lib/env';
import { logEvent } from '@/lib/analytics';
import { queryOne } from '@/lib/db';

export const runtime = 'nodejs';

const Body = z.object({
  tier: z.enum(['premium', 'vip']),
});

export async function POST(req: Request) {
  // Fast-path 503 when Stripe isn't configured. Without this guard the
  // Stripe SDK constructor throws an unhelpful error that bubbles up as a
  // generic 500 and floods the logs.
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
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  let input: z.infer<typeof Body>;
  try {
    input = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const priceId = await getPriceId(input.tier);

    // Find existing Stripe customer if any
    const existingSub = await queryOne<{ stripe_customer_id: string }>(
      `SELECT stripe_customer_id FROM web_subscriptions WHERE user_id = $1::bigint ORDER BY id DESC LIMIT 1`,
      [session.user.id]
    );

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

    await logEvent({
      userId: session.user.id,
      discordId: session.user.discordId ?? null,
      eventType: 'checkout_started',
      metadata: { tier: input.tier, sessionId: checkoutSession.id },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return NextResponse.json(
        { error: 'Billing temporarily unavailable' },
        { status: 503 },
      );
    }
    console.error('[stripe/checkout] failed:', err);
    return NextResponse.json(
      { error: 'Could not start checkout. Please try again in a moment.' },
      { status: 500 },
    );
  }
}
