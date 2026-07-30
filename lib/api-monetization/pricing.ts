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

/**
 * Intelligence products — premium data feeds sourced from the ValorOdds
 * Postgres database (not proxied to a separate backend service like the 26
 * sport APIs). These are value-added analytics: arbitrage opportunities,
 * line-movement / steam-move detection, injury reports, and AI-generated
 * betting analysis. Priced as standalone or bundle add-ons.
 *
 * Ping weights are higher than a bare sport call because each query does
 * heavier DB work and returns richer, pre-computed intelligence.
 */
export const INTELLIGENCE_PRODUCTS = [
  {
    code: 'arbitrage' as const,
    name: 'Arbitrage & Sure-Bet Feed',
    pingWeight: 5,
    addonMonthlyPriceCents: 5000, // +$50/mo on top of any bundle
    standaloneMonthlyPriceCents: 7500, // $75/mo standalone
    standaloneMonthlyPings: 50_000, // dedicated pool at weight 5 => 10,000 effective calls/mo
    description:
      'Live sure-bet opportunities across 20+ sportsbooks. Every row includes the full per-book odds breakdown so you can compute exact stake allocations. Updated every 60 seconds.',
  },
  {
    code: 'steam_moves' as const,
    name: 'Steam Moves & Line Movement',
    pingWeight: 5,
    addonMonthlyPriceCents: 5000, // +$50/mo
    standaloneMonthlyPriceCents: 7500, // $75/mo standalone
    standaloneMonthlyPings: 50_000,
    description:
      'Real-time line-movement alerts. When 3+ sportsbooks move a line in the same direction within a short window, we flag it as a steam move — the sharpest signal in the market.',
  },
  {
    code: 'injuries' as const,
    name: 'Injury Reports',
    pingWeight: 2,
    addonMonthlyPriceCents: 2500, // +$25/mo
    standaloneMonthlyPriceCents: 3900, // $39/mo standalone
    standaloneMonthlyPings: 50_000, // weight 2 => 25,000 effective calls/mo
    description:
      'Standardized injury reports aggregated from ESPN and other sources. Player, team, position, status (Day-To-Day / IL / Out), injury type, and full description.',
  },
  {
    code: 'ai_analysis' as const,
    name: 'AI Betting Intelligence',
    pingWeight: 10,
    addonMonthlyPriceCents: 10000, // +$100/mo
    standaloneMonthlyPriceCents: 14900, // $149/mo standalone
    standaloneMonthlyPings: 30_000, // weight 10 => 3,000 effective calls/mo
    description:
      'GPT-4o-powered depth analysis for every game across all supported sports. Each report includes a recommended pick, confidence assessment, odds breakdown, and full reasoning in markdown.',
  },
] as const;

export type IntelligenceProductCode = (typeof INTELLIGENCE_PRODUCTS)[number]['code'];

export const INTELLIGENCE_PRODUCT_CODES = INTELLIGENCE_PRODUCTS.map((p) => p.code) as readonly string[];

/** True if the code is one of the four intelligence products. */
export function isIntelligenceCode(code: string): code is IntelligenceProductCode {
  return INTELLIGENCE_PRODUCT_CODES.includes(code);
}

export const DEFAULT_OVERAGE_PRICE_CENTS_PER_1K = 150; // $1.50 / 1,000 overage pings

export function findPingTier(code: string) {
  return PING_TIERS.find((t) => t.code === code) ?? null;
}

export function isSportCode(code: string): code is SportProductCode {
  return SPORT_PRODUCTS.some((s) => s.code === code);
}

/** Find an intelligence product config by code, or null. */
export function findIntelligenceProduct(code: string) {
  return INTELLIGENCE_PRODUCTS.find((p) => p.code === code) ?? null;
}

/** True if a code is a valid purchasable product (sport, odds, intelligence, or all_access). */
export function isPurchasableCode(code: string): boolean {
  return isSportCode(code) || code === 'odds' || code === 'all_access' || isIntelligenceCode(code);
}

/** Formats cents as a "$X" or "$X.XX" display string. */
export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}
