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
 */
export function isStripeConfigured(): boolean {
  const key = env.stripeSecretKey();
  return typeof key === 'string' && key.startsWith('sk_') && key.length > 20;
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

async function resolveActivePriceForProduct(productId: string): Promise<string> {
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
  const fallback = prices.data.find((p) => p.active);
  const chosen = monthly ?? fallback;
  if (!chosen) {
    throw new Error(`No active price found for product ${productId}`);
  }
  return chosen.id;
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
  const priceId = await resolveActivePriceForProduct(productId);

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
