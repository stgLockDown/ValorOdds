'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Activity, AlertTriangle, CheckCircle2, XCircle, Loader2, RefreshCw,
  Zap, TrendingUp, Filter, Radio, ArrowLeft, Code2, Clock,
} from 'lucide-react';

// ---------- Types ----------
interface ApiEvent {
  id: string;
  called_at: string;
  product_code: string;
  endpoint: string;
  weight: number;
  status_code: number | null;
  is_error: boolean;
  plan_id: string;
  email: string;
  key_prefix: string | null;
}

interface MonitorStats {
  total_calls_24h: string;
  total_calls_1h: string;
  error_count_24h: string;
  error_count_1h: string;
  total_pings_24h: string;
  total_pings_1h: string;
  unique_endpoints_24h: string;
  unique_plans_24h: string;
  error_rate_24h: string;
  error_rate_1h: string;
}

interface ByProduct {
  product_code: string;
  calls: string;
  errors: string;
  pings: string;
}

interface ByStatusCode {
  status_code: string | null;
  count: string;
}

interface MonitorResponse {
  events: ApiEvent[];
  stats: MonitorStats;
  byProduct: ByProduct[];
  byStatusCode: ByStatusCode[];
  serverTime: string;
}

// ---------- Helpers ----------
function timeAgo(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  if (diff < 1000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

function statusColor(code: number | null): string {
  if (code === null) return 'text-red-400';
  if (code < 300) return 'text-green-400';
  if (code < 400) return 'text-blue-400';
  if (code < 500) return 'text-yellow-400';
  return 'text-red-400';
}

function statusBg(code: number | null): string {
  if (code === null) return 'bg-red-500/10 border-red-500/30';
  if (code < 300) return 'bg-green-500/5 border-brand-border';
  if (code < 400) return 'bg-blue-500/5 border-brand-border';
  if (code < 500) return 'bg-yellow-500/5 border-yellow-500/20';
  return 'bg-red-500/10 border-red-500/30';
}

function productLabel(code: string): string {
  const map: Record<string, string> = {
    odds: 'Odds API',
    all_access: 'All-Access',
    arbitrage: 'Arbitrage',
    steam_moves: 'Steam Moves',
    injuries: 'Injuries',
    ai_analysis: 'AI Analysis',
  };
  return map[code] ?? code.charAt(0).toUpperCase() + code.slice(1);
}

// ---------- Stat Card ----------
function StatCard({ icon: Icon, label, value, sub, alert }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  alert?: boolean;
}) {
  return (
    <div className={`card p-4 ${alert ? 'border-red-500/30' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-brand-muted">{label}</span>
        <Icon className={`h-4 w-4 ${alert ? 'text-red-400' : 'text-brand-primary'}`} />
      </div>
      <div className={`text-2xl font-bold mt-1 ${alert ? 'text-red-400' : ''}`}>{value}</div>
      {sub && <div className="text-xs text-brand-muted mt-0.5">{sub}</div>}
    </div>
  );
}

// ---------- Main Component ----------
export default function ApiMonitorClient() {
  const [data, setData] = useState<MonitorResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'errors' | 'success'>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(3000); // 3 seconds
  const lastSinceRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        limit: '100',
        filter,
      });
      if (lastSinceRef.current) {
        params.set('since', lastSinceRef.current);
      }
      const res = await fetch(`/api/admin/api-monitor?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        if (res.status === 403) {
          setError('Forbidden — admin access required');
          setAutoRefresh(false);
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const json: MonitorResponse = await res.json();
      setData(json);
      lastSinceRef.current = json.serverTime;
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  // Initial fetch + polling
  useEffect(() => {
    fetchData();

    if (autoRefresh) {
      intervalRef.current = setInterval(fetchData, refreshInterval);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData, autoRefresh, refreshInterval]);

  // Reset "since" when filter changes so we get fresh data
  useEffect(() => {
    lastSinceRef.current = null;
    setLoading(true);
    fetchData();
  }, [filter]);

  const handleManualRefresh = () => {
    lastSinceRef.current = null;
    fetchData();
  };

  const stats = data?.stats;
  const errorRate24h = stats ? parseFloat(stats.error_rate_24h) : 0;
  const errorRate1h = stats ? parseFloat(stats.error_rate_1h) : 0;
  const hasRecentErrors = stats ? Number(stats.error_count_1h) > 0 : false;

  return (
    <>
      <div className="container-px mx-auto max-w-7xl py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-brand-muted mb-1">
              <Link href="/admin" className="hover:text-brand-text flex items-center gap-1">
                <ArrowLeft className="h-3 w-3" /> Admin
              </Link>
              <span>/</span>
              <span>API Live Monitor</span>
            </div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Radio className="h-7 w-7 text-brand-primary" />
              API Live Monitor
            </h1>
            <p className="text-brand-muted mt-1">
              Real-time stream of all API calls across the platform. Errors are highlighted in red.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Auto-refresh toggle */}
            <label className="flex items-center gap-2 text-sm text-brand-muted cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-brand-border bg-brand-surface text-brand-primary focus:ring-brand-primary"
              />
              Auto-refresh
            </label>

            {/* Refresh interval selector */}
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="text-sm rounded-lg border border-brand-border bg-brand-surface px-2 py-1 text-brand-text"
              disabled={!autoRefresh}
            >
              <option value={2000}>2s</option>
              <option value={3000}>3s</option>
              <option value={5000}>5s</option>
              <option value={10000}>10s</option>
            </select>

            {/* Manual refresh */}
            <button
              onClick={handleManualRefresh}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Live indicator */}
        {autoRefresh && !error && (
          <div className="flex items-center gap-2 text-sm text-green-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400"></span>
            </span>
            LIVE — polling every {refreshInterval / 1000}s
            {data?.serverTime && (
              <span className="text-brand-muted ml-2">
                Last update: {new Date(data.serverTime).toLocaleTimeString()}
              </span>
            )}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="card border-red-500/30 p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <span className="text-red-400 font-medium">{error}</span>
          </div>
        )}

        {/* Loading state */}
        {loading && !data ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
          </div>
        ) : (
          <>
            {/* Stats Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={Activity}
                label="Calls (24h)"
                value={Number(stats?.total_calls_24h ?? 0).toLocaleString()}
                sub={`${Number(stats?.total_calls_1h ?? 0).toLocaleString()} in last hour`}
              />
              <StatCard
                icon={Zap}
                label="Pings (24h)"
                value={Number(stats?.total_pings_24h ?? 0).toLocaleString()}
                sub={`${Number(stats?.total_pings_1h ?? 0).toLocaleString()} in last hour`}
              />
              <StatCard
                icon={hasRecentErrors ? AlertTriangle : CheckCircle2}
                label="Errors (24h)"
                value={Number(stats?.error_count_24h ?? 0).toLocaleString()}
                sub={`${Number(stats?.error_count_1h ?? 0)} in last hour`}
                alert={hasRecentErrors}
              />
              <StatCard
                icon={TrendingUp}
                label="Error rate (1h)"
                value={`${errorRate1h}%`}
                sub={`${errorRate24h}% over 24h`}
                alert={errorRate1h > 5}
              />
            </div>

            {/* Filter buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-4 w-4 text-brand-muted" />
              {(['all', 'errors', 'success'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    filter === f
                      ? 'bg-brand-primary text-white'
                      : 'bg-brand-surface text-brand-muted hover:text-brand-text'
                  }`}
                >
                  {f === 'all' && 'All calls'}
                  {f === 'errors' && `Errors only${stats ? ` (${stats.error_count_24h})` : ''}`}
                  {f === 'success' && 'Success only'}
                </button>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr,300px]">
              {/* Live Event Feed */}
              <div className="card overflow-hidden p-0">
                <div className="px-5 py-3 border-b border-brand-border flex items-center justify-between">
                  <span className="font-semibold flex items-center gap-2">
                    <Radio className="h-4 w-4 text-brand-primary" />
                    Live API Call Feed
                  </span>
                  <span className="text-xs text-brand-muted">
                    {data?.events.length ?? 0} events
                  </span>
                </div>

                <div className="max-h-[600px] overflow-y-auto">
                  {data?.events.length === 0 ? (
                    <div className="px-5 py-12 text-center text-brand-muted">
                      <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p>No API calls recorded yet.</p>
                      <p className="text-xs mt-1">Calls will appear here in real-time as they happen.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-brand-border">
                      {data?.events.map((event) => (
                        <div
                          key={event.id}
                          className={`px-5 py-3 border-l-4 ${statusBg(event.status_code)} transition-colors`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              {/* Top row: status code + product + endpoint */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`font-mono text-sm font-bold ${statusColor(event.status_code)}`}>
                                  {event.status_code ?? 'ERR'}
                                </span>
                                <span className="text-xs px-1.5 py-0.5 rounded bg-brand-surface text-brand-muted font-medium">
                                  {productLabel(event.product_code)}
                                </span>
                                {event.is_error && (
                                  <span className="flex items-center gap-1 text-xs text-red-400">
                                    <XCircle className="h-3 w-3" />
                                    ERROR
                                  </span>
                                )}
                                {event.weight > 1 && (
                                  <span className="text-xs text-brand-muted flex items-center gap-0.5">
                                    <Zap className="h-3 w-3" />
                                    {event.weight}x
                                  </span>
                                )}
                              </div>

                              {/* Endpoint */}
                              <div className="mt-1 font-mono text-sm text-brand-text truncate">
                                {event.endpoint}
                              </div>

                              {/* Bottom row: user + time */}
                              <div className="mt-1 flex items-center gap-3 text-xs text-brand-muted">
                                <span className="truncate">{event.email || 'unknown'}</span>
                                {event.key_prefix && (
                                  <span className="font-mono opacity-60">{event.key_prefix}…</span>
                                )}
                                <span className="flex items-center gap-1 whitespace-nowrap">
                                  <Clock className="h-3 w-3" />
                                  {timeAgo(event.called_at)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Side panel: by product + status codes */}
              <div className="space-y-4">
                {/* By Product */}
                <div className="card overflow-hidden p-0">
                  <div className="px-4 py-3 border-b border-brand-border font-semibold text-sm">
                    Calls by Product (24h)
                  </div>
                  <div className="divide-y divide-brand-border max-h-[280px] overflow-y-auto">
                    {data?.byProduct.length === 0 ? (
                      <div className="px-4 py-6 text-center text-xs text-brand-muted">No data</div>
                    ) : (
                      data?.byProduct.map((p) => {
                        const errorCount = Number(p.errors);
                        return (
                          <div key={p.product_code} className="px-4 py-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{productLabel(p.product_code)}</span>
                              <span className="text-sm text-brand-muted">{Number(p.calls).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs">
                              <span className="text-brand-muted">{Number(p.pings).toLocaleString()} pings</span>
                              {errorCount > 0 && (
                                <span className="text-red-400 flex items-center gap-0.5">
                                  <AlertTriangle className="h-3 w-3" />
                                  {errorCount} errors
                                </span>
                              )}
                            </div>
                            {/* Usage bar */}
                            <div className="mt-1.5 h-1 rounded-full bg-brand-surface overflow-hidden">
                              <div
                                className={`h-full ${errorCount > 0 ? 'bg-red-500' : 'bg-brand-primary'}`}
                                style={{
                                  width: `${Math.min(100, (Number(p.calls) / Math.max(1, Number(data.byProduct[0]?.calls ?? 1))) * 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* By Status Code */}
                <div className="card overflow-hidden p-0">
                  <div className="px-4 py-3 border-b border-brand-border font-semibold text-sm">
                    Status Codes (24h)
                  </div>
                  <div className="divide-y divide-brand-border">
                    {data?.byStatusCode.length === 0 ? (
                      <div className="px-4 py-6 text-center text-xs text-brand-muted">No data</div>
                    ) : (
                      data?.byStatusCode.map((s, i) => (
                        <div key={i} className="px-4 py-2 flex items-center justify-between">
                          <span className={`font-mono text-sm font-bold ${statusColor(s.status_code ? parseInt(s.status_code) : null)}`}>
                            {s.status_code ?? 'No response'}
                          </span>
                          <span className="text-sm text-brand-muted">{Number(s.count).toLocaleString()}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Quick stats */}
                <div className="card p-4 space-y-2">
                  <div className="font-semibold text-sm flex items-center gap-2">
                    <Code2 className="h-4 w-4 text-brand-primary" />
                    Overview (24h)
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-brand-muted">Unique endpoints</span>
                    <span>{Number(stats?.unique_endpoints_24h ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-brand-muted">Active API plans</span>
                    <span>{Number(stats?.unique_plans_24h ?? 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
