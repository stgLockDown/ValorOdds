'use client';

import { useCallback, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from '@stripe/react-stripe-js';

// Publishable key is safe to expose to the browser. loadStripe is memoised
// at module scope so we only ever create one Stripe instance.
const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

type Tier = 'basic' | 'premium' | 'vip';

const TIER_LABEL: Record<Tier, { name: string; price: string }> = {
  basic: { name: 'Basic', price: '$9.99/mo' },
  premium: { name: 'Premium', price: '$29/mo' },
  vip: { name: 'VIP', price: '$79/mo' },
};

export default function CheckoutClient({ tier }: { tier: Tier }) {
  const [error, setError] = useState<string | null>(null);

  const fetchClientSecret = useCallback(async () => {
    const resp = await fetch('/api/stripe/checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data?.clientSecret) {
      const msg =
        data?.detail ||
        data?.error ||
        (resp.status === 401
          ? 'Please sign in to continue.'
          : 'Could not start checkout. Please try again.');
      setError(msg);
      throw new Error(msg);
    }
    return data.clientSecret as string;
  }, [tier]);

  const label = TIER_LABEL[tier];

  if (!stripePromise) {
    return (
      <div className="card max-w-lg mx-auto text-center">
        <h1 className="text-xl font-bold mb-2">Checkout unavailable</h1>
        <p className="text-brand-muted">
          Payments aren&apos;t configured on this deployment yet. Please try again shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">Subscribe to {label.name}</h1>
        <p className="text-brand-muted mt-1">{label.price} · cancel anytime</p>
      </div>

      {error && (
        <div className="card mb-4 border-red-500/30 bg-red-500/10">
          <p className="text-sm text-red-400">{error}</p>
          {error.toLowerCase().includes('sign in') && (
            <a href={`/auth/signin?next=${encodeURIComponent(`/checkout?tier=${tier}`)}`}
               className="btn-primary mt-3 w-fit">Sign in</a>
          )}
        </div>
      )}

      <div id="checkout" className="rounded-xl overflow-hidden bg-white">
        <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      </div>
    </div>
  );
}
