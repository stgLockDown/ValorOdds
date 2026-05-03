import { buildMetadata, canonical, breadcrumbJsonLd, SITE, faqJsonLd } from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';

/**
 * Data partners / API page. Targets enterprise traffic looking for:
 *  - Licensed odds data feeds
 *  - White-label arbitrage detection
 *  - Sportsbook / DFS operator partnerships
 *  - Media integrations
 *
 * Distinct from /partners, which is the affiliate funnel. This page is
 * the "talk to sales" funnel.
 */

export const metadata = buildMetadata({
  title: 'Data & API Partnerships',
  description:
    'License Valor Odds data feeds, arbitrage detection, or white-label integrations. Enterprise terms for sportsbooks, DFS operators, and media partners.',
  path: '/partners/data',
  keywords: [
    'sports odds api',
    'arbitrage api',
    'odds data feed',
    'white label odds',
    'sportsbook data api',
    'betting data licensing',
  ],
});

const FAQS = [
  {
    q: 'What data feeds are available?',
    a: 'Live odds across 30+ sportsbooks, arbitrage opportunities with edge calculations, +EV signals benchmarked against sharp-book consensus, closing line value tracking, and historical line movement. All delivered via REST and WebSocket.',
  },
  {
    q: 'What\'s the latency from book to feed?',
    a: 'Sub-second for most major books. 99th-percentile latency measured over the last 30 days is 780 ms for core markets (moneyline, spread, totals) on tier-one US books.',
  },
  {
    q: 'Pricing model?',
    a: 'Tiered monthly licensing based on request volume and books covered. Pilot contracts start at $2,500/month. White-label and revenue-share arrangements are available for platforms with >5,000 monthly active users.',
  },
  {
    q: 'Do you offer regulated-jurisdiction certifications?',
    a: 'Our data pipeline is GLI-19 aligned for use inside licensed sports-betting products. We hold NDAs with book partners and can provide SOC-2-aligned data-handling documentation on request.',
  },
];

export default function DataPartnersPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', url: SITE.url },
            { name: 'Partners', url: canonical('/partners') },
            { name: 'Data', url: canonical('/partners/data') },
          ]),
          faqJsonLd(FAQS),
        ]}
      />

      <nav className="text-xs text-slate-400 mb-6" aria-label="Breadcrumb">
        <a href="/" className="hover:text-slate-200">Home</a>
        <span className="mx-2">/</span>
        <a href="/partners" className="hover:text-slate-200">Partners</a>
        <span className="mx-2">/</span>
        <span className="text-slate-300">Data</span>
      </nav>

      <div className="max-w-3xl">
        <h1 className="text-4xl sm:text-5xl font-bold mb-4">
          Licensed odds data for sportsbooks, media, and platforms
        </h1>
        <p className="text-lg text-slate-300 mb-8">
          We power arbitrage detection, +EV signals, and best-price comparison
          for platforms that need sub-second odds data with audit-ready
          provenance. Pilot contracts start at $2,500/month.
        </p>
        <div className="flex flex-wrap gap-3 mb-12">
          <a
            href="mailto:partners@valorodds.com?subject=Data%20partnership%20inquiry"
            className="inline-flex items-center rounded-md bg-teal-500 px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-teal-400"
          >
            Contact sales →
          </a>
          <a
            href="/partners"
            className="inline-flex items-center rounded-md border border-white/15 px-5 py-3 text-sm font-semibold text-slate-100 hover:bg-white/5"
          >
            Affiliate program
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-16">
        {[
          { v: '30+', l: 'Sportsbooks covered' },
          { v: '<1s', l: 'Book-to-feed latency (p99)' },
          { v: '10', l: 'Sports supported' },
          { v: 'GLI-19', l: 'Aligned data pipeline' },
          { v: 'REST + WS', l: 'Delivery methods' },
          { v: 'SOC-2', l: 'Aligned data handling' },
        ].map((c) => (
          <div
            key={c.l}
            className="rounded-xl border border-white/10 bg-white/[0.02] p-5"
          >
            <div className="text-2xl font-bold text-teal-300">{c.v}</div>
            <div className="text-xs text-slate-400 mt-1">{c.l}</div>
          </div>
        ))}
      </div>

      <section aria-labelledby="use-heading" className="mb-16">
        <h2 id="use-heading" className="text-2xl font-semibold mb-5">
          Who builds on Valor Odds data
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-300">
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-5">
            <h3 className="font-semibold text-slate-100 mb-2">Sportsbook operators</h3>
            <p>
              Use our arbitrage detection as a price-check service on your own
              trading desk, or plug our +EV signals into in-house model
              validation. Enterprise SLAs available.
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-5">
            <h3 className="font-semibold text-slate-100 mb-2">DFS & prop platforms</h3>
            <p>
              Ingest our player-prop consensus prices to set your own lines or
              flag outliers. Historical line-movement data is available for
              model training.
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-5">
            <h3 className="font-semibold text-slate-100 mb-2">Media & affiliates</h3>
            <p>
              White-labeled best-odds widgets, branded embed experiences, and
              revenue-share arrangements for high-traffic content sites.
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-5">
            <h3 className="font-semibold text-slate-100 mb-2">Quant & research</h3>
            <p>
              Historical tick-level odds, CLV baselines, and bucketed line
              movement for academic research, firm proprietary modeling, and
              market-microstructure studies.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="faq-heading" className="mb-16">
        <h2 id="faq-heading" className="text-2xl font-semibold mb-5">Frequently asked</h2>
        <div className="space-y-3 max-w-3xl">
          {FAQS.map((f) => (
            <details
              key={f.q}
              className="rounded-lg border border-white/10 bg-white/[0.02] p-4"
            >
              <summary className="cursor-pointer font-medium text-slate-100">{f.q}</summary>
              <p className="mt-2 text-sm text-slate-300">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
        <h2 className="text-xl font-semibold mb-2">Request a data sample</h2>
        <p className="text-sm text-slate-300 mb-3">
          Email{' '}
          <a className="text-teal-300 underline" href="mailto:partners@valorodds.com">
            partners@valorodds.com
          </a>{' '}
          with your use case and expected volume. We return a sample payload
          and pilot pricing within one business day.
        </p>
      </section>
    </main>
  );
}