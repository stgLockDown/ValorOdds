'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  TrendingUp, Zap, Activity, AlertTriangle, BarChart2,
  Star, Settings, MessageSquare, RefreshCw, ChevronRight, ChevronLeft,
  Shield, Users, Trophy, Target, Flame, DollarSign, KeyRound, Headphones
} from 'lucide-react';
import Link from 'next/link';
import ChatClient from '../(sub)/chat/ChatClient';
import PinGameButton from '@/components/PinGameButton';
import BoxScore from '@/components/BoxScore';
import { formatOddsByPref, oddsColorClass } from '@/lib/format-odds';
import { useOddsFormat, setOddsFormatCache } from '@/lib/use-odds-format';
import { canUseArbitrage } from '@/lib/entitlements';

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

type Tab = 'command-center' | 'overview' | 'best-bets' | 'odds' | 'arbitrage' | 'steam' | 'injuries' | 'players' | 'trends' | 'sportsbooks' | 'chat' | 'preferences';

const TABS: { id: Tab; label: string; icon: any; premium?: boolean }[] = [
  { id: 'command-center', label: 'Command Center', icon: Zap },
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
  { id: 'preferences',label: 'Preferences',     icon: Settings },
];

const SPORTS = ['All', 'NBA', 'NFL', 'MLB', 'NHL', 'SOCCER', 'MMA', 'BOXING', 'TENNIS'];

function Badge({ text, color }: { text: string; color: string }) {
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${color}`}>{text}</span>;
}

// Brand-consistent colour for a tier badge. Basic gets a distinct cyan so
// it reads as "paid but entry-level" between free (grey) and premium.
function tierBadgeColor(tier?: string): string {
  switch (tier) {
    case 'vip': return 'bg-yellow-500/20 text-yellow-400';
    case 'premium': return 'bg-brand-primary/20 text-brand-primary';
    case 'basic': return 'bg-cyan-500/20 text-cyan-300';
    default: return 'bg-brand-elevated text-brand-muted';
  }
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
  const [sport, setSport] = useState('');
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
    fetch(`/api/dashboard/best-bets?type=${type}&sport=${sport}&limit=10`)
      .then(r => r.json()).then(d => setData(d.data || []))
      .finally(() => setLoading(false));
  }, [type, sport]);

  const types = [
    { id: 'all', label: 'All' },
    { id: 'bestBets', label: 'Best Bets' },
    { id: 'dailyPicks', label: 'Daily Picks' },
    { id: 'depthAnalysis', label: 'Depth Chart Analysis' },
  ];

  // Map the raw `analysis_type` DB value to the same human-readable label
  // used on the filter buttons above. Previously the card badge rendered
  // `item.analysis_type` verbatim (e.g. literal "depthAnalysis"), which
  // looked like a leaked internal field name (QA audit: "Raw internal data
  // leaking into the AI Best Bets panel").
  const typeLabel = (id: string): string => types.find(t => t.id === id)?.label || id;

  return (
    <div>
      <SportFilter value={sport} onChange={setSport} />
      <div className="flex flex-wrap gap-2 mb-6">
        {types.map(t => (
          <button key={t.id} onClick={() => setType(t.id)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              type === t.id ? 'bg-brand-primary text-white' : 'bg-brand-elevated text-brand-muted hover:text-white'
            }`}>{t.label}</button>
        ))}
      </div>
      {loading ? <LoadingSpinner /> : data.length === 0 ? <EmptyState message="No picks available yet." /> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
          {data.map((item: any) => (
            <div key={item.id} className="card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Badge text={typeLabel(item.analysis_type)} color="bg-brand-primary/20 text-brand-primary" />
                  {item.sports_data?.sport && (
                    <Badge text={item.sports_data.sport} color="bg-brand-elevated text-brand-muted" />
                  )}
                </div>
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
              <div className="table-scroll">
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

function money(v: any): string {
  const n = parseFloat(v);
  if (!isFinite(n)) return '0.00';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ArbitrageTab({ tier, isAdmin }: { tier: string; isAdmin: boolean }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [capped, setCapped] = useState(false);
  const [sport, setSport] = useState('');
  // Bankroll the user wants to spread across both sides. We keep a separate
  // text field (`bankrollInput`) so users can type freely, then debounce it
  // into `bankroll` which actually drives the API request + stake math.
  const [bankrollInput, setBankrollInput] = useState('100');
  const [bankroll, setBankroll] = useState(100);
  const oddsFormat = useOddsFormat();

  // Debounce the typed bankroll so we don't refetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      const parsed = parseFloat(bankrollInput);
      setBankroll(parsed > 0 ? parsed : 100);
    }, 400);
    return () => clearTimeout(t);
  }, [bankrollInput]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/arbitrage?sport=${sport}&stake=${bankroll}&limit=20`)
      .then(r => r.json()).then(d => { setData(d.data || []); setCapped(!!d.capped); })
      .finally(() => setLoading(false));
  }, [sport, bankroll]);

  const isBasic = tier === 'basic' && !isAdmin;

  return (
    <div>
      <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-4 mb-4">
        <p className="text-sm text-green-400">
          <span className="font-semibold">⚡ Arbitrage opportunities</span> let you bet both sides across different sportsbooks for guaranteed profit regardless of outcome. We tell you <span className="font-semibold">exactly how much to bet on each side</span> for your bankroll.
        </p>
      </div>

      {isBasic && (
        <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/20 p-4 mb-4 flex items-start justify-between gap-3">
          <p className="text-sm text-cyan-300">
            <span className="font-semibold">Basic plan</span> — you get <span className="font-semibold">1 domestic + 1 international</span> arbitrage opportunity each day. Upgrade to <span className="font-semibold">Premium</span> for the full, unlimited live feed plus AI chat, steam moves and player props.
          </p>
          <a href="/pricing" className="shrink-0 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-400 transition-colors">Upgrade</a>
        </div>
      )}

      {/* Bankroll control — stakes below rescale to this total instantly */}
      <div className="card mb-4 flex flex-wrap items-center gap-3">
        <label htmlFor="arb-bankroll" className="text-sm font-semibold flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-green-400" /> Total bankroll
        </label>
        <div className="flex items-center gap-1">
          <span className="text-brand-muted">$</span>
          <input
            id="arb-bankroll"
            type="number"
            min={1}
            step={10}
            value={bankrollInput}
            onChange={(e) => setBankrollInput(e.target.value)}
            className="w-28 rounded-lg bg-brand-elevated border border-white/10 px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-brand-primary"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {[50, 100, 250, 500, 1000].map(v => (
            <button key={v} onClick={() => setBankrollInput(String(v))}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                bankroll === v ? 'bg-brand-primary text-white' : 'bg-brand-elevated text-brand-muted hover:text-white'
              }`}>${v}</button>
          ))}
        </div>
        <span className="text-xs text-brand-muted">Stakes update automatically.</span>
      </div>

      <SportFilter value={sport} onChange={setSport} />
      {loading ? <LoadingSpinner /> : data.length === 0 ? <EmptyState message="No arbitrage opportunities detected right now." /> : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-5">
          {data.map((arb: any) => {
            const profit = arb.guaranteed_profit != null ? parseFloat(arb.guaranteed_profit) : null;
            const hasStakes = arb.side1_stake != null && arb.side2_stake != null;
            return (
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
                    {hasStakes && (
                      <p className="text-sm font-semibold text-green-400 mt-1">Bet ${money(arb.side1_stake)}</p>
                    )}
                  </div>
                  <div className="rounded-lg bg-brand-elevated p-3">
                    <p className="text-xs text-brand-muted mb-1">{arb.side2_bookmaker}</p>
                    <p className="font-semibold">{arb.side2_selection}</p>
                    <p className="text-xl font-mono font-bold text-brand-primary">
                      {formatOddsByPref(arb.side2_odds, oddsFormat)}
                    </p>
                    {hasStakes && (
                      <p className="text-sm font-semibold text-green-400 mt-1">Bet ${money(arb.side2_stake)}</p>
                    )}
                  </div>
                </div>

                {/* How to bet — mirrors the Discord "How to Execute" steps */}
                {hasStakes && (
                  <div className="mt-3 rounded-lg bg-green-500/5 border border-green-500/20 p-3">
                    <p className="text-xs font-semibold text-green-400 mb-2 flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5" /> How to bet (${money(arb.stake_total ?? bankroll)} total)
                    </p>
                    <ol className="text-sm text-brand-text space-y-1 list-decimal list-inside">
                      <li>Place <span className="font-semibold text-white">${money(arb.side1_stake)}</span> on <span className="font-semibold">{arb.side1_selection}</span> at {arb.side1_bookmaker} ({formatOddsByPref(arb.side1_odds, oddsFormat)})</li>
                      <li>Place <span className="font-semibold text-white">${money(arb.side2_stake)}</span> on <span className="font-semibold">{arb.side2_selection}</span> at {arb.side2_bookmaker} ({formatOddsByPref(arb.side2_odds, oddsFormat)})</li>
                      {profit != null && (
                        <li>Collect <span className="font-semibold text-green-400">${money(arb.payout)}</span> whichever side wins → guaranteed profit <span className="font-semibold text-green-400">${money(profit)}</span></li>
                      )}
                    </ol>
                  </div>
                )}

                <p className="text-xs text-brand-muted mt-2">
                  🕐 {new Date(arb.detected_at).toLocaleString()}
                  {arb.commence_time ? <> · Game: {new Date(arb.commence_time).toLocaleString()}</> : null}
                </p>
                <p className="text-[11px] text-brand-muted mt-1">
                  ⚠️ Odds move fast — confirm both lines are still available before betting. Limits/voids vary by book.
                </p>
              </div>
            );
          })}
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
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
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/injuries?sport=${sport}&status=${status}&limit=50`)
      .then(r => r.json()).then(d => setData(d.data || []))
      .finally(() => setLoading(false));
  }, [sport, status]);

  const statuses = [
    { id: '', label: 'All' },
    { id: 'Out', label: '🔴 Out / IR' },
    { id: 'Day-To-Day', label: '🟡 Day-To-Day' },
  ];

  function statusColor(s: string) {
    const v = (s || '').toLowerCase();
    if (v === 'out' || v.includes('injured reserve') || v === 'ir' || v === 'suspended') return 'bg-red-500/20 text-red-400';
    if (v.includes('doubtful')) return 'bg-orange-500/20 text-orange-400';
    if (v.includes('questionable') || v.includes('game-time')) return 'bg-yellow-500/20 text-yellow-400';
    return 'bg-green-500/20 text-green-400';
  }

  return (
    <div>
      <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-4 mb-4">
        <p className="text-sm text-blue-300">
          <span className="font-semibold">🏥 Injury reports</span> from the last 72 hours across NBA, NHL & MLB. Off-season leagues (e.g. NFL in summer) won't have active reports.
        </p>
      </div>
      <SportFilter value={sport} onChange={setSport} />
      <div className="flex flex-wrap gap-2 mb-4">
        {statuses.map(s => (
          <button key={s.id} onClick={() => setStatus(s.id)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              status === s.id ? 'bg-brand-primary text-white' : 'bg-brand-elevated text-brand-muted hover:text-white'
            }`}>{s.label}</button>
        ))}
      </div>
      {loading ? <LoadingSpinner /> : data.length === 0 ? (
        <EmptyState message={
          sport
            ? `No ${sport} injury reports in the last 72 hours${sport === 'NFL' ? ' (off-season).' : '.'}`
            : 'No injury reports in the last 72 hours.'
        } />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
          {data.map((inj: any, i: number) => {
            const isLong = (inj.description?.length ?? 0) > 120;
            const isExpanded = expanded.has(i);
            const shownDescription = isLong && !isExpanded
              ? `${inj.description.slice(0, 120)}…`
              : inj.description;
            return (
              <div key={i} className="card py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold">{inj.player_name}</span>
                      <span className="text-xs text-brand-muted">{inj.team}</span>
                      <Badge text={inj.sport} color="bg-brand-elevated text-brand-muted" />
                      {inj.position && <span className="text-xs text-brand-muted">{inj.position}</span>}
                    </div>
                    <p className="text-sm text-brand-muted whitespace-pre-wrap break-words">
                      {inj.injury_type}{shownDescription ? ` — ${shownDescription}` : ''}
                    </p>
                    {isLong && (
                      <button
                        onClick={() =>
                          setExpanded((prev) => {
                            const next = new Set(prev);
                            if (next.has(i)) next.delete(i); else next.add(i);
                            return next;
                          })
                        }
                        className="text-xs text-brand-primary hover:underline mt-1"
                      >
                        {isExpanded ? 'Show less' : 'Read more'}
                      </button>
                    )}
                  </div>
                  <Badge text={inj.status} color={statusColor(inj.status)} />
                </div>
              </div>
            );
          })}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
          {data.map((p: any, i: number) => (
            <div key={i} className="card py-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold">{p.player_name}</span>
                    <Badge text={p.sport} color="bg-brand-elevated text-brand-muted" />
                    <span className="text-xs text-brand-muted">{p.team}</span>
                    {p.position && <span className="text-xs text-brand-muted">{p.position}</span>}
                  </div>
                  <p className="text-sm font-mono text-brand-primary">{statLine(p)}</p>
                  {p.notable_reason && <p className="text-xs text-yellow-400 mt-1">⭐ {p.notable_reason}</p>}
                </div>
                {p.fantasy_score && (
                  <div className="text-right ml-2 flex-shrink-0">
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
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/trends?sport=${sport}&limit=30`)
      .then(r => r.json())
      .then(d => {
        setData(d.data || []);
        setFetchedAt(new Date());
      })
      .finally(() => setLoading(false));
  }, [sport]);

  // "Newest data point" timestamp — lets users judge freshness even when the
  // trend rows themselves (games already played) are naturally older than
  // other live-updating tabs.
  const newestDataAt = data.length
    ? data.reduce((max: Date, t: any) => {
        const d = new Date(t.created_at || t.event_date);
        return d > max ? d : max;
      }, new Date(0))
    : null;

  return (
    <div>
      <SportFilter value={sport} onChange={setSport} />
      {!loading && fetchedAt && (
        <p className="text-xs text-brand-muted mb-3">
          Loaded as of {fetchedAt.toLocaleTimeString()}
          {newestDataAt && newestDataAt.getTime() > 0 && (
            <> · Newest result recorded {newestDataAt.toLocaleString()}</>
          )}
        </p>
      )}
      {loading ? <LoadingSpinner /> : data.length === 0 ? <EmptyState message="No trend data available." /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
          {data.map((t: any, i: number) => (
            <div key={i} className="card py-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
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
                <div className="text-right ml-2 flex-shrink-0">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:gap-4">
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
                <div className="flex gap-3 sm:gap-4 text-right">
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

function PushNotificationsCard() {
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pinned, setPinned] = useState<any[]>([]);

  const refreshPinned = useCallback(() => {
    fetch('/api/games/pinned')
      .then(r => (r.ok ? r.json() : { data: [] }))
      .then(j => setPinned(Array.isArray(j?.data) ? j.data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      const { isPushSupported, getNotificationPermission } = await import('@/lib/push-client');
      setSupported(isPushSupported());
      setPermission(getNotificationPermission());
      if (isPushSupported() && 'serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready.catch(() => null);
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        setEnabled(Boolean(sub));
      }
      refreshPinned();
    })();
  }, [refreshPinned]);

  async function togglePush() {
    if (busy) return;
    setBusy(true);
    try {
      const { ensurePushSubscription, removePushSubscription, getNotificationPermission } = await import('@/lib/push-client');
      if (enabled) {
        await removePushSubscription();
        setEnabled(false);
      } else {
        const sub = await ensurePushSubscription();
        setEnabled(Boolean(sub));
      }
      setPermission(getNotificationPermission());
    } finally {
      setBusy(false);
    }
  }

  async function unpin(gameId: string) {
    await fetch(`/api/games/${encodeURIComponent(gameId)}/pin`, { method: 'DELETE' });
    refreshPinned();
  }

  return (
    <div className="card">
      <h3 className="font-semibold mb-1">📲 Push notifications &amp; pinned scores</h3>
      <p className="text-xs text-brand-muted mb-4">
        Pin any game to your phone&apos;s pull-down shade to keep a live box score on screen, with a
        big-plays feed on top. Works on Android and on installed PWAs.
      </p>

      {!supported ? (
        <p className="text-sm text-brand-muted">
          Push notifications aren&apos;t supported in this browser. On iPhone, install Valor Odds to your
          Home Screen to enable them.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium">Browser push notifications</p>
              <p className="text-xs text-brand-muted">
                {permission === 'denied'
                  ? 'Blocked — enable notifications in your browser settings.'
                  : enabled
                    ? 'Enabled on this device'
                    : 'Enable to pin live scores'}
              </p>
            </div>
            <button
              onClick={togglePush}
              disabled={busy || permission === 'denied'}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                enabled ? 'bg-brand-primary' : 'bg-brand-elevated'
              } disabled:opacity-50`}>
              <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                enabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Pinned games</p>
            {pinned.length === 0 ? (
              <p className="text-xs text-brand-muted">
                No pinned games yet. Use the pin icon on any live or upcoming score to add one.
              </p>
            ) : (
              <ul className="space-y-2">
                {pinned.map((g) => (
                  <li key={g.game_id} className="flex items-center justify-between rounded-lg bg-brand-elevated px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {g.away_abbrev || g.away_team} @ {g.home_abbrev || g.home_team}
                      </p>
                      <p className="text-xs text-brand-muted">{g.sport}</p>
                    </div>
                    <button
                      onClick={() => unpin(g.game_id)}
                      className="ml-3 rounded-md px-2 py-1 text-xs text-brand-muted hover:text-white hover:bg-brand-bg">
                      Unpin
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
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
      {/* Followed sports */}
      <div className="card">
        <h3 className="font-semibold mb-3">🏆 Followed sports</h3>
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

      {/* Followed teams */}
      <div className="card">
        <h3 className="font-semibold mb-3">🏠 Followed teams</h3>
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

      {/* Followed players */}
      <div className="card">
        <h3 className="font-semibold mb-3">⭐ Followed players</h3>
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
        <h3 className="font-semibold mb-3">📚 Followed sportsbooks</h3>
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
        <h3 className="font-semibold mb-4">🔔 Alert preferences</h3>
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

      {/* Push notifications & pinned games */}
      <PushNotificationsCard />

      {/* Odds format */}
      <div className="card">
        <h3 className="font-semibold mb-3">💰 Odds format</h3>
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
            <h2 className="text-xl font-bold sm:text-2xl">Welcome back, {user.name || user.email?.split('@')[0]}! 👋</h2>
            <p className="text-brand-muted text-sm mt-1">
              <Badge text={user.tier?.toUpperCase() || 'FREE'} color={tierBadgeColor(user.tier)} />
              {user.isAdmin && <span className="ml-2"><Badge text="ADMIN" color="bg-red-500/20 text-red-400" /></span>}
            </p>
          </div>
        </div>
      </div>

      {/* API Dashboard quick link */}
      <Link href="/api-access/manage" className="card flex items-center justify-between p-4 hover:border-brand-primary/50 transition-colors group">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-brand-primary/10 p-2.5">
            <KeyRound className="h-5 w-5 text-brand-primary" />
          </div>
          <div>
            <p className="font-semibold">API Dashboard</p>
            <p className="text-sm text-brand-muted">Manage your API keys, view usage, and test endpoints</p>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-brand-muted group-hover:text-brand-primary group-hover:translate-x-1 transition-all" />
      </Link>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
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

      {/* Data sections — multi-column on desktop to fill wide screens */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Latest Best Bet — spans 2 cols on desktop for readability */}
        {bestBet && (
          <div className="card lg:col-span-2">
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

        {/* Latest Steam Moves — full width row below */}
        {steam.length > 0 && (
          <div className="card lg:col-span-3">
            <h3 className="font-semibold flex items-center gap-2 mb-3"><Flame className="h-4 w-4 text-orange-400" /> Recent Steam Moves</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {steam.map((move: any) => (
                <div key={move.id} className="flex items-center justify-between p-2 rounded-lg bg-brand-elevated">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{move.outcome_name}</p>
                    <p className="text-xs text-brand-muted truncate">{move.home_team} vs {move.away_team}</p>
                  </div>
                  <div className="text-right ml-2 flex-shrink-0">
                    <p className="text-sm font-mono text-orange-400">{move.before_avg_price} → {move.after_avg_price}</p>
                    <p className="text-xs text-brand-muted">{move.books_moved} books</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Command Center (default landing) ----------

function LiveScoresStrip({ onViewGame }: { onViewGame: (g: any) => void }) {
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    fetch('/api/dashboard/games?limit=40')
      .then(r => r.json())
      .then(d => {
        const all: any[] = d.data || [];
        // Live games first, then soonest-starting scheduled games.
        const live = all.filter(g => g.is_live);
        const upcoming = all
          .filter(g => !g.is_live)
          .sort((a, b) => new Date(a.game_date || 0).getTime() - new Date(b.game_date || 0).getTime());
        setGames([...live, ...upcoming].slice(0, 24));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000); // refresh scores every minute
    return () => clearInterval(t);
  }, [load]);

  // Update arrow visibility based on scroll position
  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    updateScrollState();
  }, [games, updateScrollState]);

  const scrollByPage = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    // Scroll by roughly the visible width (one "page" of cards)
    const scrollAmount = el.clientWidth * 0.8;
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  if (loading) {
    return <div className="card"><LoadingSpinner /></div>;
  }
  if (games.length === 0) {
    return (
      <div className="card">
        <h3 className="font-semibold flex items-center gap-2 mb-2"><Activity className="h-4 w-4 text-green-400" /> Live & Upcoming</h3>
        <EmptyState message="No games in the current window." />
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2"><Activity className="h-4 w-4 text-green-400" /> Live &amp; Upcoming Scores</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-brand-muted hidden sm:inline">auto-refreshes</span>
          <button
            onClick={() => scrollByPage('left')}
            disabled={!canScrollLeft}
            aria-label="Previous scores"
            className="p-1 rounded-md bg-brand-elevated border border-brand-border text-brand-muted hover:text-brand-fg hover:border-brand-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => scrollByPage('right')}
            disabled={!canScrollRight}
            aria-label="Next scores"
            className="p-1 rounded-md bg-brand-elevated border border-brand-border text-brand-muted hover:text-brand-fg hover:border-brand-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scroll-smooth snap-x snap-mandatory scrollbar-hide"
      >
        {games.map((g) => {
          const when = g.game_date ? new Date(g.game_date) : null;
          return (
            <div key={g.game_id} className="min-w-[170px] sm:min-w-[200px] rounded-lg bg-brand-elevated p-3 flex-shrink-0 snap-start">
              <div className="flex items-center justify-between mb-2">
                <Badge text={g.sport} color="bg-brand-bg text-brand-muted" />
                {g.is_live ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-red-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE
                  </span>
                ) : g.is_final ? (
                  <span className="text-xs font-semibold text-brand-muted">FINAL</span>
                ) : (
                  <span className="text-xs text-brand-muted">{when ? when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}</span>
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm truncate pr-2">{g.away_team_abbrev || g.away_team}</span>
                  {(g.is_live || g.is_final) && <span className="text-sm font-mono font-bold">{g.away_score}</span>}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm truncate pr-2">{g.home_team_abbrev || g.home_team}</span>
                  {(g.is_live || g.is_final) && <span className="text-sm font-mono font-bold">{g.home_score}</span>}
                </div>
              </div>
              {g.is_live && (g.clock || g.period) && (
                <p className="text-xs text-red-400 mt-2">
                  {g.status_detail || [g.period ? `P${g.period}` : '', g.clock || ''].filter(Boolean).join(' · ')}
                </p>
              )}
              {!g.is_live && !g.is_final && when && (
                <p className="text-xs text-brand-muted mt-2">{when.toLocaleDateString([], { month: 'short', day: 'numeric' })}</p>
              )}
              <div className="mt-2 flex items-center justify-between border-t border-brand-border/50 pt-2">
                <button
                  onClick={() =>
                    onViewGame({
                      gameId: g.game_id,
                      sport: g.sport,
                      homeTeam: g.home_team,
                      awayTeam: g.away_team,
                      espnEventId: g.espn_event_id,
                    })
                  }
                  className="text-[10px] font-semibold uppercase tracking-wide text-brand-primaryText hover:text-white"
                >
                  Box score
                </button>
                <PinGameButton
                  compact
                  game={{
                    gameId: g.game_id,
                    sport: g.sport,
                    homeTeam: g.home_team,
                    awayTeam: g.away_team,
                    homeAbbrev: g.home_team_abbrev,
                    awayAbbrev: g.away_team_abbrev,
                    espnEventId: g.espn_event_id,
                    gameDate: g.game_date,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OpportunityCards({ isPremiumOrVip, onJump }: { isPremiumOrVip: boolean; onJump: (t: Tab) => void }) {
  const [bestBet, setBestBet] = useState<any>(null);
  const [arbs, setArbs] = useState<any[]>([]);
  const [steam, setSteam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard/best-bets?type=bestBets&limit=1').then(r => r.json()).catch(() => ({})),
      fetch('/api/dashboard/arbitrage?stake=100&limit=3').then(r => r.json()).catch(() => ({})),
      fetch('/api/dashboard/steam-moves?hours=12&limit=3').then(r => r.json()).catch(() => ({})),
    ]).then(([bets, arbData, steamData]) => {
      setBestBet(bets.data?.[0] || null);
      setArbs(arbData.data || []);
      setSteam(steamData.data || []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="card"><LoadingSpinner /></div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
      {/* Top Arbitrage */}
      <button onClick={() => onJump('arbitrage')} className="card text-left hover:border-green-500/40 transition-colors border border-transparent">
        <h3 className="font-semibold flex items-center gap-2 mb-2 text-sm"><DollarSign className="h-4 w-4 text-green-400" /> Top Arbitrage</h3>
        {arbs.length === 0 ? (
          <p className="text-xs text-brand-muted">None right now.</p>
        ) : (
          <div className="space-y-2">
            {arbs.slice(0, 2).map((arb: any) => (
              <div key={arb.id}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold truncate pr-2">{arb.away_team} @ {arb.home_team}</span>
                  <Badge text={`+${parseFloat(arb.profit_percentage).toFixed(2)}%`} color="bg-green-500/20 text-green-400" />
                </div>
                {arb.side1_stake != null && (
                  <p className="text-xs text-brand-muted">
                    Bet ${money(arb.side1_stake)} / ${money(arb.side2_stake)} → +${money(arb.guaranteed_profit)} guaranteed
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-green-400 mt-2 flex items-center gap-1">See stakes <ChevronRight className="h-3 w-3" /></p>
      </button>

      {/* Latest AI Best Bet */}
      <button onClick={() => onJump('best-bets')} className="card text-left hover:border-brand-primary/40 transition-colors border border-transparent">
        <h3 className="font-semibold flex items-center gap-2 mb-2 text-sm"><Star className="h-4 w-4 text-brand-primary" /> AI Best Bets</h3>
        {bestBet ? (
          <p className="text-xs text-brand-muted line-clamp-4 whitespace-pre-wrap">{bestBet.content}</p>
        ) : (
          <p className="text-xs text-brand-muted">No picks published yet today.</p>
        )}
        <p className="text-xs text-brand-primary mt-2 flex items-center gap-1">View all <ChevronRight className="h-3 w-3" /></p>
      </button>

      {/* Steam Moves */}
      <button onClick={() => onJump('steam')} className="card text-left hover:border-orange-500/40 transition-colors border border-transparent">
        <h3 className="font-semibold flex items-center gap-2 mb-2 text-sm"><Flame className="h-4 w-4 text-orange-400" /> Steam Moves</h3>
        {steam.length === 0 ? (
          <p className="text-xs text-brand-muted">No sharp moves (12h).</p>
        ) : (
          <div className="space-y-2">
            {steam.slice(0, 2).map((m: any) => (
              <div key={m.id}>
                <p className="text-sm font-semibold truncate">{m.outcome_name}</p>
                <p className="text-xs text-brand-muted truncate">{m.away_team} @ {m.home_team} · {m.books_moved} books</p>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-orange-400 mt-2 flex items-center gap-1">{isPremiumOrVip ? 'View all' : 'Unlock'} <ChevronRight className="h-3 w-3" /></p>
      </button>
    </div>
  );
}

function CommandCenter({ user, isPremiumOrVip, onJump, onViewGame }: { user: any; isPremiumOrVip: boolean; onJump: (t: Tab) => void; onViewGame: (g: any) => void }) {
  const canChat = isPremiumOrVip;
  return (
    <div className="space-y-5">
      {/* Welcome */}
      <div className="card bg-gradient-to-r from-brand-primary/20 to-purple-500/10 border-brand-primary/30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold sm:text-2xl">Welcome back, {user.name || user.email?.split('@')[0]}! 👋</h2>
            <p className="text-brand-muted text-sm mt-1 flex items-center gap-2 flex-wrap">
              <Badge text={user.tier?.toUpperCase() || 'FREE'} color={tierBadgeColor(user.tier)} />
              {user.isAdmin && <Badge text="ADMIN" color="bg-red-500/20 text-red-400" />}
              <span>Your command center — live games, top opportunities &amp; the AI analyst.</span>
            </p>
          </div>
        </div>
      </div>

      {/* Stacked layout: live data (full width) on top, AI chat (full width) below */}

      {/* Live scores + opportunity cards — full page width */}
      <div className="space-y-5">
        <LiveScoresStrip onViewGame={onViewGame} />
        <OpportunityCards isPremiumOrVip={isPremiumOrVip} onJump={onJump} />
      </div>

      {/* Ask the AI Analyst — full page width, below the live data */}
      <div className="card p-0 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="font-semibold flex items-center gap-2"><MessageSquare className="h-4 w-4 text-brand-primary" /> Ask the AI Analyst</h3>
          <button onClick={() => onJump('chat')} className="text-xs text-brand-primary flex items-center gap-1 hover:underline">
            Full screen <ChevronRight className="h-3 w-3" />
          </button>
        </div>
        {canChat ? (
          <ChatClient embedded user={{ id: user.id, email: user.email, tier: user.tier || 'free', discordId: user.discordId || null }} />
        ) : (
          <div className="p-6 text-center">
            <MessageSquare className="h-10 w-10 mx-auto mb-3 text-brand-muted" />
            <h4 className="font-semibold mb-1">AI chat is a Premium feature</h4>
            <p className="text-sm text-brand-muted mb-4">Upgrade to ask the AI about lines, matchups, injuries and arbitrage in real time.</p>
            <a href="/pricing" className="inline-block px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-semibold">Upgrade</a>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Main Dashboard ----------

export default function DashboardClient({ user }: { user: any }) {
  const [activeTab, setActiveTab] = useState<Tab>('command-center');
  // The game whose box score is open in the detail modal (if any).
  const [viewGame, setViewGame] = useState<any | null>(null);

  // Open the box-score modal when arriving via a notification link (?game=).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const gameId = new URLSearchParams(window.location.search).get('game');
    if (!gameId) return;
    fetch(`/api/games/pinned`)
      .then(r => (r.ok ? r.json() : { data: [] }))
      .then(j => {
        const g = (Array.isArray(j?.data) ? j.data : []).find((x: any) => x.game_id === gameId);
        if (g) {
          setViewGame({
            gameId: g.game_id,
            sport: g.sport,
            homeTeam: g.home_team,
            awayTeam: g.away_team,
            espnEventId: g.espn_event_id,
          });
        }
      })
      .catch(() => {});
  }, []);

  const isPremiumOrVip = user.tier === 'premium' || user.tier === 'vip' || user.isAdmin;
  // Basic and up may see the arbitrage finder (Basic is capped to 1 domestic +
  // 1 international per day, enforced server-side); Free cannot.
  const canSeeArbitrage = canUseArbitrage(user.tier, user.isAdmin);

  function renderTab() {
    switch (activeTab) {
      case 'command-center': return <CommandCenter user={user} isPremiumOrVip={isPremiumOrVip} onJump={setActiveTab} onViewGame={setViewGame} />;
      case 'overview':     return <OverviewTab user={user} />;
      case 'best-bets':    return <BestBetsTab />;
      case 'odds':         return <OddsTab />;
      case 'arbitrage':    return canSeeArbitrage ? <ArbitrageTab tier={user.tier || 'free'} isAdmin={!!user.isAdmin} /> : <LockedTab />;
      case 'steam':        return isPremiumOrVip ? <SteamTab /> : <LockedTab />;
      case 'injuries':     return <InjuriesTab />;
      case 'players':      return <PlayerStatsTab />;
      case 'trends':       return <TrendsTab />;
      case 'sportsbooks':  return <SportsbooksTab />;
      case 'chat':         return <ChatClient user={{ id: user.id, email: user.email, tier: user.tier || 'free', discordId: user.discordId || null }} />;
      case 'preferences':  return <PreferencesTab userId={user.id} />;
      default:             return null;
    }
  }

  // Shared tab-button renderer — used by both the mobile horizontal bar and
  // the desktop vertical sidebar so styling stays in sync.
  function TabButton({ id, label, icon: Icon, premium }: { id: Tab; label: string; icon: any; premium?: boolean }) {
    const locked = id === 'arbitrage' ? !canSeeArbitrage : premium && !isPremiumOrVip;
    const active = activeTab === id;
    return (
      <button
        onClick={() => setActiveTab(id)}
        className={`flex items-center gap-2.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
          active
            ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20'
            : 'text-brand-muted hover:text-white hover:bg-brand-elevated'
        } ${locked ? 'opacity-60' : ''} px-3 py-2 text-sm lg:w-full lg:px-3.5 lg:py-2.5 lg:text-[13px]`}
      >
        <Icon className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1 text-left">{label}</span>
        {locked && <span className="text-xs">🔒</span>}
      </button>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="lg:grid lg:grid-cols-[230px,1fr] lg:gap-8">
        {/* Desktop sidebar nav — sticky, vertical, full-width buttons */}
        <aside className="hidden lg:block">
          <div className="sticky top-[5.5rem] space-y-1">
            <div className="px-3.5 pb-3 mb-2 border-b border-brand-border">
              <p className="text-xs text-brand-muted uppercase tracking-wider font-semibold">Navigation</p>
            </div>
            {TABS.map(({ id, label, icon, premium }) => (
              <TabButton key={id} id={id} label={label} icon={icon} premium={premium} />
            ))}
            {user.isAdmin && (
              <div className="pt-3 mt-3 border-t border-brand-border">
                <p className="px-3.5 pb-2 text-xs text-amber-300/80 uppercase tracking-wider font-semibold">Admin Tools</p>
                <Link href="/admin" className="flex items-center gap-3 rounded-lg px-3.5 py-2 text-sm text-amber-300 hover:bg-brand-surface transition-colors">
                  <Shield className="h-4 w-4" /> Admin Panel
                </Link>
                <Link href="/admin/support" className="flex items-center gap-3 rounded-lg px-3.5 py-2 text-sm text-amber-300 hover:bg-brand-surface transition-colors">
                  <Headphones className="h-4 w-4" /> Support Tickets
                </Link>
                <Link href="/admin/api-access" className="flex items-center gap-3 rounded-lg px-3.5 py-2 text-sm text-amber-300 hover:bg-brand-surface transition-colors">
                  <KeyRound className="h-4 w-4" /> API Monetization
                </Link>
              </div>
            )}
            <div className="pt-3 mt-3 border-t border-brand-border px-3.5">
              <div className="flex items-center gap-2 text-xs">
                <Badge text={user.tier?.toUpperCase() || 'FREE'} color={tierBadgeColor(user.tier)} />
                {user.isAdmin && <Badge text="ADMIN" color="bg-red-500/20 text-red-400" />}
              </div>
            </div>
          </div>
        </aside>

        {/* Mobile horizontal tab bar — scrollable, hidden on desktop */}
        <div className="lg:hidden mb-4 -mx-3 px-3 sm:mx-0 sm:px-0">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-2">
            {TABS.map(({ id, label, icon, premium }) => (
              <TabButton key={id} id={id} label={label} icon={icon} premium={premium} />
            ))}
            {user.isAdmin && (
              <>
                <Link href="/admin" className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 transition-colors whitespace-nowrap">
                  <Shield className="h-4 w-4" /> Admin
                </Link>
                <Link href="/admin/support" className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 transition-colors whitespace-nowrap">
                  <Headphones className="h-4 w-4" /> Support
                </Link>
                <Link href="/admin/api-access" className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 transition-colors whitespace-nowrap">
                  <KeyRound className="h-4 w-4" /> API
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Tab Content — fills remaining desktop width */}
        <div className="min-w-0">
          {renderTab()}
        </div>
      </div>

      {/* Box-score modal — opened from a pinned game or a notification link. */}
      {viewGame && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setViewGame(null)}
        >
          <div
            className="relative my-8 w-full max-w-3xl rounded-xl border border-brand-border bg-brand-bg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-xl border-b border-brand-border bg-brand-surface px-4 py-3">
              <h2 className="text-sm font-semibold">
                {viewGame.awayTeam} @ {viewGame.homeTeam}
              </h2>
              <button
                onClick={() => setViewGame(null)}
                className="rounded-md px-2 py-1 text-brand-muted hover:bg-brand-elevated hover:text-white"
                aria-label="Close box score"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              <BoxScore
                gameId={viewGame.gameId}
                sport={viewGame.sport}
                homeTeam={viewGame.homeTeam}
                awayTeam={viewGame.awayTeam}
                espnEventId={viewGame.espnEventId}
              />
            </div>
          </div>
        </div>
      )}
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
// Add displayName for layout detection
DashboardClient.displayName = 'DashboardClient';
