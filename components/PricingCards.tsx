'use client';

import { useEffect, useState } from 'react';
import { Check, X, Loader2, Sparkles } from 'lucide-react';

type Tier = {
  id: 'free' | 'basic' | 'premium' | 'vip';
  name: string;
  price: string;
  period: string;
  tagline: string;
  featured?: boolean;
  ribbon?: string;
  ctaLabel: string;
  features: { label: string; included: boolean }[];
};

const TIERS: Tier[] = [
  {
    id: 'free',
    name: 'Free Trial',
    price: '$0',
    period: '/ 7 days',
    tagline: 'Try Valor Odds, no card required.',
    ctaLabel: 'Start free',
    features: [
      { label: 'Access to summary channel', included: true },
      { label: 'Daily top 5 opportunities', included: true },
      { label: 'Community support', included: true },
      { label: 'AI chat analyst', included: false },
      { label: 'Arbitrage finder', included: false },
      { label: 'Player props predictions', included: false },
    ],
  },
  {
    id: 'basic',
    name: 'Basic',
    price: '$9.99',
    period: '/ month',
    tagline: 'The essentials, without the AI chat.',
    ctaLabel: 'Get Basic',
    features: [
      { label: 'Live scores & best bets', included: true },
      { label: 'Live odds & line tracking', included: true },
      { label: 'Injury reports', included: true },
      { label: 'Trends & sportsbook reviews', included: true },
      { label: '1 domestic + 1 international arb / day', included: true },
      { label: 'AI chat analyst', included: false },
      { label: 'Unlimited arbitrage & steam moves', included: false },
      { label: 'Player props predictions', included: false },
      { label: 'Premium Discord channels', included: false },
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '$30',
    period: '/ month',
    tagline: 'Full coverage across every sport we track.',
    featured: true,
    ribbon: 'Most Popular',
    ctaLabel: 'Go Premium',
    features: [
      { label: 'Everything in Basic', included: true },
      { label: 'AI chat analyst (unlimited)', included: true },
      { label: 'Arbitrage finder + stake sizing', included: true },
      { label: 'Steam moves & sharp signals', included: true },
      { label: 'Player props (4 sports)', included: true },
      { label: 'Priority support', included: true },
      { label: 'Mobile notifications', included: true },
    ],
  },
  {
    id: 'vip',
    name: 'VIP',
    price: '$80',
    period: '/ month',
    tagline: 'Shape the future of Valor Odds.',
    ribbon: '🌟 Shape the future',
    ctaLabel: 'Join VIP',
    features: [
      { label: 'Everything in Premium', included: true },
      { label: 'Early access to opportunities', included: true },
      { label: 'Exclusive VIP channel', included: true },
      { label: 'Direct input on bot functions', included: true },
      { label: 'Live meetings with dev team', included: true },
      { label: 'Mobile app beta access', included: true },
      { label: 'Custom alerts & priority support', included: true },
    ],
  },
];

export default function PricingCards({
  isAuthenticated: isAuthenticatedProp,
}: {
  /**
   * Optional. When omitted, the component resolves the session client-side via
   * /api/account/me. This lets the /pricing page stay free of `await auth()`
   * so it doesn't get forced into dynamic (no-store) server rendering.
   */
  isAuthenticated?: boolean;
}) {
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [resolvedAuth, setResolvedAuth] = useState<boolean>(isAuthenticatedProp ?? false);
  const [currentTier, setCurrentTier] = useState<Tier['id'] | null>(null);

  useEffect(() => {
    if (typeof isAuthenticatedProp === 'boolean') {
      setResolvedAuth(isAuthenticatedProp);
      if (!isAuthenticatedProp) return;
    }
    let cancelled = false;
    // NextAuth session endpoint returns 200 for guests (no console 401).
    // It also carries the user's current subscription tier, which we use to
    // make the CTA plan-aware (e.g. don't prompt an active VIP subscriber to
    // "Join VIP" again).
    fetch('/api/auth/session', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setResolvedAuth(Boolean(data?.user));
        const tier = data?.user?.tier as Tier['id'] | undefined;
        if (tier && ['free', 'basic', 'premium', 'vip'].includes(tier)) {
          setCurrentTier(tier);
        }
      })
      .catch(() => {
        if (!cancelled) setResolvedAuth(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticatedProp]);

  const isAuthenticated = resolvedAuth;

  function handleCheckout(tier: 'basic' | 'premium' | 'vip') {
    if (!isAuthenticated) {
      window.location.href = `/auth/signup?next=${encodeURIComponent(`/checkout?tier=${tier}`)}`;
      return;
    }
    setLoadingTier(tier);
    // Embedded checkout lives on /checkout — the Stripe form renders on our
    // own page (no redirect to a hosted Stripe page).
    window.location.href = `/checkout?tier=${tier}`;
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {TIERS.map((tier) => (
        <div
          key={tier.id}
          id={tier.id}
          className={
            tier.featured
              ? 'card-interactive border-brand-primary/50 ring-1 ring-brand-primary/30 relative scroll-mt-24'
              : 'card-interactive relative scroll-mt-24'
          }
        >
          {tier.ribbon && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="badge-primary">
                <Sparkles className="h-3 w-3" />
                {tier.ribbon}
              </span>
            </div>
          )}
          <h3 className="text-xl font-bold">{tier.name}</h3>
          <p className="text-sm text-brand-muted mt-1">{tier.tagline}</p>
          <div className="mt-6 flex items-baseline gap-1">
            <span className="text-4xl font-extrabold">{tier.price}</span>
            <span className="text-brand-muted text-sm">{tier.period}</span>
          </div>
          <ul className="mt-6 space-y-2.5 text-sm">
            {tier.features.map((f) => (
              <li key={f.label} className="flex items-start gap-2">
                {f.included ? (
                  <Check className="h-4 w-4 text-brand-success mt-0.5 shrink-0" />
                ) : (
                  <X className="h-4 w-4 text-brand-muted mt-0.5 shrink-0" />
                )}
                <span className={f.included ? '' : 'text-brand-muted line-through'}>
                  {f.label}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            {tier.id === 'free' ? (
              <a href={isAuthenticated ? '/dashboard' : '/auth/signup'} className="btn-secondary w-full">
                {isAuthenticated ? 'Go to dashboard' : tier.ctaLabel}
              </a>
            ) : isAuthenticated && currentTier === tier.id ? (
              <button className="btn-secondary w-full flex items-center justify-center gap-2" disabled>
                <Check className="h-4 w-4" /> Current plan
              </button>
            ) : isAuthenticated && currentTier && currentTier !== 'free' ? (
              <a href="/account" className="btn-secondary w-full">
                Manage plan
              </a>
            ) : (
              <button
                onClick={() => handleCheckout(tier.id as 'basic' | 'premium' | 'vip')}
                disabled={loadingTier !== null}
                className={tier.featured ? 'btn-primary w-full' : 'btn-secondary w-full'}
              >
                {loadingTier === tier.id ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Continuing…
                  </>
                ) : (
                  tier.ctaLabel
                )}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}