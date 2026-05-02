/**
 * Stripe SDK wrapper. Also resolves active price IDs from product IDs on first use.
 *
 * Resolution order for each tier:
 *   1. If STRIPE_PRICE_<TIER> env var is set → use it directly (fast path).
 *   2. Otherwise, look up the active monthly recurring price for
 *      STRIPE_PRODUCT_<TIER>.
 *   3. If neither is set, throw a helpful error that surfaces in the API route.
 */
import Stripe from 'stripe';
import { env, type Tier } from './env';

type PaidTier = Exclude<Tier, 'free'>;

declare global {
  // eslint-disable-next-line no-var
  var __stripe: Stripe | undefined;
  // eslint-disable-next-line no-var
  var __stripePriceCache:
    | {
        premium?: string;
        vip?: string;
        beta?: string;
        fetchedAt?: number;
      }
    | undefined;
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
  const monthly = prices.data.find(
    (p) => p.recurring?.interval === 'month' && p.active,
  );
  const fallback = prices.data.find((p) => p.active);
  const chosen = monthly ?? fallback;
  if (!chosen) {
    throw new Error(`No active price found for product ${productId}`);
  }
  return chosen.id;
}

function directPriceFor(tier: PaidTier): string {
  if (tier === 'premium') return env.stripePricePremium();
  if (tier === 'vip') return env.stripePriceVip();
  return env.stripePriceBeta();
}

function productIdFor(tier: PaidTier): string {
  if (tier === 'premium') return env.stripeProductPremium();
  if (tier === 'vip') return env.stripeProductVip();
  return env.stripeProductBeta();
}

export async function getPriceId(tier: PaidTier): Promise<string> {
  // Fast path: direct price ID provided
  const direct = directPriceFor(tier);
  if (direct && direct.startsWith('price_')) {
    return direct;
  }

  const now = Date.now();
  const cache = global.__stripePriceCache ?? {};
  const fresh = cache.fetchedAt && now - cache.fetchedAt < PRICE_CACHE_TTL;
  if (fresh && cache[tier]) return cache[tier] as string;

  const productId = productIdFor(tier);
  if (!productId) {
    throw new Error(
      `No STRIPE_PRICE_${tier.toUpperCase()} or STRIPE_PRODUCT_${tier.toUpperCase()} configured. Set one in Railway env vars.`,
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
  if (productId === env.stripeProductPremium()) return 'premium';
  if (productId === env.stripeProductVip()) return 'vip';
  if (productId === env.stripeProductBeta()) return 'beta';
  return null;
}