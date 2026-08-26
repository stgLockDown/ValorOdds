import BoxScore from '@/components/BoxScore';
import type { GameCard } from '@/lib/games-data';

/**
 * Box Score tab — reuses the existing (client) BoxScore component, pointed
 * at the public box-score API so it works on both the public marketing site
 * and the logged-in dashboard. Auto-refreshes while the game is live.
 */
export default function GameBoxScoreTab({ game, isDashboard }: { game: GameCard; isDashboard?: boolean }) {
  return (
    <BoxScore
      gameId={game.gameId}
      sport={game.sport}
      homeTeam={game.homeTeam}
      awayTeam={game.awayTeam}
      espnEventId={game.espnEventId}
      // Public pages hit the anonymous-safe API; dashboard hits the authed one
      // (the default apiBase in BoxScore.tsx).
      apiBase={isDashboard ? undefined : '/api/public/games'}
    />
  );
}
