'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { X, Trophy, Repeat, UserPlus, Bell, Sparkles, AlertCircle } from 'lucide-react';

// ──────────────────────────────────────────────────────────────────────────────
// Toast provider — in-app popup notifications.
//
// A tiny context-based toast system. `useToast().push(...)` shows a popup in
// the bottom-right corner that auto-dismisses. Used by the notification poller
// to surface league events (scores, waivers, trades) as they happen.
// ──────────────────────────────────────────────────────────────────────────────

export type ToastKind = 'score' | 'matchup' | 'waiver' | 'trade' | 'draft' | 'league';

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  body?: string | null;
  url?: string | null;
}

interface ToastContextValue {
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const ICONS: Record<ToastKind, typeof Trophy> = {
  score: Trophy,
  matchup: Trophy,
  waiver: UserPlus,
  trade: Repeat,
  draft: Sparkles,
  league: Bell,
};

const ACCENTS: Record<ToastKind, string> = {
  score: 'text-brand-accent',
  matchup: 'text-brand-accent',
  waiver: 'text-brand-success',
  trade: 'text-brand-primaryText',
  draft: 'text-brand-primaryText',
  league: 'text-brand-muted',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => {
        // Cap the stack so a burst of events can't cover the screen.
        const next = [...prev, { ...t, id }];
        return next.slice(-4);
      });
      const timer = setTimeout(() => dismiss(id), 7000);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  // Clean up any outstanding timers on unmount.
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ push, dismiss }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[min(92vw,22rem)] pointer-events-none">
        {toasts.map((t) => {
          const Icon = ICONS[t.kind] ?? AlertCircle;
          const accent = ACCENTS[t.kind] ?? 'text-brand-muted';
          return (
            <div
              key={t.id}
              className="pointer-events-auto rounded-xl border border-brand-border bg-brand-surface/95 backdrop-blur shadow-2xl p-3.5 flex items-start gap-3 animate-[toastIn_.22s_ease-out]"
              role="status"
            >
              <div className={`mt-0.5 flex-shrink-0 ${accent}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-brand-text leading-snug">{t.title}</p>
                {t.body && (
                  <p className="text-xs text-brand-muted mt-0.5 leading-snug">{t.body}</p>
                )}
                {t.url && (
                  <a
                    href={t.url}
                    className="inline-block text-xs font-semibold text-brand-primaryText hover:underline mt-1.5"
                  >
                    View →
                  </a>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="flex-shrink-0 text-brand-muted hover:text-brand-text transition-colors"
                aria-label="Dismiss notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
