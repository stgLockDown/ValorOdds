'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Activity,
  Database,
  TrendingUp,
  Zap,
  RefreshCw,
  ChevronRight,
  Terminal,
  CheckCircle2,
  AlertCircle,
  Brain,
} from 'lucide-react';

interface SampleTab {
  id: string;
  label: string;
  category: 'Sport Data' | 'Odds API' | 'Intelligence';
  endpoint: string;
  method: 'GET';
  description: string;
  pingCost: number;
  status: number;
  json: unknown;
}

interface SamplesPayload {
  fetchedAt: string;
  samples: SampleTab[];
}

function syntaxHighlight(json: unknown): string {
  if (json === null || json === undefined) return 'null';
  let str: string;
  try {
    str = JSON.stringify(json, null, 2);
  } catch {
    return String(json);
  }
  // Escape HTML first.
  str = str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Highlight strings (keys vs values), numbers, booleans, null.
  return str.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'text-amber-300'; // number
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'text-sky-300'; // key
        } else {
          cls = 'text-emerald-300'; // string value
        }
      } else if (/true|false/.test(match)) {
        cls = 'text-purple-300'; // boolean
      } else if (/null/.test(match)) {
        cls = 'text-rose-300'; // null
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

export default function LiveDataPreview() {
  const [data, setData] = useState<SamplesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string>('leagues');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/api-access/samples', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload: SamplesPayload = await res.json();
      if (!payload.samples || payload.samples.length === 0) {
        throw new Error('No samples returned');
      }
      setData(payload);
      // Keep current tab if still present, else pick first.
      if (!payload.samples.find((s) => s.id === activeId)) {
        setActiveId(payload.samples[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load samples');
    } finally {
      setLoading(false);
    }
  }, [activeId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = data?.samples.find((s) => s.id === activeId) ?? data?.samples[0];

  const sportTabs = data?.samples.filter((s) => s.category === 'Sport Data') ?? [];
  const oddsTabs = data?.samples.filter((s) => s.category === 'Odds API') ?? [];
  const intelTabs = data?.samples.filter((s) => s.category === 'Intelligence') ?? [];

  const handleCopy = async () => {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(active.json, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const fetchedTime = data?.fetchedAt
    ? new Date(data.fetchedAt).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      })
    : null;

  return (
    <section className="mt-20 scroll-mt-20" id="live-preview">
      <div className="text-center max-w-2xl mx-auto mb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 text-green-400 text-xs font-semibold px-3 py-1 mb-3">
          <Activity className="h-3.5 w-3.5" />
          LIVE DATA PREVIEW
        </span>
        <h2 className="text-3xl font-extrabold">See exactly what you&apos;ll get</h2>
        <p className="mt-3 text-brand-muted">
          These are real, live responses from our backend APIs — not mocks. Browse the sample
          endpoints below to preview the JSON structure, field names, and data depth you&apos;ll
          receive with every API call.
        </p>
      </div>

      {/* Browser-style window frame */}
      <div className="max-w-5xl mx-auto rounded-xl border border-brand-border bg-brand-surface overflow-hidden shadow-2xl">
        {/* Title bar */}
        <div className="flex items-center gap-2 bg-brand-elevated px-4 py-3 border-b border-brand-border">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-red-500/80" />
            <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
            <span className="h-3 w-3 rounded-full bg-green-500/80" />
          </div>
          <div className="ml-3 flex-1 flex items-center gap-2 rounded-md bg-black/30 px-3 py-1.5 text-xs text-brand-muted font-mono">
            <Terminal className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              api-gateway-production-12e8.up.railway.app
              {active ? active.endpoint.replace('GET ', '') : '/v1/...'}
            </span>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-brand-muted hover:text-brand-text hover:bg-white/5 transition-colors disabled:opacity-50"
            title="Refresh samples"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex flex-wrap items-center gap-1 bg-brand-elevated/50 px-3 py-2 border-b border-brand-border">
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-brand-muted mr-2">
            <Database className="h-3 w-3" /> Sport Data
          </span>
          {sportTabs.map((tab) => (
            <TabButton
              key={tab.id}
              active={activeId === tab.id}
              onClick={() => setActiveId(tab.id)}
              label={tab.label}
            />
          ))}
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-brand-muted mx-2">
            <TrendingUp className="h-3 w-3" /> Odds API
          </span>
          {oddsTabs.map((tab) => (
            <TabButton
              key={tab.id}
              active={activeId === tab.id}
              onClick={() => setActiveId(tab.id)}
              label={tab.label}
            />
          ))}
          {intelTabs.length > 0 && (
            <>
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-brand-muted mx-2">
                <Brain className="h-3 w-3" /> Intelligence
              </span>
              {intelTabs.map((tab) => (
                <TabButton
                  key={tab.id}
                  active={activeId === tab.id}
                  onClick={() => setActiveId(tab.id)}
                  label={tab.label}
                />
              ))}
            </>
          )}
        </div>

        {/* Content area */}
        <div className="grid lg:grid-cols-[280px_1fr] divide-y lg:divide-y-0 lg:divide-x divide-brand-border">
          {/* Left: endpoint info */}
          <div className="p-4 space-y-3 bg-brand-surface">
            {active ? (
              <>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="rounded bg-green-500/20 text-green-400 text-[10px] font-bold px-1.5 py-0.5 font-mono">
                      {active.method}
                    </span>
                    <span className="text-xs font-mono text-brand-muted">{active.endpoint}</span>
                  </div>
                  <p className="text-xs text-brand-muted leading-relaxed">{active.description}</p>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-brand-border">
                  {active.status === 200 ? (
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-400" />
                  )}
                  <span className="text-xs font-mono">
                    HTTP {active.status}
                  </span>
                  <span className="ml-auto flex items-center gap-1 rounded-full bg-brand-primary/10 text-brand-primary text-[10px] font-semibold px-2 py-0.5">
                    <Zap className="h-3 w-3" />
                    {active.pingCost} ping{active.pingCost > 1 ? 's' : ''}
                  </span>
                </div>
                <button
                  onClick={handleCopy}
                  className="w-full flex items-center justify-center gap-1.5 rounded-md border border-brand-border bg-brand-elevated px-3 py-2 text-xs font-medium text-brand-text hover:bg-white/5 transition-colors"
                >
                  {copied ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> Copied!
                    </>
                  ) : (
                    <>
                      <ChevronRight className="h-3.5 w-3.5" /> Copy JSON
                    </>
                  )}
                </button>
              </>
            ) : loading ? (
              <div className="text-xs text-brand-muted">Loading…</div>
            ) : (
              <div className="text-xs text-brand-muted">No data available</div>
            )}
          </div>

          {/* Right: JSON response */}
          <div className="bg-black/50 min-h-[320px] max-h-[480px] overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full min-h-[320px] text-brand-muted text-sm">
                <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                Fetching live data…
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[320px] text-amber-400 text-sm p-4 text-center">
                <AlertCircle className="h-6 w-6 mb-2" />
                {error}
                <button
                  onClick={load}
                  className="mt-3 text-xs underline text-brand-muted hover:text-brand-text"
                >
                  Try again
                </button>
              </div>
            ) : active ? (
              <pre className="p-4 text-xs leading-relaxed font-mono">
                <code
                  dangerouslySetInnerHTML={{ __html: syntaxHighlight(active.json) }}
                />
              </pre>
            ) : null}
          </div>
        </div>

        {/* Footer status bar */}
        <div className="flex items-center justify-between bg-brand-elevated px-4 py-2 border-t border-brand-border text-[11px] text-brand-muted font-mono">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            {data ? `${data.samples.length} endpoints` : '—'}
          </span>
          {fetchedTime && <span>Last fetched: {fetchedTime}</span>}
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-brand-muted max-w-2xl mx-auto">
        Responses are trimmed for display — live API responses contain the full dataset.
        All examples fetched in real time from our production backend services.
      </p>
    </section>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-brand-primary text-white'
          : 'text-brand-muted hover:text-brand-text hover:bg-white/5'
      }`}
    >
      {label}
    </button>
  );
}
