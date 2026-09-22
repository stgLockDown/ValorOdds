'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2, Radio, ChevronDown, ChevronUp, Zap, Flame, Trophy, Star,
  TrendingUp, TrendingDown, Minus, Eye, EyeOff, Swords, Sparkles, X,
  Activity, ArrowUpDown, Pin,
} from 'lucide-react';
import { getPositionColor } from '@/lib/dd/position-colors';
import { PlayerInfoCard } from '@/components/dd/PlayerInfoCard';
import { compareSlots, slotLabel } from '@/lib/dd/slot-order';

// ──────────────────────────────────────────────────────────────────────────────
// Types — mirror the /api/dd/leagues/[id]/home payload
// ──────────────────────────────────────────────────────────────────────────────

export interface WeeklyStatEntry {
  stats: Record<string, number>;
  chips: { label: string; value: string }[];
  points: number;
  source: 'live' | 'actual' | 'projection';
  gameState?: 'pre' | 'in' | 'post';
  /** Player's team has the ball right now (D/ST: opponent has the ball). */
  hasPossession?: boolean;
  /** That offense is inside the opponent's 20. */
  isRedZone?: boolean;
  /** Line is an estimate, not earned points. */
  isProjected?: boolean;
}
export interface WeeklyPlayerLine {
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
export interface WeeklyRoster {
  memberId: string;
  teamName: string;
  isBot: boolean;
  starters: WeeklyPlayerLine[];
  bench: WeeklyPlayerLine[];
  starterPoints: number;
  benchPoints: number;
  projectedStarterPoints: number;
  projectedWeekPoints?: number;
  inPlayCount?: number;
}
export interface BoardMatchup {
  id: string;
  week: number;
  homeMemberId: string;
  awayMemberId: string;
  homeScore: number | null;
  awayScore: number | null;
  winnerMemberId: string | null;
  isTie: boolean;
  status: string;
}
export interface BoardMember {
  id: string;
  teamName: string;
  isBot: boolean;
  isCommissioner: boolean;
  record: { wins: number; losses: number; ties: number; pointsFor: number };
}

export interface MatchupBoardProps {
  leagueId: string;
  sport: string;
  seasonYear: number;
  week: number;
  rosters: WeeklyRoster[];
  matchups: BoardMatchup[];
  members: BoardMember[];
  currentMemberId: string | null;
  liveGames: number;
  hasLiveData: boolean;
  /** League's real current scoring period (Wed→Tue calendar). */
  calendarWeek?: number | null;
  /** True when the selected week hasn't been played yet. */
  isFutureWeek?: boolean;
  /** True when every line shown is a projection. */
  isProjectedWeek?: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** A points jump of at least this many points counts as a "big play". */
const BIG_PLAY_THRESHOLD = 6;

interface BigPlay {
  id: string;
  playerName: string;
  teamName: string;
  memberId: string;
  delta: number;
  label: string;
  ts: number;
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

/** Derive a human label for the most notable thing in a player's stat line. */
function notableLabel(p: WeeklyPlayerLine): string {
  const s = p.week.stats ?? {};
  if ((s.rec_td ?? 0) > 0) return 'Receiving TD';
  if ((s.rush_td ?? 0) > 0) return 'Rushing TD';
  if ((s.pass_td ?? 0) > 0) return 'Passing TD';
  if ((s.def_td ?? 0) > 0) return 'Defensive TD';
  if ((s.fg_50 ?? 0) > 0) return '50+ FG';
  if ((s.rec_100 ?? 0) > 0) return '100+ Rec Yds';
  if ((s.rush_100 ?? 0) > 0) return '100+ Rush Yds';
  if ((s.pass_300 ?? 0) > 0) return '300+ Pass Yds';
  if ((s.def_int ?? 0) > 0) return 'Interception';
  if ((s.def_sack ?? 0) > 0) return 'Sack';
  if ((s.fg ?? 0) > 0) return 'Field Goal';
  return 'Big play';
}

/** Ease a number toward a target with requestAnimationFrame. */
function useAnimatedNumber(target: number, duration = 800): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    fromRef.current = value;
    startRef.current = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(fromRef.current + (target - fromRef.current) * eased);
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

function sourceMeta(p: WeeklyPlayerLine): { label: string; color: string } {
  const isLive = p.week.source === 'live';
  const isActual = p.week.source === 'actual';
  const inGame = p.week.gameState === 'in';
  const finalGame = p.week.gameState === 'post';
  // A projected line is never labelled as earned points — future weeks and
  // players whose game hasn't kicked off always read "Proj".
  const label = p.week.isProjected
    ? 'Proj'
    : isLive
      ? inGame
        ? 'Live'
        : finalGame
          ? 'Final'
          : 'Scheduled'
      : isActual
        ? 'Actual'
        : 'Proj';
  const color = p.week.isProjected
    ? 'text-brand-muted'
    : inGame
      ? 'text-brand-danger'
      : isLive || isActual
        ? 'text-brand-success'
        : 'text-brand-muted';
  return { label, color };
}

// ──────────────────────────────────────────────────────────────────────────────
// Player row — headshot + live stat chips + animated points + big-play flash
// ──────────────────────────────────────────────────────────────────────────────

function PlayerRow({
  player,
  sport,
  isPinned,
  isFlashing,
  onPin,
  onHover,
  onLeave,
  onSelect,
}: {
  player: WeeklyPlayerLine;
  sport: string;
  isPinned: boolean;
  isFlashing: boolean;
  onPin: (name: string) => void;
  onHover: (p: WeeklyPlayerLine, el: HTMLElement) => void;
  onLeave: () => void;
  onSelect: (p: WeeklyPlayerLine) => void;
}) {
  const { label: sourceLabel, color: sourceColor } = sourceMeta(player);
  const inGame = player.week.gameState === 'in';
  // "In play" = this player's offense has the ball right now (for a D/ST, the
  // opponent has it, so the defense is on the field). ESPN highlights these.
  const inPlay = inGame && Boolean(player.week.hasPossession);
  const inRedZone = inPlay && Boolean(player.week.isRedZone);
  const animatedPoints = useAnimatedNumber(player.week.points);

  return (
    <div
      className={`group relative flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors cursor-pointer ${
        isFlashing
          ? 'dd-bigplay border-brand-accent/70 bg-brand-accent/10'
          : inRedZone
            ? 'dd-inplay-rz border-brand-danger/80 bg-brand-danger/15 hover:border-brand-danger'
            : inPlay
              ? 'dd-inplay border-brand-success/70 bg-brand-success/10 hover:border-brand-success'
              : inGame
                ? 'border-brand-danger/40 bg-brand-danger/5 hover:border-brand-danger/70'
                : 'border-brand-border bg-brand-elevated/40 hover:border-brand-primary/60'
      }`}
      onMouseEnter={(e) => onHover(player, e.currentTarget)}
      onMouseLeave={onLeave}
      onClick={() => onSelect(player)}
    >
      {/* Live shimmer sweep */}
      {inGame && !isFlashing && (
        <span className="dd-shimmer pointer-events-none absolute inset-0 rounded-lg" />
      )}

      {/* Big-play sparkle */}
      {isFlashing && (
        <Sparkles className="dd-sparkle pointer-events-none absolute -top-1.5 -right-1.5 w-5 h-5 text-brand-accent" />
      )}

      {/* Pin toggle */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPin(player.playerName);
        }}
        className={`flex-shrink-0 transition-colors ${
          isPinned ? 'text-brand-accent' : 'text-brand-border hover:text-brand-muted'
        }`}
        title={isPinned ? 'Unpin player' : 'Pin player to top'}
        aria-label={isPinned ? 'Unpin player' : 'Pin player'}
      >
        <Pin className="w-3.5 h-3.5" fill={isPinned ? 'currentColor' : 'none'} />
      </button>

      {/* Possession rail — a bright edge on players whose offense is on the field */}
      {inPlay && (
        <span
          className={`pointer-events-none absolute left-0 top-1 bottom-1 w-[3px] rounded-full ${
            inRedZone ? 'bg-brand-danger' : 'bg-brand-success'
          }`}
        />
      )}

      <span className="w-11 text-[10px] font-bold uppercase tracking-wide text-brand-muted flex-shrink-0">
        {slotLabel(player.slot)}
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
          {inGame && !inPlay && (
            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-brand-danger flex-shrink-0">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-danger opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand-danger" />
              </span>
              Live
            </span>
          )}
          {inPlay && (
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide flex-shrink-0 ${
                inRedZone
                  ? 'border-brand-danger/60 bg-brand-danger/20 text-brand-danger'
                  : 'border-brand-success/60 bg-brand-success/20 text-brand-success'
              }`}
              title={
                inRedZone
                  ? 'Red zone — this offense has the ball inside the 20'
                  : 'In play — this player\u2019s team has possession'
              }
            >
              <span className="relative flex h-1.5 w-1.5">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    inRedZone ? 'bg-brand-danger' : 'bg-brand-success'
                  }`}
                />
                <span
                  className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                    inRedZone ? 'bg-brand-danger' : 'bg-brand-success'
                  }`}
                />
              </span>
              {inRedZone ? 'Red Zone' : 'In Play'}
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
          {player.week.chips.length === 0 && (
            <span className="text-[10px] text-brand-muted italic">No stats yet</span>
          )}
        </div>
      </div>

      {/* Points */}
      <div className="text-right flex-shrink-0">
        <div
          className={`text-sm font-bold tabular-nums ${
            isFlashing ? 'dd-score-pop text-brand-accent' : 'text-brand-primaryText'
          }`}
        >
          {animatedPoints.toFixed(1)}
        </div>
        <div className={`text-[9px] uppercase tracking-wide ${sourceColor}`}>{sourceLabel}</div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Team column — starters + collapsible bench
// ──────────────────────────────────────────────────────────────────────────────

function TeamColumn({
  roster,
  member,
  isMe,
  isWinner,
  isFinal,
  isFutureWeek,
  sport,
  pinned,
  flashes,
  liveOnly,
  sortBy,
  onPin,
  onHover,
  onLeave,
  onSelect,
}: {
  roster: WeeklyRoster | undefined;
  member: BoardMember | undefined;
  isMe: boolean;
  isWinner: boolean;
  isFinal: boolean;
  isFutureWeek: boolean;
  sport: string;
  pinned: Set<string>;
  flashes: Record<string, number>;
  liveOnly: boolean;
  sortBy: 'slot' | 'points';
  onPin: (name: string) => void;
  onHover: (p: WeeklyPlayerLine, el: HTMLElement) => void;
  onLeave: () => void;
  onSelect: (p: WeeklyPlayerLine) => void;
}) {
  const [benchOpen, setBenchOpen] = useState(true);

  const order = (list: WeeklyPlayerLine[]) => {
    let out = [...list];
    if (liveOnly) out = out.filter((p) => p.week.gameState !== 'pre');
    if (sortBy === 'points') {
      out.sort((a, b) => b.week.points - a.week.points);
    } else {
      // ESPN lineup order: QB, RB, RB, WR, WR, TE, FLEX, FLEX+, D/ST, K.
      // The server already sorts this way; re-applying here keeps the order
      // correct after toggling back from the points view.
      out.sort((a, b) => compareSlots(a.slot, b.slot, sport));
    }
    // Pinned players float to the top, preserving their relative order.
    out.sort((a, b) => Number(pinned.has(b.playerName)) - Number(pinned.has(a.playerName)));
    return out;
  };

  const starters = order(roster?.starters ?? []);
  const bench = order(roster?.bench ?? []);
  const total = roster?.starterPoints ?? 0;
  const animatedTotal = useAnimatedNumber(total);

  return (
    <div
      className={`card p-4 ${
        isMe ? 'ring-1 ring-brand-primary/50' : ''
      } ${isWinner ? 'ring-1 ring-brand-success/50' : ''}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-sm font-bold truncate ${isMe ? 'text-brand-accent' : 'text-brand-text'}`}>
              {member?.teamName ?? roster?.teamName ?? 'Unknown'}
            </span>
            {isMe && <span className="text-[10px] text-brand-accent flex-shrink-0">(You)</span>}
            {member?.isBot && <span className="text-[10px] text-brand-muted flex-shrink-0">AI</span>}
            {isWinner && <Trophy className="w-3.5 h-3.5 text-brand-accent flex-shrink-0" />}
          </div>
          {member && (
            <div className="text-[10px] text-brand-muted mt-0.5">
              {member.record.wins}-{member.record.losses}
              {member.record.ties ? `-${member.record.ties}` : ''} · {member.record.pointsFor.toFixed(1)} PF
            </div>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <div className={`text-2xl font-extrabold tabular-nums ${isWinner ? 'text-brand-success' : 'text-brand-text'}`}>
            {animatedTotal.toFixed(1)}
          </div>
          <div className="text-[9px] uppercase tracking-wide text-brand-muted">
            {isFutureWeek ? 'Projected' : isFinal ? 'Final' : 'Live total'}
          </div>
        </div>
      </div>

      {/* Starters */}
      <div className="space-y-1.5">
        {starters.map((p) => (
          <PlayerRow
            key={p.playerName}
            player={p}
            sport={sport}
            isPinned={pinned.has(p.playerName)}
            isFlashing={Boolean(flashes[p.playerName])}
            onPin={onPin}
            onHover={onHover}
            onLeave={onLeave}
            onSelect={onSelect}
          />
        ))}
        {starters.length === 0 && (
          <p className="text-xs text-brand-muted text-center py-3">
            {liveOnly ? 'No starters have played yet.' : 'No starters set.'}
          </p>
        )}
      </div>

      {/* Bench */}
      {(roster?.bench.length ?? 0) > 0 && (
        <div className="mt-3 pt-3 border-t border-brand-border">
          <button
            type="button"
            onClick={() => setBenchOpen((v) => !v)}
            className="flex w-full items-center justify-between text-xs font-semibold text-brand-muted hover:text-brand-text transition-colors"
          >
            <span className="inline-flex items-center gap-1.5">
              {benchOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Bench ({roster?.bench.length ?? 0})
            </span>
            <span className="tabular-nums">{(roster?.benchPoints ?? 0).toFixed(1)} pts</span>
          </button>
          {benchOpen && (
            <div className="space-y-1.5 mt-2">
              {bench.map((p) => (
                <PlayerRow
                  key={p.playerName}
                  player={p}
                  sport={sport}
                  isPinned={pinned.has(p.playerName)}
                  isFlashing={Boolean(flashes[p.playerName])}
                  onPin={onPin}
                  onHover={onHover}
                  onLeave={onLeave}
                  onSelect={onSelect}
                />
              ))}
              {bench.length === 0 && (
                <p className="text-xs text-brand-muted text-center py-2">No bench players have played yet.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Big-play banner + feed
// ──────────────────────────────────────────────────────────────────────────────

function BigPlayBanner({ play }: { play: BigPlay }) {
  return (
    <div
      key={play.id}
      className="dd-banner-in flex items-center gap-3 rounded-xl border border-brand-accent/50 bg-gradient-to-r from-brand-accent/20 via-brand-accent/10 to-transparent px-4 py-3"
    >
      <div className="relative flex-shrink-0">
        <Flame className="w-6 h-6 text-brand-accent" />
        <Sparkles className="w-3.5 h-3.5 text-brand-accent absolute -top-1 -right-1 animate-pulse" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-brand-text truncate">
          {play.label} — {play.playerName}
        </div>
        <div className="text-[11px] text-brand-muted truncate">{play.teamName}</div>
      </div>
      <div className="text-lg font-extrabold text-brand-accent tabular-nums flex-shrink-0">
        +{play.delta.toFixed(1)}
      </div>
    </div>
  );
}

function BigPlayFeed({ feed, onClose }: { feed: BigPlay[]; onClose: () => void }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-brand-text flex items-center gap-2 text-sm">
          <Flame className="w-4 h-4 text-brand-accent" /> Big Play Feed
        </h3>
        <button onClick={onClose} className="text-brand-muted hover:text-brand-text" aria-label="Close feed">
          <X className="w-4 h-4" />
        </button>
      </div>
      {feed.length === 0 ? (
        <p className="text-xs text-brand-muted text-center py-4">
          No big plays yet. They&apos;ll appear here as players score.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {feed.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2 rounded-lg bg-brand-elevated/40 border border-brand-border px-3 py-2"
            >
              <Zap className="w-3.5 h-3.5 text-brand-accent flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-brand-text truncate">{p.playerName}</div>
                <div className="text-[10px] text-brand-muted truncate">
                  {p.label} · {p.teamName}
                </div>
              </div>
              <span className="text-xs font-bold text-brand-accent tabular-nums flex-shrink-0">
                +{p.delta.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Player detail modal — full stat breakdown + player info
// ──────────────────────────────────────────────────────────────────────────────

function PlayerDetailModal({
  player,
  sport,
  seasonYear,
  onClose,
}: {
  player: WeeklyPlayerLine;
  sport: string;
  seasonYear: number;
  onClose: () => void;
}) {
  const { label: sourceLabel, color: sourceColor } = sourceMeta(player);
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-[ddFadeIn_0.2s_ease-out]" onClick={onClose} />
      <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-brand-surface border border-brand-border shadow-2xl p-5 animate-[ddPopIn_0.3s_cubic-bezier(0.34,1.56,0.64,1)]">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-brand-muted hover:text-brand-text"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 rounded-full bg-brand-elevated border border-brand-border overflow-hidden flex-shrink-0 flex items-center justify-center">
            {player.headshot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={player.headshot} alt={player.playerName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs text-brand-muted">{player.position}</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <PosBadge sport={sport} position={player.position ?? ''} />
              <span className="text-base font-bold text-brand-text truncate">{player.playerName}</span>
            </div>
            <div className="text-xs text-brand-muted mt-0.5">
              {player.team ?? '—'}
              {player.opponent ? ` vs ${player.opponent}` : ''} · Slot {player.slot}
            </div>
          </div>
        </div>

        {/* Points */}
        <div className="flex items-center justify-between rounded-xl bg-brand-elevated/50 border border-brand-border px-4 py-3 mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-brand-muted">Week {player.week.points ? '' : ''}Points</div>
            <div className="text-3xl font-extrabold text-brand-primaryText tabular-nums">
              {player.week.points.toFixed(1)}
            </div>
          </div>
          <div className="text-right">
            <div className={`text-xs font-bold uppercase tracking-wide ${sourceColor}`}>{sourceLabel}</div>
            <div className="text-[10px] text-brand-muted mt-0.5">
              Proj {player.projectedPoints.toFixed(1)}
            </div>
          </div>
        </div>

        {/* Stat breakdown */}
        <div className="mb-4">
          <div className="text-xs font-semibold text-brand-muted mb-2">Stat Line</div>
          {player.week.chips.length ? (
            <div className="grid grid-cols-3 gap-2">
              {player.week.chips.map((c, i) => (
                <div key={i} className="rounded-lg bg-brand-elevated/40 border border-brand-border px-2 py-1.5 text-center">
                  <div className="text-sm font-bold text-brand-text tabular-nums">{c.value}</div>
                  <div className="text-[10px] text-brand-muted truncate">{c.label}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-brand-muted italic">No stats recorded yet.</p>
          )}
        </div>

        {/* Player info (fetched) */}
        {player.playerId && (
          <div>
            <div className="text-xs font-semibold text-brand-muted mb-2">Player Info</div>
            <PlayerInfoCard
              poolId={player.playerId}
              sport={(player.sport as any) ?? sport}
              seasonYear={seasonYear}
              playerName={player.playerName}
              position={player.position}
              team={player.team}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main board
// ──────────────────────────────────────────────────────────────────────────────

export default function MatchupBoard({
  leagueId,
  sport,
  seasonYear,
  week,
  rosters,
  matchups,
  members,
  currentMemberId,
  liveGames,
  hasLiveData,
  calendarWeek = null,
  isFutureWeek = false,
  isProjectedWeek = false,
}: MatchupBoardProps) {
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const rosterById = useMemo(() => new Map(rosters.map((r) => [r.memberId, r])), [rosters]);

  const myMatchup = matchups.find(
    (m) => m.homeMemberId === currentMemberId || m.awayMemberId === currentMemberId
  );

  const [focusId, setFocusId] = useState<string | null>(null);
  // Reset the focused matchup whenever the week changes.
  useEffect(() => {
    setFocusId(myMatchup?.id ?? matchups[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  const focus = matchups.find((m) => m.id === focusId) ?? myMatchup ?? matchups[0];

  // ── Interactable state ──
  const [liveOnly, setLiveOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'slot' | 'points'>('slot');
  const [feedOpen, setFeedOpen] = useState(false);
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<{ player: WeeklyPlayerLine; top: number; left: number } | null>(null);
  const [detail, setDetail] = useState<WeeklyPlayerLine | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist pins per league.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`dd-pins-${leagueId}`);
      if (raw) setPinned(new Set(JSON.parse(raw)));
    } catch {
      /* ignore */
    }
  }, [leagueId]);

  const togglePin = (name: string) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      try {
        localStorage.setItem(`dd-pins-${leagueId}`, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // ── Big-play detection: watch for points jumps between polls ──
  const prevPointsRef = useRef<Map<string, number>>(new Map());
  const [flashes, setFlashes] = useState<Record<string, number>>({});
  const [feed, setFeed] = useState<BigPlay[]>([]);

  useEffect(() => {
    const prev = prevPointsRef.current;
    const next = new Map<string, number>();
    const newPlays: BigPlay[] = [];
    const newFlashes: Record<string, number> = {};

    for (const r of rosters) {
      for (const p of [...r.starters, ...r.bench]) {
        const pts = p.week.points;
        next.set(p.playerName, pts);
        const before = prev.get(p.playerName);
        if (before != null && pts - before >= BIG_PLAY_THRESHOLD) {
          const delta = Math.round((pts - before) * 10) / 10;
          newPlays.push({
            id: `${p.playerName}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            playerName: p.playerName,
            teamName: r.teamName,
            memberId: r.memberId,
            delta,
            label: notableLabel(p),
            ts: Date.now(),
          });
          newFlashes[p.playerName] = Date.now();
        }
      }
    }
    prevPointsRef.current = next;

    if (newPlays.length) {
      setFeed((f) => [...newPlays, ...f].slice(0, 15));
      setFlashes((f) => ({ ...f, ...newFlashes }));
      const t = setTimeout(() => {
        setFlashes((f) => {
          const copy = { ...f };
          for (const k of Object.keys(newFlashes)) delete copy[k];
          return copy;
        });
      }, 1700);
      return () => clearTimeout(t);
    }
  }, [rosters]);

  const latestPlay = feed[0] ?? null;

  // Animated scoreboard totals — hooks must run before any early return.
  const homeScore = focus ? focus.homeScore ?? rosterById.get(focus.homeMemberId)?.starterPoints ?? 0 : 0;
  const awayScore = focus ? focus.awayScore ?? rosterById.get(focus.awayMemberId)?.starterPoints ?? 0 : 0;
  const animatedHome = useAnimatedNumber(homeScore);
  const animatedAway = useAnimatedNumber(awayScore);

  // ── Hover popup ──
  const handleHover = (p: WeeklyPlayerLine, el: HTMLElement) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    const rect = el.getBoundingClientRect();
    const left = Math.min(rect.left, window.innerWidth - 340);
    const top = Math.min(rect.bottom + 8, window.innerHeight - 420);
    hoverTimer.current = setTimeout(() => {
      setHovered({ player: p, top: Math.max(8, top), left: Math.max(8, left) });
    }, 180);
  };
  const handleLeave = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered(null), 160);
  };

  if (!focus) {
    return (
      <div className="card p-5 text-center text-sm text-brand-muted">
        No matchups scheduled for Week {week}.
      </div>
    );
  }

  const homeRoster = rosterById.get(focus.homeMemberId);
  const awayRoster = rosterById.get(focus.awayMemberId);
  const homeMember = memberById.get(focus.homeMemberId);
  const awayMember = memberById.get(focus.awayMemberId);
  const isFinal = focus.status === 'final';
  const isLive = focus.status === 'in_progress';

  return (
    <div className="space-y-4">
      {/* Big-play banner */}
      {latestPlay && <BigPlayBanner play={latestPlay} />}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setLiveOnly((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            liveOnly
              ? 'border-brand-danger/50 bg-brand-danger/10 text-brand-danger'
              : 'border-brand-border bg-brand-elevated/40 text-brand-muted hover:text-brand-text'
          }`}
          title="Hide players whose game hasn't started"
        >
          {liveOnly ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          Live only
        </button>

        <button
          onClick={() => setSortBy((s) => (s === 'slot' ? 'points' : 'slot'))}
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand-border bg-brand-elevated/40 px-2.5 py-1.5 text-xs font-medium text-brand-muted hover:text-brand-text transition-colors"
          title="Toggle sort order"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          Sort: {sortBy === 'slot' ? 'Slot' : 'Points'}
        </button>

        <button
          onClick={() => setFeedOpen((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            feedOpen
              ? 'border-brand-accent/50 bg-brand-accent/10 text-brand-accent'
              : 'border-brand-border bg-brand-elevated/40 text-brand-muted hover:text-brand-text'
          }`}
          title="Show recent big plays"
        >
          <Flame className="w-3.5 h-3.5" />
          Big plays{feed.length ? ` (${feed.length})` : ''}
        </button>

        {pinned.size > 0 && (
          <button
            onClick={() => {
              setPinned(new Set());
              try {
                localStorage.removeItem(`dd-pins-${leagueId}`);
              } catch {
                /* ignore */
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-accent/40 bg-brand-accent/10 px-2.5 py-1.5 text-xs font-medium text-brand-accent"
            title="Clear pinned players"
          >
            <Pin className="w-3.5 h-3.5" /> {pinned.size} pinned · clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-2 text-[11px] text-brand-muted">
          {isFutureWeek ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-brand-primaryText">
              <Activity className="w-3.5 h-3.5" /> Projected — not yet played
            </span>
          ) : liveGames > 0 ? (
            <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-wide text-brand-danger">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-danger opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-danger" />
              </span>
              <Radio className="w-3.5 h-3.5" /> {liveGames} live
            </span>
          ) : hasLiveData ? (
            <span className="inline-flex items-center gap-1.5 text-brand-success">
              <Activity className="w-3.5 h-3.5" /> Real game stats
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" /> Projections
            </span>
          )}
        </div>
      </div>

      {/* Future-week notice — these numbers are estimates, never earned points. */}
      {isFutureWeek && (
        <div className="flex items-start gap-2.5 rounded-lg border border-brand-primary/30 bg-brand-primary/10 px-3 py-2.5 text-xs">
          <Activity className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-brand-primaryText" />
          <p className="leading-relaxed text-brand-muted">
            <span className="font-semibold text-brand-primaryText">
              Week {week} hasn&rsquo;t been played yet.
            </span>{' '}
            Every total below is a <span className="font-semibold">projection</span> — no points have
            been earned.
            {calendarWeek != null && ` The current scoring period is Week ${calendarWeek}.`}
          </p>
        </div>
      )}

      {/* Focused matchup scoreboard */}
      <div className="card p-4 sm:p-5">
        <div className="grid grid-cols-3 items-center gap-3">
          <div className="text-center">
            <div className={`text-sm font-semibold truncate ${focus.homeMemberId === currentMemberId ? 'text-brand-accent' : 'text-brand-text'}`}>
              {homeMember?.teamName ?? 'Home'}
              {focus.homeMemberId === currentMemberId && <span className="ml-1 text-[10px] text-brand-accent">(You)</span>}
            </div>
            <div className={`text-3xl font-extrabold tabular-nums mt-1 ${focus.winnerMemberId === focus.homeMemberId ? 'text-brand-success' : 'text-brand-text'}`}>
              {animatedHome.toFixed(1)}
            </div>
            {focus.winnerMemberId === focus.homeMemberId && (
              <div className="text-[10px] font-bold text-brand-success mt-0.5">WIN</div>
            )}
          </div>
          <div className="text-center">
            <Swords className="w-5 h-5 text-brand-muted mx-auto" />
            <div className="text-[10px] font-bold text-brand-muted mt-1">VS</div>
          </div>
          <div className="text-center">
            <div className={`text-sm font-semibold truncate ${focus.awayMemberId === currentMemberId ? 'text-brand-accent' : 'text-brand-text'}`}>
              {awayMember?.teamName ?? 'Away'}
              {focus.awayMemberId === currentMemberId && <span className="ml-1 text-[10px] text-brand-accent">(You)</span>}
            </div>
            <div className={`text-3xl font-extrabold tabular-nums mt-1 ${focus.winnerMemberId === focus.awayMemberId ? 'text-brand-success' : 'text-brand-text'}`}>
              {animatedAway.toFixed(1)}
            </div>
            {focus.winnerMemberId === focus.awayMemberId && (
              <div className="text-[10px] font-bold text-brand-success mt-0.5">WIN</div>
            )}
          </div>
        </div>
        <div className="text-center text-xs text-brand-muted mt-3">
          {isFinal ? (
            <span className="font-semibold uppercase tracking-wide text-brand-accent">Final</span>
          ) : isLive ? (
            <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-wide text-brand-danger">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-danger opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-danger" />
              </span>
              Live
            </span>
          ) : (
            'Scheduled'
          )}
        </div>
      </div>

      {/* Two team columns */}
      <div className="grid gap-4 lg:grid-cols-2">
        <TeamColumn
          roster={homeRoster}
          member={homeMember}
          isMe={focus.homeMemberId === currentMemberId}
          isWinner={focus.winnerMemberId === focus.homeMemberId}
          isFinal={isFinal}
          isFutureWeek={isFutureWeek}
          sport={sport}
          pinned={pinned}
          flashes={flashes}
          liveOnly={liveOnly}
          sortBy={sortBy}
          onPin={togglePin}
          onHover={handleHover}
          onLeave={handleLeave}
          onSelect={setDetail}
        />
        <TeamColumn
          roster={awayRoster}
          member={awayMember}
          isMe={focus.awayMemberId === currentMemberId}
          isWinner={focus.winnerMemberId === focus.awayMemberId}
          isFinal={isFinal}
          isFutureWeek={isFutureWeek}
          sport={sport}
          pinned={pinned}
          flashes={flashes}
          liveOnly={liveOnly}
          sortBy={sortBy}
          onPin={togglePin}
          onHover={handleHover}
          onLeave={handleLeave}
          onSelect={setDetail}
        />
      </div>

      {/* Big play feed */}
      {feedOpen && <BigPlayFeed feed={feed} onClose={() => setFeedOpen(false)} />}

      {/* Other matchups this week */}
      {matchups.length > 1 && (
        <div className="card p-4">
          <h3 className="font-semibold text-brand-text mb-3 flex items-center gap-2 text-sm">
            <Swords className="w-4 h-4 text-brand-primaryText" /> Week {week} Matchups
          </h3>
          <div className="space-y-2">
            {matchups.map((g) => {
              const h = memberById.get(g.homeMemberId);
              const a = memberById.get(g.awayMemberId);
              const isFocused = g.id === focus.id;
              const involvesMe =
                g.homeMemberId === currentMemberId || g.awayMemberId === currentMemberId;
              return (
                <button
                  key={g.id}
                  onClick={() => setFocusId(g.id)}
                  className={`flex w-full items-center gap-2 text-sm rounded-lg px-3 py-2 transition-colors text-left ${
                    isFocused
                      ? 'bg-brand-primary/15 border border-brand-primary/50'
                      : 'bg-brand-elevated/40 border border-transparent hover:border-brand-border'
                  }`}
                >
                  <span className={`flex-1 text-right truncate ${g.winnerMemberId === g.homeMemberId ? 'font-semibold text-brand-text' : 'text-brand-muted'}`}>
                    {h?.teamName ?? '?'}
                    {g.homeMemberId === currentMemberId && <span className="ml-1 text-[10px] text-brand-accent">(You)</span>}
                  </span>
                  <span className="text-xs font-bold text-brand-text px-2 tabular-nums">
                    {g.homeScore != null ? g.homeScore.toFixed(1) : '—'} – {g.awayScore != null ? g.awayScore.toFixed(1) : '—'}
                  </span>
                  <span className={`flex-1 truncate ${g.winnerMemberId === g.awayMemberId ? 'font-semibold text-brand-text' : 'text-brand-muted'}`}>
                    {a?.teamName ?? '?'}
                    {g.awayMemberId === currentMemberId && <span className="ml-1 text-[10px] text-brand-accent">(You)</span>}
                  </span>
                  {g.status === 'in_progress' && (
                    <span className="relative flex h-2 w-2 flex-shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-danger opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-danger" />
                    </span>
                  )}
                  {involvesMe && <Star className="w-3.5 h-3.5 text-brand-accent flex-shrink-0" fill="currentColor" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Hover popup */}
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

      {/* Detail modal */}
      {detail && (
        <PlayerDetailModal
          player={detail}
          sport={sport}
          seasonYear={seasonYear}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
