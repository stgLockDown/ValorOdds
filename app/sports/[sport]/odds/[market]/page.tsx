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
  MARKETS,
} from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';
import { getBestOddsBySportMarket, fmtAmerican } from '@/lib/public-data';

/**
 * Programmatic market page: /sports/[sport]/odds/[market]
 *
 * Targets long-tail search ("nba moneyline odds today", "nfl spread picks",
 * "mlb totals odds") — the exact long-tail pattern that DraftKings and
 * FanDuel blanket the SERP with. ISR every 2 minutes for freshness.
 */

export const revalidate = 120;

/**
 * Map our friendly slug (moneyline / spread / totals / ...) to the market
 * type string used by odds_snapshots. We keep the DB-facing codes narrow
 * (h2h / spreads / totals / player_props) so analytics stays clean.
 */
const MARKET_DB_CODE: Record<string, string | null> = {
  moneyline: 'h2h',
  spread: 'spreads',
  totals: 'totals',
  'player-props': 'player_props',
  'game-props': 'game_props',
  futures: 'futures',
  parlays: null, // derived, not a raw market — page still renders as an explainer
  live: null,
};

export async function generateStaticParams() {
  const params: { sport: string; market: string }[] = [];
  for (const s of SPORTS) {
    for (const m of MARKETS) {
      params.push({ sport: s.slug, market: m.slug });
    }
  }
  return params;
}

type Params = { params: { sport: string; market: string } };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const sport = SPORTS.find((s) => s.slug === params.sport);
  const market = MARKETS.find((m) => m.slug === params.market);
  if (!sport || !market) return { title: 'Not Found' };
  const title = `${sport.name} ${market.name} Odds — Live Prices`;
  const desc = `Compare live ${sport.name} ${market.name.toLowerCase()} odds across every major sportsbook. Find the best price, spot arbitrage opportunities, and track line movement with Valor Odds.`;
  return buildMetadata({
    title,
    description: desc,
    path: `/sports/${sport.slug}/odds/${market.slug}`,
    keywords: [
      `${sport.name.toLowerCase()} ${market.name.toLowerCase()} odds`,
      `${sport.name.toLowerCase()} ${market.name.toLowerCase()}`,
      `best ${sport.name.toLowerCase()} ${market.name.toLowerCase()} prices`,
      `${sport.name.toLowerCase()} betting lines`,
    ],
    image: `/api/og?title=${encodeURIComponent(`${sport.name} ${market.name}`)}&subtitle=${encodeURIComponent('Live odds across every sportsbook')}&kicker=${encodeURIComponent('Valor Odds')}`,
  });
}

function formatGameTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default async function MarketOddsPage({ params }: Params) {
  const sport = SPORTS.find((s) => s.slug === params.sport);
  const market = MARKETS.find((m) => m.slug === params.market);
  if (!sport || !market) notFound();

  const dbCode = MARKET_DB_CODE[market.slug] ?? null;
  const games = dbCode ? await getBestOddsBySportMarket(sport.code, dbCode, 25) : [];

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', url: canonical('/') },
          { name: 'Sports', url: canonical('/sports') },
          { name: sport.name, url: canonical(`/sports/${sport.slug}`) },
          {
            name: market.name,
            url: canonical(`/sports/${sport.slug}/odds/${market.slug}`),
          },
        ])}
      />
      <Navbar />

      <main className="container-px mx-auto max-w-7xl py-12">
        <nav aria-label="Breadcrumb" className="text-xs text-brand-muted mb-6">
          <Link href="/" className="hover:underline">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/sports" className="hover:underline">Sports</Link>
          <span className="mx-2">/</span>
          <Link href={`/sports/${sport.slug}`} className="hover:underline">
            {sport.name}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-white">{market.name}</span>
        </nav>

        <header className="max-w-3xl">
          <div className="text-xs uppercase tracking-widest text-brand-accent">
            {sport.fullName} · {market.name}
          </div>
          <h1 className="mt-2 text-4xl sm:text-5xl font-extrabold leading-tight">
            {sport.name} {market.name.toLowerCase()} odds
          </h1>
          <p className="mt-4 text-brand-muted text-lg">
            Compare live {sport.name} {market.name.toLowerCase()} prices across every major
            sportsbook. Valor Odds surfaces the best number per outcome in real time so you can
            shop your line before placing the bet.
          </p>
        </header>

        {/* Odds table */}
        <section className="mt-10">
          {dbCode == null ? (
            <div className="rounded-xl border border-brand-border bg-brand-surface p-6">
              <h2 className="text-xl font-bold">
                {market.name} coverage is rolling out per sport.
              </h2>
              <p className="mt-2 text-brand-muted">
                {market.description} In the meantime, explore {sport.name} moneyline, spread, and
                totals odds — all fully supported today.
              </p>
              <div className="mt-4 flex gap-2">
                <Link
                  href={`/sports/${sport.slug}/odds/moneyline`}
                  className="btn-secondary px-4 py-2 text-sm"
                >
                  {sport.name} moneyline
                </Link>
                <Link
                  href={`/sports/${sport.slug}/odds/spread`}
                  className="btn-secondary px-4 py-2 text-sm"
                >
                  {sport.name} spread
                </Link>
                <Link
                  href={`/sports/${sport.slug}/odds/totals`}
                  className="btn-secondary px-4 py-2 text-sm"
                >
                  {sport.name} totals
                </Link>
              </div>
            </div>
          ) : games.length === 0 ? (
            <p className="text-brand-muted">
              No upcoming {sport.name} {market.name.toLowerCase()} games are in the feed right
              now. Lines typically open 3–7 days before each event.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-brand-border">
              <table className="w-full text-sm">
                <thead className="bg-brand-surface">
                  <tr className="text-left">
                    <th className="p-3 font-semibold">Game</th>
                    <th className="p-3 font-semibold">Start</th>
                    <th className="p-3 font-semibold">Outcome</th>
                    {market.slug !== 'moneyline' && (
                      <th className="p-3 font-semibold">Line</th>
                    )}
                    <th className="p-3 font-semibold">Best price</th>
                    <th className="p-3 font-semibold">Sportsbook</th>
                  </tr>
                </thead>
                <tbody>
                  {games.flatMap((g) =>
                    g.outcomes.map((o, i) => (
                      <tr
                        key={`${g.gameId}-${o.name}-${i}`}
                        className="border-t border-brand-border"
                      >
                        <td className="p-3">
                          {g.awayTeam} <span className="text-brand-muted">@</span> {g.homeTeam}
                        </td>
                        <td className="p-3 text-brand-muted">{formatGameTime(g.commenceTime)}</td>
                        <td className="p-3">{o.name}</td>
                        {market.slug !== 'moneyline' && (
                          <td className="p-3 font-mono">
                            {o.point != null ? o.point.toFixed(1) : '—'}
                          </td>
                        )}
                        <td className="p-3 font-mono font-semibold text-brand-accent">
                          {fmtAmerican(o.price)}
                        </td>
                        <td className="p-3 text-brand-muted">{o.bookmaker}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* SEO copy */}
        <section className="mt-16 prose-chat max-w-3xl">
          <h2 className="text-2xl font-bold">
            How {market.name.toLowerCase()} betting works in {sport.name}
          </h2>
          <p className="mt-3 text-brand-muted">
            {market.description} In {sport.name}, {market.name.toLowerCase()} markets are priced
            continuously by every major sportsbook, but the numbers don't always agree. That
            disagreement is the edge sharp bettors hunt — and it's exactly what Valor Odds
            surfaces automatically. Instead of flipping between five tabs to shop a line, you see
            the best price per outcome in one table, updated in real time.
          </p>
          <p className="mt-3 text-brand-muted">
            Want to push further? Subscribe to Premium to unlock arbitrage alerts, +EV filters,
            and AI-powered player-prop analysis built for {sport.name}.
          </p>
        </section>
      </main>

      <Footer />
    </>
  );
}