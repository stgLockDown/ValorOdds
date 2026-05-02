import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  buildMetadata,
  breadcrumbJsonLd,
  canonical,
  faqJsonLd,
  SPORTS,
} from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';

export const metadata: Metadata = buildMetadata({
  title: 'Live Sports Arbitrage — Real-Time Sure Bets',
  description:
    'Find live sports arbitrage opportunities in real time across MLB, NFL, NBA, NHL, soccer, UFC, and more. Valor Odds scans every major sportsbook so you can lock in risk-free profit.',
  path: '/arbitrage',
  keywords: [
    'sports arbitrage',
    'arbitrage betting',
    'sure bets',
    'arb betting',
    'live arbitrage opportunities',
    'risk free sports betting',
  ],
});

const ARB_FAQS = [
  {
    q: 'What is sports arbitrage betting?',
    a: 'Sports arbitrage (also called sure betting or arb betting) is placing bets on every possible outcome of an event across different sportsbooks so the returns are guaranteed regardless of who wins. The profit comes from price differences between sportsbooks.',
  },
  {
    q: 'How does Valor Odds find arbitrage opportunities?',
    a: 'We continuously scan odds from every major sportsbook, compare prices across outcomes in real time, and surface only opportunities with a positive combined implied probability edge. Filters include edge percentage, sport, market type, and sportsbook.',
  },
  {
    q: 'Is arbitrage betting risk-free?',
    a: 'Mathematically, arbitrage guarantees profit if all bets are placed at the prices you found. Real-world risk comes from line movement between legs, bet limits, sportsbook account limits, and execution speed. Our alerts are designed to surface opportunities fast enough to act on.',
  },
  {
    q: 'Will sportsbooks ban me for arbitrage betting?',
    a: 'Some sportsbooks limit or ban accounts they identify as arbitrage bettors. This is not illegal, but it is a sportsbook house rule. Sharp bettors typically spread volume across many books and avoid obvious round-number stakes.',
  },
];

export default function ArbitrageHubPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', url: canonical('/') },
            { name: 'Arbitrage', url: canonical('/arbitrage') },
          ]),
          faqJsonLd(ARB_FAQS),
        ]}
      />
      <Navbar />

      <main className="container-px mx-auto max-w-6xl py-16">
        <header className="max-w-3xl">
          <div className="text-xs uppercase tracking-widest text-brand-accent">Arbitrage</div>
          <h1 className="mt-2 text-4xl sm:text-5xl font-extrabold">
            Live sports arbitrage, in real time
          </h1>
          <p className="mt-4 text-brand-muted text-lg">
            Valor Odds scans every major sportsbook continuously and surfaces arbitrage
            opportunities — bets where the combined prices across outcomes guarantee a positive
            return. No spreadsheets, no lag.
          </p>
          <div className="mt-6 flex gap-3">
            <Link href="/auth/signup" className="btn-primary px-6 py-3 text-base">
              Start free
            </Link>
            <Link href="/pricing" className="btn-secondary px-6 py-3 text-base">
              See pricing
            </Link>
          </div>
        </header>

        <section className="mt-12">
          <h2 className="text-2xl font-bold">Arbitrage by sport</h2>
          <p className="mt-2 text-brand-muted">
            Jump into live arbitrage opportunities for a specific sport.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SPORTS.map((s) => (
              <Link
                key={s.slug}
                href={`/arbitrage/${s.slug}`}
                className="block rounded-xl border border-brand-border bg-brand-surface p-5 hover:border-brand-accent transition-colors"
              >
                <div className="text-xs uppercase tracking-wider text-brand-accent">
                  {s.name}
                </div>
                <div className="mt-2 font-semibold">{s.fullName} arbitrage</div>
                <div className="mt-1 text-sm text-brand-muted">
                  Live sure bets across every tracked {s.name} sportsbook.
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-16 grid gap-6 lg:grid-cols-3">
          {[
            {
              title: 'Continuous scanning',
              body: 'Odds refresh continuously across every tracked sportsbook, and we recompute edge in real time.',
            },
            {
              title: 'Edge filters',
              body: 'Filter by minimum edge percentage, sport, market, and sportsbook so you only see arbs worth acting on.',
            },
            {
              title: 'Discord alerts',
              body: 'Opt in to push the best arbs directly to your Discord — Valor Odds runs the same engine across web and bot.',
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-brand-border bg-brand-surface p-6"
            >
              <h3 className="text-lg font-bold">{f.title}</h3>
              <p className="mt-2 text-sm text-brand-muted">{f.body}</p>
            </div>
          ))}
        </section>

        <section className="mt-16 max-w-3xl">
          <h2 className="text-2xl font-bold">Arbitrage betting FAQ</h2>
          <dl className="mt-4 divide-y divide-brand-border rounded-xl border border-brand-border bg-brand-surface">
            {ARB_FAQS.map((f, i) => (
              <div key={i} className="p-5">
                <dt className="font-semibold">{f.q}</dt>
                <dd className="mt-2 text-sm text-brand-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <Footer />
    </>
  );
}