import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { buildMetadata, breadcrumbJsonLd, canonical, SPORTS } from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';

export const metadata: Metadata = buildMetadata({
  title: 'All Sports — Live Odds, Picks & Arbitrage',
  description:
    'Live odds, expert picks, and real-time arbitrage opportunities across MLB, NFL, NBA, NHL, NCAA, soccer, UFC, tennis, and boxing. One unified sports betting intelligence platform.',
  path: '/sports',
  keywords: [
    'live sports odds',
    'arbitrage by sport',
    'multi sport betting',
    'sports betting analytics',
  ],
});

export default function SportsIndexPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', url: canonical('/') },
          { name: 'Sports', url: canonical('/sports') },
        ])}
      />
      <Navbar />
      <main className="container-px mx-auto max-w-7xl py-16">
        <header className="max-w-3xl">
          <div className="text-xs uppercase tracking-widest text-brand-accent">Sports</div>
          <h1 className="mt-2 text-4xl sm:text-5xl font-extrabold">
            Live odds & arbitrage across every major sport
          </h1>
          <p className="mt-4 text-brand-muted text-lg">
            Pick a sport to see live odds, upcoming games, markets, and real-time arbitrage
            opportunities powered by Valor Odds' AI engine.
          </p>
        </header>

        <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SPORTS.map((s) => (
            <Link
              key={s.slug}
              href={`/sports/${s.slug}`}
              className="block rounded-xl border border-brand-border bg-brand-surface p-6 hover:border-brand-accent transition-colors"
            >
              <div className="text-xs uppercase tracking-wider text-brand-accent">
                {s.name}
              </div>
              <h2 className="mt-2 text-xl font-bold">{s.fullName}</h2>
              <p className="mt-2 text-sm text-brand-muted">
                Live {s.name} odds, arbitrage opportunities, and prop insights.
              </p>
              <span className="mt-4 inline-block text-sm text-brand-accent">Open hub →</span>
            </Link>
          ))}
        </section>
      </main>
      <Footer />
    </>
  );
}