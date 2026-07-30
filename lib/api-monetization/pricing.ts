/**
 * Single source of truth for the API monetization "build your own bundle"
 * pricing. Mirrors the seed data in db/migrations/004_api_monetization.sql —
 * if you change a price here, update that migration's seed values too (and
 * vice versa) so the DB and this config never drift.
 */

export const SPORT_PRODUCTS = [
  { code: 'baseball', name: 'Baseball API' },
  { code: 'basketball', name: 'Basketball API' },
  { code: 'soccer', name: 'Soccer API' },
  { code: 'hockey', name: 'Hockey API' },
  { code: 'football', name: 'Football API' },
  { code: 'fifa', name: 'FIFA API' },
  { code: 'champions_league', name: 'Champions League API' },
  { code: 'tennis', name: 'Tennis API' },
  { code: 'golf', name: 'Golf API' },
  { code: 'cricket', name: 'Cricket API' },
  { code: 'cycling', name: 'Cycling API' },
  { code: 'combat', name: 'Combat Sports API' },
  { code: 'rugby', name: 'Rugby API' },
  { code: 'rugby_league', name: 'Rugby League API' },
  { code: 'swimming', name: 'Swimming API' },
  { code: 'tour_de_france', name: 'Tour De France API' },
  { code: 'track', name: 'Track API' },
  { code: 'volleyball', name: 'Volleyball API' },
  { code: 'wimbledon', name: 'Wimbledon API' },
  { code: 'world_series', name: 'World Series API' },
  { code: 'xgames', name: 'X Games API' },
  { code: 'motorsports', name: 'Motorsports API' },
  { code: 'olympics', name: 'Olympics API' },
  { code: 'march_madness', name: 'March Madness API' },
  { code: 'superbowl', name: 'Super Bowl API' },
  { code: 'formula1', name: 'Formula 1 API' },
] as const;

export type SportProductCode = (typeof SPORT_PRODUCTS)[number]['code'];

export const SPORT_ADDON_PRICE_CENTS = 500; // $5/mo per sport add-on
export const ALL_ACCESS_PRICE_CENTS = 9900; // $99/mo flat instead of 26 x $5 = $130/mo

export const PING_TIERS = [
  { code: 't10k', name: '10,000 pings/mo', monthlyPings: 10_000, priceCents: 1200 },
  { code: 't50k', name: '50,000 pings/mo', monthlyPings: 50_000, priceCents: 3500 },
  { code: 't250k', name: '250,000 pings/mo', monthlyPings: 250_000, priceCents: 12500 },
  { code: 't1m', name: '1,000,000 pings/mo', monthlyPings: 1_000_000, priceCents: 36900 },
] as const;

export type PingTierCode = (typeof PING_TIERS)[number]['code'];

export const ODDS_PRODUCT = {
  code: 'odds' as const,
  name: 'Odds API',
  pingWeight: 5, // costs 5x the quota of a normal sport call — "much higher price per rate"
  addonMonthlyPriceCents: 10000, // +$100/mo on top of any bundle
  standaloneMonthlyPriceCents: 25000, // $250/mo standalone
  standaloneMonthlyPings: 50_000, // dedicated pool, weight 5 => 10,000 effective calls/mo
};

export const DEFAULT_OVERAGE_PRICE_CENTS_PER_1K = 150; // $1.50 / 1,000 overage pings

export function findPingTier(code: string) {
  return PING_TIERS.find((t) => t.code === code) ?? null;
}

export function isSportCode(code: string): code is SportProductCode {
  return SPORT_PRODUCTS.some((s) => s.code === code);
}

/** Formats cents as a "$X" or "$X.XX" display string. */
export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}
