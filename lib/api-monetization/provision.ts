/**
 * Provisioning logic invoked from the Stripe webhook when an API
 * monetization checkout completes. Creates/updates the customer's
 * customer_api_plans row, links products purchased, computes the
 * effective monthly ping quota, and issues an API key on first purchase.
 */
import type Stripe from 'stripe';
import { query, queryOne } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { findPingTier, ODDS_PRODUCT } from './pricing';
import { issueApiKeyForPlan, getActiveKeyForPlan } from './keys';

export interface ApiCheckoutMetadata {
  webUserId?: string;
  apiPlanType?: 'bundle' | 'odds_standalone' | '';
  apiPingTierCode?: string;
  apiAllAccess?: string;
  apiOddsAddon?: string;
  apiSports?: string;
  apiIntelAddons?: string;
}

export function isApiMonetizationCheckout(
  metadata: Record<string, unknown> | ApiCheckoutMetadata | null | undefined
): boolean {
  if (!metadata) return false;
  const planType = (metadata as ApiCheckoutMetadata).apiPlanType;
  return planType === 'bundle' || planType === 'odds_standalone';
}

/**
 * Handles checkout.session.completed for an API-monetization purchase.
 * Returns the raw API key ONLY on first issuance (so it can be emailed /
 * shown once) — null if the plan already existed (key unchanged).
 */
export async function provisionApiPlanFromCheckout(
  sess: Stripe.Checkout.Session,
  sub: Stripe.Subscription
): Promise<{ planId: number; rawKeyIfNew: string | null } | null> {
  const meta = sess.metadata as ApiCheckoutMetadata | undefined;
  if (!meta || !isApiMonetizationCheckout(meta)) return null;

  const userId = meta.webUserId;
  if (!userId) return null;

  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const planType = meta.apiPlanType as 'bundle' | 'odds_standalone';
  const allAccess = meta.apiAllAccess === 'true';
  const oddsAddon = meta.apiOddsAddon === 'true';
  const sports = (meta.apiSports || '').split(',').filter(Boolean);
  const intelAddons = (meta.apiIntelAddons || '').split(',').filter(Boolean);
  const pingTierCode = meta.apiPingTierCode || null;

  let monthlyQuota = 0;
  if (planType === 'bundle' && pingTierCode) {
    const tier = findPingTier(pingTierCode);
    monthlyQuota = tier?.monthlyPings ?? 0;
  } else if (planType === 'odds_standalone') {
    monthlyQuota = ODDS_PRODUCT.standaloneMonthlyPings;
  }

  const startIso = sub.current_period_start ? new Date(sub.current_period_start * 1000) : null;
  const endIso = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;

  const existing = await queryOne<{ id: string }>(
    `SELECT id::text FROM customer_api_plans WHERE stripe_subscription_id = $1 LIMIT 1`,
    [sub.id]
  );

  let planId: number;
  if (existing) {
    await query(
      `UPDATE customer_api_plans SET
         plan_type = $1, ping_tier_code = $2, all_access = $3, odds_addon = $4,
         monthly_ping_quota = $5, stripe_customer_id = $6, status = $7,
         current_period_start = $8, current_period_end = $9
       WHERE id = $10::bigint`,
      [
        planType,
        pingTierCode,
        allAccess,
        oddsAddon,
        monthlyQuota,
        customerId,
        sub.status,
        startIso,
        endIso,
        existing.id,
      ]
    );
    planId = Number(existing.id);
  } else {
    const inserted = await queryOne<{ id: string }>(
      `INSERT INTO customer_api_plans
         (user_id, plan_type, ping_tier_code, all_access, odds_addon, monthly_ping_quota,
          stripe_customer_id, stripe_subscription_id, status, current_period_start, current_period_end)
       VALUES ($1::bigint, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id::text`,
      [
        userId,
        planType,
        pingTierCode,
        allAccess,
        oddsAddon,
        monthlyQuota,
        customerId,
        sub.id,
        sub.status,
        startIso,
        endIso,
      ]
    );
    planId = Number(inserted!.id);
  }

  // Link purchased sport products (only relevant for bundle plans without all_access;
  // all_access plans check the boolean flag directly and don't need per-row links).
  if (planType === 'bundle' && !allAccess && sports.length > 0) {
    for (const code of sports) {
      await query(
        `INSERT INTO customer_api_plan_products (plan_id, product_code) VALUES ($1, $2)
         ON CONFLICT (plan_id, product_code) DO NOTHING`,
        [planId, code]
      );
    }
  }

  // Link intelligence product add-ons (arbitrage, steam_moves, injuries, ai_analysis).
  // These are always per-row links regardless of all_access — all_access only
  // covers the 26 sport APIs, not the premium intelligence feeds.
  if (planType === 'bundle' && intelAddons.length > 0) {
    for (const code of intelAddons) {
      await query(
        `INSERT INTO customer_api_plan_products (plan_id, product_code) VALUES ($1, $2)
         ON CONFLICT (plan_id, product_code) DO NOTHING`,
        [planId, code]
      );
    }
  }

  // Issue an API key on first provisioning only.
  const activeKey = await getActiveKeyForPlan(planId);
  let rawKeyIfNew: string | null = null;
  if (!activeKey) {
    rawKeyIfNew = await issueApiKeyForPlan(planId);
  }

  return { planId, rawKeyIfNew };
}

/** Mirrors subscription status changes (renewal, cancellation) onto the plan row. */
export async function syncApiPlanFromSubscription(sub: Stripe.Subscription): Promise<void> {
  const startIso = sub.current_period_start ? new Date(sub.current_period_start * 1000) : null;
  const endIso = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
  await query(
    `UPDATE customer_api_plans SET
       status = $1, current_period_start = $2, current_period_end = $3, cancel_at_period_end = $4
     WHERE stripe_subscription_id = $5`,
    [sub.status, startIso, endIso, sub.cancel_at_period_end, sub.id]
  );
}

export async function cancelApiPlan(subscriptionId: string): Promise<void> {
  await query(
    `UPDATE customer_api_plans SET status = 'canceled' WHERE stripe_subscription_id = $1`,
    [subscriptionId]
  );
}
