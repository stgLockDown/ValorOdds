/**
 * Idempotent Stripe product/price provisioning for the API monetization
 * "build your own bundle" platform. Safe to call multiple times — it looks
 * up existing products by a stable `metadata.api_monetization_code` marker
 * before creating anything, and persists the resulting product/price IDs
 * back into the api_products / api_ping_tiers Postgres tables so the rest
 * of the app (checkout route) can read them without re-querying Stripe.
 *
 * Run via the admin-only route: POST /api/admin/api-monetization/stripe-setup
 */
import { getStripe } from '@/lib/stripe';
import { query } from '@/lib/db';
import {
  SPORT_PRODUCTS,
  SPORT_ADDON_PRICE_CENTS,
  ALL_ACCESS_PRICE_CENTS,
  PING_TIERS,
  ODDS_PRODUCT,
} from './pricing';

const MARKER_KEY = 'api_monetization_code';

interface SetupResult {
  code: string;
  productId: string;
  priceIds: Record<string, string>; // e.g. { addon: 'price_...' } or { standalone: 'price_...' }
  created: boolean;
}

async function findOrCreateProduct(
  stripe: ReturnType<typeof getStripe>,
  code: string,
  name: string
): Promise<{ id: string; created: boolean }> {
  const search = await stripe.products.search({
    query: `active:'true' AND metadata['${MARKER_KEY}']:'${code}'`,
  });
  if (search.data.length > 0) {
    return { id: search.data[0].id, created: false };
  }
  const product = await stripe.products.create({
    name,
    metadata: { [MARKER_KEY]: code },
  });
  return { id: product.id, created: true };
}

async function findOrCreatePrice(
  stripe: ReturnType<typeof getStripe>,
  productId: string,
  unitAmountCents: number,
  nickname: string,
  recurring = true
): Promise<string> {
  const existing = await stripe.prices.list({ product: productId, active: true, limit: 20 });
  const match = existing.data.find(
    (p) =>
      p.unit_amount === unitAmountCents &&
      (recurring ? p.recurring?.interval === 'month' : !p.recurring) &&
      p.currency === 'usd'
  );
  if (match) return match.id;

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: unitAmountCents,
    currency: 'usd',
    recurring: recurring ? { interval: 'month' } : undefined,
    nickname,
  });
  return price.id;
}

/** Creates a metered (usage-based) price for pay-per-overage billing. */
async function findOrCreateMeteredOveragePrice(
  stripe: ReturnType<typeof getStripe>,
  productId: string,
  unitAmountCentsPer1k: number
): Promise<string> {
  const existing = await stripe.prices.list({ product: productId, active: true, limit: 20 });
  const match = existing.data.find(
    (p) => p.recurring?.usage_type === 'metered' && p.billing_scheme === 'per_unit'
  );
  if (match) return match.id;

  // Stripe metered prices bill per unit; we report usage in units of 1,000
  // overage pings so unit_amount can be a whole-cent value ($1.50/1k = 150).
  const price = await stripe.prices.create({
    product: productId,
    currency: 'usd',
    unit_amount: unitAmountCentsPer1k,
    recurring: { interval: 'month', usage_type: 'metered' },
    nickname: 'Overage — per 1,000 pings',
  });
  return price.id;
}

export async function runStripeSetup(): Promise<{ results: SetupResult[]; summary: string[] }> {
  const stripe = getStripe();
  const results: SetupResult[] = [];
  const summary: string[] = [];

  // ---------- Ping tiers ----------
  for (const tier of PING_TIERS) {
    const { id: productId, created } = await findOrCreateProduct(
      stripe,
      `ping_tier_${tier.code}`,
      `API Access — ${tier.name}`
    );
    const priceId = await findOrCreatePrice(stripe, productId, tier.priceCents, tier.name);

    await query(
      `UPDATE api_ping_tiers SET stripe_product_id = $1, stripe_price_id = $2 WHERE code = $3`,
      [productId, priceId, tier.code]
    );

    results.push({ code: `ping_tier_${tier.code}`, productId, priceIds: { tier: priceId }, created });
    summary.push(`Ping tier ${tier.code}: product=${productId} price=${priceId}${created ? ' (created)' : ''}`);
  }

  // ---------- Per-sport add-ons ----------
  for (const sport of SPORT_PRODUCTS) {
    const { id: productId, created } = await findOrCreateProduct(
      stripe,
      `sport_addon_${sport.code}`,
      `${sport.name} — Add-on`
    );
    const priceId = await findOrCreatePrice(
      stripe,
      productId,
      SPORT_ADDON_PRICE_CENTS,
      `${sport.name} add-on`
    );

    await query(
      `UPDATE api_products SET stripe_product_id = $1, stripe_price_id_addon = $2 WHERE code = $3`,
      [productId, priceId, sport.code]
    );

    results.push({ code: `sport_addon_${sport.code}`, productId, priceIds: { addon: priceId }, created });
    summary.push(`Sport add-on ${sport.code}: product=${productId} price=${priceId}${created ? ' (created)' : ''}`);
  }

  // ---------- All-Access add-on ----------
  {
    const { id: productId, created } = await findOrCreateProduct(
      stripe,
      'all_access',
      'All-Access (all 26 sports)'
    );
    const priceId = await findOrCreatePrice(stripe, productId, ALL_ACCESS_PRICE_CENTS, 'All-Access');

    await query(
      `UPDATE api_products SET stripe_product_id = $1, stripe_price_id_addon = $2 WHERE code = 'all_access'`,
      [productId, priceId]
    );

    results.push({ code: 'all_access', productId, priceIds: { addon: priceId }, created });
    summary.push(`All-Access: product=${productId} price=${priceId}${created ? ' (created)' : ''}`);
  }

  // ---------- Odds API: standalone + bundle add-on ----------
  {
    const { id: productId, created } = await findOrCreateProduct(stripe, 'odds', 'Odds API');

    const standalonePriceId = await findOrCreatePrice(
      stripe,
      productId,
      ODDS_PRODUCT.standaloneMonthlyPriceCents,
      'Odds API — standalone'
    );
    const addonPriceId = await findOrCreatePrice(
      stripe,
      productId,
      ODDS_PRODUCT.addonMonthlyPriceCents,
      'Odds API — bundle add-on'
    );

    await query(
      `UPDATE api_products
       SET stripe_product_id = $1, stripe_price_id_standalone = $2, stripe_price_id_addon = $3
       WHERE code = 'odds'`,
      [productId, standalonePriceId, addonPriceId]
    );

    results.push({
      code: 'odds',
      productId,
      priceIds: { standalone: standalonePriceId, addon: addonPriceId },
      created,
    });
    summary.push(
      `Odds API: product=${productId} standalone=${standalonePriceId} addon=${addonPriceId}${created ? ' (created)' : ''}`
    );
  }

  // ---------- Overage metered billing product (shared across all plans) ----------
  {
    const { id: productId, created } = await findOrCreateProduct(
      stripe,
      'overage_metered',
      'API Overage Billing'
    );
    const meteredPriceId = await findOrCreateMeteredOveragePrice(stripe, productId, 150);

    results.push({ code: 'overage_metered', productId, priceIds: { metered: meteredPriceId }, created });
    summary.push(
      `Overage metered: product=${productId} price=${meteredPriceId}${created ? ' (created)' : ''}`
    );
  }

  return { results, summary };
}
