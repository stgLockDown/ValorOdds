'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Zap, Info } from 'lucide-react';

interface Product {
  code: string;
  name: string;
  category: 'sport' | 'premium' | 'bundle_addon';
  ping_weight: number;
  addon_monthly_price_cents: number | null;
  standalone_monthly_price_cents: number | null;
  standalone_monthly_pings: number | null;
}

interface PingTier {
  code: string;
  name: string;
  monthly_pings: number;
  monthly_price_cents: number;
}

function fmtCents(cents: number): string {
  const d = cents / 100;
  return d % 1 === 0 ? `$${d}` : `$${d.toFixed(2)}`;
}

export default function BundleBuilder({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [tiers, setTiers] = useState<PingTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [pingTierCode, setPingTierCode] = useState<string>('t50k');
  const [allAccess, setAllAccess] = useState(false);
  const [selectedSports, setSelectedSports] = useState<Set<string>>(new Set());
  const [oddsAddon, setOddsAddon] = useState(false);
  const [oddsStandaloneMode, setOddsStandaloneMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/api-access/catalog')
      .then((r) => r.json())
      .then((data) => {
        setProducts(data.products || []);
        setTiers(data.ping_tiers || []);
      })
      .catch(() => setError('Could not load pricing catalog.'))
      .finally(() => setLoading(false));
  }, []);

  const sportProducts = products.filter((p) => p.category === 'sport');
  const oddsProduct = products.find((p) => p.code === 'odds');

  function toggleSport(code: string) {
    setSelectedSports((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  const total = useMemo(() => {
    if (oddsStandaloneMode) {
      return oddsProduct?.standalone_monthly_price_cents ?? 0;
    }
    let cents = 0;
    const tier = tiers.find((t) => t.code === pingTierCode);
    cents += tier?.monthly_price_cents ?? 0;
    if (allAccess) {
      const aa = products.find((p) => p.code === 'all_access');
      cents += aa?.addon_monthly_price_cents ?? 0;
    } else {
      for (const code of selectedSports) {
        const p = sportProducts.find((sp) => sp.code === code);
        cents += p?.addon_monthly_price_cents ?? 0;
      }
    }
    if (oddsAddon) {
      cents += oddsProduct?.addon_monthly_price_cents ?? 0;
    }
    return cents;
  }, [oddsStandaloneMode, oddsProduct, tiers, pingTierCode, allAccess, products, selectedSports, sportProducts, oddsAddon]);

  async function handleCheckout() {
    if (!isAuthenticated) {
      window.location.href = `/auth/signup?next=${encodeURIComponent('/api-access')}`;
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body = oddsStandaloneMode
        ? { planType: 'odds_standalone' as const }
        : {
            planType: 'bundle' as const,
            pingTierCode,
            allAccess,
            sports: allAccess ? [] : Array.from(selectedSports),
            oddsAddon,
          };
      const resp = await fetch('/api/api-access/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Checkout failed');
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr,360px]">
      <div className="space-y-6">
        {/* Odds standalone toggle */}
        <div className="card p-5 border-brand-accent/40">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-brand-accent" />
                <h3 className="font-semibold">Just want the Odds API?</h3>
              </div>
              <p className="text-sm text-brand-muted mt-1">
                Standalone access to our real-time Odds API — its own dedicated pool of{' '}
                {oddsProduct?.standalone_monthly_pings?.toLocaleString()} pings/mo, no ping-tier bundle
                required.
              </p>
            </div>
            <label className="flex items-center gap-2 shrink-0 cursor-pointer">
              <input
                type="checkbox"
                checked={oddsStandaloneMode}
                onChange={(e) => setOddsStandaloneMode(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="font-bold text-brand-accent">
                {oddsProduct ? fmtCents(oddsProduct.standalone_monthly_price_cents ?? 0) : ''}/mo
              </span>
            </label>
          </div>
        </div>

        <fieldset disabled={oddsStandaloneMode} className={oddsStandaloneMode ? 'opacity-40 pointer-events-none space-y-6' : 'space-y-6'}>
          {/* Ping tier selector */}
          <div className="card p-5">
            <h3 className="font-semibold mb-1">1. Choose your ping pool</h3>
            <p className="text-sm text-brand-muted mb-4">
              Pings are consumed each time you call any API in your bundle (Odds API calls cost 5x more
              — {oddsProduct?.ping_weight}x weight).
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {tiers.map((t) => (
                <label
                  key={t.code}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                    pingTierCode === t.code
                      ? 'border-brand-primary bg-brand-primary/10'
                      : 'border-brand-border hover:border-brand-primary/50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="pingTier"
                      checked={pingTierCode === t.code}
                      onChange={() => setPingTierCode(t.code)}
                      className="h-4 w-4"
                    />
                    {t.name}
                  </span>
                  <span className="font-bold">{fmtCents(t.monthly_price_cents)}/mo</span>
                </label>
              ))}
            </div>
          </div>

          {/* Sport selection */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold">2. Pick your sports</h3>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={allAccess}
                  onChange={(e) => setAllAccess(e.target.checked)}
                  className="h-4 w-4"
                />
                All-Access (all 26) — $99/mo flat
              </label>
            </div>
            <p className="text-sm text-brand-muted mb-4">
              $5/mo per sport add-on, or save with All-Access instead of adding all 26 individually.
            </p>
            <div
              className={`grid gap-2 sm:grid-cols-2 md:grid-cols-3 ${allAccess ? 'opacity-40 pointer-events-none' : ''}`}
            >
              {sportProducts.map((p) => (
                <label
                  key={p.code}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                    selectedSports.has(p.code)
                      ? 'border-brand-primary bg-brand-primary/10'
                      : 'border-brand-border hover:border-brand-primary/50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedSports.has(p.code)}
                      onChange={() => toggleSport(p.code)}
                      className="h-3.5 w-3.5"
                    />
                    {p.name}
                  </span>
                  <span className="text-brand-muted">{fmtCents(p.addon_monthly_price_cents ?? 0)}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Odds add-on */}
          <div className="card p-5">
            <label className="flex items-center justify-between cursor-pointer">
              <span>
                <span className="font-semibold">3. Add Odds API to this bundle?</span>
                <p className="text-sm text-brand-muted mt-1">
                  Adds Odds API access to your pool at 5x weight per call (premium data, priced
                  accordingly).
                </p>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <input
                  type="checkbox"
                  checked={oddsAddon}
                  onChange={(e) => setOddsAddon(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="font-bold">
                  +{oddsProduct ? fmtCents(oddsProduct.addon_monthly_price_cents ?? 0) : ''}/mo
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        {error && <div className="text-sm text-red-400">{error}</div>}
      </div>

      {/* Summary / checkout sidebar */}
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold">Your plan</h3>
          {oddsStandaloneMode ? (
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span>Odds API — standalone</span>
                <span>{oddsProduct ? fmtCents(oddsProduct.standalone_monthly_price_cents ?? 0) : ''}</span>
              </div>
              <div className="text-brand-muted text-xs flex items-start gap-1 mt-2">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {oddsProduct?.standalone_monthly_pings?.toLocaleString()} pings/mo dedicated pool.
              </div>
            </div>
          ) : (
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span>{tiers.find((t) => t.code === pingTierCode)?.name}</span>
                <span>{fmtCents(tiers.find((t) => t.code === pingTierCode)?.monthly_price_cents ?? 0)}</span>
              </div>
              {allAccess ? (
                <div className="flex justify-between">
                  <span>All-Access (26 sports)</span>
                  <span>
                    {fmtCents(products.find((p) => p.code === 'all_access')?.addon_monthly_price_cents ?? 0)}
                  </span>
                </div>
              ) : (
                Array.from(selectedSports).map((code) => {
                  const p = sportProducts.find((sp) => sp.code === code);
                  return (
                    <div key={code} className="flex justify-between text-brand-muted">
                      <span>{p?.name}</span>
                      <span>{fmtCents(p?.addon_monthly_price_cents ?? 0)}</span>
                    </div>
                  );
                })
              )}
              {oddsAddon && (
                <div className="flex justify-between">
                  <span>Odds API add-on</span>
                  <span>+{fmtCents(oddsProduct?.addon_monthly_price_cents ?? 0)}</span>
                </div>
              )}
            </div>
          )}
          <div className="border-t border-brand-border pt-3 flex justify-between font-bold text-lg">
            <span>Total</span>
            <span>{fmtCents(total)}/mo</span>
          </div>
          <button
            onClick={handleCheckout}
            disabled={submitting || (!oddsStandaloneMode && !allAccess && selectedSports.size === 0 && !oddsAddon)}
            className="btn-primary w-full justify-center"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {isAuthenticated ? 'Subscribe' : 'Sign up & subscribe'}
          </button>
          <p className="text-xs text-brand-muted text-center">
            Cancel anytime. Optional pay-per-overage available after checkout.
          </p>
        </div>
      </div>
    </div>
  );
}
