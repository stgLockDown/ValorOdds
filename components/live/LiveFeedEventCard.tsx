'use client';

import { useState, useCallback, useEffect } from 'react';
import { MessageCircle, Loader2 } from 'lucide-react';
import { teamLogoUrl } from '@/lib/team-logos';

export type LiveFeedEventDTO = {
  id: string;
  sport: string;
  espnEventId: string;
  sourcePlayId: string;
  version: number;
  eventType: 'play' | 'tv_timeout' | 'team_timeout' | 'quarter_end' | 'game_status';
  playTypeText: string | null;
  text: string | null;
  teamAbbrev: string | null;
  homeScore: number | null;
  awayScore: number | null;
  period: number | null;
  clockDisplay: string | null;
  down: number | null;
  distance: number | null;
  yardLine: number | null;
  yardsToEndzone: number | null;
  possessionText: string | null;
  downDistanceText: string | null;
  isRedZone: boolean;
  fieldPosition: number | null;
  isScoringPlay: boolean;
  scoringType: string | null;
  isTurnover: boolean;
  statYardage: number | null;
  wallclock: string | null;
  reactions: Record<string, number>;
  myReactions: string[];
  commentCount: number;
};

const REACTION_EMOJIS = ['🔥', '😂', '👏', '😱', '💀'];

function periodLabel(period: number | null): string {
  if (!period) return '';
  if (period <= 4) return `Q${period}`;
  return `OT${period > 5 ? period - 4 : ''}`;
}

/** Timeline dividers — TV timeout / team timeout / quarter-end render as a thin rule, not a full play card. */
function TimelineDivider({ event }: { event: LiveFeedEventDTO }) {
  const label =
    event.eventType === 'tv_timeout'
      ? 'TV Timeout'
      : event.eventType === 'team_timeout'
        ? `Timeout${event.teamAbbrev ? ` — ${event.teamAbbrev}` : ''}`
        : event.playTypeText || 'End of Quarter';
  return (
    <div className="flex items-center gap-3 py-2 px-1">
      <div className="h-px flex-1 bg-brand-border" />
      <span className="text-[11px] uppercase tracking-wider text-brand-muted whitespace-nowrap">
        {label} {event.clockDisplay ? `· ${event.clockDisplay}` : ''}
      </span>
      <div className="h-px flex-1 bg-brand-border" />
    </div>
  );
}

export default function LiveFeedEventCard({
  event,
  sport,
  isLoggedIn,
}: {
  event: LiveFeedEventDTO;
  sport: string;
  isLoggedIn: boolean;
}) {
  const [reactions, setReactions] = useState(event.reactions);
  const [myReactions, setMyReactions] = useState(event.myReactions);
  const [showComments, setShowComments] = useState(false);

  const handleReact = useCallback(
    async (emoji: string) => {
      const hasIt = myReactions.includes(emoji);
      // Optimistic update
      setMyReactions((prev) => (hasIt ? prev.filter((e) => e !== emoji) : [...prev, emoji]));
      setReactions((prev) => ({
        ...prev,
        [emoji]: Math.max(0, (prev[emoji] || 0) + (hasIt ? -1 : 1)),
      }));
      try {
        await fetch('/api/public/live-feed/reactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId: event.id, emoji }),
        });
      } catch {
        // Silent — reactions are best-effort, the next poll tick will reconcile.
      }
    },
    [event.id, myReactions],
  );

  if (event.eventType !== 'play') {
    return <TimelineDivider event={event} />;
  }

  const homeAbbrev = event.teamAbbrev;
  const fieldPct = event.fieldPosition !== null ? Math.round(event.fieldPosition * 100) : null;

  return (
    <div
      className={`rounded-lg border p-3 ${
        event.isScoringPlay
          ? 'border-brand-accent/60 bg-brand-accent/5'
          : event.isTurnover
            ? 'border-red-500/50 bg-red-500/5'
            : 'border-brand-border bg-brand-surface'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 text-[11px] text-brand-muted">
          {homeAbbrev && (
            <span className="inline-flex items-center gap-1">
              <TeamMark abbrev={homeAbbrev} sport={sport} />
              {homeAbbrev}
            </span>
          )}
          <span>{periodLabel(event.period)}</span>
          {event.clockDisplay && <span>· {event.clockDisplay}</span>}
          {event.downDistanceText && <span>· {event.downDistanceText}</span>}
          {event.isRedZone && (
            <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
              RED ZONE
            </span>
          )}
        </div>
        <div className="font-mono text-xs text-brand-muted whitespace-nowrap">
          {event.awayScore ?? 0}–{event.homeScore ?? 0}
        </div>
      </div>

      {fieldPct !== null && (
        <div className="mb-2 h-1.5 w-full rounded-full bg-brand-elevated overflow-hidden">
          <div
            className="h-full bg-brand-accent transition-all"
            style={{ width: `${fieldPct}%` }}
            title={event.possessionText ?? undefined}
          />
        </div>
      )}

      <p className="text-sm leading-snug">
        {event.isScoringPlay && (
          <span className="mr-1.5 rounded bg-brand-accent px-1.5 py-0.5 text-[10px] font-bold text-brand-bg">
            {event.scoringType?.toUpperCase() || 'SCORE'}
          </span>
        )}
        {event.text}
      </p>

      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        {REACTION_EMOJIS.map((emoji) => {
          const count = reactions[emoji] || 0;
          const active = myReactions.includes(emoji);
          return (
            <button
              key={emoji}
              onClick={() => handleReact(emoji)}
              className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                active
                  ? 'border-brand-primary bg-brand-primary/15'
                  : 'border-brand-border bg-brand-elevated hover:border-brand-primary/50'
              }`}
            >
              {emoji} {count > 0 && <span className="ml-0.5 text-[10px] text-brand-muted">{count}</span>}
            </button>
          );
        })}
        <button
          onClick={() => setShowComments((v) => !v)}
          className="ml-auto inline-flex items-center gap-1 rounded-full border border-brand-border bg-brand-elevated px-2 py-0.5 text-xs text-brand-muted hover:border-brand-primary/50"
        >
          <MessageCircle className="h-3 w-3" />
          {event.commentCount > 0 ? event.commentCount : 'Comment'}
        </button>
      </div>

      {showComments && <CommentThread eventId={event.id} isLoggedIn={isLoggedIn} />}
    </div>
  );
}

function TeamMark({ abbrev, sport }: { abbrev: string; sport: string }) {
  const logo = teamLogoUrl(sport, abbrev);
  if (!logo) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={logo} alt={abbrev} className="h-3.5 w-3.5 object-contain" />;
}

type CommentDTO = {
  id: string;
  eventId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  parentId: string | null;
  body: string;
  createdAt: string;
};

function CommentThread({ eventId, isLoggedIn }: { eventId: string; isLoggedIn: boolean }) {
  const [comments, setComments] = useState<CommentDTO[] | null>(null);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/live-feed/comments?eventId=${encodeURIComponent(eventId)}`, { cache: 'no-store' });
      const data = await res.json();
      setComments(data.comments || []);
    } catch {
      setComments([]);
    }
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const handlePost = useCallback(async () => {
    if (!draft.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch('/api/live-feed/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, body: draft }),
      });
      const data = await res.json();
      if (res.ok && data.comment) {
        setComments((prev) => [...(prev || []), data.comment]);
        setDraft('');
      } else {
        setError(data.error || 'Failed to post comment.');
      }
    } catch {
      setError('Network error.');
    } finally {
      setPosting(false);
    }
  }, [draft, eventId]);

  return (
    <div className="mt-3 border-t border-brand-border pt-3 space-y-2">
      {comments === null ? (
        <div className="flex items-center gap-2 text-xs text-brand-muted">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading comments…
        </div>
      ) : comments.length === 0 ? (
        <p className="text-xs text-brand-muted">No comments yet — be the first to react.</p>
      ) : (
        comments.map((c) => (
          <div key={c.id} className="text-xs">
            <span className="font-semibold">{c.displayName}</span>{' '}
            <span className="text-brand-muted">{c.body}</span>
          </div>
        ))
      )}

      {isLoggedIn ? (
        <div className="flex items-center gap-2 pt-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment…"
            maxLength={500}
            className="flex-1 rounded border border-brand-border bg-brand-elevated px-2 py-1 text-xs outline-none focus:border-brand-primary"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handlePost();
            }}
          />
          <button
            onClick={handlePost}
            disabled={posting || !draft.trim()}
            className="rounded bg-brand-primary px-2 py-1 text-xs font-medium text-brand-bg disabled:opacity-50"
          >
            Post
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-brand-muted">
          <a href="/auth/signin" className="underline">
            Sign in
          </a>{' '}
          to join the conversation.
        </p>
      )}
      {error && <p className="text-[11px] text-brand-danger">{error}</p>}
    </div>
  );
}
