import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Navbar from '@/components/MarketingNavbar';
import Footer from '@/components/Footer';
import Breadcrumbs from '@/components/Breadcrumbs';
import { buildMetadata, canonical, SPORTS } from '@/lib/seo';
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
 * Public per-game tabbed detail page: /games/[sport]/[gameSlug]/[tab]
 *
 * Tabs: details, odds, box-score, standings, injuries, futures (placeholder).
 * The slug-level page redirects here to the `details` tab.
 */
export const dynamic = 'force-dynamic';
export const dynamicParams = true;

type Params = { params: { sport: string; gameSlug: string; tab: string } };

function findSport(slug: string) {
  return SPORTS.find((s) => s.slug === slug);
}

export async function generateStaticParams() {
  // Return empty — pages are generated on-demand at runtime via ISR (revalidate=60).
  // Pre-rendering at build time requires DB access which can hang the build.
  return [];
}

function isValidTab(tab: string): tab is GameTabSlug {
  return GAME_TABS.some((t) => t.slug === tab);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const sport = findSport(params.sport);
  if (!sport || !isGamesHubSport(sport.code)) return { title: 'Game Not Found' };
  const game = await getGameBySlug(sport.code, decodeURIComponent(params.gameSlug));
  if (!game) return { title: 'Game Not Found' };
  const tabLabel = GAME_TABS.find((t) => t.slug === params.tab)?.label || 'Details';
  const title = `${game.awayTeam} @ ${game.homeTeam} — ${tabLabel} | ${sport.name}`;
  const desc = `${tabLabel} for ${game.awayTeam} at ${game.homeTeam} — ${sport.fullName} odds, box score, standings & injuries on Valor Odds.`;
  return buildMetadata({
    title,
    description: desc,
    path: `/games/${sport.slug}/${encodeURIComponent(game.slug)}/${params.tab}`,
    keywords: [`${game.awayTeam} vs ${game.homeTeam}`, `${sport.name.toLowerCase()} ${tabLabel.toLowerCase()}`],
  });
}

function TabContent({ tab, game }: { tab: GameTabSlug; game: GameCard }) {
  switch (tab) {
    case 'details':
      return <GameDetailsTab game={game} injuriesHref={`/games/${findSportSlug(game.sport)}/${encodeURIComponent(game.slug)}/injuries`} />;
    case 'odds':
      return <GameOddsTab game={game} />;
    case 'box-score':
      return <GameBoxScoreTab game={game} />;
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

function findSportSlug(code: string): string {
  return SPORTS.find((s) => s.code === code.toUpperCase())?.slug || code.toLowerCase();
}

export default async function GameTabPage({ params }: Params) {
  const sport = findSport(params.sport);
  if (!sport || !isGamesHubSport(sport.code)) notFound();
  if (!isValidTab(params.tab)) {
    redirect(`/games/${sport.slug}/${encodeURIComponent(params.gameSlug)}/details`);
  }
  const game = await getGameBySlug(sport.code, decodeURIComponent(params.gameSlug));
  if (!game) notFound();

  const basePath = `/games/${sport.slug}/${encodeURIComponent(game.slug)}`;

  return (
    <>
      <Navbar />
      <main className="container-px mx-auto max-w-5xl py-10">
        <Breadcrumbs
          items={[
            { name: 'Home', url: canonical('/') },
            { name: sport.name, url: canonical(`/games/${sport.slug}`) },
            { name: `${game.awayTeam} @ ${game.homeTeam}`, url: canonical(basePath) },
          ]}
        />

        <div className="mt-6 space-y-6">
          <GameHeader game={game} />
          <GameTabsNav basePath={basePath} activeTab={params.tab} />
          <TabContent tab={params.tab} game={game} />
        </div>
      </main>
      <Footer />
    </>
  );
}
