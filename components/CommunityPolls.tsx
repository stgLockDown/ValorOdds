'use client';

import { useEffect, useState, useCallback } from 'react';
import { Check, Users, Loader2, Trophy, RefreshCw } from 'lucide-react';
import { sportLabel, sportEmoji, type PollDTO, type Poll } from '@/lib/polls-types';
import { formatTeamName } from '@/lib/espn-scores';

type PollCard = Poll & { voting?: boolean; error?: string };

/**
 * Community Polls widget for the homepage.
 *
 * Shows 3-4 daily game polls where visitors vote for who they think
 * will win. Anonymous (fingerprint-deduped), auto-refreshing, with
 * optimistic voting for instant feedback.
 */
export default function CommunityPolls() {
  const [polls, setPolls] = useState<PollCard[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPolls = useCallback(async () => {
    try {
      const res = await fetch('/api/polls/today', { cache: 'no-store' });
      const data = await res.json();
      setPolls((prev) => {
        // Preserve local voting/error state across refreshes
        return (data.polls || []).map((p: Poll) => {
          const existing = prev.find((x) => x.id === p.id);
          return { ...p, voting: existing?.voting, error: existing?.error };
        });
      });
    } catch {
      // Silently fail — polls are a "nice to have", not critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPolls();
    // Auto-refresh vote counts every 30 seconds
    const interval = setInterval(fetchPolls, 30_000);
    return () => clearInterval(interval);
  }, [fetchPolls]);

  const handleVote = useCallback(
    async (pollId: number, team: 'home' | 'away') => {
      // Optimistic: immediately show the vote + updated counts
      setPolls((prev) =>
        prev.map((p) => {
          if (p.id !== pollId) return p;
          if (p.userVote === team) return p; // already voted for this team

          // Recalculate counts optimistically
          let homeVotes = p.homeVotes;
          let awayVotes = p.awayVotes;
          if (p.userVote === 'home') homeVotes--;
          if (p.userVote === 'away') awayVotes--;
          if (team === 'home') homeVotes++;
          if (team === 'away') awayVotes++;

          return {
            ...p,
            userVote: team,
            homeVotes,
            awayVotes,
            totalVotes: homeVotes + awayVotes,
            voting: true,
            error: undefined,
          };
        }),
      );

      try {
        const res = await fetch('/api/polls/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pollId, team }),
        });
        const data = await res.json();

        if (res.ok && data.poll) {
          const updated = data.poll as PollDTO;
          setPolls((prev) =>
            prev.map((p) =>
              p.id === pollId
                ? {
                    ...p,
                    homeVotes: updated.homeVotes,
                    awayVotes: updated.awayVotes,
                    totalVotes: updated.totalVotes,
                    userVote: team,
                    voting: false,
                    error: undefined,
                  }
                : p,
            ),
          );
        } else {
          // Revert on error — refetch to get accurate state
          setPolls((prev) =>
            prev.map((p) => (p.id === pollId ? { ...p, voting: false, error: 'Failed to vote' } : p)),
          );
          fetchPolls();
        }
      } catch {
        setPolls((prev) =>
          prev.map((p) => (p.id === pollId ? { ...p, voting: false, error: 'Network error' } : p)),
        );
        fetchPolls();
      }
    },
    [fetchPolls],
  );

  if (loading) {
    return (
      <section className="container-px mx-auto max-w-7xl py-12">
        <div className="flex items-center justify-center gap-2 text-brand-muted py-12">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading today&apos;s matchups...
        </div>
      </section>
    );
  }

  if (polls.length === 0) {
    // No games today — don't render the section at all
    return null;
  }

  const totalAllVotes = polls.reduce((sum, p) => sum + p.totalVotes, 0);

  return (
    <section className="container-px mx-auto max-w-7xl py-12 sm:py-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-border bg-brand-surface px-3 py-1 text-xs text-brand-muted mb-3">
            <Trophy className="h-3.5 w-3.5 text-brand-accent" />
            Community Poll
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold">
            Who do you think will <span className="gradient-text">win today?</span>
          </h2>
          <p className="mt-2 text-sm text-brand-muted">
            Vote on today&apos;s top matchups and see what the community thinks. Updates daily.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-brand-muted">
          <Users className="h-4 w-4" />
          <span>
            <span className="font-semibold text-brand-text">{totalAllVotes.toLocaleString()}</span> community{' '}
            {totalAllVotes === 1 ? 'vote' : 'votes'} so far
          </span>
          <RefreshCw className="h-3 w-3 ml-1 opacity-50" />
        </div>
      </div>

      {/* Poll cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {polls.map((poll) => (
          <PollCardView key={poll.id} poll={poll} onVote={handleVote} />
        ))}
      </div>
    </section>
  );
}

function PollCardView({
  poll,
  onVote,
}: {
  poll: PollCard;
  onVote: (pollId: number, team: 'home' | 'away') => void;
}) {
  const total = poll.totalVotes;
  const homePct = total > 0 ? Math.round((poll.homeVotes / total) * 100) : 50;
  const awayPct = total > 0 ? 100 - homePct : 50;
  const hasVoted = poll.userVote !== null;
  const commenceDate = new Date(poll.commenceTime);
  const timeStr = commenceDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  // Once a vote is cast, the buttons lock into a read-only results view.
  // A visitor who wants to switch their vote must explicitly tap
  // "Change vote" first — this prevents accidental/unlimited vote-switching
  // while still letting people correct a misclick.
  const [changingVote, setChangingVote] = useState(false);
  const canClickButtons = !hasVoted || changingVote;

  const handleButtonClick = (team: 'home' | 'away') => {
    if (poll.voting) return;
    onVote(poll.id, team);
    setChangingVote(false);
  };

  return (
    <div
      className={`card-interactive flex flex-col ${
        hasVoted ? 'border-brand-primary/40' : ''
      }`}
    >
      {/* Sport badge + time */}
      <div className="flex items-center justify-between mb-3">
        <span className="badge-primary text-[11px]">
          {sportEmoji(poll.sport)} {sportLabel(poll.sport)}
        </span>
        <span className="text-[11px] text-brand-muted">{timeStr}</span>
      </div>

      {/* Vote buttons / results */}
      <div className="flex-1 flex flex-col gap-2">
        <VoteButton
          label={formatTeamName(poll.homeTeam)}
          votes={poll.homeVotes}
          percentage={homePct}
          selected={poll.userVote === 'home'}
          hasVoted={hasVoted}
          locked={hasVoted && !canClickButtons}
          voting={poll.voting ?? false}
          onClick={() => canClickButtons && handleButtonClick('home')}
          accent="home"
        />
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-brand-muted px-1">
          <div className="flex-1 h-px bg-brand-border" />
          VS
          <div className="flex-1 h-px bg-brand-border" />
        </div>
        <VoteButton
          label={formatTeamName(poll.awayTeam)}
          votes={poll.awayVotes}
          percentage={awayPct}
          selected={poll.userVote === 'away'}
          hasVoted={hasVoted}
          locked={hasVoted && !canClickButtons}
          voting={poll.voting ?? false}
          onClick={() => canClickButtons && handleButtonClick('away')}
          accent="away"
        />
      </div>

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-brand-border flex items-center justify-between text-[11px] text-brand-muted">
        {hasVoted ? (
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-brand-success">
              <Check className="h-3 w-3" />
              You voted: {poll.userVote === 'home' ? formatTeamName(poll.homeTeam) : formatTeamName(poll.awayTeam)}
            </span>
            {!changingVote && (
              <button
                type="button"
                onClick={() => setChangingVote(true)}
                className="underline decoration-dotted hover:text-brand-text"
              >
                Change vote
              </button>
            )}
          </span>
        ) : (
          <span>Tap to vote</span>
        )}
        <span>{total.toLocaleString()} {total === 1 ? 'vote' : 'votes'}</span>
      </div>

      {poll.error && (
        <div className="mt-2 text-[11px] text-brand-danger">{poll.error}</div>
      )}
    </div>
  );
}

function VoteButton({
  label,
  votes,
  percentage,
  selected,
  hasVoted,
  locked,
  voting,
  onClick,
  accent,
}: {
  label: string;
  votes: number;
  percentage: number;
  selected: boolean;
  hasVoted: boolean;
  locked: boolean;
  voting: boolean;
  onClick: () => void;
  accent: 'home' | 'away';
}) {
  // Before voting: show as a clickable button
  if (!hasVoted) {
    return (
      <button
        onClick={onClick}
        disabled={voting}
        className="group relative overflow-hidden rounded-lg border border-brand-border bg-brand-elevated px-4 py-3 text-left text-sm font-medium transition-all hover:border-brand-primary hover:bg-brand-primary/10 disabled:opacity-60 disabled:cursor-wait"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="truncate">{label}</span>
          <span className="text-brand-muted text-xs group-hover:text-brand-primaryText transition-colors">Vote →</span>
        </span>
      </button>
    );
  }

  // After voting: show as a results bar (locked/read-only unless the user
  // has tapped "Change vote", which unlocks it for a one-time switch)
  const isWinning = percentage >= 50;
  return (
    <button
      onClick={onClick}
      disabled={voting || locked}
      className={`group relative overflow-hidden rounded-lg border px-4 py-3 text-left text-sm transition-all ${
        locked ? 'cursor-default' : 'disabled:cursor-wait'
      } ${
        selected
          ? 'border-brand-primary bg-brand-primary/15'
          : 'border-brand-border bg-brand-elevated hover:border-brand-primary/50'
      }`}
    >
      {/* Progress bar background */}
      <div
        className={`absolute inset-y-0 left-0 transition-all duration-500 ${
          selected ? 'bg-brand-primary/20' : 'bg-brand-elevated/50'
        }`}
        style={{ width: `${percentage}%` }}
      />
      {/* Content on top */}
      <div className="relative flex items-center justify-between gap-2">
        <span className={`flex items-center gap-1.5 truncate ${selected ? 'font-semibold' : ''}`}>
          {selected && <Check className="h-3.5 w-3.5 text-brand-primaryText shrink-0" />}
          <span className="truncate">{label}</span>
        </span>
        <span className={`shrink-0 text-xs ${isWinning ? 'text-brand-text font-semibold' : 'text-brand-muted'}`}>
          {percentage}%
          <span className="ml-1.5 text-[10px] opacity-60">({votes})</span>
        </span>
      </div>
    </button>
  );
}
