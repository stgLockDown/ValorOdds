import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import Navbar from '@/components/MarketingNavbar';
import Footer from '@/components/Footer';
import Breadcrumbs from '@/components/Breadcrumbs';
import { buildMetadata, canonical, SPORTS } from '@/lib/seo';
import { getGamesGrid, isGamesHubSport, fmtAmerican, type GameCard } from '@/lib/games-data';

/**
 * Games Hub grid page: /games/[sport]
 *
 * Card-grid view of every upcoming/live MLB or NFL game — team logos, best
 * moneyline/spread/total across every tracked sportsbook, and a live status
 * badge. Each card links into the tabbed per-game detail page
 * (/games/[sport]/[gameSlug]/[tab]).
 *
 * ISR-rendered; short revalidate window since live scores/odds change fast.
 */

export const revalidate = 60;
export const dynamicParams = true;

function findSport(slug: string) {
  return SPORTS.find((s) => s.slug === slug);
}

type Params = { params: { sport: string } };

export async function generateStaticParams() {
  return SPORTS.filter((s) => isGamesHubSport(s.code)).map((s) => ({ sport: s.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const sport = findSport(params.sport);
  if (!sport || !isGamesHubSport(sport.code)) return { title: 'Games Not Found' };
  const title = `${sport.name} Games Today — Live Scores, Odds & Box Scores`;
  const desc = `Every upcoming and live ${sport.fullName} game with team logos, moneyline/spread/total odds compared across every major sportsbook, and live box scores updated by ${sport.code === 'MLB' ? 'inning' : 'quarter'}.`;
  return buildMetadata({
    title,
    description: desc,
    path: `/games/${sport.slug}`,
    keywords: [
      `${sport.name.toLowerCase()} games today`,
      `${sport.name.toLowerCase()} scores`,
      `${sport.name.toLowerCase()} odds`,
      `${sport.name.toLowerCase()} box scores`,
    ],
    image: `/api/og?title=${encodeURIComponent(`${sport.name} Games`)}&subtitle=${encodeURIComponent('Live scores, odds & box scores')}&kicker=${encodeURIComponent('Valor Odds')}`,
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

function TeamLogo({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return (
      <div className="h-10 w-10 shrink-0 rounded-full bg-brand-elevated flex items-center justify-center text-[10px] text-brand-muted">
        {alt.slice(0, 3).toUpperCase()}
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={40}
      height={40}
      className="h-10 w-10 shrink-0 object-contain"
      unoptimized
    />
  );
}

function StatusPill({ game }: { game: GameCard }) {
  if (game.status === 'live') {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-brand-danger/20 px-2 py-0.5 text-[11px] font-semibold text-red-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
        LIVE {game.statusDetail ? `• ${game.statusDetail}` : ''}
      </span>
    );
  }
  if (game.status === 'final') {
    return (
      <span className="rounded bg-brand-elevated px-2 py-0.5 text-[11px] font-semibold text-brand-muted">
        FINAL
      </span>
    );
  }
  return (
    <span className="text-[11px] text-brand-muted">{formatGameTime(game.commenceTime)}</span>
  );
}

function GameCardTile({ game, sportSlug }: { game: GameCard; sportSlug: string }) {
  const ml = game.bestMoneyline;
  const spread = game.bestSpread;
  const total = game.bestTotal;
  const showScores = game.status !== 'scheduled';

  return (
    <Link
      href={`/games/${sportSlug}/${encodeURIComponent(game.slug)}`}
      className="block rounded-xl border border-brand-border bg-brand-surface p-4 transition-colors hover:border-brand-accent"
    >
      <div className="flex items-center justify-between">
        <StatusPill game={game} />
        {game.nBooks > 0 && (
          <span className="text-[11px] text-brand-muted">{game.nBooks} books</span>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {[
          { team: game.awayTeam, logo: game.awayLogo, score: game.awayScore, ml: ml[0], sp: spread[0] },
          { team: game.homeTeam, logo: game.homeLogo, score: game.homeScore, ml: ml[1], sp: spread[1] },
        ].map((row) => (
          <div key={row.team} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <TeamLogo src={row.logo} alt={row.team} />
              <span className="truncate font-semibold text-sm">{row.team}</span>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {showScores && (
                <span className="text-lg font-bold tabular-nums">{row.score}</span>
              )}
              <span className="w-14 text-right font-mono text-xs text-brand-accent">
                {row.ml?.price != null ? fmtAmerican(row.ml.price) : '—'}
              </span>
              <span className="hidden w-16 text-right font-mono text-xs text-brand-muted sm:inline">
                {row.sp?.point != null
                  ? `${row.sp.point > 0 ? '+' : ''}${row.sp.point} (${fmtAmerican(row.sp.price)})`
                  : '—'}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-brand-border pt-3 text-xs text-brand-muted">
        <span>
          O/U{' '}
          {total[0]?.point != null ? (
            <span className="font-mono text-brand-text">{total[0].point}</span>
          ) : (
            '—'
          )}
        </span>
        <span className="font-semibold text-brand-accent">View Details →</span>
      </div>
    </Link>
  );
}

export default async function GamesHubPage({ params }: Params) {
  const sport = findSport(params.sport);
  if (!sport || !isGamesHubSport(sport.code)) notFound();

  const games = await getGamesGrid(sport.code, 60);
  const live = games.filter((g) => g.status === 'live');
  const upcoming = games.filter((g) => g.status === 'scheduled');
  const final = games.filter((g) => g.status === 'final');

  return (
    <>
      <Navbar />
      <main className="container-px mx-auto max-w-6xl py-12">
        <Breadcrumbs
          items={[
            { name: 'Home', url: canonical('/') },
            { name: 'Sports', url: canonical('/sports') },
            { name: sport.name, url: canonical(`/sports/${sport.slug}`) },
            { name: 'Games', url: canonical(`/games/${sport.slug}`) },
          ]}
        />

        <header className="max-w-3xl">
          <div className="text-xs uppercase tracking-widest text-brand-accent">
            {sport.fullName}
          </div>
          <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold leading-tight">
            {sport.name} Games — Live Scores &amp; Odds
          </h1>
          <p className="mt-4 text-brand-muted text-lg">
            Every upcoming and live {sport.fullName} matchup with team logos, the best
            moneyline, spread, and total prices across every major sportsbook we track, and
            live box scores by {sport.code === 'MLB' ? 'inning' : 'quarter'} once the game
            starts.
          </p>
        </header>

        {games.length === 0 ? (
          <div className="mt-10 rounded-xl border border-brand-border bg-brand-surface p-8 text-center text-brand-muted">
            No {sport.name} games in the current window. Check back closer to the next slate.
          </div>
        ) : (
          <div className="mt-10 space-y-10">
            {live.length > 0 && (
              <section>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Live now
                </h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {live.map((g) => (
                    <GameCardTile key={g.gameId} game={g} sportSlug={sport.slug} />
                  ))}
                </div>
              </section>
            )}

            {upcoming.length > 0 && (
              <section>
                <h2 className="text-xl font-bold">Upcoming</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {upcoming.map((g) => (
                    <GameCardTile key={g.gameId} game={g} sportSlug={sport.slug} />
                  ))}
                </div>
              </section>
            )}

            {final.length > 0 && (
              <section>
                <h2 className="text-xl font-bold">Final</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {final.map((g) => (
                    <GameCardTile key={g.gameId} game={g} sportSlug={sport.slug} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        <section className="mt-16 flex flex-wrap gap-3 text-sm">
          <Link href={`/sports/${sport.slug}/odds/moneyline`} className="badge-secondary">
            {sport.name} moneyline odds
          </Link>
          <Link href={`/sports/${sport.slug}/odds/spread`} className="badge-secondary">
            {sport.name} spreads
          </Link>
          <Link href={`/sports/${sport.slug}/odds/totals`} className="badge-secondary">
            {sport.name} totals
          </Link>
          <Link href={`/dd`} className="badge-secondary">
            DiamondDraft {sport.name} fantasy
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
