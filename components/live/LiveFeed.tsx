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
  const [loadError, setLoadError] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ sport, home: homeTeam, away: awayTeam });
    if (espnEventId) params.set('event', espnEventId);

    let cancelled = false;
    // Bound the initial fetch so a slow/stuck backend (e.g. transient DB
    // pool pressure) can't leave the UI on "Loading live feed…" forever —
    // fail into an explicit, retryable error state instead.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    fetch(`/api/public/live-feed?${params.toString()}`, { cache: 'no-store', signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setEvents(data.events || []);
        setLoadError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
      })
      .finally(() => clearTimeout(timeoutId));

    const es = new EventSource(`/api/public/live-feed/stream?${params.toString()}`);
    esRef.current = es;
    es.onopen = () => {
      setConnected(true);
      setLoadError(false);
    };
    es.onerror = () => setConnected(false);
    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.type === 'feed' && Array.isArray(data.events)) {
          setEvents(data.events);
          setConnected(true);
          setLoadError(false);
        }
      } catch {
        // ignore malformed message
      }
    };

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeoutId);
      es.close();
      esRef.current = null;
    };
  }, [sport, homeTeam, awayTeam, espnEventId]);

  if (events === null && loadError) {
    return (
      <div className="card p-6 text-center text-sm text-brand-muted">
        Couldn&apos;t load the live feed right now.{' '}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="underline decoration-dotted hover:text-brand-text"
        >
          Retry
        </button>
      </div>
    );
  }

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
