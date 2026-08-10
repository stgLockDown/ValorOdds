'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Key, RefreshCw, Copy, Check, Loader2, AlertTriangle, ShieldCheck,
  BarChart2, Zap, ChevronDown, ChevronUp, Code2,
} from 'lucide-react';

interface Plan {
  id: string;
  plan_type: 'bundle' | 'odds_standalone';
  ping_tier_code: string | null;
  all_access: boolean;
  odds_addon: boolean;
  overage_enabled: boolean;
  overage_price_cents_per_1k: number;
  monthly_ping_quota: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  key_prefix: string | null;
  key_created_at: string | null;
  products: string[];
}

interface UsagePeriod {
  pings_included: number;
  pings_used: number;
  overage_pings: number;
  overage_cost_cents: number;
  status: string;
  period_start?: string;
  period_end?: string;
}

interface UsageEvent {
  product_code: string;
  endpoint: string;
  weight: number;
  status_code: number;
  called_at: string;
}

interface ProductUsage {
  product_code: string;
  calls: number;
  pings: number;
}

function fmtCents(cents: number): string {
  const d = cents / 100;
  return d % 1 === 0 ? `$${d}` : `$${d.toFixed(2)}`;
}

function planLabel(p: Plan): string {
  if (p.plan_type === 'odds_standalone') return 'Odds API — Standalone';
  if (p.all_access) return 'All-Access Bundle (26 sports)';
  const n = p.products?.length ?? 0;
  return `Custom Bundle (${n} sport${n === 1 ? '' : 's'})${p.odds_addon ? ' + Odds API' : ''}`;
}

function PlanCard({ plan, onChanged }: { plan: Plan; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [usage, setUsage] = useState<{ period: UsagePeriod; recentCalls: UsageEvent[]; byProduct: ProductUsage[] } | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [togglingOverage, setTogglingOverage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUsage = useCallback(async () => {
    setLoadingUsage(true);
    try {
      const resp = await fetch(`/api/api-access/usage?planId=${plan.id}`);
      const data = await resp.json();
      if (resp.ok) setUsage(data);
    } catch {
      // ignore
    } finally {
      setLoadingUsage(false);
    }
  }, [plan.id]);

  useEffect(() => {
    if (expanded && !usage) loadUsage();
  }, [expanded, usage, loadUsage]);

  async function handleRegenerate() {
    if (!confirm('This will immediately invalidate the current key. Continue?')) return;
    setRegenerating(true);
    setError(null);
    try {
      const resp = await fetch('/api/api-access/keys/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to regenerate key');
      setRevealedKey(data.apiKey);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate key');
    } finally {
      setRegenerating(false);
    }
  }

  async function handleOverageToggle(checked: boolean) {
    setTogglingOverage(true);
    setError(null);
    try {
      const resp = await fetch('/api/api-access/overage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, enabled: checked }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to update overage setting');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update overage setting');
    } finally {
      setTogglingOverage(false);
    }
  }

  function copyKey() {
    if (!revealedKey) return;
    navigator.clipboard.writeText(revealedKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const quota = Number(plan.monthly_ping_quota);
  const used = usage?.period?.pings_used ?? 0;
  const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  const overCap = usage?.period?.overage_pings ? usage.period.overage_pings > 0 : false;

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brand-primary" />
            <h3 className="font-semibold">{planLabel(plan)}</h3>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                plan.status === 'active'
                  ? 'bg-green-500/10 text-green-400'
                  : 'bg-yellow-500/10 text-yellow-400'
              }`}
            >
              {plan.status}
            </span>
          </div>
          <p className="text-sm text-brand-muted mt-1">
            {quota.toLocaleString()} pings/mo included
            {plan.current_period_end
              ? ` · renews ${new Date(plan.current_period_end).toLocaleDateString()}`
              : ''}
            {plan.cancel_at_period_end ? ' · cancels at period end' : ''}
          </p>
          {!plan.all_access && plan.plan_type === 'bundle' && plan.products.length > 0 && (
            <p className="text-xs text-brand-muted mt-1">
              Sports: {plan.products.join(', ')}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="text-xs text-brand-muted font-mono bg-brand-surface px-2 py-1.5 rounded flex items-center gap-1.5">
            <Key className="h-3.5 w-3.5" />
            {plan.key_prefix ? `${plan.key_prefix}••••••••` : 'no key issued'}
          </div>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
          >
            {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Regenerate
          </button>
        </div>
      </div>

      {revealedKey && (
        <div className="rounded-lg border border-brand-accent/40 bg-brand-accent/5 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-brand-accent">
            <AlertTriangle className="h-4 w-4" />
            Copy your new key now — it won't be shown again
          </div>
          <div className="flex items-center gap-2">
            <code className="text-xs bg-black/30 rounded px-2 py-1.5 break-all flex-1">{revealedKey}</code>
            <button onClick={copyKey} className="btn-secondary text-xs px-2 py-1.5 flex items-center gap-1">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-brand-border pt-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={plan.overage_enabled}
            disabled={togglingOverage}
            onChange={(e) => handleOverageToggle(e.target.checked)}
            className="h-4 w-4"
          />
          <span>
            Pay for overage past my monthly pool{' '}
            <span className="text-brand-muted">
              ({fmtCents(plan.overage_price_cents_per_1k)}/1,000 pings)
            </span>
          </span>
        </label>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-sm text-brand-primary flex items-center gap-1"
        >
          <BarChart2 className="h-4 w-4" />
          Usage {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {!plan.overage_enabled && (
        <p className="text-xs text-brand-muted -mt-2">
          Default: calls are cut off (HTTP 429) once your monthly pool is used up — no surprise charges.
        </p>
      )}
      {plan.overage_enabled && (
        <p className="text-xs text-brand-muted -mt-2">
          Overage enabled: calls keep working past your pool and are billed automatically at the rate above.
        </p>
      )}

      {error && <div className="text-sm text-red-400">{error}</div>}

      {expanded && (
        <div className="border-t border-brand-border pt-4 space-y-4">
          {loadingUsage ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-brand-primary" />
            </div>
          ) : usage ? (
            <>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>
                    {used.toLocaleString()} / {quota.toLocaleString()} pings used this month
                  </span>
                  <span className="text-brand-muted">{pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-brand-surface overflow-hidden">
                  <div
                    className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : 'bg-brand-primary'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {overCap && (
                  <p className="text-xs text-yellow-400 mt-2 flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5" />
                    {usage.period.overage_pings.toLocaleString()} overage pings this period ·{' '}
                    {fmtCents(usage.period.overage_cost_cents)} billed
                  </p>
                )}
              </div>

              {usage.byProduct.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-brand-muted uppercase mb-2">
                    Usage by product (this month)
                  </h4>
                  <div className="space-y-1">
                    {usage.byProduct.map((p) => (
                      <div key={p.product_code} className="flex justify-between text-sm">
                        <span>{p.product_code}</span>
                        <span className="text-brand-muted">
                          {p.calls.toLocaleString()} calls · {p.pings.toLocaleString()} pings
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {usage.recentCalls.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-brand-muted uppercase mb-2">Recent calls</h4>
                  <div className="max-h-48 overflow-y-auto space-y-1 text-xs font-mono">
                    {usage.recentCalls.map((c, i) => (
                      <div key={i} className="flex justify-between text-brand-muted">
                        <span className="truncate pr-2">
                          {c.product_code} {c.endpoint}
                        </span>
                        <span className="shrink-0">
                          {c.status_code} · {c.weight}p · {new Date(c.called_at).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-brand-muted">No usage yet this period.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ApiManageClient() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const resp = await fetch('/api/api-access/me');
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to load plans');
      setPlans(data.plans);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plans');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return <div className="card p-6 text-red-400">{error}</div>;
  }

  if (plans === null) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="card p-10 text-center space-y-3">
        <p className="text-brand-muted">You don't have any active API plans yet.</p>
        <Link href="/api-access" className="btn-primary inline-flex">
          Build a bundle
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <QuickStart />
      {plans.map((p) => (
        <PlanCard key={p.id} plan={p} onChanged={load} />
      ))}
      <div className="text-center pt-4">
        <Link href="/api-access" className="text-sm text-brand-primary underline">
          + Add another plan or change your bundle
        </Link>
      </div>
    </div>
  );
}

function QuickStart() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const sample = `curl https://api-gateway-production-12e8.up.railway.app/v1/odds \\
  -H "X-API-Key: vok_YOUR_KEY_HERE" \\
  -H "Accept: application/json"`;

  function copy() {
    navigator.clipboard.writeText(sample).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="card overflow-hidden p-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-3 flex items-center justify-between hover:bg-brand-surface/40 transition-colors"
      >
        <span className="font-semibold flex items-center gap-2">
          <Code2 className="h-4 w-4 text-brand-primary" />
          Quick start — how to use your API key
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-brand-muted" /> : <ChevronDown className="h-4 w-4 text-brand-muted" />}
      </button>
      {open && (
        <div className="px-5 py-4 border-t border-brand-border space-y-3 text-sm">
          <p className="text-brand-muted">
            Pass your API key as the <code className="text-brand-text bg-brand-surface px-1 rounded">X-API-Key</code> header
            on every request to the gateway. Each call consumes pings from your monthly pool
            (1 ping per sport call, 5 pings per Odds API call).
          </p>
          <div className="relative">
            <pre className="bg-black/40 rounded-lg p-3 text-xs font-mono overflow-x-auto text-brand-text">
{sample}
            </pre>
            <button
              onClick={copy}
              className="absolute top-2 right-2 btn-secondary text-xs px-2 py-1 flex items-center gap-1"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-brand-muted">
            Need the full endpoint reference?{' '}
            <Link href="/docs" className="text-brand-primary underline">Read the API docs →</Link>
          </p>
        </div>
      )}
    </div>
  );
}
