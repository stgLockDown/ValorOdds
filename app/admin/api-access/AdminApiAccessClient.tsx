'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Key, Activity, DollarSign, Users, Loader2, RefreshCw, Search,
  TrendingUp, Zap, ChevronDown, ChevronUp, Code2, Settings2,
  CheckCircle2, XCircle, AlertCircle, FlaskConical,
} from 'lucide-react';
import { formatCents } from '@/lib/api-monetization/pricing';

// ---------- Types ----------
interface PlanCount { status: string; c: string; }
interface TierBreakdown { tier: string; c: string; }
interface TopProduct { product_code: string; calls: string; pings: string; }

interface Stats {
  planCounts: PlanCount[];
  activeKeyCount: string;
  activePlanCount: string;
  estimatedMrrCents: number;
  monthPingsUsed: string;
  monthCalls: string;
  monthOveragePings: string;
  monthOverageCents: string;
  tierBreakdown: TierBreakdown[];
  topProducts: TopProduct[];
}

interface AdminPlan {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  plan_type: string;
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
  created_at: string;
  key_prefix: string | null;
  key_active: boolean | null;
  pings_used: string | null;
  overage_pings: string | null;
  product_count: string | null;
  products: string[];
}

// ---------- Helpers ----------
function planTypeLabel(p: AdminPlan): string {
  if (p.plan_type === 'odds_standalone') return 'Odds API — Standalone';
  if (p.all_access) return 'All-Access Bundle (26 sports)';
  const n = p.products?.length ?? Number(p.product_count ?? 0);
  return `Custom Bundle (${n} product${n === 1 ? '' : 's'})${p.odds_addon ? ' + Odds' : ''}`;
}

function statusBadge(status: string): string {
  switch (status) {
    case 'active': return 'bg-green-500/10 text-green-400';
    case 'trialing': return 'bg-blue-500/10 text-blue-400';
    case 'past_due': return 'bg-yellow-500/10 text-yellow-400';
    case 'canceled': return 'bg-red-500/10 text-red-400';
    default: return 'bg-brand-surface text-brand-muted';
  }
}

function pct(used: number, quota: number): number {
  if (quota <= 0) return 0;
  return Math.min(100, Math.round((used / quota) * 100));
}

// ---------- Stat card ----------
function StatCard({ icon: Icon, label, value, sub }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-brand-muted">{label}</span>
        <Icon className="h-4 w-4 text-brand-primary" />
      </div>
      <div className="text-3xl font-bold mt-2">{value}</div>
      {sub && <div className="text-xs text-brand-muted mt-1">{sub}</div>}
    </div>
  );
}

// ---------- Overview section ----------
function Overview({ stats, loading }: { stats: Stats | null; loading: boolean }) {
  if (loading || !stats) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card p-5 h-[110px] animate-pulse bg-brand-surface/50" />
        ))}
      </div>
    );
  }

  const totalPlans = stats.planCounts.reduce((sum, p) => sum + Number(p.c), 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label="Active plans"
          value={stats.activePlanCount}
          sub={`${totalPlans} total (all statuses)`}
        />
        <StatCard
          icon={Key}
          label="Active API keys"
          value={stats.activeKeyCount}
          sub="Issued & not revoked"
        />
        <StatCard
          icon={DollarSign}
          label="Est. monthly MRR"
          value={formatCents(stats.estimatedMrrCents)}
          sub="From active/trialing/past_due"
        />
        <StatCard
          icon={Activity}
          label="Pings this month"
          value={Number(stats.monthPingsUsed).toLocaleString()}
          sub={`${Number(stats.monthCalls).toLocaleString()} total calls`}
        />
      </div>

      {/* Secondary stats row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4 flex items-center gap-3">
          <div className="rounded-lg bg-brand-primary/10 p-2.5">
            <TrendingUp className="h-5 w-5 text-brand-primary" />
          </div>
          <div>
            <div className="text-xs text-brand-muted">Overage revenue (this month)</div>
            <div className="text-lg font-bold">
              {formatCents(Number(stats.monthOverageCents))}
            </div>
            <div className="text-xs text-brand-muted">
              {Number(stats.monthOveragePings).toLocaleString()} overage pings
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="text-xs font-semibold text-brand-muted uppercase mb-2">
            Plans by status
          </div>
          <div className="flex flex-wrap gap-2">
            {stats.planCounts.map((pc) => (
              <span
                key={pc.status}
                className={`text-xs px-2.5 py-1 rounded-full ${statusBadge(pc.status)}`}
              >
                {pc.status} · {pc.c}
              </span>
            ))}
            {stats.planCounts.length === 0 && (
              <span className="text-xs text-brand-muted">No plans yet.</span>
            )}
          </div>
        </div>

        <div className="card p-4">
          <div className="text-xs font-semibold text-brand-muted uppercase mb-2">
            Active by tier
          </div>
          <div className="flex flex-wrap gap-2">
            {stats.tierBreakdown.map((t) => (
              <span
                key={t.tier}
                className="text-xs px-2.5 py-1 rounded-full bg-brand-surface text-brand-text"
              >
                {t.tier} · {t.c}
              </span>
            ))}
            {stats.tierBreakdown.length === 0 && (
              <span className="text-xs text-brand-muted">No active plans.</span>
            )}
          </div>
        </div>
      </div>

      {/* Top products by usage */}
      {stats.topProducts.length > 0 && (
        <div className="card overflow-hidden p-0">
          <div className="px-5 py-3 border-b border-brand-border font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4 text-brand-primary" />
            Top products by usage (this month)
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-brand-muted uppercase">
              <tr>
                <th className="text-left px-5 py-2">Product</th>
                <th className="text-right px-5 py-2">Calls</th>
                <th className="text-right px-5 py-2">Pings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {stats.topProducts.map((p) => (
                <tr key={p.product_code}>
                  <td className="px-5 py-2 font-medium">{p.product_code}</td>
                  <td className="px-5 py-2 text-right">{Number(p.calls).toLocaleString()}</td>
                  <td className="px-5 py-2 text-right">{Number(p.pings).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------- Plan row (expandable) ----------
function PlanRow({ plan }: { plan: AdminPlan }) {
  const [expanded, setExpanded] = useState(false);
  const quota = Number(plan.monthly_ping_quota);
  const used = Number(plan.pings_used ?? 0);
  const usagePct = pct(used, quota);
  const overage = Number(plan.overage_pings ?? 0);

  return (
    <>
      <tr
        className="hover:bg-brand-surface/40 cursor-pointer transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {expanded ? <ChevronUp className="h-3.5 w-3.5 text-brand-muted" /> : <ChevronDown className="h-3.5 w-3.5 text-brand-muted" />}
            <div>
              <div className="font-medium">{plan.email}</div>
              {plan.display_name && (
                <div className="text-xs text-brand-muted">{plan.display_name}</div>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-sm">{planTypeLabel(plan)}</td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge(plan.status)}`}>
            {plan.status}
          </span>
        </td>
        <td className="px-4 py-3 text-sm font-mono text-brand-muted">
          {plan.key_prefix ? `${plan.key_prefix}••••` : '—'}
        </td>
        <td className="px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 rounded-full bg-brand-surface overflow-hidden shrink-0">
              <div
                className={`h-full rounded-full ${usagePct >= 100 ? 'bg-red-500' : usagePct >= 80 ? 'bg-yellow-500' : 'bg-brand-primary'}`}
                style={{ width: `${usagePct}%` }}
              />
            </div>
            <span className="text-xs text-brand-muted whitespace-nowrap">
              {used.toLocaleString()}/{quota.toLocaleString()}
            </span>
          </div>
          {overage > 0 && (
            <div className="text-xs text-yellow-400 mt-0.5 flex items-center gap-1">
              <Zap className="h-3 w-3" />
              {overage.toLocaleString()} overage
            </div>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-brand-muted">
          {plan.current_period_end
            ? new Date(plan.current_period_end).toLocaleDateString()
            : '—'}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-brand-surface/20">
          <td colSpan={6} className="px-4 py-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-xs text-brand-muted uppercase mb-1">Plan ID</div>
                <div className="font-mono text-xs">{plan.id}</div>
              </div>
              <div>
                <div className="text-xs text-brand-muted uppercase mb-1">Quota</div>
                <div>{quota.toLocaleString()} pings/mo</div>
              </div>
              <div>
                <div className="text-xs text-brand-muted uppercase mb-1">Overage</div>
                <div>
                  {plan.overage_enabled ? (
                    <span className="text-green-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Enabled · {formatCents(plan.overage_price_cents_per_1k)}/1k
                    </span>
                  ) : (
                    <span className="text-brand-muted flex items-center gap-1">
                      <XCircle className="h-3.5 w-3.5" />
                      Hard cutoff (429)
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-brand-muted uppercase mb-1">Created</div>
                <div>{new Date(plan.created_at).toLocaleDateString()}</div>
              </div>
              {plan.products.length > 0 && (
                <div className="sm:col-span-2 lg:col-span-4">
                  <div className="text-xs text-brand-muted uppercase mb-1">Products</div>
                  <div className="flex flex-wrap gap-1.5">
                    {plan.products.map((code) => (
                      <span key={code} className="text-xs px-2 py-0.5 rounded bg-brand-surface text-brand-text">
                        {code}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {plan.cancel_at_period_end && (
                <div className="sm:col-span-2 lg:col-span-4">
                  <div className="text-xs text-yellow-400 flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Scheduled to cancel at period end
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------- Stripe setup section ----------
function StripeSetupSection() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function runSetup() {
    if (!confirm('Run Stripe product/price setup? This is idempotent — safe to run repeatedly.')) return;
    setRunning(true);
    setResult(null);
    try {
      const resp = await fetch('/api/admin/api-monetization/stripe-setup', { method: 'POST' });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || data.detail || 'Setup failed');
      setResult({
        ok: true,
        msg: `Success — ${data.count ?? 0} products/prices synced. ${data.summary ?? ''}`,
      });
    } catch (err) {
      setResult({ ok: false, msg: err instanceof Error ? err.message : 'Setup failed' });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-brand-primary/10 p-2.5">
            <Settings2 className="h-5 w-5 text-brand-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Stripe product sync</h3>
            <p className="text-sm text-brand-muted">
              Create or reconcile all Stripe products &amp; prices for the API catalog.
              Idempotent — safe to run anytime.
            </p>
          </div>
        </div>
        <button
          onClick={runSetup}
          disabled={running}
          className="btn-primary flex items-center gap-2"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {running ? 'Syncing…' : 'Run sync'}
        </button>
      </div>
      {result && (
        <div className={`mt-4 text-sm rounded-lg p-3 ${result.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {result.ok ? '✓ ' : '✗ '}{result.msg}
        </div>
      )}
    </div>
  );
}

// ---------- Main component ----------
export default function AdminApiAccessClient() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const resp = await fetch('/api/admin/api-monetization/stats');
      const data = await resp.json();
      if (resp.ok) setStats(data);
      else setError(data.error || 'Failed to load stats');
    } catch {
      setError('Failed to load stats');
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const loadPlans = useCallback(async () => {
    setLoadingPlans(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      params.set('limit', '200');
      const resp = await fetch(`/api/admin/api-monetization/plans?${params}`);
      const data = await resp.json();
      if (resp.ok) {
        setPlans(data.plans);
        setTotal(Number(data.total));
      } else {
        setError(data.error || 'Failed to load plans');
      }
    } catch {
      setError('Failed to load plans');
    } finally {
      setLoadingPlans(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const filteredPlans = search
    ? plans.filter(
        (p) =>
          p.email.toLowerCase().includes(search.toLowerCase()) ||
          (p.display_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
          p.products.some((prod) => prod.includes(search.toLowerCase()))
      )
    : plans;

  function refreshAll() {
    loadStats();
    loadPlans();
  }

  return (
    <main className="container-px mx-auto max-w-7xl py-12 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold">API Monetization</h1>
            <p className="text-brand-muted mt-1">
              Monitor customer API plans, usage, revenue, and manage Stripe catalog sync.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/api-playground" className="btn-primary flex items-center gap-2">
              <FlaskConical className="h-4 w-4" />
              API Playground
            </Link>
            <button onClick={refreshAll} className="btn-secondary flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <Link href="/admin" className="btn-secondary">← Admin home</Link>
          </div>
        </div>

        {error && (
          <div className="card p-4 text-red-400 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Overview stats */}
        <Overview stats={stats} loading={loadingStats} />

        {/* Stripe setup */}
        <StripeSetupSection />

        {/* Plans table */}
        <div className="card overflow-hidden p-0">
          <div className="px-5 py-3 border-b border-brand-border flex items-center justify-between flex-wrap gap-3">
            <div className="font-semibold flex items-center gap-2">
              <Code2 className="h-4 w-4 text-brand-primary" />
              Customer plans
              <span className="text-sm font-normal text-brand-muted">({total} total)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-brand-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search email or product…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input pl-8 py-1.5 text-sm w-56"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input py-1.5 text-sm w-32"
              >
                <option value="all">All status</option>
                <option value="active">Active</option>
                <option value="trialing">Trialing</option>
                <option value="past_due">Past due</option>
                <option value="canceled">Canceled</option>
              </select>
            </div>
          </div>

          {loadingPlans ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
            </div>
          ) : filteredPlans.length === 0 ? (
            <div className="px-5 py-16 text-center text-brand-muted">
              {plans.length === 0
                ? 'No API plans have been purchased yet.'
                : 'No plans match your search.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-brand-muted uppercase bg-brand-surface/30">
                  <tr>
                    <th className="text-left px-4 py-2.5">Customer</th>
                    <th className="text-left px-4 py-2.5">Plan</th>
                    <th className="text-left px-4 py-2.5">Status</th>
                    <th className="text-left px-4 py-2.5">API key</th>
                    <th className="text-left px-4 py-2.5">Usage (this month)</th>
                    <th className="text-left px-4 py-2.5">Renews</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border">
                  {filteredPlans.map((plan) => (
                    <PlanRow key={plan.id} plan={plan} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
  );
}
