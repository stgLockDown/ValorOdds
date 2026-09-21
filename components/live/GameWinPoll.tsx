'use client';

import { useEffect, useState, useCallback } from 'react';
import { Check, Trophy, Loader2 } from 'lucide-react';
import type { Poll, PollDTO } from '@/lib/polls-types';
import { formatTeamName } from '@/lib/espn-scores';

/**
 * Community "who will win?" vote widget scoped to a single game — shown at
 * the top of the Live Zone tab, before the play-by-play feed. Reuses the
 * same anonymous, fingerprint-deduped vote mechanics as the homepage
 * <CommunityPolls> widget, but backed by /api/polls/game (get-or-create a
 * single poll row) instead of the daily top-4 slate.
 */
export default function GameWinPoll({
  gameId,
  sport,
  homeTeam,
  awayTeam,
  commenceTime,
}: {
  gameId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
}) {
  const [poll, setPoll] = useState<(Poll & { voting?: boolean; error?: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [changingVote, setChangingVote] = useState(false);
  // Tracks a fetch failure (e.g. transient DB pool pressure returning a
  // 500) separately from "poll doesn't exist" so we can retry with
  // backoff instead of just disappearing forever after one bad tick.
  const [fetchFailed, setFetchFailed] = useState(false);

  const fetchPoll = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        gameId,
        sport,
        home: homeTeam,
        away: awayTeam,
        commenceTime,
      });
      const res = await fetch(`/api/polls/game?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data?.poll) {
        setPoll((prev) => ({ ...data.poll, voting: prev?.voting, error: prev?.error }));
        setFetchFailed(false);
      }
    } catch {
      // Transient — retry on the next interval tick / manual retry click
      // rather than treating this as "no poll exists".
      setFetchFailed(true);
    } finally {
      setLoading(false);
    }
  }, [gameId, sport, homeTeam, awayTeam, commenceTime]);

  useEffect(() => {
    fetchPoll();
    const interval = setInterval(fetchPoll, 20_000);
    return () => clearInterval(interval);
  }, [fetchPoll]);

  // Quick retry after a transient failure (e.g. a one-off DB timeout)
  // instead of waiting the full 20s poll interval.
  useEffect(() => {
    if (!fetchFailed || poll) return;
    const retryTimeout = setTimeout(fetchPoll, 3_000);
    return () => clearTimeout(retryTimeout);
  }, [fetchFailed, poll, fetchPoll]);

  const handleVote = useCallback(
    async (team: 'home' | 'away') => {
      if (!poll) return;
      setPoll((prev) => {
        if (!prev || prev.userVote === team) return prev;
        let homeVotes = prev.homeVotes;
        let awayVotes = prev.awayVotes;
        if (prev.userVote === 'home') homeVotes--;
        if (prev.userVote === 'away') awayVotes--;
        if (team === 'home') homeVotes++;
        if (team === 'away') awayVotes++;
        return { ...prev, userVote: team, homeVotes, awayVotes, totalVotes: homeVotes + awayVotes, voting: true };
      });
      setChangingVote(false);

      try {
        const res = await fetch('/api/polls/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pollId: poll.id, team }),
        });
        const data = await res.json();
        if (res.ok && data.poll) {
          const updated = data.poll as PollDTO;
          setPoll((prev) =>
            prev
              ? { ...prev, homeVotes: updated.homeVotes, awayVotes: updated.awayVotes, totalVotes: updated.totalVotes, userVote: team, voting: false }
              : prev,
          );
        } else {
          setPoll((prev) => (prev ? { ...prev, voting: false, error: 'Failed to vote' } : prev));
          fetchPoll();
        }
      } catch {
        setPoll((prev) => (prev ? { ...prev, voting: false, error: 'Network error' } : prev));
        fetchPoll();
      }
    },
    [poll, fetchPoll],
  );

  if (loading) {
    return (
      <div className="card p-4 flex items-center gap-2 text-sm text-brand-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading community vote…
      </div>
    );
  }

  if (!poll) return null;

  const total = poll.totalVotes;
  const homePct = total > 0 ? Math.round((poll.homeVotes / total) * 100) : 50;
  const awayPct = total > 0 ? 100 - homePct : 50;
  const hasVoted = poll.userVote !== null;
  const canClick = !hasVoted || changingVote;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="inline-flex items-center gap-2 text-xs text-brand-muted">
          <Trophy className="h-3.5 w-3.5 text-brand-accent" />
          Who will win?
        </div>
        <span className="text-[11px] text-brand-muted">
          {total.toLocaleString()} {total === 1 ? 'vote' : 'votes'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PollButton
          label={formatTeamName(awayTeam)}
          votes={poll.awayVotes}
          pct={awayPct}
          selected={poll.userVote === 'away'}
          hasVoted={hasVoted}
          locked={hasVoted && !canClick}
          voting={poll.voting ?? false}
          onClick={() => canClick && handleVote('away')}
        />
        <PollButton
          label={formatTeamName(homeTeam)}
          votes={poll.homeVotes}
          pct={homePct}
          selected={poll.userVote === 'home'}
          hasVoted={hasVoted}
          locked={hasVoted && !canClick}
          voting={poll.voting ?? false}
          onClick={() => canClick && handleVote('home')}
        />
      </div>
      {hasVoted && !changingVote && (
        <button
          type="button"
          onClick={() => setChangingVote(true)}
          className="mt-2 text-[11px] text-brand-muted underline decoration-dotted hover:text-brand-text"
        >
          Change vote
        </button>
      )}
      {poll.error && <div className="mt-2 text-[11px] text-brand-danger">{poll.error}</div>}
    </div>
  );
}

function PollButton({
  label,
  votes,
  pct,
  selected,
  hasVoted,
  locked,
  voting,
  onClick,
}: {
  label: string;
  votes: number;
  pct: number;
  selected: boolean;
  hasVoted: boolean;
  locked: boolean;
  voting: boolean;
  onClick: () => void;
}) {
  if (!hasVoted) {
    return (
      <button
        onClick={onClick}
        disabled={voting}
        className="rounded-lg border border-brand-border bg-brand-elevated px-3 py-2.5 text-sm font-medium transition-all hover:border-brand-primary hover:bg-brand-primary/10 disabled:opacity-60"
      >
        {label}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      disabled={voting || locked}
      className={`relative overflow-hidden rounded-lg border px-3 py-2.5 text-left text-sm transition-all ${
        locked ? 'cursor-default' : ''
      } ${selected ? 'border-brand-primary bg-brand-primary/15' : 'border-brand-border bg-brand-elevated'}`}
    >
      <div
        className={`absolute inset-y-0 left-0 transition-all duration-500 ${selected ? 'bg-brand-primary/20' : 'bg-brand-elevated/50'}`}
        style={{ width: `${pct}%` }}
      />
      <div className="relative flex items-center justify-between gap-2">
        <span className={`flex items-center gap-1 truncate ${selected ? 'font-semibold' : ''}`}>
          {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate">{label}</span>
        </span>
        <span className="text-xs shrink-0">
          {pct}% <span className="opacity-60">({votes})</span>
        </span>
      </div>
    </button>
  );
}
