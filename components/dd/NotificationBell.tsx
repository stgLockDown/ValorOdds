'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Trophy, Repeat, UserPlus, Sparkles, Check } from 'lucide-react';
import { useToast, type ToastKind } from './ToastProvider';

// ──────────────────────────────────────────────────────────────────────────────
// Notification bell — polls the league notification feed and surfaces new
// events as popup toasts. Also renders a dropdown of recent notifications.
//
// Polling is deliberately lightweight: we track the highest id we've seen and
// ask only for `?since=<id>`, so each tick transfers just the new rows.
// ──────────────────────────────────────────────────────────────────────────────

interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  readAt: string | null;
  createdAt: string;
}

const ICONS: Record<string, typeof Trophy> = {
  score: Trophy,
  matchup: Trophy,
  waiver: UserPlus,
  trade: Repeat,
  draft: Sparkles,
  league: Bell,
};

const POLL_MS = 20000;

export default function NotificationBell({ leagueId }: { leagueId: string }) {
  const { push } = useToast();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const lastIdRef = useRef<string | null>(null);
  const primedRef = useRef(false);

  const load = useCallback(
    async (initial: boolean) => {
      try {
        const qs = initial || !lastIdRef.current ? '' : `?since=${lastIdRef.current}`;
        const res = await fetch(`/api/dd/leagues/${leagueId}/notifications${qs}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const json = await res.json();
        const incoming: NotificationItem[] = json.notifications ?? [];

        if (incoming.length) {
          // The API returns newest-first; track the max id for the next cursor.
          const maxId = incoming.reduce(
            (mx, n) => (BigInt(n.id) > BigInt(mx) ? n.id : mx),
            lastIdRef.current ?? '0'
          );
          lastIdRef.current = maxId;

          setItems((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            const merged = [...incoming.filter((n) => !seen.has(n.id)), ...prev];
            return merged.slice(0, 40);
          });

          // On the very first load we don't pop toasts for history — only for
          // genuinely new events after the page is open.
          if (primedRef.current) {
            for (const n of [...incoming].reverse()) {
              push({
                kind: (n.kind as ToastKind) ?? 'league',
                title: n.title,
                body: n.body,
                url: n.url,
              });
            }
          }
        }

        if (typeof json.unread === 'number') setUnread(json.unread);
        primedRef.current = true;
      } catch {
        // Network hiccups are non-fatal; the next tick retries.
      }
    },
    [leagueId, push]
  );

  useEffect(() => {
    load(true);
    const t = setInterval(() => load(false), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const markAllRead = async () => {
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    try {
      await fetch(`/api/dd/leagues/${leagueId}/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open && unread > 0) markAllRead();
        }}
        className="relative btn-ghost p-2"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-danger text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-[min(92vw,22rem)] max-h-[26rem] overflow-y-auto rounded-xl border border-brand-border bg-brand-surface shadow-2xl z-50">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-brand-border sticky top-0 bg-brand-surface">
              <span className="text-sm font-semibold text-brand-text">Notifications</span>
              <button
                onClick={markAllRead}
                className="text-xs text-brand-muted hover:text-brand-text inline-flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" /> Mark all read
              </button>
            </div>
            {items.length === 0 ? (
              <p className="px-3.5 py-6 text-center text-sm text-brand-muted">
                No notifications yet.
              </p>
            ) : (
              <div className="divide-y divide-brand-border">
                {items.map((n) => {
                  const Icon = ICONS[n.kind] ?? Bell;
                  return (
                    <a
                      key={n.id}
                      href={n.url ?? '#'}
                      className={`flex items-start gap-3 px-3.5 py-3 hover:bg-brand-elevated/50 transition-colors ${
                        n.readAt ? '' : 'bg-brand-primary/5'
                      }`}
                    >
                      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0 text-brand-primaryText" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-brand-text leading-snug">{n.title}</p>
                        {n.body && (
                          <p className="text-xs text-brand-muted mt-0.5 leading-snug">{n.body}</p>
                        )}
                        <p className="text-[10px] text-brand-muted mt-1">
                          {new Date(n.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
