/**
 * DiamondDraft — ESPN sync extension entitlements.
 *
 * Feature gating for the browser extension that overlays live draft analytics
 * on ESPN's draft room. This module sits on top of `lib/entitlements.ts` and
 * never re-implements the tier ladder: it composes the existing helpers so the
 * extension can never drift out of sync with the web dashboard.
 *
 * The gating ladder mirrors the rest of the product:
 *
 *   free    — the bar loads and shows best-available by projection only. No VOR
 *             numbers, no scarcity, no AI. Enough to demonstrate value.
 *   basic   — full VOR board, positional scarcity, tier-cliff alerts and pick
 *             grading. No AI chat (consistent with `canUseChat`).
 *   premium — everything in basic plus the AI draft assistant.
 *   vip     — same as premium; reserved for future VIP-only extras.
 *
 * Admins always receive the full feature set.
 */

import type { Tier } from '../env';
import { tierAtLeast, canUseChat, resultLimitFor } from '../entitlements';

/** Feature flags returned to the extension so the UI can render correctly. */
export interface EspnSyncFeatures {
  /** May the extension call the sync endpoint at all? */
  canSync: boolean;
  /** Show numeric VOR values and the ranked VOR board. */
  canSeeVor: boolean;
  /** Show positional scarcity and urgency indicators. */
  canSeeScarcity: boolean;
  /** Show tier-cliff warnings ("take him now" alerts). */
  canSeeTierCliffs: boolean;
  /** Show letter grades on picks that have been made. */
  canSeePickGrades: boolean;
  /** Access the AI draft assistant from inside the bar. */
  canUseAiChat: boolean;
  /** Maximum number of board rows returned to this tier. */
  boardLimit: number;
  /** Maximum number of ranked suggestions returned. */
  suggestionLimit: number;
  /** Minimum seconds between sync calls, enforced server-side. */
  minSyncIntervalMs: number;
  /** The tier these features were derived from (echoed for the client). */
  tier: Tier;
  /** True when the caller is an admin and gating was bypassed. */
  isAdmin: boolean;
}

/**
 * Free users can load the bar, so `canSync` is true for everyone. The value of
 * the response is what varies by tier — this keeps the upgrade prompt visible
 * in-product rather than showing an empty bar.
 */
export function espnSyncFeaturesFor(
  tier: Tier | null | undefined,
  isAdmin = false,
): EspnSyncFeatures {
  const t: Tier = tier ?? 'free';
  const paid = isAdmin || tierAtLeast(t, 'basic');

  return {
    canSync: true,
    canSeeVor: paid,
    canSeeScarcity: paid,
    canSeeTierCliffs: paid,
    canSeePickGrades: paid,
    // Delegate to the canonical chat gate so the extension and the web app
    // always agree on who gets AI.
    canUseAiChat: canUseChat(t, isAdmin),
    boardLimit: resultLimitFor(t, isAdmin),
    suggestionLimit: isAdmin || tierAtLeast(t, 'premium') ? 5 : paid ? 3 : 1,
    // Throttle free callers harder; paid tiers need near-real-time updates as
    // picks come in.
    minSyncIntervalMs: paid ? 1000 : 5000,
    tier: t,
    isAdmin,
  };
}

/**
 * Strip a VOR result down to what the caller's tier is allowed to see.
 *
 * Free users still get a useful board — players ordered by the engine — but the
 * analytical fields that constitute the paid product are zeroed out rather than
 * merely hidden client-side. Never rely on the extension to hide paid data:
 * anything sent over the wire is readable by the user.
 */
export function redactForTier<
  B extends object,
  S,
  G,
  R,
>(
  result: { board: B[]; scarcity: S[]; suggestions: G[]; activeRuns: R[] },
  features: EspnSyncFeatures,
): {
  board: Array<Partial<B>>;
  scarcity: S[];
  suggestions: G[];
  activeRuns: R[];
} {
  const board = result.board.slice(0, features.boardLimit).map((p) => {
    if (features.canSeeVor) return p as Partial<B>;
    // Remove the paid analytics from each row before it leaves the server.
    // Done by key list rather than destructuring so the function stays generic
    // over any board row shape the caller supplies.
    const PAID_FIELDS = [
      'vor',
      'vorScore',
      'replacementLevel',
      'dropoff',
      'isTierCliff',
      'adpValue',
    ] as const;

    const rest: Record<string, unknown> = { ...(p as Record<string, unknown>) };
    for (const field of PAID_FIELDS) delete rest[field];
    return rest as Partial<B>;
  });

  return {
    board,
    scarcity: features.canSeeScarcity ? result.scarcity : [],
    suggestions: result.suggestions.slice(0, features.suggestionLimit),
    activeRuns: features.canSeeScarcity ? result.activeRuns : [],
  };
}

/**
 * Build the upgrade nudge shown in the bar, or null when the tier already has
 * everything. Returned by the sync endpoint so copy lives server-side and can
 * change without shipping a new extension build.
 */
export function upgradePromptFor(features: EspnSyncFeatures): {
  headline: string;
  detail: string;
  targetTier: Exclude<Tier, 'free'>;
} | null {
  if (features.isAdmin) return null;

  if (!features.canSeeVor) {
    return {
      headline: 'Unlock live draft analytics',
      detail:
        'Upgrade to Basic for Value Over Replacement scoring, positional scarcity and tier-cliff alerts as your draft unfolds.',
      targetTier: 'basic',
    };
  }

  if (!features.canUseAiChat) {
    return {
      headline: 'Add the AI draft assistant',
      detail:
        'Upgrade to Premium to ask the AI about any pick, with your full draft board as live context.',
      targetTier: 'premium',
    };
  }

  return null;
}
