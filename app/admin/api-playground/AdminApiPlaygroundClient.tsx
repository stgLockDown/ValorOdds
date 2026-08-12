'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  FlaskConical, Send, Loader2, ChevronDown, ChevronUp, Copy, Check,
  AlertCircle, CheckCircle2, XCircle, Clock, Zap, KeyRound, Code2,
  RefreshCw,
} from 'lucide-react';

// ---------- Types ----------
interface Product {
  code: string;
  name: string;
  category: string;
  ping_weight: number;
}

interface EndpointTemplate {
  label: string;
  path: string;
  queryParams?: string;
}

interface Templates {
  [productCode: string]: EndpointTemplate[];
}

interface PlaygroundResponse {
  ok: boolean;
  status: number;
  statusText: string;
  elapsedMs: number;
  request: {
    url: string;
    method: string;
    product: string;
    keySource: string;
    path: string;
    queryParams: string;
  };
  headers: Record<string, string>;
  body: unknown;
  isJson: boolean;
  bodySize: number;
  error?: string;
}

// ---------- Helpers ----------
function categoryColor(category: string): string {
  switch (category) {
    case 'sport': return 'bg-blue-500/10 text-blue-400';
    case 'odds': return 'bg-purple-500/10 text-purple-400';
    case 'intelligence': return 'bg-amber-500/10 text-amber-400';
    case 'meta': return 'bg-brand-surface text-brand-muted';
    default: return 'bg-brand-surface text-brand-muted';
  }
}

function statusColor(status: number): string {
  if (status === 0) return 'text-red-400';
  if (status < 300) return 'text-green-400';
  if (status < 400) return 'text-blue-400';
  if (status < 500) return 'text-yellow-400';
  return 'text-red-400';
}

function statusIcon(status: number) {
  if (status === 0) return <XCircle className="h-5 w-5 text-red-400" />;
  if (status < 300) return <CheckCircle2 className="h-5 w-5 text-green-400" />;
  if (status < 400) return <ChevronDown className="h-5 w-5 text-blue-400" />;
  return <AlertCircle className="h-5 w-5 text-yellow-400" />;
}

function formatJson(obj: unknown): string {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

function truncateForDisplay(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + `\n\n... (${text.length - maxLen} more bytes truncated. Full response saved.)`;
}

// ---------- Main Component ----------
export default function AdminApiPlaygroundClient() {
  const [products, setProducts] = useState<Product[]>([]);
  const [templates, setTemplates] = useState<Templates>({});
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [product, setProduct] = useState('baseball');
  const [path, setPath] = useState('v1/games');
  const [method, setMethod] = useState<'GET' | 'POST'>('GET');
  const [queryParams, setQueryParams] = useState('limit=20');
  const [useOwnKey, setUseOwnKey] = useState(false);

  const [response, setResponse] = useState<PlaygroundResponse | null>(null);
  const [sending, setSending] = useState(false);
  const [showHeaders, setShowHeaders] = useState(false);
  const [copiedBody, setCopiedBody] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  // Load product list and templates on mount
  useEffect(() => {
    fetch('/api/admin/api-playground')
      .then((r) => r.json())
      .then((data) => {
        if (data.products) {
          setProducts(data.products);
          setTemplates(data.templates || {});
        }
      })
      .catch(() => {})
      .finally(() => setLoadingProducts(false));
  }, []);

  // When product changes, load the first template
  function selectProduct(code: string) {
    setProduct(code);
    const tpl = templates[code];
    if (tpl && tpl.length > 0) {
      setPath(tpl[0].path);
      setQueryParams(tpl[0].queryParams || '');
    } else {
      setPath('');
      setQueryParams('');
    }
    setResponse(null);
  }

  function selectTemplate(tpl: EndpointTemplate) {
    setPath(tpl.path);
    setQueryParams(tpl.queryParams || '');
    setResponse(null);
  }

  const sendRequest = useCallback(async () => {
    setSending(true);
    setResponse(null);
    try {
      const resp = await fetch('/api/admin/api-playground', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product, path, method, queryParams, useOwnKey }),
      });
      const data = await resp.json();
      setResponse(data);
    } catch (err) {
      setResponse({
        ok: false,
        status: 0,
        statusText: 'Client Error',
        elapsedMs: 0,
        request: { url: '', method, product, keySource: '', path, queryParams },
        headers: {},
        body: null,
        isJson: false,
        bodySize: 0,
        error: err instanceof Error ? err.message : 'Failed to send request',
      });
    } finally {
      setSending(false);
    }
  }, [product, path, method, queryParams, useOwnKey]);

  function copyBody() {
    if (!response) return;
    const text = response.isJson ? formatJson(response.body) : String(response.body || '');
    navigator.clipboard.writeText(text).then(() => {
      setCopiedBody(true);
      setTimeout(() => setCopiedBody(false), 2000);
    });
  }

  function copyCurl() {
    if (!response) return;
    const url = response.request.url;
    const keyHeader = response.request.keySource === 'own-key'
      ? '$VALORODDS_API_KEY'
      : '<internal-key>';
    const curl = `curl -s "${url}" \\\n  -H "X-API-Key: ${keyHeader}" \\\n  -H "Accept: application/json"${method === 'POST' ? ' \\\n  -X POST' : ''} | python3 -m json.tool`;
    navigator.clipboard.writeText(curl).then(() => {
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2000);
    });
  }

  const currentTemplates = templates[product] || [];
  const gatewayBase = 'https://api-gateway-production-12e8.up.railway.app';

  // Build preview URL for display
  const previewUrl = (() => {
    const cleanPath = path.replace(/^\/+/, '');
    const intelProducts = ['arbitrage', 'steam_moves', 'injuries', 'ai_analysis'];
    const qs = queryParams?.trim() || '';
    const qsPrefixed = qs ? (qs.startsWith('?') ? qs : `?${qs}`) : '';
    if (product === 'catalog') return `${gatewayBase}/v1/catalog${qsPrefixed}`;
    if (product === 'usage') return `${gatewayBase}/v1/usage${qsPrefixed}`;
    if (intelProducts.includes(product)) {
      const intelPath = product.replace(/_/g, '-');
      return `${gatewayBase}/v1/intelligence/${intelPath}${cleanPath ? `/${cleanPath}` : ''}${qsPrefixed}`;
    }
    return `${gatewayBase}/v1/proxy/${product}/${cleanPath}${qsPrefixed}`;
  })();

  return (
    <main className="container-px mx-auto max-w-7xl py-12 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FlaskConical className="h-7 w-7 text-brand-primary" />
            API Playground
          </h1>
          <p className="text-brand-muted mt-1">
            Test any API endpoint live. Verify responses, status codes, and ping costs without leaving the dashboard.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/api-access" className="btn-secondary flex items-center gap-2">
            <Code2 className="h-4 w-4" />
            API Monetization
          </Link>
          <Link href="/admin" className="btn-secondary">← Admin home</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-6">
        {/* ---------- Left: Request Builder ---------- */}
        <div className="space-y-4">
          {/* Product selector */}
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Code2 className="h-4 w-4 text-brand-primary" />
              Request Builder
            </h2>

            {loadingProducts ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-brand-primary" />
              </div>
            ) : (
              <>
                {/* Product */}
                <div>
                  <label className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-1.5 block">
                    Product
                  </label>
                  <select
                    value={product}
                    onChange={(e) => selectProduct(e.target.value)}
                    className="input w-full"
                  >
                    {products.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name} ({p.code}){p.ping_weight > 0 ? ` — ${p.ping_weight} ping${p.ping_weight > 1 ? 's' : ''}` : ''}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${categoryColor(products.find((p) => p.code === product)?.category || '')}`}>
                      {products.find((p) => p.code === product)?.category || 'unknown'}
                    </span>
                  </div>
                </div>

                {/* Quick templates */}
                {currentTemplates.length > 0 && (
                  <div>
                    <label className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-1.5 block">
                      Quick endpoints
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {currentTemplates.map((tpl, i) => (
                        <button
                          key={i}
                          onClick={() => selectTemplate(tpl)}
                          className={`text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
                            path === tpl.path && (queryParams || '') === (tpl.queryParams || '')
                              ? 'bg-brand-primary text-white'
                              : 'bg-brand-surface text-brand-muted hover:text-brand-text'
                          }`}
                        >
                          {tpl.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Method */}
                <div>
                  <label className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-1.5 block">
                    Method
                  </label>
                  <div className="flex gap-2">
                    {(['GET', 'POST'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setMethod(m)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-mono font-semibold transition-colors ${
                          method === m
                            ? 'bg-brand-primary text-white'
                            : 'bg-brand-surface text-brand-muted hover:text-brand-text'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Path */}
                <div>
                  <label className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-1.5 block">
                    Endpoint path
                  </label>
                  <input
                    type="text"
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    placeholder="v1/games"
                    className="input w-full font-mono text-sm"
                  />
                  <p className="text-xs text-brand-muted mt-1">
                    The path after the product prefix (e.g. <code className="text-brand-text bg-brand-surface px-1 rounded">v1/games</code>)
                  </p>
                </div>

                {/* Query params */}
                <div>
                  <label className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-1.5 block">
                    Query parameters
                  </label>
                  <input
                    type="text"
                    value={queryParams}
                    onChange={(e) => setQueryParams(e.target.value)}
                    placeholder="limit=20&league=mlb"
                    className="input w-full font-mono text-sm"
                  />
                </div>

                {/* Auth mode */}
                <div>
                  <label className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-1.5 block">
                    Authentication
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2.5 text-sm cursor-pointer p-2.5 rounded-lg border border-brand-border hover:bg-brand-surface/40 transition-colors">
                      <input
                        type="radio"
                        checked={!useOwnKey}
                        onChange={() => setUseOwnKey(false)}
                        className="h-4 w-4"
                      />
                      <div className="flex-1">
                        <div className="font-medium flex items-center gap-1.5">
                          <KeyRound className="h-3.5 w-3.5 text-brand-muted" />
                          Internal key
                        </div>
                        <div className="text-xs text-brand-muted">
                          Bypasses auth &amp; quota — tests backend service directly
                        </div>
                      </div>
                    </label>
                    <label className="flex items-center gap-2.5 text-sm cursor-pointer p-2.5 rounded-lg border border-brand-border hover:bg-brand-surface/40 transition-colors">
                      <input
                        type="radio"
                        checked={useOwnKey}
                        onChange={() => setUseOwnKey(true)}
                        className="h-4 w-4"
                      />
                      <div className="flex-1">
                        <div className="font-medium flex items-center gap-1.5">
                          <KeyRound className="h-3.5 w-3.5 text-brand-primary" />
                          My API key
                        </div>
                        <div className="text-xs text-brand-muted">
                          Full flow: auth → entitlement → quota → proxy (consumes pings)
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* URL preview */}
                <div className="rounded-lg bg-brand-surface/60 border border-brand-border p-3">
                  <div className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-1">
                    Request URL
                  </div>
                  <code className="text-xs text-brand-text break-all font-mono">{previewUrl}</code>
                </div>

                {/* Send button */}
                <button
                  onClick={sendRequest}
                  disabled={sending}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {sending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending request…
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send request
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        {/* ---------- Right: Response ---------- */}
        <div className="space-y-4">
          {response ? (
            <>
              {/* Status bar */}
              <div className="card p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    {statusIcon(response.status)}
                    <div>
                      <div className={`text-lg font-bold font-mono ${statusColor(response.status)}`}>
                        {response.status === 0 ? 'NETWORK ERROR' : `${response.status} ${response.statusText}`}
                      </div>
                      <div className="text-xs text-brand-muted flex items-center gap-3 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {response.elapsedMs}ms
                        </span>
                        <span className="flex items-center gap-1">
                          <Code2 className="h-3 w-3" />
                          {response.bodySize.toLocaleString()} bytes
                        </span>
                        {response.headers['x-pings-consumed'] && (
                          <span className="flex items-center gap-1 text-brand-primary">
                            <Zap className="h-3 w-3" />
                            {response.headers['x-pings-consumed']} ping{response.headers['x-pings-consumed'] !== '1' ? 's' : ''}
                          </span>
                        )}
                        {response.request.keySource === 'own-key' && (
                          <span className="flex items-center gap-1 text-brand-primary">
                            <KeyRound className="h-3 w-3" />
                            own key
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={sendRequest}
                      disabled={sending}
                      className="btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1.5"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Retry
                    </button>
                    <button
                      onClick={copyCurl}
                      className="btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1.5"
                    >
                      {copiedCurl ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedCurl ? 'Copied' : 'Copy curl'}
                    </button>
                  </div>
                </div>

                {/* Error message */}
                {response.error && (
                  <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">
                    <AlertCircle className="h-4 w-4 inline mr-1.5" />
                    {response.error}
                  </div>
                )}
              </div>

              {/* Headers (collapsible) */}
              {Object.keys(response.headers).length > 0 && (
                <div className="card overflow-hidden p-0">
                  <button
                    onClick={() => setShowHeaders((v) => !v)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-brand-surface/40 transition-colors"
                  >
                    <span className="text-sm font-semibold">Response headers</span>
                    {showHeaders ? <ChevronUp className="h-4 w-4 text-brand-muted" /> : <ChevronDown className="h-4 w-4 text-brand-muted" />}
                  </button>
                  {showHeaders && (
                    <div className="px-4 py-3 border-t border-brand-border space-y-1.5">
                      {Object.entries(response.headers).map(([key, val]) => (
                        <div key={key} className="flex items-center gap-2 text-xs">
                          <span className="font-mono text-brand-muted shrink-0">{key}:</span>
                          <span className="font-mono text-brand-text">{val}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Response body */}
              <div className="card overflow-hidden p-0">
                <div className="px-4 py-3 border-b border-brand-border flex items-center justify-between">
                  <span className="text-sm font-semibold">Response body</span>
                  <button
                    onClick={copyBody}
                    className="btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1.5"
                  >
                    {copiedBody ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedBody ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="p-4 max-h-[600px] overflow-auto">
                  {response.isJson ? (
                    <pre className="text-xs font-mono text-brand-text whitespace-pre-wrap break-all">
                      {truncateForDisplay(formatJson(response.body), 50000)}
                    </pre>
                  ) : (
                    <pre className="text-xs font-mono text-brand-text whitespace-pre-wrap break-all">
                      {truncateForDisplay(String(response.body || '(empty body)'), 50000)}
                    </pre>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="card p-12 text-center">
              <FlaskConical className="h-12 w-12 mx-auto text-brand-muted opacity-30 mb-4" />
              <h3 className="font-semibold text-lg">Ready to test</h3>
              <p className="text-brand-muted text-sm mt-1 max-w-sm mx-auto">
                Select a product, choose an endpoint template (or type a custom path), and click
                <strong className="text-brand-text"> Send request</strong> to see the live API response.
              </p>
              {!sending && (
                <button
                  onClick={sendRequest}
                  className="btn-primary mt-4 inline-flex items-center gap-2"
                >
                  <Send className="h-4 w-4" />
                  Send first request
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Curl reference */}
      <div className="card p-5">
        <h3 className="font-semibold flex items-center gap-2 mb-3">
          <Code2 className="h-4 w-4 text-brand-primary" />
          Equivalent curl command
        </h3>
        <div className="relative">
          <pre className="bg-black/40 rounded-lg p-3 text-xs font-mono overflow-x-auto text-brand-text">
{`curl -s "${previewUrl}" \\
  -H "X-API-Key: ${useOwnKey ? '$VALORODDS_API_KEY' : '<internal-key>'}" \\
  -H "Accept: application/json"${method === 'POST' ? ' \\\n  -X POST' : ''} | python3 -m json.tool`}
          </pre>
        </div>
      </div>
    </main>
  );
}
