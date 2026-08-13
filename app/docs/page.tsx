import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/MarketingNavbar';
import Footer from '@/components/Footer';
import { buildMetadata, breadcrumbJsonLd, faqJsonLd, canonical } from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';

export const metadata: Metadata = buildMetadata({
  title: 'API Documentation — Valor Odds Developer Platform',
  description:
    'Complete developer documentation for the Valor Odds API platform. Learn how to authenticate, call 26 sport data APIs and the Odds API through a single gateway, manage ping quotas, handle errors, and integrate with curl, JavaScript, and Python.',
  path: '/docs',
  keywords: [
    'valor odds api documentation',
    'sports api docs',
    'odds api documentation',
    'sports data api reference',
    'api gateway authentication',
    'x-api-key header',
    'sports api quickstart',
  ],
});

const DOCS_FAQS = [
  {
    q: 'What is the base URL for all API calls?',
    a: 'All customer-facing API calls go through the gateway at https://api-gateway-production-12e8.up.railway.app. You never call individual sport services directly — the gateway handles authentication, quota enforcement, and proxying.',
  },
  {
    q: 'How do I get an API key?',
    a: 'Purchase a plan from the API Access page. After checkout, an API key is provisioned automatically and emailed to you. You can also view your key prefix and regenerate your key from the API Dashboard at /api-access/manage.',
  },
  {
    q: 'What is a ping and how are they counted?',
    a: 'A ping is one API call. Sport data calls consume 1 ping each. Odds API calls consume 5 pings each due to higher data acquisition costs. Your monthly ping pool is shared across all sports in your bundle.',
  },
  {
    q: 'What happens when I run out of pings?',
    a: 'By default, you get a 429 quota_exceeded response. If you enable pay-per-overage in your API dashboard, calls continue working and overage is billed at $1.50 per 1,000 pings.',
  },
  {
    q: 'Can I call APIs I have not purchased?',
    a: 'No. Calling a product not included in your plan returns 403 product_not_in_plan. You can add sports or upgrade your plan from the API Access page at any time.',
  },
  {
    q: 'How do I regenerate my API key?',
    a: 'Go to /api-access/manage, find your plan card, and click "Regenerate key." The old key is immediately revoked. The new raw key is shown once — copy it immediately, as it will not be displayed again.',
  },
];

const GATEWAY_BASE = 'https://api-gateway-production-12e8.up.railway.app';

export default function DocsPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', url: canonical('/') },
            { name: 'API Access', url: canonical('/api-access') },
            { name: 'Documentation', url: canonical('/docs') },
          ]),
          faqJsonLd(DOCS_FAQS),
        ]}
      />
      <Navbar />
      <main className="container-px mx-auto max-w-7xl py-12">
        {/* Hero */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <span className="inline-block rounded-full bg-brand-primary/10 text-brand-primary text-xs font-semibold px-3 py-1 mb-3">
            DEVELOPER DOCUMENTATION
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold">API Documentation</h1>
          <p className="mt-4 text-brand-muted">
            Everything you need to integrate Valor Odds sports data and real-time odds into your
            application. One gateway, one API key, 26 sports plus the Odds API.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/api-access" className="btn-primary">
              Get API Access
            </Link>
            <Link href="/api-access/manage" className="btn-secondary">
              API Dashboard
            </Link>
          </div>
        </div>

        {/* Docs layout: sidebar + content */}
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8">
          {/* Sidebar TOC */}
          <aside className="hidden lg:block">
            <nav className="sticky top-24 space-y-1 text-sm">
              <p className="font-semibold text-brand-text mb-2">Contents</p>
              {[
                ['overview', 'Overview'],
                ['authentication', 'Authentication'],
                ['quickstart', 'Quick Start'],
                ['gateway-endpoints', 'Gateway Endpoints'],
                ['sport-endpoints', 'Sport API Endpoints'],
                ['odds-endpoints', 'Odds API Endpoints'],
                ['intel-endpoints', 'Intelligence Endpoints'],
                ['pricing', 'Pricing & Quotas'],
                ['rate-limits', 'Rate Limits & Overages'],
                ['errors', 'Error Codes'],
                ['examples', 'Code Examples'],
                ['webhooks', 'Webhooks'],
                ['faq', 'FAQ'],
              ].map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="block rounded-md px-3 py-1.5 text-brand-muted hover:text-brand-text hover:bg-brand-surface transition-colors"
                >
                  {label}
                </a>
              ))}
            </nav>
          </aside>

          {/* Content */}
          <div className="space-y-12 max-w-4xl">
            {/* Overview */}
            <section id="overview">
              <h2 className="text-2xl font-bold mb-4">Overview</h2>
              <p className="text-brand-muted leading-relaxed">
                The Valor Odds API platform gives you programmatic access to real-time sports data
                across 26 sports and a premium Odds API — all through a single unified gateway. You
                purchase a plan that includes a monthly ping pool and the sports you want access to,
                receive an API key, and then make authenticated calls through the gateway. The
                gateway validates your key, checks that your plan includes the requested product,
                decrements your ping quota atomically, and proxies the request to the underlying
                sport-specific backend service. This architecture means you only ever need to know
                one base URL and one authentication method, regardless of how many sports you access.
              </p>
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="card p-4">
                  <p className="text-2xl font-bold text-brand-primary">26</p>
                  <p className="text-sm text-brand-muted mt-1">Sport data APIs</p>
                </div>
                <div className="card p-4">
                  <p className="text-2xl font-bold text-brand-primary">1</p>
                  <p className="text-sm text-brand-muted mt-1">Unified gateway</p>
                </div>
                <div className="card p-4">
                  <p className="text-2xl font-bold text-brand-primary">1M</p>
                  <p className="text-sm text-brand-muted mt-1">Pings/mo (top tier)</p>
                </div>
              </div>
            </section>

            {/* Authentication */}
            <section id="authentication">
              <h2 className="text-2xl font-bold mb-4">Authentication</h2>
              <p className="text-brand-muted leading-relaxed">
                Every API call requires your API key sent as the <code className="docs-inline-code">X-API-Key</code> HTTP
                header. Your key is a string prefixed with <code className="docs-inline-code">vok_</code> and is
                unique to your plan. Keys are SHA-256 hashed at rest — we never store the raw key, so
                if you lose it you must regenerate a new one from your dashboard. Keep your key
                secret; do not commit it to public repositories or expose it in client-side code.
              </p>
              <CodeBlock
                language="http"
                code={`GET /v1/proxy/baseball/v1/games HTTP/1.1
Host: api-gateway-production-12e8.up.railway.app
X-API-Key: vok_your_api_key_here
Accept: application/json`}
              />
              <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                <p className="font-semibold text-amber-300">⚠️ Key Security</p>
                <p className="text-brand-muted mt-1">
                  Your raw API key is shown only once when first issued or regenerated. Store it in
                  an environment variable or secrets manager. If compromised, regenerate immediately
                  from <Link href="/api-access/manage" className="text-brand-primary underline">your dashboard</Link> — the old key
                  is revoked instantly.
                </p>
              </div>
            </section>

            {/* Quick Start */}
            <section id="quickstart">
              <h2 className="text-2xl font-bold mb-4">Quick Start</h2>
              <p className="text-brand-muted leading-relaxed mb-4">
                Three steps to your first API call:
              </p>
              <div className="space-y-4">
                <div className="card p-5">
                  <p className="font-semibold text-brand-text">
                    <span className="text-brand-primary">1.</span> Purchase a plan
                  </p>
                  <p className="text-sm text-brand-muted mt-1">
                    Visit <Link href="/api-access" className="text-brand-primary underline">/api-access</Link>,
                    choose a ping tier, select your sports (or All-Access), and complete checkout via
                    Stripe. Your API key is provisioned automatically and emailed to you.
                  </p>
                </div>
                <div className="card p-5">
                  <p className="font-semibold text-brand-text">
                    <span className="text-brand-primary">2.</span> Save your API key
                  </p>
                  <p className="text-sm text-brand-muted mt-1">
                    Copy the key from your email or the API Dashboard. Store it as an environment
                    variable:
                  </p>
                  <CodeBlock language="bash" code={`export VALORODDS_API_KEY="vok_your_api_key_here"`} />
                </div>
                <div className="card p-5">
                  <p className="font-semibold text-brand-text">
                    <span className="text-brand-primary">3.</span> Make your first call
                  </p>
                  <CodeBlock
                    language="bash"
                    code={`curl -s "${GATEWAY_BASE}/v1/proxy/baseball/v1/games" \\
  -H "X-API-Key: $VALORODDS_API_KEY" | python3 -m json.tool`}
                  />
                  <p className="text-sm text-brand-muted mt-3">
                    A successful response returns the sport data as JSON and includes an{' '}
                    <code className="docs-inline-code">X-Pings-Consumed: 1</code> response header
                    showing how many pings were deducted from your monthly quota.
                  </p>
                </div>
              </div>
            </section>

            {/* Gateway Endpoints */}
            <section id="gateway-endpoints">
              <h2 className="text-2xl font-bold mb-4">Gateway Endpoints</h2>
              <p className="text-brand-muted leading-relaxed mb-4">
                The gateway exposes three endpoints: the proxy (your main data access point), the
                catalog (public product/tier listing), and usage (your current quota snapshot).
              </p>

              <h3 className="text-lg font-semibold mt-6 mb-3">Proxy — All sport &amp; odds data</h3>
              <ApiEndpointRow
                method="ALL"
                path={`/v1/proxy/{product}/{path...}`}
                description="Proxy any request to a backend sport or odds API. The gateway authenticates your key, checks product entitlement, consumes quota, and forwards the request."
                auth="X-API-Key header (required)"
              />
              <p className="text-sm text-brand-muted mt-2">
                Replace <code className="docs-inline-code">{'{product}'}</code> with a product code
                (e.g. <code className="docs-inline-code">baseball</code>,{' '}
                <code className="docs-inline-code">odds</code>) and{' '}
                <code className="docs-inline-code">{'{path...}'}</code> with the backend API path
                (e.g. <code className="docs-inline-code">v1/games</code>). Query parameters are
                forwarded as-is.
              </p>
              <CodeBlock
                language="bash"
                code={`# Baseball games list
curl "${GATEWAY_BASE}/v1/proxy/baseball/v1/games" \\
  -H "X-API-Key: $VALORODDS_API_KEY"

# Specific game boxscore
curl "${GATEWAY_BASE}/v1/proxy/baseball/v1/games/12345/boxscore" \\
  -H "X-API-Key: $VALORODDS_API_KEY"

# With query params
curl "${GATEWAY_BASE}/v1/proxy/baseball/v1/games?league=mlb&season=2025" \\
  -H "X-API-Key: $VALORODDS_API_KEY"`}
              />

              <h3 className="text-lg font-semibold mt-8 mb-3">Catalog — Public product listing</h3>
              <ApiEndpointRow
                method="GET"
                path="/v1/catalog"
                description="Returns all active products and ping tiers. No authentication required."
                auth="None"
              />
              <CodeBlock
                language="bash"
                code={`curl "${GATEWAY_BASE}/v1/catalog" | python3 -m json.tool`}
              />
              <p className="text-sm text-brand-muted mt-2">Response shape:</p>
              <CodeBlock
                language="json"
                code={`{
  "products": [
    {
      "code": "baseball",
      "name": "Baseball API",
      "category": "sport",
      "ping_weight": 1,
      "addon_monthly_price_cents": 500,
      "standalone_monthly_price_cents": null,
      "standalone_monthly_pings": null
    }
    // ... 25 more products (26 total sport/league products across the catalog)
  ],
  "ping_tiers": [
    { "code": "t10k",  "name": "10,000 pings/mo",       "monthly_pings": 10000,    "monthly_price_cents": 1200 },
    { "code": "t50k",  "name": "50,000 pings/mo",       "monthly_pings": 50000,    "monthly_price_cents": 3500 },
    { "code": "t250k", "name": "250,000 pings/mo",      "monthly_pings": 250000,   "monthly_price_cents": 12500 },
    { "code": "t1m",   "name": "1,000,000 pings/mo",    "monthly_pings": 1000000,  "monthly_price_cents": 36900 }
  ]
}`}
              />

              <h3 className="text-lg font-semibold mt-8 mb-3">Usage — Current quota snapshot</h3>
              <ApiEndpointRow
                method="GET"
                path="/v1/usage"
                description="Returns your current billing-period usage: pings included, pings used, overage pings, and overage cost."
                auth="X-API-Key header (required)"
              />
              <CodeBlock
                language="bash"
                code={`curl "${GATEWAY_BASE}/v1/usage" \\
  -H "X-API-Key: $VALORODDS_API_KEY"`}
              />
              <CodeBlock
                language="json"
                code={`{
  "plan_type": "bundle",
  "all_access": false,
  "odds_addon": false,
  "overage_enabled": false,
  "period": {
    "period_start": "2025-07-01",
    "period_end": "2025-07-31",
    "pings_included": 50000,
    "pings_used": 3271,
    "overage_pings": 0,
    "overage_cost_cents": 0,
    "status": "active"
  }
}`}
              />
            </section>

            {/* Sport API Endpoints */}
            <section id="sport-endpoints">
              <h2 className="text-2xl font-bold mb-4">Sport API Endpoints</h2>
              <p className="text-brand-muted leading-relaxed mb-4">
                Each of the 26 sport APIs follows a consistent REST pattern with{' '}
                <code className="docs-inline-code">/v1/</code> prefixed paths. All calls go through
                the gateway at <code className="docs-inline-code">/v1/proxy/{'{product}'}/</code>.
                Below is the full endpoint reference (using baseball as the example — replace{' '}
                <code className="docs-inline-code">baseball</code> with any sport product code).
              </p>

              <div className="space-y-2">
                <ApiEndpointRow method="GET" path="/v1/games" description="List games (supports league & season query params)" />
                <ApiEndpointRow method="GET" path="/v1/games/{game_id}" description="Get a single game by ID" />
                <ApiEndpointRow method="GET" path="/v1/games/{game_id}/boxscore" description="Get the boxscore for a specific game" />
                <ApiEndpointRow method="GET" path="/v1/games/{game_id}/innings" description="Get inning-by-inning breakdown" />
                <ApiEndpointRow method="GET" path="/v1/games/{game_id}/pitches" description="Get pitch-level data for a game" />
                <ApiEndpointRow method="GET" path="/v1/games/players/{player_id}/hotzones" description="Get a player's hot zone data" />
                <ApiEndpointRow method="GET" path="/v1/leagues" description="List all leagues for this sport" />
                <ApiEndpointRow method="GET" path="/v1/leagues/{league_id}/teams" description="List teams in a specific league" />
                <ApiEndpointRow method="GET" path="/v1/teams/{team_id}" description="Get team details by ID" />
                <ApiEndpointRow method="GET" path="/v1/teams/{team_id}/roster" description="Get the roster for a specific team" />
                <ApiEndpointRow method="GET" path="/v1/players/{player_id}" description="Get player details by ID" />
                <ApiEndpointRow method="GET" path="/v1/players/{player_id}/stats" description="Get player statistics" />
                <ApiEndpointRow method="GET" path="/v1/status" description="Get the data ingestion status for this sport" />
              </div>

              <div className="mt-6 card p-5">
                <p className="font-semibold text-brand-text mb-1">All 26 API product codes</p>
                <p className="text-xs text-brand-muted mb-4">
                  Split into general sports (broad, ongoing coverage of a sport) and
                  leagues/tournaments (a specific competition or event within a sport) so you know
                  exactly what each code covers before you add it to your bundle.
                </p>

                <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted mb-2">
                  Sports (16)
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm mb-5">
                  {[
                    'baseball', 'basketball', 'soccer', 'hockey', 'football',
                    'tennis', 'golf', 'cricket', 'cycling', 'combat',
                    'rugby', 'rugby_league', 'swimming', 'volleyball',
                    'motorsports', 'formula1',
                  ].map((code) => (
                    <span key={code} className="rounded bg-brand-elevated px-2 py-1 font-mono text-xs text-brand-muted">
                      {code}
                    </span>
                  ))}
                </div>

                <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted mb-2">
                  Leagues / Tournaments (10)
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                  {[
                    'fifa', 'champions_league', 'tour_de_france', 'track',
                    'wimbledon', 'world_series', 'xgames', 'olympics',
                    'march_madness', 'superbowl',
                  ].map((code) => (
                    <span key={code} className="rounded bg-brand-elevated px-2 py-1 font-mono text-xs text-brand-muted">
                      {code}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            {/* Odds API Endpoints */}
            <section id="odds-endpoints">
              <h2 className="text-2xl font-bold mb-4">Odds API Endpoints</h2>
              <p className="text-brand-muted leading-relaxed mb-4">
                The Odds API (product code <code className="docs-inline-code">odds</code>) provides
                real-time sportsbook odds across multiple books. It is a premium product — each call
                consumes <strong className="text-brand-text">5 pings</strong> from your quota
                instead of 1. You can access it either as a bundle add-on (+$100/mo on top of any
                ping tier) or as a standalone subscription ($250/mo with its own dedicated 50,000
                ping pool).
              </p>
              <CodeBlock
                language="bash"
                code={`# Odds API calls use the same gateway proxy pattern
curl "${GATEWAY_BASE}/v1/proxy/odds/v1/odds" \\
  -H "X-API-Key: $VALORODDS_API_KEY"

# Each odds call returns X-Pings-Consumed: 5`}
              />
              <div className="mt-4 rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-4 text-sm">
                <p className="font-semibold text-indigo-300">Odds API Ping Weight</p>
                <p className="text-brand-muted mt-1">
                  Because odds data is more expensive to source and refresh in real time, each Odds
                  API call consumes 5 pings. With a 50,000 ping pool (standalone or from your
                  bundle), that gives you 10,000 effective odds calls per month.
                </p>
              </div>
            </section>

            {/* Intelligence Endpoints */}
            <section id="intel-endpoints">
              <h2 className="text-2xl font-bold mb-4">Intelligence Endpoints</h2>
              <p className="text-brand-muted leading-relaxed mb-4">
                Intelligence products are premium analytics feeds sourced from our real-time data
                pipeline. Unlike sport APIs (which proxy to backend services), these endpoints query
                our database directly and return pre-computed, value-added intelligence. There are
                four products, each available as a bundle add-on or standalone subscription.
              </p>

              <h3 className="text-lg font-semibold mt-6 mb-3">
                Arbitrage &amp; Sure-Bet Feed — <code className="docs-inline-code">arbitrage</code>
              </h3>
              <p className="text-brand-muted leading-relaxed mb-3">
                Live sure-bet opportunities across 20+ sportsbooks. Every row includes the best odds
                on each side, the sportsbook offering them, the guaranteed profit percentage, and the
                full per-book odds breakdown in the <code className="docs-inline-code">all_odds</code>
                field. Updated every 60 seconds. Each call consumes <strong className="text-brand-text">5 pings</strong>.
              </p>
              <CodeBlock
                language="bash"
                code={`# Get the top 20 live arbitrage opportunities
curl "${GATEWAY_BASE}/v1/intelligence/arbitrage?limit=20&min_profit=1" \\
  -H "X-API-Key: $VALORODDS_API_KEY"

# Filter by sport
curl "${GATEWAY_BASE}/v1/intelligence/arbitrage?sport=soccer&stake=500" \\
  -H "X-API-Key: $VALORODDS_API_KEY"`}
              />
              <div className="mt-3 mb-6 overflow-x-auto">
                <table className="w-full text-sm border border-brand-border rounded-lg">
                  <thead className="bg-brand-surface">
                    <tr className="text-left">
                      <th className="px-4 py-2 font-semibold">Parameter</th>
                      <th className="px-4 py-2 font-semibold">Default</th>
                      <th className="px-4 py-2 font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border">
                    <tr><td className="px-4 py-2 font-mono">sport</td><td className="px-4 py-2 text-brand-muted">all</td><td className="px-4 py-2 text-brand-muted">Filter by sport (case-insensitive)</td></tr>
                    <tr><td className="px-4 py-2 font-mono">min_profit</td><td className="px-4 py-2 text-brand-muted">0</td><td className="px-4 py-2 text-brand-muted">Minimum profit percentage</td></tr>
                    <tr><td className="px-4 py-2 font-mono">limit</td><td className="px-4 py-2 text-brand-muted">50</td><td className="px-4 py-2 text-brand-muted">Max results (up to 200)</td></tr>
                    <tr><td className="px-4 py-2 font-mono">stake</td><td className="px-4 py-2 text-brand-muted">100</td><td className="px-4 py-2 text-brand-muted">Bankroll for stake allocation calculation</td></tr>
                    <tr><td className="px-4 py-2 font-mono">window</td><td className="px-4 py-2 text-brand-muted">35</td><td className="px-4 py-2 text-brand-muted">Lookback window in minutes</td></tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-lg font-semibold mt-6 mb-3">
                Steam Moves &amp; Line Movement — <code className="docs-inline-code">steam_moves</code>
              </h3>
              <p className="text-brand-muted leading-relaxed mb-3">
                Real-time line-movement alerts. When 3+ sportsbooks move a line in the same direction
                within a short window, we flag it as a steam move — the sharpest signal in the market.
                Each alert includes before/after average prices, the number of books that moved, total
                books tracked, and the direction (UP or DOWN). Each call consumes{' '}
                <strong className="text-brand-text">5 pings</strong>.
              </p>
              <CodeBlock
                language="bash"
                code={`# Get recent steam moves across all sports
curl "${GATEWAY_BASE}/v1/intelligence/steam-moves?limit=50" \\
  -H "X-API-Key: $VALORODDS_API_KEY"

# Filter by sport and direction
curl "${GATEWAY_BASE}/v1/intelligence/steam-moves?sport=BASEBALL&direction=UP" \\
  -H "X-API-Key: $VALORODDS_API_KEY"`}
              />
              <div className="mt-3 mb-6 overflow-x-auto">
                <table className="w-full text-sm border border-brand-border rounded-lg">
                  <thead className="bg-brand-surface">
                    <tr className="text-left">
                      <th className="px-4 py-2 font-semibold">Parameter</th>
                      <th className="px-4 py-2 font-semibold">Default</th>
                      <th className="px-4 py-2 font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border">
                    <tr><td className="px-4 py-2 font-mono">sport</td><td className="px-4 py-2 text-brand-muted">all</td><td className="px-4 py-2 text-brand-muted">Filter by sport (case-insensitive)</td></tr>
                    <tr><td className="px-4 py-2 font-mono">direction</td><td className="px-4 py-2 text-brand-muted">all</td><td className="px-4 py-2 text-brand-muted">UP or DOWN</td></tr>
                    <tr><td className="px-4 py-2 font-mono">market</td><td className="px-4 py-2 text-brand-muted">all</td><td className="px-4 py-2 text-brand-muted">Market type (spreads, totals, etc.)</td></tr>
                    <tr><td className="px-4 py-2 font-mono">min_books</td><td className="px-4 py-2 text-brand-muted">1</td><td className="px-4 py-2 text-brand-muted">Minimum books that moved</td></tr>
                    <tr><td className="px-4 py-2 font-mono">limit</td><td className="px-4 py-2 text-brand-muted">50</td><td className="px-4 py-2 text-brand-muted">Max results (up to 200)</td></tr>
                    <tr><td className="px-4 py-2 font-mono">window</td><td className="px-4 py-2 text-brand-muted">60</td><td className="px-4 py-2 text-brand-muted">Lookback in minutes (max 1440)</td></tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-lg font-semibold mt-6 mb-3">
                Injury Reports — <code className="docs-inline-code">injuries</code>
              </h3>
              <p className="text-brand-muted leading-relaxed mb-3">
                Standardized injury reports aggregated from ESPN and other sources. Each report
                includes the player name, team, position, status (Day-To-Day, IL, Out, etc.), injury
                type, and a full text description. Each call consumes{' '}
                <strong className="text-brand-text">2 pings</strong>.
              </p>
              <CodeBlock
                language="bash"
                code={`# Get recent injury reports
curl "${GATEWAY_BASE}/v1/intelligence/injuries?limit=50" \\
  -H "X-API-Key: $VALORODDS_API_KEY"

# Filter by sport and team
curl "${GATEWAY_BASE}/v1/intelligence/injuries?sport=MLB&team=Yankees" \\
  -H "X-API-Key: $VALORODDS_API_KEY"`}
              />
              <div className="mt-3 mb-6 overflow-x-auto">
                <table className="w-full text-sm border border-brand-border rounded-lg">
                  <thead className="bg-brand-surface">
                    <tr className="text-left">
                      <th className="px-4 py-2 font-semibold">Parameter</th>
                      <th className="px-4 py-2 font-semibold">Default</th>
                      <th className="px-4 py-2 font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border">
                    <tr><td className="px-4 py-2 font-mono">sport</td><td className="px-4 py-2 text-brand-muted">all</td><td className="px-4 py-2 text-brand-muted">Filter by sport (e.g. MLB, NBA)</td></tr>
                    <tr><td className="px-4 py-2 font-mono">team</td><td className="px-4 py-2 text-brand-muted">all</td><td className="px-4 py-2 text-brand-muted">Partial team name match (case-insensitive)</td></tr>
                    <tr><td className="px-4 py-2 font-mono">status</td><td className="px-4 py-2 text-brand-muted">all</td><td className="px-4 py-2 text-brand-muted">Filter by status (Day-To-Day, Out, IL, etc.)</td></tr>
                    <tr><td className="px-4 py-2 font-mono">limit</td><td className="px-4 py-2 text-brand-muted">50</td><td className="px-4 py-2 text-brand-muted">Max results (up to 200)</td></tr>
                    <tr><td className="px-4 py-2 font-mono">window</td><td className="px-4 py-2 text-brand-muted">48</td><td className="px-4 py-2 text-brand-muted">Lookback in hours (max 720 = 30 days)</td></tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-lg font-semibold mt-6 mb-3">
                AI Betting Intelligence — <code className="docs-inline-code">ai_analysis</code>
              </h3>
              <p className="text-brand-muted leading-relaxed mb-3">
                GPT-4o-powered depth analysis for every game across all supported sports. Each report
                includes a recommended pick, confidence assessment, odds breakdown, and full reasoning
                in markdown. This is our highest-weight product — each call consumes{' '}
                <strong className="text-brand-text">10 pings</strong> due to the compute cost of
                generating each analysis.
              </p>
              <CodeBlock
                language="bash"
                code={`# Get the 20 most recent AI analyses
curl "${GATEWAY_BASE}/v1/intelligence/ai-analysis?limit=20" \\
  -H "X-API-Key: $VALORODDS_API_KEY"

# Get analysis without the full content (metadata only, lighter response)
curl "${GATEWAY_BASE}/v1/intelligence/ai-analysis?include_content=false" \\
  -H "X-API-Key: $VALORODDS_API_KEY"`}
              />
              <div className="mt-3 mb-6 overflow-x-auto">
                <table className="w-full text-sm border border-brand-border rounded-lg">
                  <thead className="bg-brand-surface">
                    <tr className="text-left">
                      <th className="px-4 py-2 font-semibold">Parameter</th>
                      <th className="px-4 py-2 font-semibold">Default</th>
                      <th className="px-4 py-2 font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border">
                    <tr><td className="px-4 py-2 font-mono">analysis_type</td><td className="px-4 py-2 text-brand-muted">depthAnalysis</td><td className="px-4 py-2 text-brand-muted">Type of analysis to retrieve</td></tr>
                    <tr><td className="px-4 py-2 font-mono">model</td><td className="px-4 py-2 text-brand-muted">all</td><td className="px-4 py-2 text-brand-muted">Filter by model (e.g. gpt-4o)</td></tr>
                    <tr><td className="px-4 py-2 font-mono">limit</td><td className="px-4 py-2 text-brand-muted">20</td><td className="px-4 py-2 text-brand-muted">Max results (up to 100)</td></tr>
                    <tr><td className="px-4 py-2 font-mono">include_content</td><td className="px-4 py-2 text-brand-muted">true</td><td className="px-4 py-2 text-brand-muted">Include full markdown content</td></tr>
                    <tr><td className="px-4 py-2 font-mono">include_sports_data</td><td className="px-4 py-2 text-brand-muted">false</td><td className="px-4 py-2 text-brand-muted">Include the source sports data JSONB</td></tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Pricing & Quotas */}
            <section id="pricing">
              <h2 className="text-2xl font-bold mb-4">Pricing &amp; Quotas</h2>
              <p className="text-brand-muted leading-relaxed mb-4">
                Pricing follows a build-your-own-bundle model. You pick a monthly ping pool size
                (your tier), then choose which sports to access. All sports share the same ping pool.
              </p>

              <h3 className="text-lg font-semibold mt-6 mb-3">Ping Tiers</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-brand-border rounded-lg">
                  <thead className="bg-brand-surface">
                    <tr className="text-left">
                      <th className="px-4 py-2 font-semibold">Tier</th>
                      <th className="px-4 py-2 font-semibold">Monthly Pings</th>
                      <th className="px-4 py-2 font-semibold">Price</th>
                      <th className="px-4 py-2 font-semibold">Effective sport calls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border">
                    <tr><td className="px-4 py-2 font-mono">t10k</td><td className="px-4 py-2">10,000</td><td className="px-4 py-2">$12/mo</td><td className="px-4 py-2 text-brand-muted">10,000</td></tr>
                    <tr><td className="px-4 py-2 font-mono">t50k</td><td className="px-4 py-2">50,000</td><td className="px-4 py-2">$35/mo</td><td className="px-4 py-2 text-brand-muted">50,000</td></tr>
                    <tr><td className="px-4 py-2 font-mono">t250k</td><td className="px-4 py-2">250,000</td><td className="px-4 py-2">$125/mo</td><td className="px-4 py-2 text-brand-muted">250,000</td></tr>
                    <tr><td className="px-4 py-2 font-mono">t1m</td><td className="px-4 py-2">1,000,000</td><td className="px-4 py-2">$369/mo</td><td className="px-4 py-2 text-brand-muted">1,000,000</td></tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-lg font-semibold mt-8 mb-3">Sport Access</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-brand-border rounded-lg">
                  <thead className="bg-brand-surface">
                    <tr className="text-left">
                      <th className="px-4 py-2 font-semibold">Option</th>
                      <th className="px-4 py-2 font-semibold">Price</th>
                      <th className="px-4 py-2 font-semibold">Includes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border">
                    <tr><td className="px-4 py-2">Per-sport add-on</td><td className="px-4 py-2">$5/mo each</td><td className="px-4 py-2 text-brand-muted">Pick individual sports</td></tr>
                    <tr><td className="px-4 py-2">All-Access</td><td className="px-4 py-2">$99/mo flat</td><td className="px-4 py-2 text-brand-muted">All 26 sports (save vs 26×$5=$130)</td></tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-lg font-semibold mt-8 mb-3">Odds API</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-brand-border rounded-lg">
                  <thead className="bg-brand-surface">
                    <tr className="text-left">
                      <th className="px-4 py-2 font-semibold">Option</th>
                      <th className="px-4 py-2 font-semibold">Price</th>
                      <th className="px-4 py-2 font-semibold">Ping pool</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border">
                    <tr><td className="px-4 py-2">Standalone</td><td className="px-4 py-2">$250/mo</td><td className="px-4 py-2 text-brand-muted">50,000 dedicated (10k effective calls at 5× weight)</td></tr>
                    <tr><td className="px-4 py-2">Bundle add-on</td><td className="px-4 py-2">+$100/mo</td><td className="px-4 py-2 text-brand-muted">Shared with your sport pool (5× weight per call)</td></tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-lg font-semibold mt-8 mb-3">Overage Billing</h3>
              <p className="text-brand-muted leading-relaxed">
                When you exhaust your monthly ping pool, the default behavior is a hard cutoff —
                calls return <code className="docs-inline-code">429 quota_exceeded</code> so you
                never get a surprise bill. If you prefer continuity, enable pay-per-overage from
                your API dashboard. Calls will keep working past your quota and overage is billed
                at a flat rate of <strong className="text-brand-text">$1.50 per 1,000 pings</strong>.
                Overage is tracked cumulatively and billed on your next Stripe invoice.
              </p>
            </section>

            {/* Rate Limits & Overages */}
            <section id="rate-limits">
              <h2 className="text-2xl font-bold mb-4">Rate Limits &amp; Overages</h2>
              <p className="text-brand-muted leading-relaxed mb-4">
                The gateway enforces quotas at the monthly billing-period level, not per-second
                rate limits. Your ping pool resets on the 1st of each calendar month (UTC). Within
                a month, every successful proxied call atomically decrements your remaining pings.
                The consumption operation is database-transactional, so concurrent requests are
                safe — there is no race condition where multiple simultaneous calls could all
                succeed past the limit.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div className="card p-4">
                  <p className="font-semibold text-brand-text">Hard cutoff (default)</p>
                  <p className="text-sm text-brand-muted mt-1">
                    Overage disabled → calls beyond your pool get 429. No extra charges. Your plan
                    renews with a fresh pool at the start of the next billing period.
                  </p>
                </div>
                <div className="card p-4">
                  <p className="font-semibold text-brand-text">Metered overage (opt-in)</p>
                  <p className="text-sm text-brand-muted mt-1">
                    Overage enabled → calls continue past your pool. Overage pings are tracked and
                    billed at $1.50/1,000 on your next invoice. Toggle anytime from your dashboard.
                  </p>
                </div>
              </div>
              <p className="text-sm text-brand-muted mt-4">
                Response headers on every proxied call:
              </p>
              <ul className="text-sm text-brand-muted mt-2 space-y-1 ml-4 list-disc">
                <li><code className="docs-inline-code">X-Pings-Consumed</code> — pings deducted for this call (1 for sports, 5 for odds)</li>
                <li><code className="docs-inline-code">X-Overage-Applied</code> — <code className="docs-inline-code">true</code> if this call drew from overage quota</li>
              </ul>
            </section>

            {/* Error Codes */}
            <section id="errors">
              <h2 className="text-2xl font-bold mb-4">Error Codes</h2>
              <p className="text-brand-muted leading-relaxed mb-4">
                All errors return JSON with an <code className="docs-inline-code">error</code> field
                and, where helpful, a <code className="docs-inline-code">message</code> field. Errors
                use standard HTTP status codes.
              </p>
              <div className="space-y-3">
                <ErrorRow code="400" name="bad_request" desc="Malformed request body or invalid parameters." />
                <ErrorRow code="401" name="missing_api_key" desc="No X-API-Key header was sent." />
                <ErrorRow code="401" name="invalid_or_inactive_api_key" desc="The API key is wrong, revoked, or belongs to a canceled plan." />
                <ErrorRow code="403" name="product_not_in_plan" desc="Your plan does not include access to the requested product. Add it from the API Access page." />
                <ErrorRow code="404" name="unknown_product" desc="The product code in the URL does not exist." />
                <ErrorRow code="429" name="quota_exceeded" desc="You have used all pings in your monthly pool and overage is disabled. Upgrade or enable overage." />
                <ErrorRow code="500" name="internal_error" desc="Server-side failure. Retry with backoff." />
                <ErrorRow code="502" name="backend_unavailable" desc="The underlying sport service is down or timed out. Retry shortly." />
              </div>

              <h3 className="text-lg font-semibold mt-8 mb-3">Example error responses</h3>
              <CodeBlock
                language="json"
                code={`// 401 — invalid key
{ "error": "invalid_or_inactive_api_key" }

// 403 — sport not in plan
{
  "error": "product_not_in_plan",
  "message": "Your plan does not include access to \\"tennis\\". Add it in your API dashboard."
}

// 429 — quota exhausted, overage off
{
  "error": "quota_exceeded",
  "message": "You have used all pings included in your plan this billing period. Upgrade your plan or enable pay-per-overage in your API dashboard to continue.",
  "retry_after": "next_billing_period"
}`}
              />
            </section>

            {/* Code Examples */}
            <section id="examples">
              <h2 className="text-2xl font-bold mb-4">Code Examples</h2>

              <h3 className="text-lg font-semibold mt-6 mb-3">cURL</h3>
              <CodeBlock
                language="bash"
                code={`# List baseball games
curl -s "${GATEWAY_BASE}/v1/proxy/baseball/v1/games" \\
  -H "X-API-Key: $VALORODDS_API_KEY"

# Get a specific game's boxscore
curl -s "${GATEWAY_BASE}/v1/proxy/baseball/v1/games/12345/boxscore" \\
  -H "X-API-Key: $VALORODDS_API_KEY"

# Check your usage
curl -s "${GATEWAY_BASE}/v1/usage" \\
  -H "X-API-Key: $VALORODDS_API_KEY"`}
              />

              <h3 className="text-lg font-semibold mt-8 mb-3">JavaScript (Node.js)</h3>
              <CodeBlock
                language="javascript"
                code={`const API_KEY = process.env.VALORODDS_API_KEY;
const GATEWAY = '${GATEWAY_BASE}';

async function getBaseballGames() {
  const res = await fetch(\`\${GATEWAY}/v1/proxy/baseball/v1/games\`, {
    headers: { 'X-API-Key': API_KEY },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(\`\${res.status}: \${err.error || res.statusText}\`);
  }

  const data = await res.json();
  console.log('Pings consumed:', res.headers.get('X-Pings-Consumed'));
  return data;
}

getBaseballGames().then(console.log).catch(console.error);`}
              />

              <h3 className="text-lg font-semibold mt-8 mb-3">Python</h3>
              <CodeBlock
                language="python"
                code={`import os
import requests

API_KEY = os.environ["VALORODDS_API_KEY"]
GATEWAY = "${GATEWAY_BASE}"

def get_baseball_games():
    resp = requests.get(
        f"{GATEWAY}/v1/proxy/baseball/v1/games",
        headers={"X-API-Key": API_KEY},
    )
    resp.raise_for_status()
    print(f"Pings consumed: {resp.headers.get('X-Pings-Consumed')}")
    return resp.json()

games = get_baseball_games()
print(f"Got {len(games)} games")`}
              />

              <h3 className="text-lg font-semibold mt-8 mb-3">Handling 429 quota exhaustion</h3>
              <CodeBlock
                language="javascript"
                code={`async function callWithRetry(url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(url, {
      headers: { 'X-API-Key': API_KEY },
    });

    if (res.status === 429) {
      // Quota exhausted — don't retry, surface to user
      const body = await res.json();
      throw new Error(\`Quota exceeded: \${body.message}\`);
    }

    if (res.status >= 500 && i < maxRetries - 1) {
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      continue;
    }

    return res.json();
  }
}`}
              />
            </section>

            {/* Webhooks */}
            <section id="webhooks">
              <h2 className="text-2xl font-bold mb-4">Webhooks</h2>
              <p className="text-brand-muted leading-relaxed mb-4">
                Valor Odds uses Stripe webhooks to provision your API plan and key automatically
                after a successful checkout. You do not need to handle webhooks yourself — the
                platform processes them server-side. When a checkout completes:
              </p>
              <div className="space-y-3">
                <div className="card p-4">
                  <p className="text-sm text-brand-muted">
                    <span className="font-semibold text-brand-text">1.</span> A{' '}
                    <code className="docs-inline-code">customer_api_plan</code> row is created with
                    your selected tier, sports, and quota.
                  </p>
                </div>
                <div className="card p-4">
                  <p className="text-sm text-brand-muted">
                    <span className="font-semibold text-brand-text">2.</span> A new API key is
                    generated, hashed, and stored. The raw key is emailed to you.
                  </p>
                </div>
                <div className="card p-4">
                  <p className="text-sm text-brand-muted">
                    <span className="font-semibold text-brand-text">3.</span> Your plan becomes
                    active immediately — you can start making API calls right away.
                  </p>
                </div>
                <div className="card p-4">
                  <p className="text-sm text-brand-muted">
                    <span className="font-semibold text-brand-text">4.</span> If you cancel or your
                    subscription lapses, the plan status changes to{' '}
                    <code className="docs-inline-code">canceled</code> and your key is deactivated
                    at the end of the billing period.
                  </p>
                </div>
              </div>
              <p className="text-sm text-brand-muted mt-4">
                The usage period resets automatically on the 1st of each month (UTC). Your ping
                quota is replenished based on your active tier at that time.
              </p>
            </section>

            {/* FAQ */}
            <section id="faq">
              <h2 className="text-2xl font-bold mb-4">Frequently Asked Questions</h2>
              <div className="space-y-4">
                {DOCS_FAQS.map((f) => (
                  <div key={f.q} className="card p-4">
                    <h3 className="font-semibold">{f.q}</h3>
                    <p className="text-sm text-brand-muted mt-1">{f.a}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* CTA */}
            <section className="card p-8 text-center bg-gradient-card">
              <h2 className="text-2xl font-bold">Ready to start building?</h2>
              <p className="mt-2 text-brand-muted">
                Get your API key in minutes. Pick your sports, choose your ping pool, and integrate today.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link href="/api-access" className="btn-primary">Get API Access</Link>
                <Link href="/api-access/manage" className="btn-secondary">View API Dashboard</Link>
              </div>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

/* ---------- Helper components ---------- */

function CodeBlock({ language, code }: { language: string; code: string }) {
  return (
    <div className="docs-codeblock my-4">
      <div className="docs-codeblock-header">
        <span className="docs-codeblock-lang">{language}</span>
      </div>
      <pre className="docs-codeblock-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function ApiEndpointRow({
  method,
  path,
  description,
  auth,
}: {
  method: string;
  path: string;
  description: string;
  auth?: string;
}) {
  const methodColor =
    method === 'GET'
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      : method === 'POST'
        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
        : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-brand-border bg-brand-surface px-4 py-3">
      <span className={`shrink-0 rounded border px-2 py-0.5 text-xs font-bold font-mono ${methodColor}`}>
        {method}
      </span>
      <code className="text-sm font-mono text-brand-text break-all">{path}</code>
      <span className="text-sm text-brand-muted sm:ml-auto">{description}</span>
      {auth && (
        <span className="text-xs text-brand-muted shrink-0 sm:pl-2 border-l border-brand-border hidden sm:block">
          {auth}
        </span>
      )}
    </div>
  );
}

function ErrorRow({ code, name, desc }: { code: string; name: string; desc: string }) {
  return (
    <div className="flex items-start gap-4 rounded-lg border border-brand-border bg-brand-surface px-4 py-3">
      <span className="shrink-0 rounded bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 text-xs font-bold font-mono">
        {code}
      </span>
      <div className="min-w-0">
        <code className="text-sm font-mono text-brand-text">{name}</code>
        <p className="text-sm text-brand-muted mt-0.5">{desc}</p>
      </div>
    </div>
  );
}
