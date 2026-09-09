/**
 * GameNewsTab — per-game news tab. Fetches sport news and filters to articles
 * tagged with either team; falls back to showing the latest sport headlines
 * when no team-tagged articles exist (offseason, preseason, etc.).
 */

import { getGameNews, getSportNews, type NewsArticle } from '@/lib/espn-news';
import NewsReel from '@/components/NewsReel';
import type { GameCard } from '@/lib/games-data';

export default async function GameNewsTab({ game }: { game: GameCard }) {
  const [teamNews, sportNews] = await Promise.all([
    getGameNews(game.sport, game.homeTeam, game.awayTeam, 6),
    getSportNews(game.sport, 6),
  ]);

  const articles: NewsArticle[] = teamNews.length > 0 ? teamNews : sportNews;

  if (articles.length === 0) {
    return (
      <div className="rounded-xl border border-brand-border bg-brand-surface p-8 text-center text-brand-muted">
        No news available for {game.awayTeam} @ {game.homeTeam} right now. Check back later.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {teamNews.length > 0 ? (
        <NewsReel
          articles={teamNews}
          title={`${game.awayTeam} @ ${game.homeTeam} — News`}
          subtitle={`Latest headlines mentioning either team`}
        />
      ) : (
        <NewsReel
          articles={sportNews}
          title={`${game.sport} News`}
          subtitle={`No team-specific headlines yet — latest from around the league`}
        />
      )}
    </div>
  );
}
