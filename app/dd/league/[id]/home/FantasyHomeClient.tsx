'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Loader2, ChevronLeft, ChevronRight, Sparkles, Trophy, Zap, Star,
  MessageSquare, Send, X, BarChart3, Users, RefreshCw, Swords, TrendingUp, Radio,
} from 'lucide-react';
import { getPositionColor } from '@/lib/dd/position-colors';
import { PlayerInfoCard } from '@/components/dd/PlayerInfoCard';
import OddsMeter from '@/components/dd/OddsMeter';
import CelebrationOverlay from '@/components/dd/CelebrationOverlay';
import { ToastProvider, useToast } from '@/components/dd/ToastProvider';

// ──────────────────────────────────────────────────────────────────────────────
// Types — mirror the /api/dd/leagues/[id]/home payload
// ──────────────────────────────────────────────────────────────────────────────

interface WeeklyStatEntry {
  stats: Record<string, number>;
  chips: { label: string; value: string }[];
  points: number;
  source: 'live' | 'actual' | 'projection';
  gameState?: 'pre' | 'in' | 'post';
}
interface WeeklyPlayerLine {
  playerName: string;
  playerId: string | null;
  team: string | null;
  position: string | null;
  sport: string | null;
  slot: string;
  headshot: string | null;
  projectedPoints: number;
  week: WeeklyStatEntry;
  opponent: string | null;
}
interface WeeklyRoster {
  memberId: string;
  teamName: string;
  isBot: boolean;
  starters: WeeklyPlayerLine[];
  bench: WeeklyPlayerLine[];
  starterPoints: number;
  benchPoints: number;
  projectedStarterPoints: number;
}
interface Odds {
  homeWinPct: number;
  awayWinPct: number;
  tiePct: number;
  homeProjected: number;
  awayProjected: number;
  projectedMargin: number;
  confidence: number;
  reason: string;
  favored: 'home' | 'away' | 'even';
}
interface AnalyticsTeam {
  memberId: string;
  teamName: string;
  projected: number;
  rank: number;
}
interface Analytics {
  teams: AnalyticsTeam[];
  myRank: number | null;
  leagueAvg: number;
  summary: string;
  topScorer: { teamName: string; points: number } | null;
  closestGame: { home: string; away: string; margin: number } | null;
}
interface Gamification {
  userId: string;
  totalXp: number;
  level: number;
  levelTitle: string;
  currentStreak: number;
  bestStreak: number;
  badges: string[];
  xpToNext: { current: number; needed: number; pct: number };
}
interface HomeData {
  league: { id: string; name: string; sport: string; status: string; seasonYear: number };
  week: number;
  weeks: number;
  currentWeek: number;
  currentMemberId: string | null;
  myTeamName: string | null;
  isCommissioner: boolean;
  scoringName: string;
  hasLiveData: boolean;
  liveProgress: number | null;
  liveGames: number;
  rosters: WeeklyRoster[];
  myRoster: WeeklyRoster | null;
  matchup: {
    id: string; week: number; homeMemberId: string; awayMemberId: string;
    homeScore: number | null; awayScore: number | null;
    winnerMemberId: string | null; isTie: boolean; status: string; isHome: boolean;
  } | null;
  opponent: { memberId: string; teamName: string } | null;
  odds: Odds | null;
  analytics: Analytics;
  gamification: Gamification | null;
}

function PosBadge({ sport, position }: { sport: string; position: string }) {
  const c = getPositionColor(sport, position);
  return (
    <span
      className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
      style={{ color: c.fg, background: c.bg, border: `1px solid ${c.border}` }}
    >
      {position}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Player row — headshot + weekly stat chips + hover popup card
// ──────────────────────────────────────────────────────────────────────────────

function PlayerRow({
  player,
  sport,
  seasonYear,
  onHover,
  onLeave,
}: {
  player: WeeklyPlayerLine;
  sport: string;
  seasonYear: number;
  onHover: (p: WeeklyPlayerLine, el: HTMLElement) => void;
  onLeave: () => void;
}) {
  const isLive = player.week.source === 'live';
  const isActual = player.week.source === 'actual';
  const isInGame = player.week.gameState === 'in';
  const isFinalGame = player.week.gameState === 'post';
  const sourceLabel = isLive
    ? isInGame
      ? 'Live'
      : isFinalGame
        ? 'Final'
        : 'Scheduled'
    : isActual
      ? 'Actual'
      : 'Proj';
  const sourceColor = isInGame
    ? 'text-brand-danger'
    : isLive || isActual
      ? 'text-brand-success'
      : 'text-brand-muted';
  return (
    <div
      className="flex items-center gap-3 rounded-lg bg-brand-elevated/40 border border-brand-border px-3 py-2 hover:border-brand-primary/60 transition-colors cursor-pointer"
      onMouseEnter={(e) => onHover(player, e.currentTarget)}
      onMouseLeave={onLeave}
    >
      <span className="w-12 text-[10px] font-bold uppercase tracking-wide text-brand-muted flex-shrink-0">
        {player.slot}
      </span>

      {/* Headshot */}
      <div className="w-9 h-9 rounded-full bg-brand-elevated border border-brand-border overflow-hidden flex-shrink-0 flex items-center justify-center">
        {player.headshot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={player.headshot}
            alt={player.playerName}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <span className="text-[10px] text-brand-muted">{player.position}</span>
        )}
      </div>

      {/* Name + chips */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <PosBadge sport={sport} position={player.position ?? ''} />
          <span className="text-sm font-medium text-brand-text truncate">{player.playerName}</span>
          {player.opponent && (
            <span className="text-[10px] text-brand-muted flex-shrink-0">vs {player.opponent}</span>
          )}
          {isInGame && (
            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-brand-danger flex-shrink-0">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-danger opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand-danger" />
              </span>
              Live
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {player.week.chips.slice(0, 4).map((c, i) => (
            <span
              key={i}
              className="text-[10px] text-brand-muted bg-brand-surface border border-brand-border rounded px-1.5 py-0.5"
            >
              {c.value} {c.label}
            </span>
          ))}
        </div>
      </div>

      {/* Points */}
      <div className="text-right flex-shrink-0">
        <div className="text-sm font-bold text-brand-primaryText tabular-nums">
          {player.week.points.toFixed(1)}
        </div>
        <div className={`text-[9px] uppercase tracking-wide ${sourceColor}`}>
          {sourceLabel}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// AI Chat panel
// ──────────────────────────────────────────────────────────────────────────────

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

function LeagueChat({
  leagueId,
  week,
  onClose,
}: {
  leagueId: string;
  week: number;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    setStreaming(true);

    try {
      const res = await fetch(`/api/dd/leagues/${leagueId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history, week }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Chat failed');
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let acc = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.content) {
              acc += parsed.content;
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: 'assistant', content: acc };
                return next;
              });
            }
          } catch {
            /* ignore partial */
          }
        }
      }
    } catch (e: any) {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: 'assistant',
          content: `⚠️ ${e.message || 'Something went wrong.'}`,
        };
        return next;
      });
    } finally {
      setStreaming(false);
    }
  };

  const suggestions = [
    'How is my team looking this week?',
    'Who should I start at flex?',
    'What are my chances of winning?',
    'Who is the biggest threat in this league?',
  ];

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-brand-surface border-l border-brand-border flex flex-col animate-[ddFadeIn_0.2s_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-brand-primaryText" />
            <span className="font-semibold text-brand-text text-sm">DiamondDraft AI</span>
          </div>
          <button onClick={onClose} className="text-brand-muted hover:text-brand-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <Sparkles className="w-8 h-8 text-brand-primaryText mx-auto mb-3" />
              <p className="text-sm text-brand-muted mb-4">
                Ask me anything about your league — lineups, matchups, trades, or strategy.
              </p>
              <div className="space-y-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="block w-full text-left text-xs text-brand-primaryText bg-brand-elevated/50 border border-brand-border rounded-lg px-3 py-2 hover:border-brand-primary transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-brand-primary text-white'
                    : 'bg-brand-elevated border border-brand-border text-brand-text'
                }`}
              >
                {m.content || (streaming && i === messages.length - 1 ? '…' : '')}
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="border-t border-brand-border p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder="Ask about your league…"
              className="flex-1 resize-none bg-brand-elevated border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-primary"
            />
            <button
              onClick={() => void send()}
              disabled={streaming || !input.trim()}
              className="btn-primary p-2.5 disabled:opacity-50"
            >
              {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

export default function FantasyHomeClient({
  leagueId,
  leagueName,
}: {
  leagueId: string;
  leagueName: string;
}) {
  return (
    <ToastProvider>
      <FantasyHomeInner leagueId={leagueId} leagueName={leagueName} />
    </ToastProvider>
  );
}

function FantasyHomeInner({
  leagueId,
  leagueName,
}: {
  leagueId: string;
  leagueName: string;
}) {
  const { push } = useToast();
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [week, setWeek] = useState<number | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [hovered, setHovered] = useState<{ player: WeeklyPlayerLine; top: number; left: number } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (w?: number | null) => {
      setLoading(true);
      setError('');
      try {
        const qs = w ? `?week=${w}` : '';
        const res = await fetch(`/api/dd/leagues/${leagueId}/home${qs}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load fantasy home');
        setData(json);
        setWeek(json.week);
      } catch (e: any) {
        setError(e.message || 'Failed to load fantasy home');
      } finally {
        setLoading(false);
      }
    },
    [leagueId]
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  // Silent refresh — re-fetches the current week without the loading spinner so
  // live scores and the odds meter update in place.
  const refresh = useCallback(async () => {
    try {
      const qs = week ? `?week=${week}` : '';
      const res = await fetch(`/api/dd/leagues/${leagueId}/home${qs}`);
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
    } catch {
      /* keep the last good payload */
    }
  }, [leagueId, week]);

  // Poll every 30s while any game is live so points tick up as real games play.
  useEffect(() => {
    if (!data?.liveGames) return;
    const timer = setInterval(() => void refresh(), 30000);
    return () => clearInterval(timer);
  }, [data?.liveGames, refresh]);

  const changeWeek = (w: number) => {
    if (!data) return;
    const clamped = Math.max(1, Math.min(data.weeks, w));
    setWeek(clamped);
    void load(clamped);
  };

  const handleHover = (player: WeeklyPlayerLine, el: HTMLElement) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      const rect = el.getBoundingClientRect();
      const top = Math.min(rect.top, window.innerHeight - 500);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - 400));
      setHovered({ player, top, left });
    }, 350);
  };
  const handleLeave = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHovered(null);
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24 text-brand-muted">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading your fantasy home…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="card p-6 text-center">
        <p className="text-brand-danger mb-4">{error}</p>
        <button onClick={() => void load(null)} className="btn-secondary">
          <RefreshCw className="w-4 h-4 inline mr-1.5" /> Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { myRoster, matchup, opponent, odds, analytics, gamification } = data;
  const sport = data.league.sport;
  const seasonYear = data.league.seasonYear;

  // Viewer-relative odds.
  const isHome = matchup?.isHome ?? false;
  const myWinPct = odds ? (isHome ? odds.homeWinPct : odds.awayWinPct) : 0;
  const oppWinPct = odds ? (isHome ? odds.awayWinPct : odds.homeWinPct) : 0;
  const myProjected = odds ? (isHome ? odds.homeProjected : odds.awayProjected) : 0;
  const oppProjected = odds ? (isHome ? odds.awayProjected : odds.homeProjected) : 0;
  const favored: 'me' | 'opp' | 'even' = !odds
    ? 'even'
    : odds.favored === 'even'
    ? 'even'
    : (odds.favored === 'home') === isHome
    ? 'me'
    : 'opp';

  const myScore = matchup ? (isHome ? matchup.homeScore : matchup.awayScore) ?? 0 : 0;
  const oppScore = matchup ? (isHome ? matchup.awayScore : matchup.homeScore) ?? 0 : 0;
  const isFinal = matchup?.status === 'final';

  const result: 'win' | 'loss' | 'tie' = matchup?.isTie
    ? 'tie'
    : matchup?.winnerMemberId && matchup.winnerMemberId === data.currentMemberId
    ? 'win'
    : 'loss';

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-primaryText">
            {leagueName}
          </p>
          <h1 className="text-2xl font-bold text-brand-text mt-1">Fantasy Home</h1>
          <p className="text-sm text-brand-muted mt-1">
            {data.myTeamName ? `${data.myTeamName} · ` : ''}Week {data.week} of {data.weeks} · {data.scoringName}
          </p>
          {data.liveGames > 0 && (
            <span className="inline-flex items-center gap-1.5 mt-2 text-[11px] font-bold uppercase tracking-wide text-brand-danger">
              <Radio className="w-3.5 h-3.5" />
              {data.liveGames} game{data.liveGames === 1 ? '' : 's'} live now
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setChatOpen(true)} className="btn-primary inline-flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Ask AI
          </button>
          <Link href={`/dd/league/${leagueId}/season`} className="btn-secondary inline-flex items-center gap-2">
            <Swords className="w-4 h-4" /> Head-to-Head
          </Link>
        </div>
      </div>

      {/* ── Week nav ── */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => changeWeek(data.week - 1)}
          disabled={data.week <= 1}
          className="btn-ghost p-2 disabled:opacity-40"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-brand-text">Week {data.week}</span>
        <button
          onClick={() => changeWeek(data.week + 1)}
          disabled={data.week >= data.weeks}
          className="btn-ghost p-2 disabled:opacity-40"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* ── Matchup + odds ── */}
      {matchup && opponent && odds ? (
        <div className="grid gap-4 md:grid-cols-2">
          <OddsMeter
            myWinPct={myWinPct}
            oppWinPct={oppWinPct}
            tiePct={odds.tiePct}
            myProjected={myProjected}
            oppProjected={oppProjected}
            confidence={odds.confidence}
            reason={odds.reason}
            favored={favored}
            myTeamName={data.myTeamName ?? 'You'}
            oppTeamName={opponent.teamName}
            isFinal={isFinal}
          />

          {/* Scoreboard */}
          <div className="card p-4 sm:p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-muted mb-3">
              <Swords className="w-3.5 h-3.5" /> This Week
            </div>
            <div className="flex items-center justify-between">
              <div className="text-center flex-1">
                <div className="text-xs text-brand-muted truncate">{data.myTeamName ?? 'You'}</div>
                <div className="text-3xl font-extrabold text-brand-text tabular-nums mt-1">
                  {myScore.toFixed(1)}
                </div>
              </div>
              <div className="text-brand-muted font-bold px-3">–</div>
              <div className="text-center flex-1">
                <div className="text-xs text-brand-muted truncate">{opponent.teamName}</div>
                <div className="text-3xl font-extrabold text-brand-muted tabular-nums mt-1">
                  {oppScore.toFixed(1)}
                </div>
              </div>
            </div>
            <div className="mt-3 text-center text-xs text-brand-muted">
              {isFinal ? (
                <span className="font-semibold uppercase tracking-wide text-brand-accent">Final</span>
              ) : data.liveGames > 0 ? (
                <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-wide text-brand-danger">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-danger opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-danger" />
                  </span>
                  Live — {data.liveGames} game{data.liveGames === 1 ? '' : 's'} in progress
                </span>
              ) : data.hasLiveData ? (
                'Scoring from real game stats — updates as games play out'
              ) : (
                'Live projections — updates as points are scored'
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="card p-4 text-sm text-brand-muted text-center">
          No matchup scheduled for Week {data.week}.
        </div>
      )}

      {/* ── Gamification strip ── */}
      {gamification && (
        <div className="card p-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-brand-accent" />
            <div>
              <div className="text-sm font-bold text-brand-text">
                Level {gamification.level} · {gamification.levelTitle}
              </div>
              <div className="text-[11px] text-brand-muted">{gamification.totalXp.toLocaleString()} XP</div>
            </div>
          </div>
          <div className="flex-1 min-w-[140px]">
            <div className="h-2 rounded-full bg-brand-elevated overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-primary to-brand-primaryText transition-[width] duration-700"
                style={{ width: `${gamification.xpToNext.pct}%` }}
              />
            </div>
            <div className="text-[10px] text-brand-muted mt-1">
              {gamification.xpToNext.current} / {gamification.xpToNext.needed} to next level
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1 text-brand-accent">
              <Zap className="w-3.5 h-3.5" /> {gamification.currentStreak} streak
            </span>
            <span className="inline-flex items-center gap-1 text-brand-primaryText">
              <Star className="w-3.5 h-3.5" /> {gamification.badges.length} badges
            </span>
          </div>
        </div>
      )}

      {/* ── My roster ── */}
      {myRoster && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-brand-text">
                <Users className="w-4 h-4 text-brand-primaryText" /> My Starters
              </div>
              <div className="text-xs text-brand-muted">
                {myRoster.starterPoints.toFixed(1)} pts · proj {myRoster.projectedStarterPoints.toFixed(1)}
              </div>
            </div>
            <div className="space-y-2">
              {myRoster.starters.map((p) => (
                <PlayerRow
                  key={p.playerName}
                  player={p}
                  sport={sport}
                  seasonYear={seasonYear}
                  onHover={handleHover}
                  onLeave={handleLeave}
                />
              ))}
              {myRoster.starters.length === 0 && (
                <p className="text-sm text-brand-muted text-center py-4">
                  No starters set. Head to the Head-to-Head tab to set your lineup.
                </p>
              )}
            </div>

            {myRoster.bench.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-semibold text-brand-muted mb-2">
                  Bench ({myRoster.bench.length}) · {myRoster.benchPoints.toFixed(1)} pts
                </div>
                <div className="space-y-1.5">
                  {myRoster.bench.map((p) => (
                    <PlayerRow
                      key={p.playerName}
                      player={p}
                      sport={sport}
                      seasonYear={seasonYear}
                      onHover={handleHover}
                      onLeave={handleLeave}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── AI analytics ── */}
          <div className="card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-brand-text mb-3">
              <BarChart3 className="w-4 h-4 text-brand-primaryText" /> AI Analytics
            </div>
            <p className="text-sm text-brand-muted leading-relaxed mb-4">{analytics.summary}</p>

            <div className="space-y-1.5">
              {analytics.teams.slice(0, 8).map((t) => (
                <div
                  key={t.memberId}
                  className={`flex items-center gap-2 text-xs rounded-lg px-2 py-1.5 ${
                    t.memberId === data.currentMemberId
                      ? 'bg-brand-primary/15 border border-brand-primary/40'
                      : 'bg-brand-elevated/40 border border-brand-border'
                  }`}
                >
                  <span className="w-5 text-brand-muted font-bold">#{t.rank}</span>
                  <span className="flex-1 truncate text-brand-text">{t.teamName}</span>
                  <span className="font-semibold text-brand-primaryText tabular-nums">
                    {t.projected.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-brand-border text-[11px] text-brand-muted flex items-center justify-between">
              <span>League avg</span>
              <span className="font-semibold text-brand-text">{analytics.leagueAvg.toFixed(1)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── League projections (all teams) ── */}
      <div className="card p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-text mb-3">
          <TrendingUp className="w-4 h-4 text-brand-primaryText" /> Week {data.week} — League Projections
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.rosters.map((r) => (
            <div
              key={r.memberId}
              className={`rounded-lg border px-3 py-2 ${
                r.memberId === data.currentMemberId
                  ? 'border-brand-primary/50 bg-brand-primary/10'
                  : 'border-brand-border bg-brand-elevated/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-brand-text truncate">{r.teamName}</span>
                <span className="text-sm font-bold text-brand-primaryText tabular-nums">
                  {r.projectedStarterPoints.toFixed(1)}
                </span>
              </div>
              <div className="text-[10px] text-brand-muted mt-0.5">
                {r.starters.length} starters · {r.bench.length} bench
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Hover popup card ── */}
      {hovered && (
        <div
          className="fixed z-50"
          style={{ top: hovered.top, left: hovered.left }}
          onMouseEnter={() => {
            if (hoverTimer.current) clearTimeout(hoverTimer.current);
          }}
          onMouseLeave={handleLeave}
        >
          <PlayerInfoCard
            poolId={hovered.player.playerId ?? ''}
            sport={(hovered.player.sport as any) ?? sport}
            seasonYear={seasonYear}
            playerName={hovered.player.playerName}
            position={hovered.player.position}
            team={hovered.player.team}
          />
        </div>
      )}

      {/* ── AI chat ── */}
      {chatOpen && <LeagueChat leagueId={leagueId} week={data.week} onClose={() => setChatOpen(false)} />}

      {/* ── Celebration ── */}
      {isFinal && matchup && opponent && (
        <CelebrationOverlay
          celebrationKey={`matchup-${matchup.id}-${matchup.week}`}
          result={result}
          myTeamName={data.myTeamName ?? 'You'}
          oppTeamName={opponent.teamName}
          myScore={myScore}
          oppScore={oppScore}
          xpAwarded={result === 'win' ? 50 : result === 'tie' ? 15 : undefined}
        />
      )}
    </div>
  );
}
