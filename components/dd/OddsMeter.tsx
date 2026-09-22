'use client';

import { useEffect, useRef, useState } from 'react';
import { TrendingUp, Activity, Minus } from 'lucide-react';

// ──────────────────────────────────────────────────────────────────────────────
// OddsMeter — animated win-probability meter
//
// Renders a two-sided bar (home vs away) plus a big animated percentage for the
// viewer's team. The percentage eases toward its target whenever new points are
// scored, so the meter visibly "swings" as the week progresses.
// ──────────────────────────────────────────────────────────────────────────────

export interface OddsMeterProps {
  /** Probability the viewer's team wins, 0..100. */
  myWinPct: number;
  /** Probability the opponent wins, 0..100. */
  oppWinPct: number;
  /** Probability of a tie, 0..100. */
  tiePct: number;
  /** Projected final score for the viewer's team. */
  myProjected: number;
  /** Projected final score for the opponent. */
  oppProjected: number;
  /** 0..100 model confidence. */
  confidence: number;
  /** Short explanation of the biggest driver. */
  reason: string;
  /** Which side the model favors. */
  favored: 'me' | 'opp' | 'even';
  /** Viewer's team name. */
  myTeamName: string;
  /** Opponent's team name. */
  oppTeamName: string;
  /** True once the matchup is final — locks the meter and shows the result. */
  isFinal?: boolean;
}

/** Ease a number toward a target with requestAnimationFrame. */
function useAnimatedNumber(target: number, duration = 900): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    fromRef.current = value;
    startRef.current = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = fromRef.current + (target - fromRef.current) * eased;
      setValue(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return value;
}

export default function OddsMeter({
  myWinPct,
  oppWinPct,
  tiePct,
  myProjected,
  oppProjected,
  confidence,
  reason,
  favored,
  myTeamName,
  oppTeamName,
  isFinal = false,
}: OddsMeterProps) {
  const animatedMine = useAnimatedNumber(myWinPct);
  const animatedOpp = useAnimatedNumber(oppWinPct);

  const mine = Math.round(animatedMine);
  const opp = Math.round(animatedOpp);

  const favoredColor =
    favored === 'me' ? 'text-brand-success' : favored === 'opp' ? 'text-brand-danger' : 'text-brand-accent';

  const FavIcon = favored === 'even' ? Minus : TrendingUp;

  return (
    <div className="card p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-muted">
          <Activity className="w-3.5 h-3.5" />
          Win Probability
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-brand-muted">
          <span>Confidence</span>
          <span className="font-semibold text-brand-text">{confidence}%</span>
        </div>
      </div>

      {/* Big percentage */}
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="text-[11px] text-brand-muted mb-0.5 truncate max-w-[140px]">{myTeamName}</div>
          <div className={`text-4xl font-extrabold tabular-nums leading-none ${favoredColor}`}>
            {mine}
            <span className="text-xl font-bold">%</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-brand-muted mb-0.5 truncate max-w-[140px]">{oppTeamName}</div>
          <div className="text-2xl font-bold tabular-nums leading-none text-brand-muted">
            {opp}
            <span className="text-base">%</span>
          </div>
        </div>
      </div>

      {/* Two-sided bar */}
      <div className="relative h-3 rounded-full overflow-hidden bg-brand-elevated flex">
        <div
          className="h-full bg-gradient-to-r from-brand-success to-emerald-400 transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(0, Math.min(100, animatedMine))}%` }}
        />
        <div
          className="h-full bg-gradient-to-r from-rose-500 to-brand-danger transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(0, Math.min(100, animatedOpp))}%` }}
        />
        {tiePct > 0.5 && (
          <div
            className="h-full bg-brand-accent/70"
            style={{ width: `${Math.max(0, Math.min(100, tiePct))}%` }}
          />
        )}
      </div>

      {/* Projected score + reason */}
      <div className="mt-3 flex items-center justify-between text-xs">
        <div className="text-brand-muted">
          Projected:{' '}
          <span className="font-semibold text-brand-text">{myProjected.toFixed(1)}</span>
          <span className="mx-1">–</span>
          <span className="font-semibold text-brand-text">{oppProjected.toFixed(1)}</span>
        </div>
        {tiePct > 0.5 && <div className="text-brand-accent">Tie {tiePct.toFixed(1)}%</div>}
      </div>

      <div className={`mt-2 flex items-start gap-1.5 text-xs ${favoredColor}`}>
        <FavIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <span>{reason}</span>
      </div>

      {isFinal && (
        <div className="mt-3 text-center text-xs font-semibold uppercase tracking-wide text-brand-accent">
          Final
        </div>
      )}
    </div>
  );
}
