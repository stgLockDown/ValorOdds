/**
 * Stripe SDK wrapper. Also resolves active price IDs from product IDs on first use.
 *
 * Hardening notes (production fix):
 *  - `getStripe()` no longer constructs `new Stripe('')` when STRIPE_SECRET_KEY
 *    is missing. The Stripe SDK throws "Neither apiKey nor config.authenticator
 *    provided" with a stack that's hostile to debug. We instead throw a
 *    typed `StripeNotConfiguredError` that callers can catch and turn into
 *    a clean 503.
 *  - `isStripeConfigured()` lets server components / pages render a
 *    friendly empty state instead of crashing the route.
 */
import Stripe from 'stripe';
import { env, type Tier } from './env';

declare global {
  // eslint-disable-next-line no-var
  var __stripe: Stripe | undefined;
  // eslint-disable-next-line no-var
  var __stripePriceCache: { basic?: string; premium?: string; vip?: string; fetchedAt?: number } | undefined;
}

export class StripeNotConfiguredError extends Error {
  constructor() {
    super(
      'Stripe is not configured on this deployment. Set STRIPE_SECRET_KEY in the ' +
        'environment to enable checkout, billing portal, and subscription features.',
    );
    this.name = 'StripeNotConfiguredError';
  }
}

/**
 * True iff a usable Stripe secret key is present. Cheap — does not construct
 * the SDK. Use this in server components to decide whether to render a
 * Stripe-dependent UI block.
 *
 * Accepts both full secret keys (`sk_live_…` / `sk_test_…`) and restricted
 * keys (`rk_live_…` / `rk_test_…`). It deliberately REJECTS API key IDs
 * (`mk_…` / `rk_…`-less identifiers) — those are the *ID* of a key shown in
 * the dashboard, not usable key material, and using them yields 401s.
 */
export function isStripeConfigured(): boolean {
  const key = env.stripeSecretKey();
  if (typeof key !== 'string' || key.length <= 20) return false;
  // Explicitly exclude the "mk_" API-key ID prefix — a common misconfiguration
  // where the dashboard's key ID is pasted instead of the key material.
  if (key.startsWith('mk_')) return false;
  return key.startsWith('sk_') || key.startsWith('rk_');
}

/**
 * Get (or create) the singleton Stripe client. Throws StripeNotConfiguredError
 * if the secret key is missing or obviously a placeholder. Callers in API
 * routes should catch this and return 503 with a clean error body.
 */
export function getStripe(): Stripe {
  if (!isStripeConfigured()) {
    throw new StripeNotConfiguredError();
  }
  if (!global.__stripe) {
    global.__stripe = new Stripe(env.stripeSecretKey(), {
      apiVersion: '2025-02-24.acacia' as Stripe.StripeConfig['apiVersion'],
      maxNetworkRetries: 2,
      timeout: 20_000,
      appInfo: { name: 'valorodds-web', version: '0.1.0' },
    });
  }
  return global.__stripe;
}

const PRICE_CACHE_TTL = 10 * 60 * 1000; // 10 min

/** Advertised monthly prices (cents) per tier — from the pricing page. */
const TIER_PRICE_CENTS: Record<Exclude<Tier, 'free'>, number> = {
  basic: 999,
  premium: 3000,
  vip: 8000,
};

/**
 * Resolve the active monthly price for a product. If the product has no
 * active monthly price (e.g. it was created in the dashboard without one),
 * self-heal by creating it at the advertised price — otherwise checkout
 * would 500 forever until someone opened the dashboard.
 */
async function resolveActivePriceForProduct(
  productId: string,
  tier: Exclude<Tier, 'free'>,
): Promise<string> {
  const stripe = getStripe();
  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 10,
  });
  // Prefer recurring monthly price.
  const monthly = prices.data.find(
    (p) => p.recurring?.interval === 'month' && p.active
  );
  if (monthly) return monthly.id;
  const fallback = prices.data.find((p) => p.active);
  if (fallback) return fallback.id;

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: TIER_PRICE_CENTS[tier],
    currency: 'usd',
    recurring: { interval: 'month' },
    nickname: `${tier[0].toUpperCase()}${tier.slice(1)} — monthly`,
  });
  // eslint-disable-next-line no-console
  console.log(
    `[stripe] no active price on product ${productId}; created monthly price ${price.id} at $${(TIER_PRICE_CENTS[tier] / 100).toFixed(2)}`
  );
  return price.id;
}

export async function getPriceId(tier: Exclude<Tier, 'free'>): Promise<string> {
  const now = Date.now();
  const cache = global.__stripePriceCache ?? {};
  const fresh = cache.fetchedAt && now - cache.fetchedAt < PRICE_CACHE_TTL;

  if (fresh && cache[tier]) return cache[tier] as string;

  const productId =
    tier === 'basic'
      ? env.stripeProductBasic()
      : tier === 'premium'
        ? env.stripeProductPremium()
        : env.stripeProductVip();
  if (!productId) {
    throw new Error(
      `No Stripe product configured for tier "${tier}". Set STRIPE_PRODUCT_${tier.toUpperCase()} in the environment.`,
    );
  }
  const priceId = await resolveActivePriceForProduct(productId, tier);

  global.__stripePriceCache = {
    ...cache,
    [tier]: priceId,
    fetchedAt: now,
  };
  return priceId;
}

export function tierFromProductId(productId: string): Tier | null {
  if (productId && productId === env.stripeProductBasic()) return 'basic';
  if (productId === env.stripeProductPremium()) return 'premium';
  if (productId === env.stripeProductVip()) return 'vip';
  return null;
}
