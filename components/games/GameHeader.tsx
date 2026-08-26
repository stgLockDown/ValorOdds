import Image from 'next/image';
import type { GameCard } from '@/lib/games-data';

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

function TeamLogo({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return (
      <div className="h-16 w-16 shrink-0 rounded-full bg-brand-elevated flex items-center justify-center text-xs text-brand-muted">
        {alt.slice(0, 3).toUpperCase()}
      </div>
    );
  }
  return <Image src={src} alt={alt} width={64} height={64} className="h-16 w-16 shrink-0 object-contain" unoptimized />;
}

/** Shared matchup header used at the top of every tab. */
export default function GameHeader({ game }: { game: GameCard }) {
  const showScores = game.status !== 'scheduled';
  return (
    <div className="rounded-xl border border-brand-border bg-brand-surface p-5">
      <div className="flex items-center justify-between text-xs">
        {game.status === 'live' ? (
          <span className="inline-flex items-center gap-1 rounded bg-brand-danger/20 px-2 py-0.5 font-semibold text-red-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
            LIVE {game.statusDetail ? `• ${game.statusDetail}` : ''}
          </span>
        ) : game.status === 'final' ? (
          <span className="rounded bg-brand-elevated px-2 py-0.5 font-semibold text-brand-muted">FINAL</span>
        ) : (
          <span className="text-brand-muted">{formatGameTime(game.commenceTime)}</span>
        )}
        {game.nBooks > 0 && <span className="text-brand-muted">{game.nBooks} sportsbooks tracked</span>}
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <TeamLogo src={game.awayLogo} alt={game.awayTeam} />
          <span className="font-semibold">{game.awayTeam}</span>
          {showScores && <span className="text-3xl font-bold tabular-nums">{game.awayScore}</span>}
        </div>
        <div className="text-brand-muted text-sm font-medium">@</div>
        <div className="flex flex-col items-center gap-2 text-center">
          <TeamLogo src={game.homeLogo} alt={game.homeTeam} />
          <span className="font-semibold">{game.homeTeam}</span>
          {showScores && <span className="text-3xl font-bold tabular-nums">{game.homeScore}</span>}
        </div>
      </div>
    </div>
  );
}
