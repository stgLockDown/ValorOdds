'use client';

import { useEffect, useState } from 'react';
import { Pin, PinOff, Loader2 } from 'lucide-react';
import { ensurePushSubscription, isPushSupported } from '@/lib/push-client';

export type PinGameInfo = {
  gameId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  homeAbbrev?: string | null;
  awayAbbrev?: string | null;
  espnEventId?: string | null;
  gameDate?: string | null;
};

type Props = {
  game: PinGameInfo;
  /** Render compact (icon only) for dense cards. */
  compact?: boolean;
  className?: string;
};

/**
 * "Pin to pull-down" button. Pins a game so the user gets a persistent phone
 * notification with the live box score + big plays. On first pin it requests
 * notification permission and subscribes the browser to Web Push.
 */
export default function PinGameButton({ game, compact = false, className = '' }: Props) {
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(isPushSupported());
    // Check current pin state.
    fetch('/api/games/pinned')
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => {
        const list = Array.isArray(j?.data) ? j.data : [];
        setPinned(list.some((g: any) => g.game_id === game.gameId));
      })
      .catch(() => {});
  }, [game.gameId]);

  if (!supported) return null;

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      if (pinned) {
        await fetch(`/api/games/${encodeURIComponent(game.gameId)}/pin`, { method: 'DELETE' });
        setPinned(false);
      } else {
        // Ensure push permission + subscription first.
        const sub = await ensurePushSubscription();
        if (!sub) {
          // Permission denied — surface a hint.
          alert('Enable notifications in your browser to pin live scores to your pull-down shade.');
          return;
        }
        const res = await fetch(`/api/games/${encodeURIComponent(game.gameId)}/pin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sport: game.sport,
            home_team: game.homeTeam,
            away_team: game.awayTeam,
            home_abbrev: game.homeAbbrev ?? null,
            away_abbrev: game.awayAbbrev ?? null,
            espn_event_id: game.espnEventId ?? null,
            game_date: game.gameDate ?? null,
          }),
        });
        if (res.ok) setPinned(true);
      }
    } finally {
      setBusy(false);
    }
  }

  const Icon = busy ? Loader2 : pinned ? PinOff : Pin;
  const label = pinned ? 'Unpin score' : 'Pin to pull-down';

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={label}
      aria-label={label}
      aria-pressed={pinned}
      className={
        compact
          ? `inline-flex items-center justify-center rounded-md p-1.5 transition-colors ${
              pinned
                ? 'text-brand-accent bg-brand-accent/10'
                : 'text-brand-muted hover:text-brand-text hover:bg-brand-elevated'
            } disabled:opacity-50 ${className}`
          : `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              pinned ? 'btn-primary' : 'btn-ghost'
            } disabled:opacity-50 ${className}`
      }
    >
      <Icon className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
      {!compact && <span>{label}</span>}
    </button>
  );
}
