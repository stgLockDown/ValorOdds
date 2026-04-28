/**
 * Stripe SDK wrapper. Also resolves active price IDs from product IDs on first use.
 */
import Stripe from 'stripe';
import { env, type Tier } from './env';

declare global {
  // eslint-disable-next-line no-var
  var __stripe: Stripe | undefined;
  // eslint-disable-next-line no-var
  var __stripePriceCache: { premium?: string; vip?: string; fetchedAt?: number } | undefined;
}

export function getStripe(): Stripe {
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

  const productId = tier === 'premium' ? env.stripeProductPremium() : env.stripeProductVip();
  const priceId = await resolveActivePriceForProduct(productId);

  global.__stripePriceCache = {
    ...cache,
    [tier]: priceId,
    fetchedAt: now,
  };
  return priceId;
}

export function tierFromProductId(productId: string): Tier | null {
  if (productId === env.stripeProductPremium()) return 'premium';
  if (productId === env.stripeProductVip()) return 'vip';
  return null;
}