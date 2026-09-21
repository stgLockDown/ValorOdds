'use client';

import { useEffect, useState } from 'react';
import GameWinPoll from '@/components/live/GameWinPoll';
import LiveFeed from '@/components/live/LiveFeed';
import type { GameCard } from '@/lib/games-data';

/**
 * Live tab — mounted under the existing Games section tab bar (not a
 * separate nav entry, per product decision). Shows the community
 * "who will win?" vote widget above the real-time play-by-play feed.
 * Works identically on the public marketing pages and the logged-in
 * dashboard; only the comment-composer changes based on session state,
 * which we resolve client-side via NextAuth's session endpoint (same
 * pattern as components/NavbarAuth.tsx) so this stays a static-friendly
 * client island rather than forcing the whole page dynamic.
 */
export default function GameLiveTab({ game }: { game: GameCard }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/session', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setIsLoggedIn(Boolean(data?.user));
      })
      .catch(() => {
        if (!cancelled) setIsLoggedIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <GameWinPoll
        gameId={game.gameId}
        sport={game.sport}
        homeTeam={game.homeTeam}
        awayTeam={game.awayTeam}
        commenceTime={game.commenceTime}
      />
      <LiveFeed
        sport={game.sport}
        homeTeam={game.homeTeam}
        awayTeam={game.awayTeam}
        espnEventId={game.espnEventId}
        isLoggedIn={isLoggedIn}
      />
    </div>
  );
}
