'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Bell, BellOff, Loader2, Send, Play, RefreshCw, Pin, PinOff,
  CheckCircle2, XCircle, AlertCircle, Smartphone, Radio, ChevronLeft,
} from 'lucide-react';
import {
  isPushSupported,
  getNotificationPermission,
  ensurePushSubscription,
  removePushSubscription,
} from '@/lib/push-client';

// ---------- Types ----------
interface StatusSnapshot {
  ok: boolean;
  pushConfigured: boolean;
  vapidPublicKeyPresent: boolean;
  mySubscriptions: number;
  totalSubscriptions: number;
  pinnedGames: number;
}

interface Game {
  game_id: string;
  espn_event_id: string | null;
  sport: string;
  home_team: string;
  away_team: string;
  home_team_abbrev: string | null;
  away_team_abbrev: string | null;
  status: string;
  is_live: boolean;
  home_score: number;
  away_score: number;
}

interface PinnedGame {
  game_id: string;
  espn_event_id: string | null;
  sport: string;
  home_team: string;
  away_team: string;
  home_abbrev: string | null;
  away_abbrev: string | null;
}

interface LogEntry {
  ts: string;
  kind: 'info' | 'success' | 'error';
  text: string;
}

// ---------- Helpers ----------
function now(): string {
  return new Date().toLocaleTimeString();
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
      }`}
    >
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}

// ---------- Main Component ----------
export default function AdminNotificationsClient() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [status, setStatus] = useState<StatusSnapshot | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const [games, setGames] = useState<Game[]>([]);
  const [loadingGames, setLoadingGames] = useState(true);
  const [pinned, setPinned] = useState<PinnedGame[]>([]);

  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((kind: LogEntry['kind'], text: string) => {
    setLog((l) => [{ ts: now(), kind, text }, ...l].slice(0, 100));
  }, []);

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const r = await fetch('/api/notifications/test');
      const data = await r.json();
      if (r.ok) setStatus(data);
      else addLog('error', `Status check failed: ${data?.error ?? r.status}`);
    } catch (e: any) {
      addLog('error', `Status check error: ${e?.message ?? e}`);
    } finally {
      setLoadingStatus(false);
    }
  }, [addLog]);

  const refreshPinned = useCallback(async () => {
    try {
      const r = await fetch('/api/games/pinned');
      const data = await r.json();
      if (r.ok) setPinned(data.data ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshGames = useCallback(async () => {
    setLoadingGames(true);
    try {
      const r = await fetch('/api/dashboard/games');
      const data = await r.json();
      if (r.ok) setGames(data.data ?? []);
      else addLog('error', `Loading games failed: ${data?.error ?? r.status}`);
    } catch (e: any) {
      addLog('error', `Loading games error: ${e?.message ?? e}`);
    } finally {
      setLoadingGames(false);
    }
  }, [addLog]);

  useEffect(() => {
    setSupported(isPushSupported());
    setPermission(getNotificationPermission());
    refreshStatus();
    refreshPinned();
    refreshGames();
  }, [refreshStatus, refreshPinned, refreshGames]);

  // ---------- Actions ----------
  const subscribe = async () => {
    setBusy('subscribe');
    addLog('info', 'Requesting notification permission & subscribing…');
    try {
      const sub = await ensurePushSubscription();
      if (sub) {
        addLog('success', 'Subscribed to push on this device.');
        setPermission(getNotificationPermission());
      } else {
        addLog('error', 'Subscription failed — permission denied or push unsupported.');
        setPermission(getNotificationPermission());
      }
    } catch (e: any) {
      addLog('error', `Subscribe error: ${e?.message ?? e}`);
    } finally {
      setBusy(null);
      refreshStatus();
    }
  };

  const unsubscribe = async () => {
    setBusy('unsubscribe');
    addLog('info', 'Unsubscribing this device…');
    try {
      await removePushSubscription();
      addLog('success', 'Unsubscribed this device.');
    } catch (e: any) {
      addLog('error', `Unsubscribe error: ${e?.message ?? e}`);
    } finally {
      setBusy(null);
      refreshStatus();
    }
  };

  const sendTest = async () => {
    setBusy('send-test');
    addLog('info', 'Sending test push to your devices…');
    try {
      const r = await fetch('/api/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send-test' }),
      });
      const data = await r.json();
      if (r.ok) {
        addLog(data.delivered > 0 ? 'success' : 'info', data.message ?? 'Test push sent.');
      } else {
        addLog('error', `Test push failed: ${data?.error ?? r.status}`);
      }
    } catch (e: any) {
      addLog('error', `Test push error: ${e?.message ?? e}`);
    } finally {
      setBusy(null);
      refreshStatus();
    }
  };

  const runDispatch = async () => {
    setBusy('run-dispatch');
    addLog('info', 'Running dispatcher pass…');
    try {
      const r = await fetch('/api/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run-dispatch' }),
      });
      const data = await r.json();
      if (r.ok) {
        const eventCount = data.events?.length ?? 0;
        if (data.dispatched > 0) {
          addLog('success', `Dispatcher delivered to ${data.dispatched} user(s) across ${eventCount} event(s).`);
          (data.events ?? []).forEach((ev: any) =>
            addLog('info', `  • ${ev.event}: ${ev.scoreLine ?? ''} (${ev.status ?? ''}) → ${ev.users} user(s)`),
          );
        } else if (data.reason) {
          addLog('info', `Dispatcher: ${data.reason}.`);
        }
        // Show per-pin diagnostics so the admin can see exactly why each pinned
        // game did or did not produce a push.
        const pins = data.pins ?? [];
        if (pins.length > 0) {
          addLog('info', `Pinned games (${pins.length}):`);
          const outcomeLabel: Record<string, string> = {
            pushed: 'PUSHED',
            pre_game: 'pre-game (no push yet)',
            no_espn_match: 'no ESPN match',
            no_summary: 'ESPN summary unavailable',
            no_subscriptions: 'no push subscriptions for this user',
          };
          for (const pin of pins) {
            const label = outcomeLabel[pin.outcome] ?? pin.outcome;
            const matchInfo = pin.espnEventId ? `espn:${pin.espnEventId}` : 'espn:—';
            const detail = pin.detail ? ` · ${pin.detail}` : '';
            const kind: LogEntry['kind'] =
              pin.outcome === 'pushed' ? 'success' : pin.outcome === 'pre_game' ? 'info' : 'error';
            addLog(
              kind,
              `  • [${pin.sport.toUpperCase()}] ${pin.awayTeam} @ ${pin.homeTeam} → ${label} (${matchInfo}${detail})`,
            );
          }
        }
      } else {
        addLog('error', `Dispatch failed: ${data?.error ?? r.status}`);
      }
    } catch (e: any) {
      addLog('error', `Dispatch error: ${e?.message ?? e}`);
    } finally {
      setBusy(null);
      refreshStatus();
    }
  };

  const togglePin = async (game: Game) => {
    const isPinned = pinned.some((p) => p.game_id === game.game_id);
    setBusy(`pin-${game.game_id}`);
    try {
      if (isPinned) {
        const r = await fetch(`/api/games/${encodeURIComponent(game.game_id)}/pin`, { method: 'DELETE' });
        if (r.ok) addLog('success', `Unpinned ${game.away_team} @ ${game.home_team}.`);
        else addLog('error', `Unpin failed (${r.status}).`);
      } else {
        // Pinning requires a push subscription first.
        const sub = await ensurePushSubscription();
        if (!sub) {
          addLog('error', 'Cannot pin — push subscription required (permission denied?).');
          setBusy(null);
          return;
        }
        const r = await fetch(`/api/games/${encodeURIComponent(game.game_id)}/pin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            game_id: game.game_id,
            espn_event_id: game.espn_event_id,
            sport: game.sport,
            home_team: game.home_team,
            away_team: game.away_team,
            home_abbrev: game.home_team_abbrev,
            away_abbrev: game.away_team_abbrev,
          }),
        });
        if (r.ok) addLog('success', `Pinned ${game.away_team} @ ${game.home_team}.`);
        else addLog('error', `Pin failed (${r.status}).`);
      }
    } catch (e: any) {
      addLog('error', `Pin toggle error: ${e?.message ?? e}`);
    } finally {
      setBusy(null);
      refreshPinned();
      refreshStatus();
    }
  };

  const permissionLabel =
    permission === 'unsupported' ? 'unsupported' : permission;

  return (
    <main className="container-px mx-auto max-w-7xl py-12 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-brand-muted hover:text-brand-primary transition-colors">
            <ChevronLeft className="h-4 w-4" /> Admin
          </Link>
          <h1 className="text-3xl font-bold mt-1">Notification test console</h1>
          <p className="text-brand-muted mt-1">
            End-to-end testing for web push — subscribe, pin a game, fire the dispatcher, and watch a real notification arrive.
          </p>
        </div>
        <button onClick={() => { refreshStatus(); refreshPinned(); refreshGames(); }} className="btn-ghost" disabled={loadingStatus}>
          {loadingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {/* Status cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <div className="text-xs uppercase tracking-wider text-brand-muted">Push service</div>
          <div className="mt-2 flex items-center gap-2">
            {status ? (
              <StatusPill ok={status.pushConfigured} label={status.pushConfigured ? 'Configured' : 'Not configured'} />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-brand-muted" />
            )}
          </div>
          <div className="text-xs text-brand-muted mt-2">VAPID keys server-side</div>
        </div>

        <div className="card">
          <div className="text-xs uppercase tracking-wider text-brand-muted">This browser</div>
          <div className="mt-2 flex items-center gap-2">
            {supported ? (
              <StatusPill ok={permission === 'granted'} label={`permission: ${permissionLabel}`} />
            ) : (
              <StatusPill ok={false} label="push unsupported" />
            )}
          </div>
          <div className="text-xs text-brand-muted mt-2">
            {status ? `${status.mySubscriptions} of your device(s) subscribed` : '…'}
          </div>
        </div>

        <div className="card">
          <div className="text-xs uppercase tracking-wider text-brand-muted">Total subscriptions</div>
          <div className="text-3xl font-bold mt-1">{status?.totalSubscriptions ?? '—'}</div>
          <div className="text-xs text-brand-muted mt-1">across all users</div>
        </div>

        <div className="card">
          <div className="text-xs uppercase tracking-wider text-brand-muted">Pinned games</div>
          <div className="text-3xl font-bold mt-1">{status?.pinnedGames ?? '—'}</div>
          <div className="text-xs text-brand-muted mt-1">platform-wide</div>
        </div>
      </div>

      {/* Action panel */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2 font-semibold">
          <Smartphone className="h-5 w-5 text-brand-primary" />
          Push actions
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={subscribe} disabled={busy !== null || !supported} className="btn-primary">
            {busy === 'subscribe' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            Subscribe this device
          </button>
          <button onClick={unsubscribe} disabled={busy !== null || !supported} className="btn-ghost">
            {busy === 'unsubscribe' ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellOff className="h-4 w-4" />}
            Unsubscribe
          </button>
          <button onClick={sendTest} disabled={busy !== null} className="btn-secondary">
            {busy === 'send-test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send test push
          </button>
          <button onClick={runDispatch} disabled={busy !== null} className="btn-secondary">
            {busy === 'run-dispatch' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run dispatcher
          </button>
        </div>
        <p className="text-xs text-brand-muted">
          <strong className="text-brand-text">Send test push</strong> fires a notification to your subscribed devices immediately.{' '}
          <strong className="text-brand-text">Run dispatcher</strong> executes the full pinned-game pass (the same code the cron calls) and pushes live scores + big plays to everyone who pinned a game.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pin a game */}
        <div className="card overflow-hidden p-0">
          <div className="px-5 py-3 border-b border-brand-border font-semibold flex items-center gap-2">
            <Pin className="h-4 w-4 text-brand-primary" />
            Pin a game to test
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-brand-border">
            {loadingGames ? (
              <div className="px-5 py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-brand-muted" /></div>
            ) : games.length === 0 ? (
              <div className="px-5 py-8 text-sm text-brand-muted">No games available right now.</div>
            ) : (
              games.map((g) => {
                const isPinned = pinned.some((p) => p.game_id === g.game_id);
                const score = g.status === 'scheduled' ? '' : `${g.away_score}–${g.home_score}`;
                return (
                  <div key={g.game_id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">
                        {g.away_team} @ {g.home_team}
                      </div>
                      <div className="text-xs text-brand-muted flex items-center gap-2">
                        <span className="uppercase">{g.sport}</span>
                        {g.is_live && <span className="inline-flex items-center gap-1 text-red-400"><Radio className="h-3 w-3" />Live</span>}
                        {score && <span>{score}</span>}
                        {!g.espn_event_id && <span className="text-amber-400">no ESPN id</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => togglePin(g)}
                      disabled={busy !== null}
                      className={isPinned ? 'btn-ghost shrink-0' : 'btn-secondary shrink-0'}
                    >
                      {busy === `pin-${g.game_id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isPinned ? (
                        <><PinOff className="h-4 w-4" /> Unpin</>
                      ) : (
                        <><Pin className="h-4 w-4" /> Pin</>
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Result log */}
        <div className="card overflow-hidden p-0 flex flex-col">
          <div className="px-5 py-3 border-b border-brand-border font-semibold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-brand-primary" />
            Result log
          </div>
          <div ref={logRef} className="flex-1 max-h-96 overflow-y-auto px-5 py-3 space-y-1.5 font-mono text-xs">
            {log.length === 0 ? (
              <div className="text-brand-muted py-6 text-center">Actions and results will appear here.</div>
            ) : (
              log.map((entry, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-brand-muted shrink-0">{entry.ts}</span>
                  <span
                    className={
                      entry.kind === 'success'
                        ? 'text-green-400'
                        : entry.kind === 'error'
                        ? 'text-red-400'
                        : 'text-brand-text'
                    }
                  >
                    {entry.text}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
