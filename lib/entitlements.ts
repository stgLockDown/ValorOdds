/**
 * Tier entitlements — single source of truth for what each subscription
 * tier can access. Import these helpers everywhere (UI gating + API guards)
 * so the rules never drift between the dashboard and the server routes.
 *
 * Tier ladder: free < basic < premium < vip
 *
 *  - free    : trial-level taste of the product.
 *  - basic   : $9.99/mo. Limited info. NO AI chat. No arbitrage / steam /
 *              player props. Gets live scores, best bets, live odds,
 *              injuries, trends, sportsbooks — but with a smaller results
 *              cap than premium/vip.
 *  - premium : $29/mo. Full access (chat + arbitrage + steam + props).
 *  - vip     : $79/mo. Everything in premium + VIP extras.
 *
 * Adding `basic` must NOT change premium/vip behaviour — those tiers keep
 * every entitlement they had before this tier existed.
 */
import type { Tier } from './env';

export const TIER_RANK: Record<Tier, number> = {
  free: 0,
  basic: 1,
  premium: 2,
  vip: 3,
};

/** True if `tier` is at least `min` on the ladder. */
export function tierAtLeast(tier: Tier | null | undefined, min: Tier): boolean {
  const t = tier ?? 'free';
  return TIER_RANK[t] >= TIER_RANK[min];
}

/**
 * AI chat is a Premium/VIP feature. Basic and Free do NOT get chat.
 * Admins always get it.
 */
export function canUseChat(tier: Tier | null | undefined, isAdmin = false): boolean {
  return isAdmin || tierAtLeast(tier, 'premium');
}

/** Arbitrage finder — Premium/VIP only. */
export function canUseArbitrage(tier: Tier | null | undefined, isAdmin = false): boolean {
  return isAdmin || tierAtLeast(tier, 'premium');
}

/** Steam moves — Premium/VIP only. */
export function canUseSteam(tier: Tier | null | undefined, isAdmin = false): boolean {
  return isAdmin || tierAtLeast(tier, 'premium');
}

/** Player props predictions — Premium/VIP only. */
export function canUsePlayerProps(tier: Tier | null | undefined, isAdmin = false): boolean {
  return isAdmin || tierAtLeast(tier, 'premium');
}

/**
 * Whether the user gets "core" dashboard data (scores, best bets, odds,
 * injuries, trends, sportsbooks). Basic and up. Free still gets a teaser
 * elsewhere; this gate is for the richer paid views.
 */
export function canUseCoreData(tier: Tier | null | undefined, isAdmin = false): boolean {
  return isAdmin || tierAtLeast(tier, 'basic');
}

/**
 * Max number of rows/opportunities a tier may pull from list endpoints.
 * Basic is intentionally capped so it delivers "limited info" relative to
 * Premium/VIP. Free is the smallest taste.
 */
export function resultLimitFor(tier: Tier | null | undefined, isAdmin = false): number {
  if (isAdmin) return 200;
  switch (tier ?? 'free') {
    case 'vip':
    case 'premium':
      return 200;
    case 'basic':
      return 10;
    case 'free':
    default:
      return 5;
  }
}

/** Tiers that are purchasable via Stripe checkout. */
export type PaidTier = Exclude<Tier, 'free'>;
export const PAID_TIERS: PaidTier[] = ['basic', 'premium', 'vip'];
