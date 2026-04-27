/**
 * Subscription / entitlement helpers shared across API routes + UI.
 */
import type Stripe from 'stripe';
import { query, queryOne } from './db';
import { tierFromProductId } from './stripe';
import type { Tier } from './env';

export interface SubscriptionRow {
  id: string;
  user_id: string | null;
  discord_id: string | null;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  tier: Tier;
  status: string;
  current_period_start: Date | null;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
}

export async function getActiveSubscriptionForUser(
  userId: string | null,
  discordId: string | null
): Promise<SubscriptionRow | null> {
  if (!userId && !discordId) return null;
  return queryOne<SubscriptionRow>(
    `SELECT id::text, user_id::text, discord_id, stripe_customer_id, stripe_subscription_id,
            tier, status, current_period_start, current_period_end, cancel_at_period_end
     FROM web_subscriptions
     WHERE (user_id = $1::bigint OR ($2::text IS NOT NULL AND discord_id = $2))
       AND status IN ('active','trialing','past_due')
     ORDER BY current_period_end DESC NULLS LAST
     LIMIT 1`,
    [userId, discordId]
  );
}

export async function upsertSubscriptionFromStripe(
  sub: Stripe.Subscription,
  userId: string | null,
  discordId: string | null
): Promise<SubscriptionRow | null> {
  const item = sub.items.data[0];
  const productId = typeof item?.price?.product === 'string'
    ? item.price.product
    : (item?.price?.product as Stripe.Product | undefined)?.id;
  if (!productId) return null;
  const tier = tierFromProductId(productId) ?? 'free';

  const customerId =
    typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  const existing = await queryOne<SubscriptionRow>(
    `SELECT id::text FROM web_subscriptions WHERE stripe_subscription_id = $1 LIMIT 1`,
    [sub.id]
  );

  const startIso = sub.current_period_start ? new Date(sub.current_period_start * 1000) : null;
  const endIso = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;

  if (existing) {
    await query(
      `UPDATE web_subscriptions SET
         user_id = COALESCE(user_id, $1::bigint),
         discord_id = COALESCE(discord_id, $2),
         stripe_customer_id = $3,
         tier = $4,
         status = $5,
         current_period_start = $6,
         current_period_end = $7,
         cancel_at_period_end = $8
       WHERE id = $9::bigint`,
      [
        userId,
        discordId,
        customerId,
        tier,
        sub.status,
        startIso,
        endIso,
        sub.cancel_at_period_end,
        existing.id,
      ]
    );
  } else {
    await query(
      `INSERT INTO web_subscriptions
         (user_id, discord_id, stripe_customer_id, stripe_subscription_id, tier, status,
          current_period_start, current_period_end, cancel_at_period_end)
       VALUES ($1::bigint, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        userId,
        discordId,
        customerId,
        sub.id,
        tier,
        sub.status,
        startIso,
        endIso,
        sub.cancel_at_period_end,
      ]
    );
  }

  return getActiveSubscriptionForUser(userId, discordId);
}

export async function markStripeEventProcessed(eventId: string, type: string, payload: unknown) {
  try {
    await query(
      `INSERT INTO web_stripe_events (event_id, type, payload)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (event_id) DO NOTHING`,
      [eventId, type, JSON.stringify(payload)]
    );
    return true;
  } catch {
    return false;
  }
}

export async function isStripeEventAlreadyProcessed(eventId: string): Promise<boolean> {
  const row = await queryOne<{ event_id: string }>(
    `SELECT event_id FROM web_stripe_events WHERE event_id = $1 LIMIT 1`,
    [eventId]
  );
  return !!row;
}