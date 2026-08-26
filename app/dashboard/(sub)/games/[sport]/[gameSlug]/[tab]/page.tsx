import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { SPORTS } from '@/lib/seo';
import {
  getGameBySlug,
  isGamesHubSport,
  type GameCard,
} from '@/lib/games-data';
import GameHeader from '@/components/games/GameHeader';
import GameTabsNav, { GAME_TABS, type GameTabSlug } from '@/components/games/GameTabsNav';
import GameDetailsTab from '@/components/games/GameDetailsTab';
import GameOddsTab from '@/components/games/GameOddsTab';
import GameBoxScoreTab from '@/components/games/GameBoxScoreTab';
import GameStandingsTab from '@/components/games/GameStandingsTab';
import GameInjuriesTab from '@/components/games/GameInjuriesTab';
import GameFuturesTab from '@/components/games/GameFuturesTab';

/**
 * Dashboard per-game tabbed detail page: /dashboard/games/[sport]/[gameSlug]/[tab]
 *
 * Authed equivalent of the public tab page — same shared tab components,
 * dashboard chrome (via the (sub) route group + AuthedSidebarLayout), and
 * the BoxScore tab hits the authed box-score API.
 */
export const dynamic = 'force-dynamic';

type Params = { params: { sport: string; gameSlug: string; tab: string } };

function findSport(slug: string) {
  return SPORTS.find((s) => s.slug === slug);
}

function isValidTab(tab: string): tab is GameTabSlug {
  return GAME_TABS.some((t) => t.slug === tab);
}

function findSportSlug(code: string): string {
  return SPORTS.find((s) => s.code === code.toUpperCase())?.slug || code.toLowerCase();
}

function TabContent({ tab, game }: { tab: GameTabSlug; game: GameCard }) {
  switch (tab) {
    case 'details':
      return <GameDetailsTab game={game} injuriesHref={`/dashboard/games/${findSportSlug(game.sport)}/${encodeURIComponent(game.slug)}/injuries`} />;
    case 'odds':
      return <GameOddsTab game={game} />;
    case 'box-score':
      return <GameBoxScoreTab game={game} isDashboard />;
    case 'standings':
      return <GameStandingsTab game={game} />;
    case 'injuries':
      return <GameInjuriesTab game={game} />;
    case 'futures':
      return <GameFuturesTab />;
    default:
      return null;
  }
}

export default async function DashboardGameTabPage({ params }: Params) {
  const sport = findSport(params.sport);
  if (!sport || !isGamesHubSport(sport.code)) notFound();
  if (!isValidTab(params.tab)) {
    redirect(`/dashboard/games/${sport.slug}/${encodeURIComponent(params.gameSlug)}/details`);
  }
  const game = await getGameBySlug(sport.code, decodeURIComponent(params.gameSlug));
  if (!game) notFound();

  const basePath = `/dashboard/games/${sport.slug}/${encodeURIComponent(game.slug)}`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-4 flex items-center gap-2 text-sm text-brand-muted">
        <Link href="/dashboard/games/mlb" className="hover:text-brand-text">Games</Link>
        <span>/</span>
        <Link href={`/dashboard/games/${sport.slug}`} className="hover:text-brand-text">{sport.name}</Link>
        <span>/</span>
        <span className="truncate text-brand-text">{game.awayTeam} @ {game.homeTeam}</span>
      </div>

      {/* Sport switcher */}
      <div className="mb-4 flex gap-2">
        {SPORTS.filter((s) => isGamesHubSport(s.code)).map((s) => (
          <Link
            key={s.slug}
            href={`/dashboard/games/${s.slug}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${s.slug === sport.slug ? 'bg-brand-accent text-white' : 'bg-brand-surface text-brand-muted hover:text-brand-text'}`}
          >
            {s.name}
          </Link>
        ))}
      </div>

      <div className="space-y-6">
        <GameHeader game={game} />
        <GameTabsNav basePath={basePath} activeTab={params.tab} />
        <TabContent tab={params.tab} game={game} />
      </div>
    </div>
  );
}
