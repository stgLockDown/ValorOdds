'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, Zap, Activity, AlertTriangle, BarChart2,
  Star, Settings, MessageSquare, RefreshCw, ChevronRight,
  Shield, Users, Trophy, Target, Flame, DollarSign
} from 'lucide-react';
import ChatClient from './chat/ChatClient';
import { formatOddsByPref, oddsColorClass } from '@/lib/format-odds';
import { useOddsFormat, setOddsFormatCache } from '@/lib/use-odds-format';

// Dynamically load markdown parser
declare global {
  interface Window {
    marked?: { parse: (s: string) => string };
    DOMPurify?: { sanitize: (s: string, o?: any) => string };
  }
}

function renderMarkdown(src: string): string {
  if (typeof window === 'undefined' || !window.marked || !window.DOMPurify) {
    return src.replace(/\\n/g, '<br>').replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
  }
  const html = window.marked.parse(String(src || ''));
  return window.DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p','br','strong','em','code','pre','ul','ol','li','a','h1','h2','h3','h4','blockquote','table','thead','tbody','tr','th','td','hr','span'],
    ALLOWED_ATTR: ['href','target','rel','class'],
  });
}

type Tab = 'overview' | 'best-bets' | 'odds' | 'arbitrage' | 'steam' | 'injuries' | 'players' | 'trends' | 'sportsbooks' | 'chat' | 'fantasy' | 'preferences';

const TABS: { id: Tab; label: string; icon: any; premium?: boolean }[] = [
  { id: 'overview',    label: 'Overview',       icon: Activity },
  { id: 'best-bets',  label: 'Best Bets',       icon: Star },
  { id: 'odds',       label: 'Live Odds',        icon: BarChart2 },
  { id: 'arbitrage',  label: 'Arbitrage',        icon: DollarSign, premium: true },
  { id: 'steam',      label: 'Steam Moves',      icon: Flame, premium: true },
  { id: 'injuries',   label: 'Injuries',         icon: AlertTriangle },
  { id: 'players',    label: 'Player Stats',     icon: Users },
  { id: 'trends',     label: 'Trends',           icon: TrendingUp },
  { id: 'sportsbooks',label: 'Sportsbooks',      icon: Shield },
  { id: 'chat',       label: 'AI Chat',          icon: MessageSquare },
  { id: 'fantasy',    label: 'Fantasy',          icon: Trophy },
  { id: 'preferences',label: 'Preferences',     icon: Settings },
];

const SPORTS = ['All', 'NBA', 'NFL', 'MLB', 'NHL', 'SOCCER', 'MMA', 'BOXING', 'TENNIS'];

function Badge({ text, color }: { text: string; color: string }) {
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${color}`}>{text}</span>;
}

function SportFilter({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {SPORTS.map(s => (
        <button key={s} onClick={() => onChange(s === 'All' ? '' : s)}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
            (s === 'All' && !value) || s === value
              ? 'bg-brand-primary text-white'
              : 'bg-brand-elevated text-brand-muted hover:text-white'
          }`}>
          {s}
        </button>
      ))}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-8 w-8 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-16 text-brand-muted">
      <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
      <p>{message}</p>
    </div>
  );
}

// ---------- Tab Components ----------

function BestBetsTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('all');
  const [markedLoaded, setMarkedLoaded] = useState(false);

  // Load markdown parser
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const load = () => {
      if (window.marked && window.DOMPurify) {
        setMarkedLoaded(true);
        return;
      }
      Promise.all([
        new Promise<void>((resolve) => {
          if (document.querySelector('script[src*="marked"]')) return resolve();
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/marked@12/marked.min.js';
          s.onload = () => resolve();
          document.head.appendChild(s);
        }),
        new Promise<void>((resolve) => {
          if (document.querySelector('script[src*="purify"]')) return resolve();
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js';
          s.onload = () => resolve();
          document.head.appendChild(s);
        })
      ]).then(() => setMarkedLoaded(true));
    };
    load();
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/best-bets?type=${type}&limit=10`)
      .then(r => r.json()).then(d => setData(d.data || []))
      .finally(() => setLoading(false));
  }, [type]);

  const types = [
    { id: 'all', label: 'All' },
    { id: 'bestBets', label: 'Best Bets' },
    { id: 'dailyPicks', label: 'Daily Picks' },
    { id: 'depthAnalysis', label: 'Deep Analysis' },
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6">
        {types.map(t => (
          <button key={t.id} onClick={() => setType(t.id)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              type === t.id ? 'bg-brand-primary text-white' : 'bg-brand-elevated text-brand-muted hover:text-white'
            }`}>{t.label}</button>
        ))}
      </div>
      {loading ? <LoadingSpinner /> : data.length === 0 ? <EmptyState message="No picks available yet." /> : (
        <div className="space-y-4">
          {data.map((item: any) => (
            <div key={item.id} className="card">
              <div className="flex items-center justify-between mb-3">
                <Badge text={item.analysis_type} color="bg-brand-primary/20 text-brand-primary" />
                <div className="flex items-center gap-2">
                  {item.confidence && <Badge text={`${item.confidence}% conf`} color="bg-green-500/20 text-green-400" />}
                  <span className="text-xs text-brand-muted">{new Date(item.generated_at).toLocaleString()}</span>
                </div>
              </div>
              <div
                className="prose prose-invert prose-sm max-w-none text-brand-text text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: markedLoaded ? renderMarkdown(item.content || '') : item.content }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OddsTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sport, setSport] = useState('');
  const [market, setMarket] = useState('h2h');
  const oddsFormat = useOddsFormat();

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/odds?sport=${sport}&market=${market}&limit=20`)
      .then(r => r.json()).then(d => setData(d.data || []))
      .finally(() => setLoading(false));
  }, [sport, market]);

  const markets = [
    { id: 'h2h', label: 'Moneyline' },
    { id: 'spreads', label: 'Spreads' },
    { id: 'totals', label: 'Totals' },
  ];

  return (
    <div>
      <SportFilter value={sport} onChange={setSport} />
      <div className="flex gap-2 mb-4">
        {markets.map(m => (
          <button key={m.id} onClick={() => setMarket(m.id)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              market === m.id ? 'bg-brand-primary text-white' : 'bg-brand-elevated text-brand-muted hover:text-white'
            }`}>{m.label}</button>
        ))}
      </div>
      {loading ? <LoadingSpinner /> : data.length === 0 ? <EmptyState message="No odds data available. The bot may be updating." /> : (
        <div className="space-y-4">
          {data.map((game: any) => (
            <div key={game.game_id} className="card">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-xs text-brand-muted uppercase tracking-wider">{game.sport}</span>
                  <h3 className="font-semibold">{game.away_team} @ {game.home_team}</h3>
                  <p className="text-xs text-brand-muted">{new Date(game.commence_time).toLocaleString()}</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-brand-muted uppercase tracking-wider">
                      <th className="text-left py-1">Sportsbook</th>
                      {Object.values(game.books)[0] && (Object.values(game.books)[0] as any).outcomes.map((o: any) => (
                        <th key={o.name} className="text-right py-1">{o.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(game.books).map((book: any) => (
                      <tr key={book.key} className="border-t border-brand-border">
                        <td className="py-1.5 text-brand-muted">{book.name}</td>
                        {book.outcomes.map((o: any) => (
                          <td key={o.name} className={`text-right font-mono font-semibold py-1.5 ${oddsColorClass(o.price)}`}>
                            {formatOddsByPref(o.price, oddsFormat)}
                            {o.point ? <span className="text-xs text-brand-muted ml-1">({o.point})</span> : null}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ArbitrageTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sport, setSport] = useState('');
  const oddsFormat = useOddsFormat();

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/arbitrage?sport=${sport}&limit=20`)
      .then(r => r.json()).then(d => setData(d.data || []))
      .finally(() => setLoading(false));
  }, [sport]);

  return (
    <div>
      <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-4 mb-6">
        <p className="text-sm text-green-400">
          <span className="font-semibold">⚡ Arbitrage opportunities</span> let you bet both sides across different sportsbooks for guaranteed profit regardless of outcome.
        </p>
      </div>
      <SportFilter value={sport} onChange={setSport} />
      {loading ? <LoadingSpinner /> : data.length === 0 ? <EmptyState message="No arbitrage opportunities detected right now." /> : (
        <div className="space-y-4">
          {data.map((arb: any) => (
            <div key={arb.id} className="card border-l-4 border-l-green-500">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <Badge text={arb.sport} color="bg-brand-elevated text-brand-muted" />
                  <span className="ml-2 text-xs text-brand-muted">{arb.market_name}</span>
                </div>
                <Badge text={`+${parseFloat(arb.profit_percentage).toFixed(2)}% profit`} color="bg-green-500/20 text-green-400" />
              </div>
              <h3 className="font-semibold mb-3">{arb.away_team} @ {arb.home_team}</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-brand-elevated p-3">
                  <p className="text-xs text-brand-muted mb-1">{arb.side1_bookmaker}</p>
                  <p className="font-semibold">{arb.side1_selection}</p>
                  <p className="text-xl font-mono font-bold text-brand-primary">
                    {formatOddsByPref(arb.side1_odds, oddsFormat)}
                  </p>
                  {arb.side1_stake && <p className="text-xs text-brand-muted mt-1">Stake: ${parseFloat(arb.side1_stake).toFixed(2)}</p>}
                </div>
                <div className="rounded-lg bg-brand-elevated p-3">
                  <p className="text-xs text-brand-muted mb-1">{arb.side2_bookmaker}</p>
                  <p className="font-semibold">{arb.side2_selection}</p>
                  <p className="text-xl font-mono font-bold text-brand-primary">
                    {formatOddsByPref(arb.side2_odds, oddsFormat)}
                  </p>
                  {arb.side2_stake && <p className="text-xs text-brand-muted mt-1">Stake: ${parseFloat(arb.side2_stake).toFixed(2)}</p>}
                </div>
              </div>
              {arb.guaranteed_profit && (
                <p className="text-xs text-green-400 mt-2">
                  💰 Guaranteed profit: ${parseFloat(arb.guaranteed_profit).toFixed(2)} per $100 wagered
                </p>
              )}
              <p className="text-xs text-brand-muted mt-1">
                🕐 {new Date(arb.detected_at).toLocaleString()} · Game: {new Date(arb.commence_time).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SteamTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sport, setSport] = useState('');
  const [hours, setHours] = useState(24);
  const oddsFormat = useOddsFormat();

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/steam-moves?sport=${sport}&hours=${hours}&limit=30`)
      .then(r => r.json()).then(d => setData(d.data || []))
      .finally(() => setLoading(false));
  }, [sport, hours]);

  function direction(before: number, after: number) {
    return after > before ? '📈 Line moved toward this side' : '📉 Line moved away';
  }

  return (
    <div>
      <div className="rounded-xl bg-orange-500/10 border border-orange-500/20 p-4 mb-6">
        <p className="text-sm text-orange-400">
          <span className="font-semibold">🔥 Steam moves</span> indicate sharp money is hitting a side. Multiple sportsbooks moving simultaneously signals professional betting action.
        </p>
      </div>
      <SportFilter value={sport} onChange={setSport} />
      <div className="flex gap-2 mb-4">
        {[6, 12, 24, 48].map(h => (
          <button key={h} onClick={() => setHours(h)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              hours === h ? 'bg-brand-primary text-white' : 'bg-brand-elevated text-brand-muted hover:text-white'
            }`}>{h}h</button>
        ))}
      </div>
      {loading ? <LoadingSpinner /> : data.length === 0 ? <EmptyState message="No steam moves detected in this window." /> : (
        <div className="space-y-3">
          {data.map((move: any) => (
            <div key={move.id} className="card border-l-4 border-l-orange-500">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge text={move.sport} color="bg-brand-elevated text-brand-muted" />
                    <Badge text={move.market_type} color="bg-brand-elevated text-brand-muted" />
                    <Badge
                      text={move.direction?.toUpperCase() || 'MOVED'}
                      color={['UP', 'SHORTENING'].includes((move.direction || '').toUpperCase()) ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}
                    />
                  </div>
                  <p className="font-semibold text-sm">{move.away_team} @ {move.home_team}</p>
                  <p className="text-sm text-brand-primary font-semibold mt-1">
                    📌 {move.outcome_name}:
                    <span className="ml-2 font-mono line-through text-brand-muted">{formatOddsByPref(move.before_avg_price, oddsFormat)}</span>
                    <span className="ml-2 font-mono text-orange-400">→ {formatOddsByPref(move.after_avg_price, oddsFormat)}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-orange-400">{move.books_moved}/{move.total_books}</p>
                  <p className="text-xs text-brand-muted">books moved</p>
                </div>
              </div>
              <p className="text-xs text-brand-muted mt-2">{new Date(move.detected_at).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InjuriesTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sport, setSport] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/injuries?sport=${sport}&status=${status}&limit=50`)
      .then(r => r.json()).then(d => setData(d.data || []))
      .finally(() => setLoading(false));
  }, [sport, status]);

  const statuses = [
    { id: '', label: 'All' },
    { id: 'Out', label: '🔴 Out' },
    { id: 'Doubtful', label: '🟠 Doubtful' },
    { id: 'Questionable', label: '🟡 Questionable' },
    { id: 'Day-To-Day', label: '🟢 Day-To-Day' },
  ];

  function statusColor(s: string) {
    if (s === 'Out') return 'bg-red-500/20 text-red-400';
    if (s === 'Doubtful') return 'bg-orange-500/20 text-orange-400';
    if (s === 'Questionable') return 'bg-yellow-500/20 text-yellow-400';
    return 'bg-green-500/20 text-green-400';
  }

  return (
    <div>
      <SportFilter value={sport} onChange={setSport} />
      <div className="flex flex-wrap gap-2 mb-4">
        {statuses.map(s => (
          <button key={s.id} onClick={() => setStatus(s.id)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              status === s.id ? 'bg-brand-primary text-white' : 'bg-brand-elevated text-brand-muted hover:text-white'
            }`}>{s.label}</button>
        ))}
      </div>
      {loading ? <LoadingSpinner /> : data.length === 0 ? <EmptyState message="No injury reports in the last 72 hours." /> : (
        <div className="space-y-2">
          {data.map((inj: any, i: number) => (
            <div key={i} className="card py-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold">{inj.player_name}</span>
                    <span className="text-xs text-brand-muted">{inj.team}</span>
                    <Badge text={inj.sport} color="bg-brand-elevated text-brand-muted" />
                    {inj.position && <span className="text-xs text-brand-muted">{inj.position}</span>}
                  </div>
                  <p className="text-sm text-brand-muted">{inj.injury_type}{inj.description ? ` — ${inj.description.slice(0, 120)}` : ''}</p>
                </div>
                <Badge text={inj.status} color={statusColor(inj.status)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerStatsTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sport, setSport] = useState('');
  const [notable, setNotable] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/player-stats?sport=${sport}&notable=${notable}&limit=30`)
      .then(r => r.json()).then(d => setData(d.data || []))
      .finally(() => setLoading(false));
  }, [sport, notable]);

  function statLine(p: any) {
    const parts = [];
    if (p.sport === 'NBA' || p.sport === 'basketball') {
      if (p.points) parts.push(`${p.points} PTS`);
      if (p.rebounds) parts.push(`${p.rebounds} REB`);
      if (p.assists) parts.push(`${p.assists} AST`);
      if (p.three_pointers_made) parts.push(`${p.three_pointers_made} 3PM`);
    } else if (p.sport === 'NFL' || p.sport === 'football') {
      if (p.yards) parts.push(`${p.yards} YDS`);
      if (p.touchdowns) parts.push(`${p.touchdowns} TD`);
    } else if (p.sport === 'MLB' || p.sport === 'baseball') {
      if (p.hits) parts.push(`${p.hits} H`);
      if (p.home_runs) parts.push(`${p.home_runs} HR`);
      if (p.rbis) parts.push(`${p.rbis} RBI`);
    } else if (p.sport === 'NHL' || p.sport === 'hockey') {
      if (p.goals) parts.push(`${p.goals} G`);
      if (p.saves) parts.push(`${p.saves} SV`);
    }
    return parts.join(' · ') || '—';
  }

  return (
    <div>
      <SportFilter value={sport} onChange={setSport} />
      <div className="flex gap-2 mb-4">
        <button onClick={() => setNotable(false)}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${!notable ? 'bg-brand-primary text-white' : 'bg-brand-elevated text-brand-muted hover:text-white'}`}>
          All Players
        </button>
        <button onClick={() => setNotable(true)}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${notable ? 'bg-brand-primary text-white' : 'bg-brand-elevated text-brand-muted hover:text-white'}`}>
          ⭐ Notable Performances
        </button>
      </div>
      {loading ? <LoadingSpinner /> : data.length === 0 ? <EmptyState message="No player stats in the last 7 days." /> : (
        <div className="space-y-2">
          {data.map((p: any, i: number) => (
            <div key={i} className="card py-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold">{p.player_name}</span>
                    <Badge text={p.sport} color="bg-brand-elevated text-brand-muted" />
                    <span className="text-xs text-brand-muted">{p.team}</span>
                    {p.position && <span className="text-xs text-brand-muted">{p.position}</span>}
                  </div>
                  <p className="text-sm font-mono text-brand-primary">{statLine(p)}</p>
                  {p.notable_reason && <p className="text-xs text-yellow-400 mt-1">⭐ {p.notable_reason}</p>}
                </div>
                {p.fantasy_score && (
                  <div className="text-right">
                    <p className="text-lg font-bold text-brand-primary">{parseFloat(p.fantasy_score).toFixed(1)}</p>
                    <p className="text-xs text-brand-muted">Fantasy</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TrendsTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sport, setSport] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/trends?sport=${sport}&limit=30`)
      .then(r => r.json()).then(d => setData(d.data || []))
      .finally(() => setLoading(false));
  }, [sport]);

  return (
    <div>
      <SportFilter value={sport} onChange={setSport} />
      {loading ? <LoadingSpinner /> : data.length === 0 ? <EmptyState message="No trend data available." /> : (
        <div className="space-y-2">
          {data.map((t: any, i: number) => (
            <div key={i} className="card py-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge text={t.sport} color="bg-brand-elevated text-brand-muted" />
                    <Badge text={t.market_type} color="bg-brand-elevated text-brand-muted" />
                    <Badge
                      text={t.outcome === 'home_win' ? '🏠 Home Win' : t.outcome === 'away_win' ? '✈️ Away Win' : t.outcome}
                      color={t.outcome === 'home_win' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}
                    />
                  </div>
                  <p className="font-semibold text-sm">{t.team} vs {t.opponent}</p>
                  {t.final_score && <p className="text-xs text-brand-muted">Final: {t.final_score}</p>}
                </div>
                <div className="text-right">
                  <p className="text-xs text-brand-muted">{new Date(t.event_date).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SportsbooksTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/sportsbook-reviews')
      .then(r => r.json()).then(d => setData(d.data || []))
      .finally(() => setLoading(false));
  }, []);

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div>
      <p className="text-sm text-brand-muted mb-6">Rankings based on line quality, CLV, hold percentage, and arbitrage opportunity frequency.</p>
      {loading ? <LoadingSpinner /> : data.length === 0 ? <EmptyState message="No sportsbook data available." /> : (
        <div className="space-y-3">
          {data.map((book: any, i: number) => (
            <div key={book.bookmaker_key} className="card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{medals[i] || `#${i + 1}`}</span>
                  <div>
                    <h3 className="font-semibold capitalize">{book.bookmaker_name || book.bookmaker_key}</h3>
                    <p className="text-xs text-brand-muted">{book.lines_tracked?.toLocaleString() || 0} lines tracked</p>
                  </div>
                </div>
                <div className="flex gap-4 text-right">
                  {book.avg_clv !== null && (
                    <div>
                      <p className={`font-mono font-bold ${parseFloat(book.avg_clv) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {parseFloat(book.avg_clv) >= 0 ? '+' : ''}{parseFloat(book.avg_clv).toFixed(2)}¢
                      </p>
                      <p className="text-xs text-brand-muted">Avg CLV</p>
                    </div>
                  )}
                  {book.arb_appearances !== null && (
                    <div>
                      <p className="font-mono font-bold text-brand-primary">{book.arb_appearances}</p>
                      <p className="text-xs text-brand-muted">Arb Spots</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PreferencesTab({ userId }: { userId: string }) {
  const [prefs, setPrefs] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [teamInput, setTeamInput] = useState('');
  const [playerInput, setPlayerInput] = useState('');

  useEffect(() => {
    fetch('/api/dashboard/preferences')
      .then(r => r.json())
      .then(d => setPrefs(d.data || {}))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    await fetch('/api/dashboard/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function addTag(field: 'teams' | 'players' | 'sportsbooks' | 'sports', value: string) {
    if (!value.trim()) return;
    setPrefs((p: any) => ({ ...p, [field]: [...(p[field] || []), value.trim()] }));
  }

  function removeTag(field: 'teams' | 'players' | 'sportsbooks' | 'sports', value: string) {
    setPrefs((p: any) => ({ ...p, [field]: (p[field] || []).filter((v: string) => v !== value) }));
  }

  if (loading) return <LoadingSpinner />;

  const SPORTSBOOK_OPTIONS = [
    'draftkings', 'fanduel', 'betmgm', 'caesars', 'pointsbet',
    'barstool', 'unibet', 'betrivers', 'bovada', 'mybookie',
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Followed Sports */}
      <div className="card">
        <h3 className="font-semibold mb-3">🏆 Followed Sports</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {SPORTS.filter(s => s !== 'All').map(s => (
            <button key={s}
              onClick={() => (prefs.sports || []).includes(s) ? removeTag('sports', s) : addTag('sports', s)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                (prefs.sports || []).includes(s)
                  ? 'bg-brand-primary text-white'
                  : 'bg-brand-elevated text-brand-muted hover:text-white'
              }`}>{s}</button>
          ))}
        </div>
      </div>

      {/* Followed Teams */}
      <div className="card">
        <h3 className="font-semibold mb-3">🏠 Followed Teams</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {(prefs.teams || []).map((t: string) => (
            <span key={t} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-brand-primary/20 text-brand-primary text-xs font-semibold">
              {t}
              <button onClick={() => removeTag('teams', t)} className="hover:text-white ml-1">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={teamInput}
            onChange={e => setTeamInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { addTag('teams', teamInput); setTeamInput(''); }}}
            placeholder="Add team (e.g. Lakers, Cowboys)..."
            className="input flex-1 text-sm"
          />
          <button onClick={() => { addTag('teams', teamInput); setTeamInput(''); }}
            className="btn-primary px-4 text-sm">Add</button>
        </div>
      </div>

      {/* Followed Players */}
      <div className="card">
        <h3 className="font-semibold mb-3">⭐ Followed Players</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {(prefs.players || []).map((p: string) => (
            <span key={p} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-brand-primary/20 text-brand-primary text-xs font-semibold">
              {p}
              <button onClick={() => removeTag('players', p)} className="hover:text-white ml-1">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={playerInput}
            onChange={e => setPlayerInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { addTag('players', playerInput); setPlayerInput(''); }}}
            placeholder="Add player (e.g. LeBron James)..."
            className="input flex-1 text-sm"
          />
          <button onClick={() => { addTag('players', playerInput); setPlayerInput(''); }}
            className="btn-primary px-4 text-sm">Add</button>
        </div>
      </div>

      {/* Sportsbooks */}
      <div className="card">
        <h3 className="font-semibold mb-3">📚 Followed Sportsbooks</h3>
        <div className="flex flex-wrap gap-2">
          {SPORTSBOOK_OPTIONS.map(s => (
            <button key={s}
              onClick={() => (prefs.sportsbooks || []).includes(s) ? removeTag('sportsbooks', s) : addTag('sportsbooks', s)}
              className={`px-3 py-1 rounded-full text-xs font-semibold capitalize transition-colors ${
                (prefs.sportsbooks || []).includes(s)
                  ? 'bg-brand-primary text-white'
                  : 'bg-brand-elevated text-brand-muted hover:text-white'
              }`}>{s}</button>
          ))}
        </div>
      </div>

      {/* Notifications */}
      <div className="card">
        <h3 className="font-semibold mb-4">🔔 Alert Preferences</h3>
        <div className="space-y-3">
          {[
            { key: 'notify_arb', label: 'Arbitrage opportunities', desc: 'Get notified of guaranteed profit bets' },
            { key: 'notify_steam', label: 'Steam moves', desc: 'Sharp money hitting a side' },
            { key: 'notify_injuries', label: 'Injury reports', desc: 'Key player injury updates' },
            { key: 'notify_best_bets', label: 'AI best bets', desc: 'Daily AI-generated picks' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-brand-muted">{desc}</p>
              </div>
              <button
                onClick={() => setPrefs((p: any) => ({ ...p, [key]: !p[key] }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  prefs[key] ? 'bg-brand-primary' : 'bg-brand-elevated'
                }`}>
                <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  prefs[key] ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Odds Format */}
      <div className="card">
        <h3 className="font-semibold mb-3">💰 Odds Format</h3>
        <div className="flex gap-2">
          {['american', 'decimal', 'fractional'].map(f => (
            <button key={f} onClick={() => {
              setPrefs((p: any) => ({ ...p, odds_format: f }));
              setOddsFormatCache(f as any);
            }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-colors ${
                prefs.odds_format === f ? 'bg-brand-primary text-white' : 'bg-brand-elevated text-brand-muted hover:text-white'
              }`}>{f}</button>
          ))}
        </div>
      </div>

      <button onClick={save} disabled={saving}
        className="btn-primary w-full py-3 text-base font-semibold">
        {saving ? 'Saving...' : saved ? '✅ Saved!' : 'Save Preferences'}
      </button>
    </div>
  );
}

function OverviewTab({ user }: { user: any }) {
  const [stats, setStats] = useState<any>({});
  const [bestBet, setBestBet] = useState<any>(null);
  const [arbs, setArbs] = useState<any[]>([]);
  const [steam, setSteam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard/best-bets?type=bestBets&limit=1').then(r => r.json()),
      fetch('/api/dashboard/arbitrage?limit=3').then(r => r.json()),
      fetch('/api/dashboard/steam-moves?hours=12&limit=3').then(r => r.json()),
    ]).then(([bets, arbData, steamData]) => {
      setBestBet(bets.data?.[0] || null);
      setArbs(arbData.data || []);
      setSteam(steamData.data || []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="card bg-gradient-to-r from-brand-primary/20 to-purple-500/10 border-brand-primary/30">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Welcome back, {user.name || user.email?.split('@')[0]}! 👋</h2>
            <p className="text-brand-muted text-sm mt-1">
              <Badge text={user.tier?.toUpperCase() || 'FREE'} color={
                user.tier === 'vip' ? 'bg-yellow-500/20 text-yellow-400' :
                user.tier === 'premium' ? 'bg-brand-primary/20 text-brand-primary' :
                'bg-brand-elevated text-brand-muted'
              } />
              {user.isAdmin && <span className="ml-2"><Badge text="ADMIN" color="bg-red-500/20 text-red-400" /></span>}
            </p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Live Arb Spots', value: arbs.length, icon: DollarSign, color: 'text-green-400' },
          { label: 'Steam Moves (12h)', value: steam.length, icon: Flame, color: 'text-orange-400' },
          { label: 'AI Picks Today', value: bestBet ? '✓' : '—', icon: Star, color: 'text-brand-primary' },
          { label: 'Status', value: 'Live', icon: Activity, color: 'text-green-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card text-center">
            <Icon className={`h-6 w-6 mx-auto mb-2 ${color}`} />
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-brand-muted mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Latest Best Bet */}
      {bestBet && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center gap-2"><Star className="h-4 w-4 text-brand-primary" /> Latest AI Best Bets</h3>
            <span className="text-xs text-brand-muted">{new Date(bestBet.generated_at).toLocaleString()}</span>
          </div>
          <div className="text-sm text-brand-muted whitespace-pre-wrap leading-relaxed line-clamp-6">
            {bestBet.content}
          </div>
        </div>
      )}

      {/* Latest Arb Opportunities */}
      {arbs.length > 0 && (
        <div className="card">
          <h3 className="font-semibold flex items-center gap-2 mb-3"><DollarSign className="h-4 w-4 text-green-400" /> Live Arbitrage</h3>
          <div className="space-y-2">
            {arbs.map((arb: any) => (
              <div key={arb.id} className="flex items-center justify-between p-2 rounded-lg bg-brand-elevated">
                <div>
                  <p className="text-sm font-semibold">{arb.away_team} @ {arb.home_team}</p>
                  <p className="text-xs text-brand-muted">{arb.side1_bookmaker} vs {arb.side2_bookmaker}</p>
                </div>
                <Badge text={`+${parseFloat(arb.profit_percentage).toFixed(2)}%`} color="bg-green-500/20 text-green-400" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Latest Steam Moves */}
      {steam.length > 0 && (
        <div className="card">
          <h3 className="font-semibold flex items-center gap-2 mb-3"><Flame className="h-4 w-4 text-orange-400" /> Recent Steam Moves</h3>
          <div className="space-y-2">
            {steam.map((move: any) => (
              <div key={move.id} className="flex items-center justify-between p-2 rounded-lg bg-brand-elevated">
                <div>
                  <p className="text-sm font-semibold">{move.outcome_name}</p>
                  <p className="text-xs text-brand-muted">{move.home_team} vs {move.away_team}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono text-orange-400">{move.before_avg_price} → {move.after_avg_price}</p>
                  <p className="text-xs text-brand-muted">{move.books_moved} books</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Main Dashboard ----------

export default function DashboardClient({ user }: { user: any }) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const isPremiumOrVip = user.tier === 'premium' || user.tier === 'vip' || user.isAdmin;

  function renderTab() {
    switch (activeTab) {
      case 'overview':     return <OverviewTab user={user} />;
      case 'best-bets':    return <BestBetsTab />;
      case 'odds':         return <OddsTab />;
      case 'arbitrage':    return isPremiumOrVip ? <ArbitrageTab /> : <LockedTab />;
      case 'steam':        return isPremiumOrVip ? <SteamTab /> : <LockedTab />;
      case 'injuries':     return <InjuriesTab />;
      case 'players':      return <PlayerStatsTab />;
      case 'trends':       return <TrendsTab />;
      case 'sportsbooks':  return <SportsbooksTab />;
      case 'chat':         return <ChatClient user={{ id: user.id, email: user.email, tier: user.tier || 'free', discordId: user.discordId || null }} />;
      case 'fantasy':      return <FantasyTab userTier={user.tier || 'free'} />;
      case 'preferences':  return <PreferencesTab userId={user.id} />;
      default:             return null;
    }
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="mx-auto px-4 py-4">
        {/* Tab Nav */}
        <div className="flex flex-wrap gap-1 mb-4">
          {TABS.map(({ id, label, icon: Icon, premium }) => {
            const locked = premium && !isPremiumOrVip;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === id
                    ? 'bg-brand-primary text-white'
                    : 'text-brand-muted hover:text-white hover:bg-brand-elevated'
                } ${locked ? 'opacity-60' : ''}`}
              >
                <Icon className="h-4 w-4" />
                {label}
                {locked && <span className="text-xs">🔒</span>}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div>
          {renderTab()}
        </div>
      </div>
    </div>
  );
}

function LockedTab() {
  return (
    <div className="text-center py-20">
      <div className="text-5xl mb-4">🔒</div>
      <h2 className="text-xl font-bold mb-2">Premium Feature</h2>
      <p className="text-brand-muted mb-6">Upgrade to Premium or VIP to access this feature.</p>
      <a href="/pricing" className="btn-primary px-8 py-3">Upgrade Now</a>
    </div>
  );
}

// ---------- Fantasy Tab (DiamondDraft) ----------

function FantasyTab({ userTier }: { userTier: string }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<{
    configured: boolean;
    leagues: any[];
    ddTier: string | null;
    ssoUrl: string | null;
  } | null>(null);

  const fetchLeagues = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/fantasy/leagues', { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErr(body.error || `Fantasy feed returned HTTP ${res.status}`);
        return;
      }
      setData(await res.json());
    } catch (e: any) {
      setErr(e?.message || 'Failed to reach the fantasy feed.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLeagues(); }, [fetchLeagues]);

  const openFantasy = useCallback(async () => {
    try {
      const res = await fetch('/api/fantasy/handoff', { method: 'POST', body: JSON.stringify({ redirect: '/dashboard' }) });
      const body = await res.json();
      if (!res.ok) {
        setErr(body.error || 'Could not open DiamondDraft.');
        return;
      }
      window.open(body.ssoUrl, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      setErr(e?.message || 'Could not open DiamondDraft.');
    }
  }, []);

  const entitled = ['beta', 'premium', 'vip'].includes((userTier || '').toLowerCase());

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-brand-card p-4 bg-brand-card">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Trophy className="h-5 w-5 text-brand-accent" />
              Fantasy Sports
            </h2>
            <p className="text-sm text-brand-muted mt-1">
              Run your leagues on <span className="font-semibold text-brand-fg">DiamondDraft</span> — baseball today, NFL & NBA & NHL coming soon.
              {entitled
                ? ' Your Valor Odds plan includes DiamondDraft Pro.'
                : ' DiamondDraft Free covers 2 leagues; Pro is included with Beta, Premium and VIP.'}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={openFantasy} className="btn-primary px-4 py-2 whitespace-nowrap">
              Open DiamondDraft →
            </button>
            <button
              onClick={fetchLeagues}
              className="px-3 py-2 rounded border border-brand-card text-brand-muted hover:text-brand-fg"
              aria-label="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {err && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {err}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="text-center py-12 text-brand-muted">Loading your leagues…</div>
      ) : !data?.configured ? (
        <div className="rounded-xl border border-brand-card p-6 bg-brand-card text-center">
          <p className="text-brand-muted mb-4">
            Fantasy integration is not connected on this server yet. Once the admin wires up
            <code className="mx-1 px-1.5 py-0.5 bg-black/30 rounded text-xs">DIAMONDDRAFT_SSO_SECRET</code>
            and
            <code className="mx-1 px-1.5 py-0.5 bg-black/30 rounded text-xs">DIAMONDDRAFT_API_URL</code>,
            your leagues will appear here automatically.
          </p>
          <button onClick={openFantasy} className="btn-primary px-6 py-2">
            Open DiamondDraft
          </button>
        </div>
      ) : data.leagues.length === 0 ? (
        <div className="rounded-xl border border-brand-card p-6 bg-brand-card text-center">
          <p className="text-brand-muted mb-4">
            You don't have any fantasy leagues yet.
          </p>
          <button onClick={openFantasy} className="btn-primary px-6 py-2">
            Create your first league →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.leagues.map((lg: any) => (
            <div key={lg.id} className="rounded-xl border border-brand-card p-4 bg-brand-card">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold">{lg.name}</h3>
                {lg.status && (
                  <span className="text-xs uppercase tracking-wide text-brand-muted">
                    {lg.status}
                  </span>
                )}
              </div>
              <p className="text-sm text-brand-muted">
                {(lg.format || 'Head-to-Head').replace(/_/g, ' ')}
                {lg.memberCount ? ` · ${lg.memberCount} members` : ''}
              </p>
              <button
                onClick={openFantasy}
                className="mt-3 text-sm text-brand-accent hover:underline"
              >
                Open league →
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Entitlement note */}
      <div className="text-xs text-brand-muted">
        {entitled
          ? `Your ${userTier.toUpperCase()} plan unlocks DiamondDraft Pro automatically.`
          : 'Upgrade to Beta or higher to get DiamondDraft Pro included.'}
      </div>
    </div>
  );
}

// Add displayName for layout detection
DashboardClient.displayName = 'DashboardClient';
