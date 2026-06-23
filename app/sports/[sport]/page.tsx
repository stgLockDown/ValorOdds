import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Navbar from '@/components/MarketingNavbar';
import Footer from '@/components/Footer';
import {
  buildMetadata,
  sportsEventJsonLd,
  canonical,
  SPORTS,
  MARKETS,
} from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';
import Breadcrumbs from '@/components/Breadcrumbs';
import {
  getUpcomingGamesBySport,
  getArbStatsBySport,
  fmtAmerican,
  getBestOddsBySportMarket,
  getTeamsBySport,
  teamSlug,
} from '@/lib/public-data';

/**
 * Per-sport hub page: /sports/[sport]
 *
 * SEO purpose: captures the fat head of sport-level queries ("nba odds",
 * "mlb betting", "nfl picks today") and internally links out to per-market
 * and per-game pages. Mirrors the "Sportsbook Home" pattern you see on
 * DraftKings / FanDuel but framed as an analytics product rather than a book.
 *
 * Rendering: Incremental Static Regeneration every 5 min. Stays crawlable
 * even if the upstream DB is down (we degrade to an empty games list).
 */

export const revalidate = 300;

export async function generateStaticParams() {
  return SPORTS.map((s) => ({ sport: s.slug }));
}

type Params = { params: { sport: string } };

function findSport(slug: string) {
  return SPORTS.find((s) => s.slug === slug);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const sport = findSport(params.sport);
  if (!sport) return { title: 'Not Found' };
  const title = `${sport.name} Odds, Picks & Arbitrage`;
  const desc = `Live ${sport.fullName} odds, player props, and real-time arbitrage opportunities across every major sportsbook. Powered by Valor Odds AI analysis.`;
  return buildMetadata({
    title,
    description: desc,
    path: `/sports/${sport.slug}`,
    keywords: [
      `${sport.name.toLowerCase()} odds`,
      `${sport.name.toLowerCase()} betting`,
      `${sport.name.toLowerCase()} picks`,
      `${sport.name.toLowerCase()} arbitrage`,
      `${sport.name.toLowerCase()} player props`,
      `best ${sport.name.toLowerCase()} odds today`,
    ],
    image: `/api/og?title=${encodeURIComponent(title)}&subtitle=${encodeURIComponent('Live odds · arbitrage · AI player props')}&kicker=${encodeURIComponent(sport.name)}`,
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
      timeZoneName: 'short',
    });
  } catch {
    return iso;
  }
}

export default async function SportHubPage({ params }: Params) {
  const sport = findSport(params.sport);
  if (!sport) notFound();

  const [games, arbStats, bestMoneyline, teams] = await Promise.all([
    getUpcomingGamesBySport(sport.code, 16),
    getArbStatsBySport(sport.code),
    getBestOddsBySportMarket(sport.code, 'h2h', 8),
    getTeamsBySport(sport.code),
  ]);

  const eventLd = games.slice(0, 10).map((g) =>
    sportsEventJsonLd({
      name: `${g.awayTeam} at ${g.homeTeam}`,
      url: canonical(`/games/${sport.slug}/${encodeURIComponent(g.gameId)}`),
      startDate: g.commenceTime,
      homeTeam: g.homeTeam,
      awayTeam: g.awayTeam,
      sport: sport.fullName,
    }),
  );

  return (
    <>
      <JsonLd data={eventLd} />
      <Navbar />

      <main className="container-px mx-auto max-w-7xl py-12">
        <Breadcrumbs
          items={[
            { name: 'Home', url: canonical('/') },
            { name: 'Sports', url: canonical('/sports') },
            { name: sport.name, url: canonical(`/sports/${sport.slug}`) },
          ]}
        />

        <header className="max-w-3xl">
          <div className="text-xs uppercase tracking-widest text-brand-accent">
            {sport.fullName}
          </div>
          <h1 className="mt-2 text-4xl sm:text-5xl font-extrabold leading-tight">
            {sport.name} odds, picks & arbitrage
          </h1>
          <p className="mt-4 text-brand-muted text-lg">
            Compare live {sport.name} odds across every major sportsbook, surface real-time
            arbitrage opportunities, and get AI-driven player prop insights. Updated continuously.
          </p>

          {arbStats.last24h > 0 && (
            <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-brand-border bg-brand-surface px-4 py-2 text-sm">
              <span className="h-2 w-2 rounded-full bg-brand-accent animate-pulse" />
              <span>
                <strong className="text-white">{arbStats.last24h}</strong> {sport.name} arbitrage
                opportunities surfaced in the last 24h
                {arbStats.avgEdgePct != null && (
                  <>
                    {' '}
                    (avg edge <strong>{arbStats.avgEdgePct.toFixed(2)}%</strong>)
                  </>
                )}
              </span>
            </div>
          )}
        </header>

        {/* Markets nav */}
        <section className="mt-10">
          <h2 className="text-2xl font-bold">{sport.name} markets</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {MARKETS.map((m) => (
              <Link
                key={m.slug}
                href={`/sports/${sport.slug}/odds/${m.slug}`}
                className="block rounded-xl border border-brand-border bg-brand-surface p-4 hover:border-brand-accent transition-colors"
              >
                <div className="font-semibold">{m.name}</div>
                <div className="mt-1 text-sm text-brand-muted">{m.description}</div>
              </Link>
            ))}
          </div>
        </section>

        {/* Upcoming games */}
        <section className="mt-12">
          <div className="flex items-baseline justify-between">
            <h2 className="text-2xl font-bold">Upcoming {sport.name} games</h2>
            <Link
              href={`/sports/${sport.slug}/odds/moneyline`}
              className="text-sm text-brand-accent hover:underline"
            >
              View all moneyline odds →
            </Link>
          </div>

          {games.length === 0 ? (
            <p className="mt-4 text-brand-muted">
              No upcoming {sport.name} games are in the feed right now. Check back soon —
              schedules and odds refresh continuously.
            </p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {games.map((g) => (
                <li
                  key={g.gameId}
                  className="rounded-xl border border-brand-border bg-brand-surface p-4"
                >
                  <div className="text-xs text-brand-muted">{formatGameTime(g.commenceTime)}</div>
                  <div className="mt-1 font-semibold">
                    {g.awayTeam}{' '}
                    <span className="text-brand-muted">@</span> {g.homeTeam}
                  </div>
                  <Link
                    href={`/games/${sport.slug}/${encodeURIComponent(g.gameId)}`}
                    className="mt-2 inline-block text-xs text-brand-accent hover:underline"
                  >
                    See odds →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Teams (internal linking to per-team hubs) */}
        {teams.length > 0 && (
          <section className="mt-12">
            <h2 className="text-2xl font-bold">{sport.name} teams</h2>
            <p className="mt-2 text-brand-muted text-sm">
              Jump to any team for its upcoming schedule and best available odds.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {teams.slice(0, 40).map((t) => (
                <Link
                  key={t}
                  href={`/sports/${sport.slug}/teams/${teamSlug(t)}`}
                  className="badge-secondary"
                >
                  {t}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Best moneyline snippets (SEO content body) */}
        {bestMoneyline.length > 0 && (
          <section className="mt-12">
            <h2 className="text-2xl font-bold">Best {sport.name} moneyline prices</h2>
            <p className="mt-2 text-brand-muted text-sm">
              Top price per outcome across all tracked sportsbooks. Prices update every few minutes.
            </p>
            <div className="mt-4 overflow-x-auto rounded-xl border border-brand-border">
              <table className="w-full text-sm">
                <thead className="bg-brand-surface">
                  <tr className="text-left">
                    <th className="p-3 font-semibold">Matchup</th>
                    <th className="p-3 font-semibold">Team</th>
                    <th className="p-3 font-semibold">Best price</th>
                    <th className="p-3 font-semibold">Sportsbook</th>
                  </tr>
                </thead>
                <tbody>
                  {bestMoneyline.flatMap((g) =>
                    g.outcomes.slice(0, 2).map((o, i) => (
                      <tr
                        key={`${g.gameId}-${o.name}-${i}`}
                        className="border-t border-brand-border"
                      >
                        <td className="p-3">
                          {g.awayTeam} @ {g.homeTeam}
                        </td>
                        <td className="p-3">{o.name}</td>
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
          </section>
        )}

        {/* SEO content block */}
        <section className="mt-16 prose-chat max-w-3xl">
          <h2 className="text-2xl font-bold">How to bet {sport.name} smarter with Valor Odds</h2>
          <p className="mt-3 text-brand-muted">
            Valor Odds is a sports betting intelligence platform, not a sportsbook. We compare
            prices across every major book in real time, surface arbitrage and +EV opportunities,
            and layer AI-driven player-prop analysis on top. For {sport.name} specifically, we
            track every line from opener to close so you can measure your closing line value and
            confirm you're beating the market.
          </p>
          <p className="mt-3 text-brand-muted">
            Whether you're a casual bettor looking for the best {sport.name} odds before you
            place a bet, or a sharp bettor measuring edge, the tools here compress hours of
            spreadsheet work into a few clicks. Use the market links above to dive into moneyline,
            spread, totals, and player-prop pages for {sport.name}.
          </p>
        </section>
      </main>

      <Footer />
    </>
  );
}