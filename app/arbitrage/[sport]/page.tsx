import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Navbar from '@/components/MarketingNavbar';
import Footer from '@/components/Footer';
import {
  buildMetadata,
  breadcrumbJsonLd,
  canonical,
  SPORTS,
} from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';
import { getArbStatsBySport } from '@/lib/public-data';

/**
 * Per-sport arbitrage landing: /arbitrage/[sport]
 *
 * Captures queries like "mlb arbitrage betting", "nba sure bets", etc.
 * Live arb feed lives behind auth in the dashboard; this page is a
 * conversion-focused public surface with a 24h stat badge.
 */

export const revalidate = 300;

export async function generateStaticParams() {
  return SPORTS.map((s) => ({ sport: s.slug }));
}

type Params = { params: { sport: string } };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const sport = SPORTS.find((s) => s.slug === params.sport);
  if (!sport) return { title: 'Not Found' };
  const title = `${sport.name} Arbitrage Betting — Live Sure Bets`;
  const desc = `Find live ${sport.fullName} arbitrage opportunities in real time across every major sportsbook. Valor Odds scans continuously so you can lock in a profit across every outcome on ${sport.name} markets.`;
  return buildMetadata({
    title,
    description: desc,
    path: `/arbitrage/${sport.slug}`,
    keywords: [
      `${sport.name.toLowerCase()} arbitrage`,
      `${sport.name.toLowerCase()} sure bets`,
      `${sport.name.toLowerCase()} arb betting`,
      `${sport.name.toLowerCase()} arbitrage calculator`,
      `${sport.name.toLowerCase()} middling`,
    ],
    image: `/api/og?title=${encodeURIComponent(`${sport.name} Arbitrage`)}&subtitle=${encodeURIComponent('Live sure bets across every sportsbook')}&kicker=${encodeURIComponent(sport.name)}`,
  });
}

export default async function SportArbitragePage({ params }: Params) {
  const sport = SPORTS.find((s) => s.slug === params.sport);
  if (!sport) notFound();

  const stats = await getArbStatsBySport(sport.code);

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', url: canonical('/') },
          { name: 'Arbitrage', url: canonical('/arbitrage') },
          { name: sport.name, url: canonical(`/arbitrage/${sport.slug}`) },
        ])}
      />
      <Navbar />

      <main className="container-px mx-auto max-w-5xl py-16">
        <nav aria-label="Breadcrumb" className="text-xs text-brand-muted mb-6">
          <Link href="/" className="hover:underline">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/arbitrage" className="hover:underline">Arbitrage</Link>
          <span className="mx-2">/</span>
          <span className="text-white">{sport.name}</span>
        </nav>

        <header className="max-w-3xl">
          <div className="text-xs uppercase tracking-widest text-brand-accent">
            {sport.fullName}
          </div>
          <h1 className="mt-2 text-4xl sm:text-5xl font-extrabold leading-tight">
            {sport.name} arbitrage betting
          </h1>
          <p className="mt-4 text-brand-muted text-lg">
            Valor Odds surfaces live {sport.name} arbitrage opportunities in real time —
            continuously scanning every major sportsbook so you can bet on all outcomes across
            different sportsbooks and lock in an edge. Line movement, bet limits, and timing can
            reduce or eliminate that edge, so no outcome is guaranteed.
          </p>

          {stats.last24h > 0 ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-brand-border bg-brand-surface p-5">
                <div className="text-xs uppercase tracking-wider text-brand-muted">
                  Last 24 hours
                </div>
                <div className="mt-1 text-3xl font-extrabold text-brand-accent">
                  {stats.last24h}
                </div>
                <div className="text-sm text-brand-muted">
                  {sport.name} arbitrage opportunities surfaced
                </div>
              </div>
              {stats.avgEdgePct != null && (
                <div className="rounded-xl border border-brand-border bg-brand-surface p-5">
                  <div className="text-xs uppercase tracking-wider text-brand-muted">
                    Avg edge
                  </div>
                  <div className="mt-1 text-3xl font-extrabold text-brand-accent">
                    {stats.avgEdgePct.toFixed(2)}%
                  </div>
                  <div className="text-sm text-brand-muted">
                    Across surfaced {sport.name} arbs
                  </div>
                </div>
              )}
            </div>
          ) : null}

          <div className="mt-6 flex gap-3">
            <Link href="/auth/signup" className="btn-primary px-6 py-3 text-base">
              Start free
            </Link>
            <Link
              href={`/sports/${sport.slug}`}
              className="btn-secondary px-6 py-3 text-base"
            >
              {sport.name} odds hub
            </Link>
          </div>
        </header>

        <section className="mt-14 prose-chat">
          <h2 className="text-2xl font-bold">Why {sport.name} is great for arbitrage</h2>
          <p className="mt-3 text-brand-muted">
            {sport.name} has deep market liquidity across dozens of sportsbooks, which means
            prices disagree constantly. Those disagreements are the raw material for arbitrage.
            Valor Odds watches every major book and surfaces the combinations where the combined
            implied probability falls below 100% — the mathematical definition of a sure bet.
          </p>
          <h2 className="mt-10 text-2xl font-bold">How the scan works</h2>
          <ol className="mt-3 list-decimal pl-6 space-y-2 text-brand-muted">
            <li>
              We pull live odds from every tracked sportsbook offering {sport.name} markets.
            </li>
            <li>
              For each game, we find the best price available per outcome across all books.
            </li>
            <li>
              If the sum of implied probabilities across outcomes is under 100%, the gap is the
              guaranteed edge — we surface it instantly.
            </li>
            <li>
              You get the stakes to place at each book to realize the arbitrage, plus a direct
              link to the book.
            </li>
          </ol>
        </section>
      </main>

      <Footer />
    </>
  );
}