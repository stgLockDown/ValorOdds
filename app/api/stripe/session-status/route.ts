import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getStripe, isStripeConfigured } from '@/lib/stripe';

export const runtime = 'nodejs';

/**
 * Returns the status of an embedded Checkout session so /checkout/return can
 * show a confirmation. Per Stripe's embedded flow, the return page retrieves
 * the session by id and reads `status` + `payment_status`.
 *   https://docs.stripe.com/billing/subscriptions/build-subscriptions?ui=embedded-page
 */
export async function GET(req: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Billing unavailable' }, { status: 503 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('session_id');
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const cs = await stripe.checkout.sessions.retrieve(sessionId);

    // Defense in depth: only let a user read their own checkout session.
    if (cs.client_reference_id && cs.client_reference_id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      status: cs.status, // 'open' | 'complete' | 'expired'
      paymentStatus: cs.payment_status, // 'paid' | 'unpaid' | 'no_payment_required'
      customerEmail: cs.customer_details?.email ?? null,
      tier: (cs.metadata?.tier as string) ?? null,
    });
  } catch (err) {
    console.error('[stripe/session-status] failed:', err);
    return NextResponse.json({ error: 'Could not retrieve session' }, { status: 500 });
  }
}
