'use client';

import { useState } from 'react';
import { Check, X, Loader2, Sparkles } from 'lucide-react';

type Tier = {
  id: 'free' | 'premium' | 'vip';
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
      { label: 'Basic AI analysis', included: true },
      { label: 'Community support', included: true },
      { label: 'All 14 sport channels', included: false },
      { label: 'Player props predictions', included: false },
      { label: 'Custom AI commands', included: false },
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '$29',
    period: '/ month',
    tagline: 'Full coverage across every sport we track.',
    featured: true,
    ribbon: 'Most Popular',
    ctaLabel: 'Go Premium',
    features: [
      { label: 'All 14 arbitrage channels', included: true },
      { label: 'Unlimited opportunities', included: true },
      { label: 'Full AI analysis & recommendations', included: true },
      { label: 'Player props (4 sports)', included: true },
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

  async function handleCheckout(tier: 'premium' | 'vip') {
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
      const data = await resp.json().catch(() => ({}));
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      // Surface the server's friendly message verbatim. 503s from
      // /api/stripe/checkout when Stripe is unconfigured land here.
      const msg =
        data?.detail ||
        data?.error ||
        (resp.status === 503
          ? 'Billing is temporarily unavailable. Please try again shortly.'
          : 'Checkout failed. Please try again.');
      alert(msg);
      setLoadingTier(null);
    } catch (err) {
      alert('Network error. Please try again.');
      setLoadingTier(null);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-3">
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
            ) : (
              <button
                onClick={() => handleCheckout(tier.id as 'premium' | 'vip')}
                disabled={loadingTier !== null}
                className={tier.featured ? 'btn-primary w-full' : 'btn-secondary w-full'}
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
  );
}