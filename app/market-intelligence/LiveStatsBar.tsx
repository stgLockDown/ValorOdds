'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, Activity, Users, BookOpen, Cloud, Newspaper, Zap } from 'lucide-react';

type Stats = {
  liveArbCount: number;
  arbSports: string[];
  steamMoves24h: number;
  steamMoveSports: string[];
  injuries24h: number;
  booksTracked: number;
  gamesToday: number;
  newsToday: number;
  weatherAlerts: number;
  lastUpdated: string;
};

function StatPill({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: any;
  label: string;
  value: string | number;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-brand-border bg-brand-surface px-4 py-3">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-lg shrink-0"
        style={{ background: `${accent}1a`, color: accent }}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xl font-bold leading-tight tabular-nums" style={{ color: accent }}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
        <div className="text-xs text-brand-muted truncate">{label}</div>
      </div>
    </div>
  );
}

export default function LiveStatsBar({ initialStats }: { initialStats: Stats }) {
  const [stats, setStats] = useState<Stats>(initialStats);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/public/market-stats', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setStats(data);
          setPulse(true);
          setTimeout(() => setPulse(false), 600);
        }
      } catch {
        // silent fail — keep stale stats
      }
    }, 60_000); // refresh every 60s
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <span
          className={`inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 transition-transform ${
            pulse ? 'scale-150' : 'scale-100'
          }`}
        >
          <span className="inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        </span>
        <span className="text-sm text-brand-muted">
          Live data feed · updates every 60 seconds · last sync{' '}
          {new Date(stats.lastUpdated).toLocaleTimeString()}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <StatPill
          icon={Zap}
          label="Live arbitrage opportunities"
          value={stats.liveArbCount}
          accent="#4FD1C5"
        />
        <StatPill
          icon={TrendingUp}
          label="Steam moves (24h)"
          value={stats.steamMoves24h}
          accent="#F6AD55"
        />
        <StatPill
          icon={Activity}
          label="Injuries tracked (24h)"
          value={stats.injuries24h}
          accent="#FC8181"
        />
        <StatPill
          icon={BookOpen}
          label="Sportsbooks monitored"
          value={stats.booksTracked}
          accent="#63B3ED"
        />
        <StatPill
          icon={Users}
          label="Games in next 24h"
          value={stats.gamesToday}
          accent="#B794F4"
        />
        <StatPill
          icon={Newspaper}
          label="News stories (24h)"
          value={stats.newsToday}
          accent="#68D391"
        />
        <StatPill
          icon={Cloud}
          label="Weather alerts (6h)"
          value={stats.weatherAlerts}
          accent="#4299E1"
        />
      </div>

      {(stats.arbSports.length > 0 || stats.steamMoveSports.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-brand-muted">
          {stats.arbSports.length > 0 && (
            <span className="rounded-full bg-brand-surface border border-brand-border px-3 py-1">
              Arbitrage live in: {stats.arbSports.map((s) => s.toUpperCase()).join(', ')}
            </span>
          )}
          {stats.steamMoveSports.length > 0 && (
            <span className="rounded-full bg-brand-surface border border-brand-border px-3 py-1">
              Steam moves in: {stats.steamMoveSports.map((s) => s.toUpperCase()).join(', ')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
