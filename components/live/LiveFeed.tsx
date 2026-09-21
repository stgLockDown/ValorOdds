'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Radio } from 'lucide-react';
import LiveFeedEventCard, { type LiveFeedEventDTO } from './LiveFeedEventCard';

/**
 * Client-side live feed — connects to the SSE stream for real-time
 * play-by-play updates (falls back gracefully if EventSource errors,
 * since the initial GET already rendered a snapshot server-side... actually
 * this whole thing is a client component, so it does its own initial fetch
 * too). Reverse-chronological: newest event at the top.
 */
export default function LiveFeed({
  sport,
  homeTeam,
  awayTeam,
  espnEventId,
  isLoggedIn,
}: {
  sport: string;
  homeTeam: string;
  awayTeam: string;
  espnEventId?: string | null;
  isLoggedIn: boolean;
}) {
  const [events, setEvents] = useState<LiveFeedEventDTO[] | null>(null);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ sport, home: homeTeam, away: awayTeam });
    if (espnEventId) params.set('event', espnEventId);

    // Initial snapshot fetch (works even if SSE is blocked by a proxy).
    fetch(`/api/public/live-feed?${params.toString()}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setEvents(data.events || []))
      .catch(() => setEvents([]));

    const es = new EventSource(`/api/public/live-feed/stream?${params.toString()}`);
    esRef.current = es;
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.type === 'feed' && Array.isArray(data.events)) {
          setEvents(data.events);
          setConnected(true);
        }
      } catch {
        // ignore malformed message
      }
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [sport, homeTeam, awayTeam, espnEventId]);

  if (events === null) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-brand-muted">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading live feed…
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="card p-6 text-center text-brand-muted text-sm">
        No plays yet — the feed will populate once the game kicks off.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] text-brand-muted mb-1">
        <Radio className={`h-3 w-3 ${connected ? 'text-brand-accent animate-pulse' : ''}`} />
        {connected ? 'Live' : 'Connecting…'}
      </div>
      {events.map((event) => (
        <LiveFeedEventCard key={event.id} event={event} sport={sport} isLoggedIn={isLoggedIn} />
      ))}
    </div>
  );
}
