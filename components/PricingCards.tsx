'use client';

import { useState } from 'react';
import { Check, X, Loader2, Sparkles } from 'lucide-react';

type TierId = 'free' | 'beta' | 'premium' | 'vip';

type Tier = {
  id: TierId;
  name: string;
  price: string;
  period: string;
  tagline: string;
  featured?: boolean;
  ribbon?: string;
  ctaLabel: string;
  features: { label: string; included: boolean }[];
};

// Beta is the live launch tier: ~$10 plus Stripe fee coverage.
// Stripe fee for $10 monthly is about $0.59 (2.9% + $0.30), so we round to $10.59.
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
      { label: 'Basic AI analysis', included: true },
      { label: 'Community support', included: true },
      { label: 'All sport channels', included: false },
      { label: 'Player props predictions', included: false },
      { label: 'Custom AI commands', included: false },
    ],
  },
  {
    id: 'beta',
    name: 'Beta Access',
    price: '$10.59',
    period: '/ month',
    tagline: 'Full access at launch pricing. Limited spots.',
    featured: true,
    ribbon: '🚀 Launch tier',
    ctaLabel: 'Join Beta',
    features: [
      { label: 'All arbitrage channels', included: true },
      { label: 'Full AI picks feed', included: true },
      { label: 'Dashboard access', included: true },
      { label: 'AI chat (limited)', included: true },
      { label: 'Community support', included: true },
      { label: 'Locked-in beta pricing for life', included: true },
      { label: 'Help shape the roadmap', included: true },
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '$29',
    period: '/ month',
    tagline: 'Full coverage across every sport we track.',
    ctaLabel: 'Go Premium',
    features: [
      { label: 'All arbitrage channels', included: true },
      { label: 'Unlimited opportunities', included: true },
      { label: 'Full AI analysis & recommendations', included: true },
      { label: 'Player props (multiple sports)', included: true },
      { label: 'Custom AI commands', included: true },
      { label: 'Priority support', included: true },
      { label: 'Mobile notifications', included: true },
    ],
  },
  {
    id: 'vip',
    name: 'VIP',
    price: '$79',
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

export default function PricingCards({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleCheckout(tier: Exclude<TierId, 'free'>) {
    setErrorMsg(null);
    if (!isAuthenticated) {
      window.location.href = `/auth/signup?next=${encodeURIComponent('/pricing')}`;
      return;
    }
    setLoadingTier(tier);
    try {
      const resp = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });
      let data: { url?: string; error?: string; code?: string } = {};
      try {
        data = await resp.json();
      } catch {
        // fall through to generic message
      }
      if (resp.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setErrorMsg(
        data.error ||
          `Checkout failed (HTTP ${resp.status}). Please try again in a moment.`,
      );
      setLoadingTier(null);
    } catch (err) {
      setErrorMsg(
        "Couldn't reach the server. Check your connection and try again.",
      );
      setLoadingTier(null);
    }
  }

  return (
    <div>
      {errorMsg && (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200"
        >
          {errorMsg}
        </div>
      )}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {TIERS.map((tier) => (
          <div
            key={tier.id}
            className={
              tier.featured
                ? 'card-interactive border-brand-primary/50 ring-1 ring-brand-primary/30 relative'
                : 'card-interactive relative'
            }
          >
            {tier.ribbon && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
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
                <a
                  href={isAuthenticated ? '/dashboard' : '/auth/signup'}
                  className="btn-secondary w-full"
                >
                  {isAuthenticated ? 'Go to dashboard' : tier.ctaLabel}
                </a>
              ) : (
                <button
                  onClick={() =>
                    handleCheckout(tier.id as Exclude<TierId, 'free'>)
                  }
                  disabled={loadingTier !== null}
                  className={
                    tier.featured ? 'btn-primary w-full' : 'btn-secondary w-full'
                  }
                >
                  {loadingTier === tier.id ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Redirecting…
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
    </div>
  );
}