import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { SPORTS } from '@/lib/seo';
import { getGamesGrid, isGamesHubSport, fmtAmerican, type GameCard } from '@/lib/games-data';

/**
 * Dashboard Games Hub: /dashboard/games/[sport]
 *
 * Same underlying data (lib/games-data.ts) as the public /games/[sport]
 * page, rendered inside the authenticated dashboard chrome (AuthedSidebarLayout,
 * via the (sub) route group layout) with the app's `.card` styling instead of
 * the marketing page's bordered tiles.
 */

export const dynamic = 'force-dynamic';

type Params = { params: { sport: string } };

function findSport(slug: string) {
  return SPORTS.find((s) => s.slug === slug);
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

function TeamLogo({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return (
      <div className="h-9 w-9 shrink-0 rounded-full bg-brand-elevated flex items-center justify-center text-[10px] text-brand-muted">
        {alt.slice(0, 3).toUpperCase()}
      </div>
    );
  }
  return <Image src={src} alt={alt} width={36} height={36} className="h-9 w-9 shrink-0 object-contain" unoptimized />;
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
    return <span className="rounded bg-brand-elevated px-2 py-0.5 text-[11px] font-semibold text-brand-muted">FINAL</span>;
  }
  return <span className="text-[11px] text-brand-muted">{formatGameTime(game.commenceTime)}</span>;
}

function GameCardTile({ game, sportSlug }: { game: GameCard; sportSlug: string }) {
  const ml = game.bestMoneyline;
  const spread = game.bestSpread;
  const total = game.bestTotal;
  const showScores = game.status !== 'scheduled';

  return (
    <Link href={`/dashboard/games/${sportSlug}/${encodeURIComponent(game.slug)}/details`} className="card card-interactive block">
      <div className="flex items-center justify-between">
        <StatusPill game={game} />
        {game.nBooks > 0 && <span className="text-[11px] text-brand-muted">{game.nBooks} books</span>}
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
              {showScores && <span className="text-lg font-bold tabular-nums">{row.score}</span>}
              <span className="w-14 text-right font-mono text-xs text-brand-accent">
                {row.ml?.price != null ? fmtAmerican(row.ml.price) : '—'}
              </span>
              <span className="hidden w-16 text-right font-mono text-xs text-brand-muted sm:inline">
                {row.sp?.point != null ? `${row.sp.point > 0 ? '+' : ''}${row.sp.point} (${fmtAmerican(row.sp.price)})` : '—'}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-brand-border pt-3 text-xs text-brand-muted">
        <span>O/U {total[0]?.point != null ? <span className="font-mono text-brand-text">{total[0].point}</span> : '—'}</span>
        <span className="font-semibold text-brand-accent">View Details →</span>
      </div>
    </Link>
  );
}

export default async function DashboardGamesHub({ params }: Params) {
  const sport = findSport(params.sport);
  if (!sport || !isGamesHubSport(sport.code)) notFound();

  const games = await getGamesGrid(sport.code, 60);
  const live = games.filter((g) => g.status === 'live');
  const upcoming = games.filter((g) => g.status === 'scheduled');
  const final = games.filter((g) => g.status === 'final');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{sport.name} Games</h1>
          <p className="text-brand-muted mt-1">
            Live scores, odds, and box scores for every {sport.fullName} matchup.
          </p>
        </div>
        <div className="flex gap-2">
          {SPORTS.filter((s) => isGamesHubSport(s.code)).map((s) => (
            <Link
              key={s.slug}
              href={`/dashboard/games/${s.slug}`}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                s.slug === sport.slug
                  ? 'bg-brand-primary text-white'
                  : 'bg-brand-elevated text-brand-muted hover:text-brand-text'
              }`}
            >
              {s.name}
            </Link>
          ))}
        </div>
      </div>

      {games.length === 0 ? (
        <div className="card text-center text-brand-muted py-10">
          No {sport.name} games in the current window. Check back closer to the next slate.
        </div>
      ) : (
        <div className="space-y-8">
          {live.length > 0 && (
            <section>
              <h2 className="text-lg font-bold flex items-center gap-2 mb-3">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Live now
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {live.map((g) => (
                  <GameCardTile key={g.gameId} game={g} sportSlug={sport.slug} />
                ))}
              </div>
            </section>
          )}
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-lg font-bold mb-3">Upcoming</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {upcoming.map((g) => (
                  <GameCardTile key={g.gameId} game={g} sportSlug={sport.slug} />
                ))}
              </div>
            </section>
          )}
          {final.length > 0 && (
            <section>
              <h2 className="text-lg font-bold mb-3">Final</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {final.map((g) => (
                  <GameCardTile key={g.gameId} game={g} sportSlug={sport.slug} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
