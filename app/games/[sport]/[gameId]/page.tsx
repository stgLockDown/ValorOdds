import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Navbar from '@/components/MarketingNavbar';
import Footer from '@/components/Footer';
import Breadcrumbs from '@/components/Breadcrumbs';
import {
  buildMetadata,
  sportsEventJsonLd,
  canonical,
  SITE,
  SPORTS,
} from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';
import { getGameById, fmtAmerican, impliedProb, teamSlug } from '@/lib/public-data';
import { formatTeamName } from '@/lib/espn-scores';

/**
 * Per-game landing page: /games/[sport]/[gameId]
 *
 * Long-tail SEO target: "Team A vs Team B odds", "Team A vs Team B prediction".
 * Each page carries a SportsEvent JSON-LD payload so it is eligible for
 * Google sports rich results, plus a best-price moneyline table and internal
 * links back to the sport hub, market pages, and both team hubs.
 *
 * Rendered with ISR (revalidate) and a no-prerender param set — pages are
 * generated on demand as crawlers/users hit them, then cached.
 */

export const revalidate = 120;
export const dynamicParams = true;

function findSport(slug: string) {
  return SPORTS.find((s) => s.slug === slug);
}

type Params = { params: { sport: string; gameId: string } };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const sport = findSport(params.sport);
  if (!sport) return { title: 'Game Not Found' };
  const gameId = decodeURIComponent(params.gameId);
  const game = await getGameById(sport.code, gameId);
  if (!game) {
    return buildMetadata({
      title: `${sport.name} Game Odds`,
      description: `Live ${sport.fullName} odds and matchup analysis from Valor Odds.`,
      path: `/games/${sport.slug}/${params.gameId}`,
      noindex: true,
    });
  }
  const awayName = formatTeamName(game.awayTeam);
  const homeName = formatTeamName(game.homeTeam);
  const title = `${awayName} vs ${homeName} Odds & Prediction`;
  const desc = `Live ${sport.name} odds for ${awayName} at ${homeName}: best moneyline prices across every major sportsbook, implied probabilities, and Valor Odds AI analysis.`;
  return buildMetadata({
    title,
    description: desc,
    path: `/games/${sport.slug}/${encodeURIComponent(gameId)}`,
    keywords: [
      `${awayName} vs ${homeName}`,
      `${awayName} ${homeName} odds`,
      `${sport.name.toLowerCase()} odds`,
      `${homeName} odds`,
      `${awayName} odds`,
    ],
    image: `/api/og?title=${encodeURIComponent(`${awayName} @ ${homeName}`)}&subtitle=${encodeURIComponent('Live odds across every sportsbook')}&kicker=${encodeURIComponent(sport.name)}`,
  });
}

function formatGameTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'long',
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

export default async function GamePage({ params }: Params) {
  const sport = findSport(params.sport);
  if (!sport) notFound();
  const gameId = decodeURIComponent(params.gameId);
  const game = await getGameById(sport.code, gameId);
  if (!game) notFound();

  const awayName = formatTeamName(game.awayTeam);
  const homeName = formatTeamName(game.homeTeam);
  const matchup = `${awayName} vs ${homeName}`;
  const url = canonical(`/games/${sport.slug}/${encodeURIComponent(gameId)}`);

  const eventLd = sportsEventJsonLd({
    name: `${awayName} at ${homeName}`,
    url,
    startDate: game.commenceTime,
    homeTeam: homeName,
    awayTeam: awayName,
    sport: sport.fullName,
  });

  return (
    <>
      <JsonLd data={eventLd} />
      <Navbar />

      <main className="container-px mx-auto max-w-5xl py-12">
        <Breadcrumbs
          items={[
            { name: 'Home', url: canonical('/') },
            { name: 'Sports', url: canonical('/sports') },
            { name: sport.name, url: canonical(`/sports/${sport.slug}`) },
            { name: matchup, url },
          ]}
        />

        <header className="max-w-3xl">
          <div className="text-xs uppercase tracking-widest text-brand-accent">
            {sport.fullName} · {formatGameTime(game.commenceTime)}
          </div>
          <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold leading-tight">
            {awayName} vs {homeName} odds
          </h1>
          <p className="mt-4 text-brand-muted text-lg">
            The best available moneyline prices for {awayName} at{' '}
            {homeName}, compared in real time across every major sportsbook.
            Valor Odds tracks every line from open to close so you can confirm you are beating the
            market.
          </p>
        </header>

        {game.bestMoneyline.length > 0 && (
          <section className="mt-10">
            <h2 className="text-2xl font-bold">Best moneyline prices</h2>
            <div className="mt-4 overflow-x-auto rounded-xl border border-brand-border">
              <table className="w-full text-sm">
                <thead className="bg-brand-surface">
                  <tr className="text-left">
                    <th className="p-3 font-semibold">Team</th>
                    <th className="p-3 font-semibold">Best price</th>
                    <th className="p-3 font-semibold">Implied win %</th>
                    <th className="p-3 font-semibold">Sportsbook</th>
                  </tr>
                </thead>
                <tbody>
                  {game.bestMoneyline.map((o, i) => (
                    <tr key={`${o.name}-${i}`} className="border-t border-brand-border">
                      <td className="p-3 font-semibold">{o.name}</td>
                      <td className="p-3 font-mono font-semibold text-brand-accent">
                        {fmtAmerican(o.price)}
                      </td>
                      <td className="p-3 text-brand-muted">
                        {(impliedProb(o.price) * 100).toFixed(1)}%
                      </td>
                      <td className="p-3 text-brand-muted">{o.bookmaker}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-brand-muted">
              Prices refresh every couple of minutes. Implied win % is derived from the listed
              American odds before removing the sportsbook&apos;s margin.
            </p>
          </section>
        )}

        {/* Internal links */}
        <section className="mt-12">
          <h2 className="text-2xl font-bold">More {sport.name} odds &amp; markets</h2>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link href={`/sports/${sport.slug}/odds/moneyline`} className="badge-secondary">
              {sport.name} moneyline
            </Link>
            <Link href={`/sports/${sport.slug}/odds/spread`} className="badge-secondary">
              {sport.name} spreads
            </Link>
            <Link href={`/sports/${sport.slug}/odds/totals`} className="badge-secondary">
              {sport.name} totals
            </Link>
            <Link href={`/sports/${sport.slug}/odds/player-props`} className="badge-secondary">
              {sport.name} player props
            </Link>
            <Link href={`/arbitrage/${sport.slug}`} className="badge-secondary">
              {sport.name} arbitrage
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link
              href={`/sports/${sport.slug}/teams/${teamSlug(game.awayTeam)}`}
              className="text-brand-accent hover:underline"
            >
              {awayName} schedule &amp; odds →
            </Link>
            <Link
              href={`/sports/${sport.slug}/teams/${teamSlug(game.homeTeam)}`}
              className="text-brand-accent hover:underline"
            >
              {homeName} schedule &amp; odds →
            </Link>
          </div>
        </section>

        <section className="mt-16 prose-chat max-w-3xl">
          <h2 className="text-2xl font-bold">
            {awayName} vs {homeName}: how to find the edge
          </h2>
          <p className="mt-3 text-brand-muted">
            Valor Odds is a betting intelligence platform, not a sportsbook. For this {sport.name}{' '}
            matchup we compare every book&apos;s price side by side, surface arbitrage and +EV
            opportunities the moment they appear, and layer AI player-prop analysis on top. Shopping
            for the best number on {awayName} or {homeName} before you bet is the single
            most reliable way to grow your long-term return.
          </p>
        </section>
      </main>

      <Footer />
    </>
  );
}
