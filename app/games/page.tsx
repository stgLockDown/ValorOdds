import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/MarketingNavbar';
import Footer from '@/components/Footer';
import { buildMetadata, breadcrumbJsonLd, canonical, SPORTS } from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';

export const metadata: Metadata = buildMetadata({
  title: 'Sports Hub \u2014 Every Game, Every Market, Live',
  description:
    'Browse every upcoming game across MLB, NFL, NBA, NHL, NCAA, soccer, UFC, tennis, and boxing. Live odds, AI picks, and real-time arbitrage opportunities for each matchup.',
  path: '/games',
  keywords: [
    'sports games today',
    'upcoming games by sport',
    'live odds games',
    'sports betting hub',
  ],
});

export default function GamesIndexPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', url: canonical('/') },
          { name: 'Games', url: canonical('/games') },
        ])}
      />
      <Navbar />
      <main className="container-px mx-auto max-w-7xl py-16">
        <header className="max-w-3xl">
          <div className="text-xs uppercase tracking-widest text-brand-accent">Sports Hub</div>
          <h1 className="mt-2 text-4xl sm:text-5xl font-extrabold">
            Every game. Every market. Live.
          </h1>
          <p className="mt-4 text-brand-muted text-lg">
            Pick a sport to see upcoming games with live odds, best lines across sportsbooks,
            and AI analysis for every matchup \u2014 all in one place.
          </p>
        </header>

        <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SPORTS.map((s) => (
            <Link
              key={s.slug}
              href={`/games/${s.slug}`}
              className="block rounded-xl border border-brand-border bg-brand-surface p-6 hover:border-brand-accent transition-colors"
            >
              <div className="text-xs uppercase tracking-wider text-brand-accent">{s.name}</div>
              <h2 className="mt-2 text-xl font-bold">{s.fullName}</h2>
              <p className="mt-2 text-sm text-brand-muted">
                Upcoming {s.name} games, live odds, and AI picks.
              </p>
              <span className="mt-4 inline-block text-sm text-brand-accent">View games \u2192</span>
            </Link>
          ))}
        </section>
      </main>
      <Footer />
    </>
  );
}
