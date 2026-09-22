'use client';

import { useEffect, useMemo, useState } from 'react';
import { Trophy, Sparkles, Star, X, Zap } from 'lucide-react';

// ──────────────────────────────────────────────────────────────────────────────
// CelebrationOverlay — ESPN-style post-game celebration
//
// Fires when a matchup goes final. Shows a confetti burst, the result, and any
// XP earned. Dismissible; remembers dismissal per matchup in sessionStorage so
// it doesn't re-fire on every render.
// ──────────────────────────────────────────────────────────────────────────────

export interface CelebrationOverlayProps {
  /** Unique key for this celebration (e.g. `matchup-<id>-<week>`). */
  celebrationKey: string;
  /** 'win' | 'loss' | 'tie' */
  result: 'win' | 'loss' | 'tie';
  myTeamName: string;
  oppTeamName: string;
  myScore: number;
  oppScore: number;
  /** XP awarded for this result, if known. */
  xpAwarded?: number;
  /** Optional badge name unlocked. */
  badgeName?: string;
}

const CONFETTI_COLORS = ['#4f46e5', '#f59e0b', '#10b981', '#ef4444', '#a5b4fc', '#fbbf24'];

function Confetti({ count = 60 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 2.2 + Math.random() * 1.6,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 6 + Math.random() * 8,
        rotate: Math.random() * 360,
      })),
    [count]
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-[-10%] block rounded-sm"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.5,
            background: p.color,
            transform: `rotate(${p.rotate}deg)`,
            animation: `ddConfettiFall ${p.duration}s linear ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
}

export default function CelebrationOverlay({
  celebrationKey,
  result,
  myTeamName,
  oppTeamName,
  myScore,
  oppScore,
  xpAwarded,
  badgeName,
}: CelebrationOverlayProps) {
  const storageKey = `dd-celebrated-${celebrationKey}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(storageKey)) return;
    } catch {
      /* ignore */
    }
    // Small delay so the page settles before the celebration pops.
    const t = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(t);
  }, [storageKey]);

  const dismiss = () => {
    setVisible(false);
    try {
      sessionStorage.setItem(storageKey, '1');
    } catch {
      /* ignore */
    }
  };

  if (!visible) return null;

  const isWin = result === 'win';
  const isTie = result === 'tie';

  const headline = isWin ? 'VICTORY!' : isTie ? 'DEAD HEAT' : 'SO CLOSE';
  const sub = isWin
    ? `${myTeamName} takes down ${oppTeamName}`
    : isTie
    ? `${myTeamName} and ${oppTeamName} finish level`
    : `${oppTeamName} edges out ${myTeamName}`;

  const accent = isWin ? 'text-brand-success' : isTie ? 'text-brand-accent' : 'text-brand-muted';
  const ring = isWin ? 'ring-brand-success/40' : isTie ? 'ring-brand-accent/40' : 'ring-brand-border';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-[ddFadeIn_0.3s_ease-out]"
        onClick={dismiss}
      />

      {/* Confetti only on a win */}
      {isWin && <Confetti />}

      {/* Card */}
      <div
        className={`relative w-full max-w-md rounded-2xl bg-brand-surface border border-brand-border ring-4 ${ring} shadow-2xl p-6 text-center animate-[ddPopIn_0.45s_cubic-bezier(0.34,1.56,0.64,1)]`}
      >
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 text-brand-muted hover:text-brand-text transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex justify-center mb-3">
          {isWin ? (
            <div className="relative">
              <Trophy className="w-16 h-16 text-brand-accent animate-[ddBounce_1.2s_ease-in-out_infinite]" />
              <Sparkles className="w-6 h-6 text-brand-accent absolute -top-1 -right-2 animate-pulse" />
            </div>
          ) : isTie ? (
            <Star className="w-14 h-14 text-brand-accent" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-brand-elevated flex items-center justify-center text-2xl">
              💪
            </div>
          )}
        </div>

        <h2 className={`text-3xl font-extrabold tracking-tight ${accent}`}>{headline}</h2>
        <p className="text-sm text-brand-muted mt-1">{sub}</p>

        {/* Score */}
        <div className="mt-5 flex items-center justify-center gap-4">
          <div className="text-right">
            <div className="text-[11px] text-brand-muted truncate max-w-[120px]">{myTeamName}</div>
            <div className={`text-3xl font-extrabold tabular-nums ${accent}`}>{myScore.toFixed(1)}</div>
          </div>
          <div className="text-brand-muted text-lg font-bold">–</div>
          <div className="text-left">
            <div className="text-[11px] text-brand-muted truncate max-w-[120px]">{oppTeamName}</div>
            <div className="text-3xl font-extrabold tabular-nums text-brand-muted">{oppScore.toFixed(1)}</div>
          </div>
        </div>

        {/* XP + badge */}
        {(xpAwarded || badgeName) && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {xpAwarded ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary/15 border border-brand-primary/40 px-3 py-1 text-xs font-semibold text-brand-primaryText">
                <Zap className="w-3.5 h-3.5" /> +{xpAwarded} XP
              </span>
            ) : null}
            {badgeName ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-accent/15 border border-brand-accent/40 px-3 py-1 text-xs font-semibold text-brand-accent">
                <Star className="w-3.5 h-3.5" /> {badgeName}
              </span>
            ) : null}
          </div>
        )}

        <button onClick={dismiss} className="btn-primary mt-6 w-full">
          {isWin ? 'Celebrate 🎉' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
