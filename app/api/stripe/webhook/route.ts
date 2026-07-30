import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, tierFromProductId, isStripeConfigured } from '@/lib/stripe';
import { env, type Tier } from '@/lib/env';
import { query, queryOne } from '@/lib/db';
import {
  isStripeEventAlreadyProcessed,
  markStripeEventProcessed,
  upsertSubscriptionFromStripe,
} from '@/lib/subscriptions';
import { syncDiscordRole } from '@/lib/bot-client';
import { logEvent } from '@/lib/analytics';
import {
  purchaseReceiptEmail,
  subscriptionCanceledEmail,
  paymentFailedEmail,
  sendEmail,
} from '@/lib/email';
import {
  isApiMonetizationCheckout,
  provisionApiPlanFromCheckout,
  syncApiPlanFromSubscription,
  cancelApiPlan,
} from '@/lib/api-monetization/provision';
import { apiKeyIssuedEmail } from '@/lib/api-monetization/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Next.js parses JSON by default; we need the raw body for Stripe signature verification.
export async function POST(req: Request) {
  // Stripe webhooks should never be hit on a deployment without Stripe
  // configured — return 503 so Stripe stops retrying instead of getting
  // a 500 spam loop.
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: 'Stripe not configured on this deployment' },
      { status: 503 },
    );
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  const rawBody = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, env.stripeWebhookSecret());
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('[stripe webhook] signature error', err?.message);
    return NextResponse.json({ error: `Webhook Error: ${err?.message}` }, { status: 400 });
  }

  // Idempotency
  if (await isStripeEventAlreadyProcessed(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await handleEvent(event);
    await markStripeEventProcessed(event.id, event.type, event);
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('[stripe webhook] handler error', event.type, err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function resolveUserContext(opts: {
  customerId?: string;
  webUserId?: string | null;
  discordId?: string | null;
}) {
  let userId = opts.webUserId ?? null;
  let discordId = opts.discordId ?? null;
  let email: string | null = null;

  if (!userId && opts.customerId) {
    const row = await queryOne<{ user_id: string | null; discord_id: string | null }>(
      `SELECT user_id::text, discord_id FROM web_subscriptions WHERE stripe_customer_id = $1 ORDER BY id DESC LIMIT 1`,
      [opts.customerId]
    );
    if (row) {
      userId = row.user_id;
      discordId = discordId ?? row.discord_id;
    }
  }

  if (userId) {
    const u = await queryOne<{ email: string; discord_id: string | null }>(
      `SELECT email, discord_id FROM web_users WHERE id = $1::bigint`,
      [userId]
    );
    if (u) {
      email = u.email;
      discordId = discordId ?? u.discord_id;
    }
  }

  return { userId, discordId, email };
}

async function handleEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const sess = event.data.object as Stripe.Checkout.Session;
      const webUserId = (sess.metadata?.webUserId as string | undefined) ?? sess.client_reference_id ?? null;
      const discordIdFromMeta = (sess.metadata?.discordId as string | undefined) || null;
      const subscriptionId = typeof sess.subscription === 'string' ? sess.subscription : sess.subscription?.id;
      if (!subscriptionId) break;

      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['items.data.price.product'] });

      // API monetization checkouts are a separate purchase flow from the
      // premium/vip chat subscription — route them to their own provisioner
      // instead of upsertSubscriptionFromStripe (which only knows tiers).
      if (isApiMonetizationCheckout(sess.metadata)) {
        const result = await provisionApiPlanFromCheckout(sess, sub);
        const ctx = await resolveUserContext({
          customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
          webUserId,
          discordId: discordIdFromMeta,
        });
        if (result?.rawKeyIfNew && ctx.email) {
          const tmpl = apiKeyIssuedEmail({
            rawKey: result.rawKeyIfNew,
            manageUrl: `${env.appUrl}/api-access/manage`,
          });
          sendEmail({ to: ctx.email, ...tmpl });
        }
        await logEvent({
          userId: ctx.userId,
          discordId: ctx.discordId,
          eventType: 'api_checkout_completed',
          metadata: { sessionId: sess.id, planId: result?.planId },
        });
        break;
      }

      const saved = await upsertSubscriptionFromStripe(sub, webUserId, discordIdFromMeta);

      const ctx = await resolveUserContext({
        customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
        webUserId,
        discordId: discordIdFromMeta,
      });

      if (ctx.discordId && saved?.tier) {
        await syncDiscordRole(ctx.discordId, saved.tier).catch((err) => {
          // eslint-disable-next-line no-console
          console.warn('[stripe webhook] discord role sync failed', err?.message);
        });
      }

      if (ctx.email && saved) {
        const amount = sess.amount_total ? (sess.amount_total / 100).toFixed(2) : '—';
        const currency = (sess.currency || 'usd').toUpperCase();
        const periodEnd = saved.current_period_end
          ? new Date(saved.current_period_end).toLocaleDateString()
          : '—';
        const receipt = purchaseReceiptEmail({
          tier: saved.tier,
          amountFormatted: `${amount} ${currency}`,
          periodEnd,
          manageUrl: `${env.appUrl}/account`,
        });
        sendEmail({ to: ctx.email, ...receipt });
      }

      await logEvent({
        userId: ctx.userId,
        discordId: ctx.discordId,
        eventType: 'checkout_completed',
        metadata: { tier: saved?.tier, sessionId: sess.id },
      });
      break;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.created': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      const metaUserId = (sub.metadata?.webUserId as string | undefined) ?? null;
      const metaDiscordId = (sub.metadata?.discordId as string | undefined) || null;

      // API monetization subscriptions are tracked in customer_api_plans,
      // NOT web_subscriptions (which is chat-tier only and has a tier CHECK
      // constraint that doesn't know about API plans). Detect via metadata
      // and route accordingly so we never write a spurious tier='free' row.
      if (isApiMonetizationCheckout(sub.metadata)) {
        await syncApiPlanFromSubscription(sub).catch(() => undefined);
        break;
      }

      const saved = await upsertSubscriptionFromStripe(sub, metaUserId, metaDiscordId);

      const ctx = await resolveUserContext({ customerId, webUserId: metaUserId, discordId: metaDiscordId });
      if (ctx.discordId && saved?.tier) {
        await syncDiscordRole(ctx.discordId, saved.tier).catch(() => undefined);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await query(
        `UPDATE web_subscriptions SET status = 'canceled', tier = 'free' WHERE stripe_subscription_id = $1`,
        [sub.id]
      );
      await cancelApiPlan(sub.id).catch(() => undefined);
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      const ctx = await resolveUserContext({ customerId });
      if (ctx.discordId) {
        await syncDiscordRole(ctx.discordId, 'free').catch(() => undefined);
      }
      if (ctx.email) {
        const effectiveUntil = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toLocaleDateString()
          : 'now';
        const tmpl = subscriptionCanceledEmail(effectiveUntil, `${env.appUrl}/pricing`);
        sendEmail({ to: ctx.email, ...tmpl });
      }
      await logEvent({
        userId: ctx.userId,
        discordId: ctx.discordId,
        eventType: 'subscription_canceled',
        metadata: { subscriptionId: sub.id },
      });
      break;
    }

    case 'invoice.payment_failed': {
      const inv = event.data.object as Stripe.Invoice;
      const customerId = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id;
      const ctx = await resolveUserContext({ customerId: customerId ?? undefined });
      if (ctx.email) {
        const tmpl = paymentFailedEmail(`${env.appUrl}/account`);
        sendEmail({ to: ctx.email, ...tmpl });
      }
      break;
    }

    default:
      // Ignore other event types; Stripe retries only on 5xx.
      break;
  }
}

// Silence Tier-only imports warning (tsc)
export type _T = Tier;