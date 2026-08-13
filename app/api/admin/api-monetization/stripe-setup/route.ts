import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isStripeConfigured, StripeNotConfiguredError } from '@/lib/stripe';
import { runStripeSetup } from '@/lib/api-monetization/stripeSetup';
import { logEvent } from '@/lib/analytics';

export const runtime = 'nodejs';

/**
 * Admin-only, idempotent. Creates (or reuses) all Stripe products/prices
 * needed for the API monetization "build your own bundle" platform, and
 * writes the resulting IDs into api_products / api_ping_tiers.
 *
 * Safe to call repeatedly — every product lookup is keyed by a stable
 * metadata marker, so re-running never creates duplicates.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: 'Stripe is not configured on this deployment.' },
      { status: 503 }
    );
  }

  try {
    const { results, summary } = await runStripeSetup();

    // Audit trail: record exactly who ran the sync and what happened.
    await logEvent({
      userId: session.user.id,
      eventType: 'admin_stripe_sync_run',
      metadata: {
        adminEmail: session.user.email ?? null,
        count: results.length,
        summary,
      },
    });

    return NextResponse.json({ ok: true, count: results.length, summary, results });
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 503 });
    }
    console.error('[admin/api-monetization/stripe-setup] failed:', err);

    // Audit trail for failed runs too, so admins can see attempted-but-failed syncs.
    await logEvent({
      userId: session.user.id,
      eventType: 'admin_stripe_sync_run',
      metadata: {
        adminEmail: session.user.email ?? null,
        failed: true,
        error: err instanceof Error ? err.message : String(err),
      },
    });

    return NextResponse.json(
      { error: 'Stripe setup failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
