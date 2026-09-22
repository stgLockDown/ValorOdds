'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Radio, Share2, MessageCircle, Flame, Activity, TrendingUp, MapPin, Tv,
  Clock, Target, Zap, Trophy, ChevronDown, ChevronUp, Loader2, ArrowRight,
  Shield, Flag, Repeat,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types (mirror lib/live-game-graphic.ts)
// ─────────────────────────────────────────────────────────────────────────────

type Team = {
  id: string | null;
  abbrev: string;
  name: string;
  shortName: string;
  logo: string | null;
  color: string | null;
  altColor: string | null;
  score: number;
  record: string | null;
  homeAway: 'home' | 'away';
};

type Play = {
  id: string;
  text: string;
  typeText: string | null;
  typeAbbrev: string | null;
  abbrev: string | null;
  possessionAbbrev: string | null;
  period: number | null;
  clock: string | null;
  down: number | null;
  distance: number | null;
  yardLine: number | null;
  yardsToEndzone: number | null;
  downDistanceText: string | null;
  possessionText: string | null;
  isRedZone: boolean;
  isScoringPlay: boolean;
  isTurnover: boolean;
  statYardage: number | null;
  homeScore: number | null;
  awayScore: number | null;
  wallclock: string | null;
};

type Drive = {
  id: string;
  teamAbbrev: string | null;
  description: string | null;
  startYardLine: number | null;
  endYardLine: number | null;
  startText: string | null;
  endText: string | null;
  isScore: boolean;
  result: string | null;
  displayResult: string | null;
  offensivePlays: number | null;
  yards: number | null;
  timeElapsed: string | null;
  plays: Play[];
};

type Odds = {
  provider: string | null;
  providerLogo: string | null;
  details: string | null;
  spread: number | null;
  overUnder: number | null;
  homeMoneyLine: number | null;
  awayMoneyLine: number | null;
  homeSpreadOdds: number | null;
  awaySpreadOdds: number | null;
  overOdds: number | null;
  underOdds: number | null;
};

type Situation = {
  down: number | null;
  distance: number | null;
  yardLine: number | null;
  yardsToEndzone: number | null;
  downDistanceText: string | null;
  possessionText: string | null;
  isRedZone: boolean;
  possessionAbbrev: string | null;
};

export type LiveGameGraphicData = {
  eventId: string;
  sport: string;
  state: 'pre' | 'in' | 'post';
  isLive: boolean;
  isFinal: boolean;
  statusDetail: string | null;
  period: number;
  clock: string | null;
  venue: string | null;
  broadcast: string | null;
  home: Team;
  away: Team;
  possession: 'home' | 'away' | null;
  situation: Situation | null;
  drives: Drive[];
  currentDrive: Drive | null;
  lastPlay: Play | null;
  plays: Play[];
  scoringPlays: Play[];
  winProbability: { home: number; away: number; tie: number } | null;
  winProbabilitySeries: { playId: string; home: number; away: number }[];
  odds: Odds | null;
  linescores: { label: string; home: number | null; away: number | null }[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const REACTION_EMOJIS = ['🔥', '😆', '🥰', '🤩'];

function hex(c: string | null, fallback: string): string {
  if (!c) return fallback;
  return c.startsWith('#') ? c : `#${c}`;
}

function periodLabel(period: number | null): string {
  if (!period) return '';
  if (period <= 4) return `Q${period}`;
  return period === 5 ? 'OT' : `OT${period - 4}`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Short human label for a play type. */
function playKind(p: Play): { label: string; tone: 'score' | 'turnover' | 'big' | 'normal' } {
  const t = (p.typeText ?? '').toLowerCase();
  if (p.isScoringPlay) {
    if (/touchdown|td/.test(t)) return { label: 'TOUCHDOWN', tone: 'score' };
    if (/field goal/.test(t)) return { label: 'FIELD GOAL', tone: 'score' };
    if (/safety/.test(t)) return { label: 'SAFETY', tone: 'score' };
    if (/two.?point|2pt/.test(t)) return { label: '2-PT', tone: 'score' };
    return { label: 'SCORE', tone: 'score' };
  }
  if (p.isTurnover) {
    if (/intercept/.test(t)) return { label: 'INTERCEPTION', tone: 'turnover' };
    if (/fumble/.test(t)) return { label: 'FUMBLE', tone: 'turnover' };
    return { label: 'TURNOVER', tone: 'turnover' };
  }
  if (/punt/.test(t)) return { label: 'PUNT', tone: 'normal' };
  if (/kickoff/.test(t)) return { label: 'KICKOFF', tone: 'normal' };
  if (/penalty/.test(t)) return { label: 'PENALTY', tone: 'normal' };
  if (/timeout/.test(t)) return { label: 'TIMEOUT', tone: 'normal' };
  if (/end of/.test(t)) return { label: 'END OF PERIOD', tone: 'normal' };
  if (/pass/.test(t)) return { label: 'PASS', tone: 'normal' };
  if (/rush/.test(t)) return { label: 'RUSH', tone: 'normal' };
  return { label: (p.typeText ?? 'PLAY').toUpperCase(), tone: 'normal' };
}

/** Extract a player name from ESPN play text, e.g. "D.Zvada 24 yard field goal". */
function playerFromText(text: string): string | null {
  const m = text.match(/^\(?[\d:]*\)?\s*([A-Z]\.\s?[A-Za-z'\-]+)/);
  if (m) return m[1].replace(/\.\s?/, '. ');
  const m2 = text.match(/\b([A-Z]\.[A-Z][a-z]+)\b/);
  return m2 ? m2[1].replace('.', '. ') : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoreboard
// ─────────────────────────────────────────────────────────────────────────────

function TeamScoreCard({
  team,
  isPossession,
  isWinner,
  isFinal,
  align,
}: {
  team: Team;
  isPossession: boolean;
  isWinner: boolean;
  isFinal: boolean;
  align: 'left' | 'right';
}) {
  const color = hex(team.color, '#4f46e5');
  return (
    <div
      className={`relative flex flex-1 items-center gap-3 rounded-xl border px-3 py-2.5 transition-all ${
        isPossession ? 'border-brand-accent/70 bg-brand-accent/5' : 'border-brand-border bg-brand-surface'
      } ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}
    >
      {isPossession && (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-brand-accent px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-black">
          Ball
        </span>
      )}
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        style={{ background: `${color}22`, border: `1.5px solid ${color}` }}
      >
        {team.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={team.logo} alt={team.name} className="h-8 w-8 object-contain" />
        ) : (
          <span className="text-xs font-bold">{team.abbrev}</span>
        )}
      </div>
      <div className={`min-w-0 flex-1 ${align === 'right' ? 'text-right' : ''}`}>
        <div className="flex items-center gap-1.5" style={{ justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
          <span className="truncate text-sm font-bold">{team.shortName}</span>
          {isWinner && isFinal && <Trophy className="h-3.5 w-3.5 text-brand-accent" />}
        </div>
        <div className="text-[11px] text-brand-muted">{team.record ?? '—'}</div>
      </div>
      <div className={`shrink-0 text-3xl font-black tabular-nums ${isWinner && isFinal ? 'text-brand-accent' : ''}`}>
        {team.score}
      </div>
    </div>
  );
}

function Scoreboard({ data }: { data: LiveGameGraphicData }) {
  const { home, away, isFinal, possession, period, clock, statusDetail, broadcast, venue } = data;
  const homeWin = isFinal && home.score > away.score;
  const awayWin = isFinal && away.score > home.score;
  return (
    <div className="rounded-2xl border border-brand-border bg-gradient-to-b from-brand-surface to-brand-bg p-3">
      <div className="mb-2 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-2">
          {data.isLive ? (
            <span className="lg-live-pulse inline-flex items-center gap-1 rounded bg-brand-danger/20 px-2 py-0.5 font-bold text-red-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
              LIVE
            </span>
          ) : isFinal ? (
            <span className="rounded bg-brand-elevated px-2 py-0.5 font-bold text-brand-muted">FINAL</span>
          ) : (
            <span className="rounded bg-brand-elevated px-2 py-0.5 font-bold text-brand-muted">SCHEDULED</span>
          )}
          {broadcast && (
            <span className="inline-flex items-center gap-1 text-brand-muted">
              <Tv className="h-3 w-3" /> {broadcast}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-brand-muted">
          {venue && (
            <span className="hidden items-center gap-1 sm:inline-flex">
              <MapPin className="h-3 w-3" /> {venue}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-stretch gap-2">
        <TeamScoreCard team={away} isPossession={possession === 'away'} isWinner={awayWin} isFinal={isFinal} align="left" />
        <div className="flex flex-col items-center justify-center px-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-brand-muted">
            {periodLabel(period) || '—'}
          </div>
          <div className="text-sm font-bold tabular-nums text-brand-text">{clock ?? '—'}</div>
          <div className="mt-0.5 text-[9px] uppercase tracking-wider text-brand-muted">@</div>
        </div>
        <TeamScoreCard team={home} isPossession={possession === 'home'} isWinner={homeWin} isFinal={isFinal} align="right" />
      </div>

      {statusDetail && (
        <div className="mt-2 text-center text-[11px] font-medium text-brand-muted">{statusDetail}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Field diagram
// ─────────────────────────────────────────────────────────────────────────────

const FIELD_W = 120; // 10-yard endzones + 100-yard field
const FIELD_H = 46;

function FieldDiagram({ data }: { data: LiveGameGraphicData }) {
  const { home, away, situation, currentDrive, possession } = data;
  const [showDrive, setShowDrive] = useState(true);

  const offTeam = possession === 'home' ? home : possession === 'away' ? away : null;
  const defTeam = possession === 'home' ? away : possession === 'away' ? home : null;

  // Ball spot: yardLine is 0–100 from the offense's own goal line.
  const ballYard = situation?.yardLine ?? currentDrive?.endYardLine ?? 50;
  const ballX = 10 + Math.max(0, Math.min(100, ballYard));

  // Line to gain (first-down marker).
  const lineToGain =
    situation?.down != null && situation?.distance != null
      ? Math.min(100, ballYard + situation.distance)
      : null;
  const ltgX = lineToGain != null ? 10 + lineToGain : null;

  // Drive trajectory: from the drive start to the current spot.
  const driveStart = currentDrive?.startYardLine ?? null;
  const driveStartX = driveStart != null ? 10 + Math.max(0, Math.min(100, driveStart)) : null;

  const offColor = hex(offTeam?.color ?? null, '#4f46e5');
  const defColor = hex(defTeam?.color ?? null, '#ef4444');

  // Yard numbers: 10..50..10 mirrored.
  const numbers = [10, 20, 30, 40, 50, 40, 30, 20, 10];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-brand-border bg-[#0b1220] p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-brand-muted">
          <Target className="h-3.5 w-3.5 text-brand-accent" />
          {situation?.downDistanceText ?? currentDrive?.description ?? 'Field Position'}
          {situation?.isRedZone && (
            <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold text-red-400">RZ</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowDrive((v) => !v)}
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
            showDrive
              ? 'border-brand-accent/60 bg-brand-accent/10 text-brand-accent'
              : 'border-brand-border text-brand-muted hover:text-brand-text'
          }`}
        >
          <Activity className="h-3 w-3" /> Drive
        </button>
      </div>

      <svg viewBox={`0 0 ${FIELD_W} ${FIELD_H}`} className="w-full" style={{ aspectRatio: `${FIELD_W} / ${FIELD_H}` }}>
        <defs>
          <linearGradient id="lgField" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0f2a1a" />
            <stop offset="50%" stopColor="#123a22" />
            <stop offset="100%" stopColor="#0f2a1a" />
          </linearGradient>
          <linearGradient id="lgOff" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={offColor} stopOpacity="0.15" />
            <stop offset="100%" stopColor={offColor} stopOpacity="0.5" />
          </linearGradient>
          <radialGradient id="lgBall">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#b45309" />
          </radialGradient>
          <filter id="fGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Endzones */}
        <rect x="0" y="0" width="10" height={FIELD_H} fill={offColor} opacity="0.35" />
        <rect x="110" y="0" width="10" height={FIELD_H} fill={defColor} opacity="0.35" />
        {/* Playing field */}
        <rect x="10" y="0" width="100" height={FIELD_H} fill="url(#lgField)" />

        {/* Yard lines every 5 yards */}
        {Array.from({ length: 21 }, (_, i) => i * 5).map((yd) => {
          const x = 10 + yd;
          const major = yd % 10 === 0;
          return (
            <line
              key={yd}
              x1={x}
              y1="0"
              x2={x}
              y2={FIELD_H}
              stroke={major ? '#e5e7eb' : '#94a3b8'}
              strokeWidth={major ? 0.35 : 0.18}
              opacity={major ? 0.55 : 0.3}
            />
          );
        })}

        {/* Yard numbers */}
        {numbers.map((n, i) => {
          const x = 10 + (i + 1) * 10;
          return (
            <text
              key={`${n}-${i}`}
              x={x}
              y={FIELD_H / 2 + 2.2}
              textAnchor="middle"
              fontSize="4.4"
              fontWeight="800"
              fill="#e5e7eb"
              opacity="0.5"
            >
              {n}
            </text>
          );
        })}

        {/* Hash marks */}
        {Array.from({ length: 40 }, (_, i) => i).map((i) => {
          const x = 10 + i * 2.5;
          return (
            <g key={`h${i}`}>
              <line x1={x} y1={FIELD_H * 0.36} x2={x} y2={FIELD_H * 0.42} stroke="#e5e7eb" strokeWidth="0.15" opacity="0.35" />
              <line x1={x} y1={FIELD_H * 0.58} x2={x} y2={FIELD_H * 0.64} stroke="#e5e7eb" strokeWidth="0.15" opacity="0.35" />
            </g>
          );
        })}

        {/* Goal posts */}
        {[10, 110].map((gx) => (
          <g key={`gp${gx}`} stroke="#fbbf24" strokeWidth="0.5" fill="none" opacity="0.9">
            <line x1={gx} y1={FIELD_H / 2 - 6} x2={gx} y2={FIELD_H / 2 + 6} />
            <line x1={gx} y1={FIELD_H / 2 - 6} x2={gx + (gx === 10 ? -3 : 3)} y2={FIELD_H / 2 - 6} />
            <line x1={gx} y1={FIELD_H / 2 + 6} x2={gx + (gx === 10 ? -3 : 3)} y2={FIELD_H / 2 + 6} />
          </g>
        ))}

        {/* Red-zone wash — the attacking 20. The offense always drives toward
            increasing x in this projection, so the target RZ is x 90 → 110. */}
        {situation?.isRedZone && (
          <rect className="lg-rz-wash" x={90} y={0} width={20} height={FIELD_H} fill="#ef4444" />
        )}

        {/* Drive trajectory arc */}
        {showDrive && driveStartX != null && (
          <path
            key={`arc-${driveStartX}-${ballX}`}
            className="lg-arc-draw"
            d={`M ${driveStartX} ${FIELD_H - 6} Q ${(driveStartX + ballX) / 2} ${FIELD_H * 0.18} ${ballX} ${FIELD_H / 2}`}
            fill="none"
            stroke="#a855f7"
            strokeWidth="0.7"
            opacity="0.9"
            filter="url(#fGlow)"
          />
        )}

        {/* Line to gain — a flowing chain so the first-down marker reads
            instantly, sliding rather than jumping between snaps. */}
        {ltgX != null && (
          <g className="lg-marker-slide" style={{ transform: `translateX(${ltgX}px)` }}>
            <line
              className="lg-chain-flow"
              x1={0}
              y1="0"
              x2={0}
              y2={FIELD_H}
              stroke="#22d3ee"
              strokeWidth="0.5"
              opacity="0.95"
            />
            <polygon points={`0,0.6 -1.3,-0.4 1.3,-0.4`} fill="#22d3ee" opacity="0.95" />
          </g>
        )}

        {/* Scrimmage line — slides to the new spot with the ball. */}
        <g className="lg-marker-slide" style={{ transform: `translateX(${ballX}px)` }}>
          <line x1={0} y1="0" x2={0} y2={FIELD_H} stroke="#facc15" strokeWidth="0.4" opacity="0.85" />
        </g>

        {/* Ball marker + possession logo + direction arrow all travel together
            so the whole cluster glides between plays instead of teleporting. */}
        <g className="lg-ball-travel" style={{ transform: `translateX(${ballX}px)` }}>
          <g filter="url(#fGlow)">
            {/* Expanding halo trailing the live ball. */}
            <circle className="lg-ball-halo" cx={0} cy={FIELD_H / 2} r="1.1" fill="#f59e0b" opacity="0.5" />
            <circle className="lg-ball-pulse" cx={0} cy={FIELD_H / 2} r="2.6" fill="url(#lgBall)" />
            <circle cx={0} cy={FIELD_H / 2} r="3.6" fill="none" stroke="#f59e0b" strokeWidth="0.3" opacity="0.7" />
          </g>

          {/* Possessing team logo at the ball */}
          {offTeam?.logo && (
            <image href={offTeam.logo} x={-3} y={FIELD_H / 2 - 9} width="6" height="6" opacity="0.95" />
          )}

          {/* Direction arrow, nudging toward the attacking end zone */}
          <g className="lg-drive-nudge" opacity="0.75">
            <line x1={6} y1={FIELD_H / 2} x2={14} y2={FIELD_H / 2} stroke="#22d3ee" strokeWidth="0.4" />
            <polygon
              points={`14,${FIELD_H / 2} 12,${FIELD_H / 2 - 1.2} 12,${FIELD_H / 2 + 1.2}`}
              fill="#22d3ee"
            />
          </g>
        </g>
      </svg>

      {/* Field-position bar — a compact, always-readable read of the drive that
          animates smoothly even when the SVG is scaled down on mobile. */}
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-brand-elevated">
        <div
          className="lg-progress-fill h-full rounded-full"
          style={{
            width: `${Math.max(0, Math.min(100, ballYard))}%`,
            background: `linear-gradient(90deg, ${offColor}, ${situation?.isRedZone ? '#ef4444' : '#22d3ee'})`,
          }}
        />
      </div>

      {/* Field footer: possession + drive summary */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-2">
          {offTeam && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-elevated px-2 py-1 font-semibold">
              {offTeam.logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={offTeam.logo} alt="" className="h-3.5 w-3.5 object-contain" />
              )}
              {offTeam.abbrev} ball
            </span>
          )}
          {situation?.possessionText && (
            <span className="text-brand-muted">at {situation.possessionText}</span>
          )}
        </div>
        {currentDrive && (
          <div className="flex items-center gap-2 text-brand-muted">
            <span className="inline-flex items-center gap-1">
              <Repeat className="h-3 w-3" /> {currentDrive.offensivePlays ?? 0} plays
            </span>
            <span className="inline-flex items-center gap-1">
              <ArrowRight className="h-3 w-3" /> {currentDrive.yards ?? 0} yds
            </span>
            {currentDrive.timeElapsed && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {currentDrive.timeElapsed}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Win probability chart
// ─────────────────────────────────────────────────────────────────────────────

function WinProbChart({ data }: { data: LiveGameGraphicData }) {
  const { winProbability, winProbabilitySeries, home, away } = data;
  const W = 300;
  const H = 70;

  const path = useMemo(() => {
    const series = winProbabilitySeries;
    if (series.length < 2) return null;
    const step = W / (series.length - 1);
    const pts = series.map((p, i) => [i * step, H - p.home * H] as const);
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) d += ` L ${pts[i][0]} ${pts[i][1]}`;
    return { d, last: pts[pts.length - 1] };
  }, [winProbabilitySeries]);

  if (!winProbability) return null;

  const homePct = Math.round(winProbability.home * 100);
  const awayPct = Math.round(winProbability.away * 100);
  const homeColor = hex(home.color, '#4f46e5');
  const awayColor = hex(away.color, '#ef4444');

  return (
    <div className="rounded-2xl border border-brand-border bg-brand-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-muted">
          <TrendingUp className="h-3.5 w-3.5 text-brand-accent" /> Win Probability
        </div>
        <div className="flex items-center gap-3 text-[11px] font-bold">
          <span style={{ color: awayColor }}>{away.abbrev} {awayPct}%</span>
          <span style={{ color: homeColor }}>{home.abbrev} {homePct}%</span>
        </div>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ aspectRatio: `${W} / ${H}` }}>
          <defs>
            <linearGradient id="lgWp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={homeColor} stopOpacity="0.35" />
              <stop offset="100%" stopColor={homeColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* grid */}
          {[0.25, 0.5, 0.75].map((g) => (
            <line key={g} x1="0" y1={H * g} x2={W} y2={H * g} stroke="#374151" strokeWidth="0.4" strokeDasharray="2 3" />
          ))}
          <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="#6b7280" strokeWidth="0.5" strokeDasharray="3 3" />
          {path && (
            <>
              <path d={`${path.d} L ${W} ${H} L 0 ${H} Z`} fill="url(#lgWp)" />
              <path d={path.d} fill="none" stroke={homeColor} strokeWidth="1.4" strokeLinejoin="round" />
              <circle cx={path.last[0]} cy={path.last[1]} r="2.4" fill="#fff" stroke={homeColor} strokeWidth="1" />
            </>
          )}
        </svg>
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-brand-muted">
        <span>Kickoff</span>
        <span>Now</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Play log
// ─────────────────────────────────────────────────────────────────────────────

function PlayCard({ play, data }: { play: Play; data: LiveGameGraphicData }) {
  const [reactions, setReactions] = useState<Record<string, number>>(() => {
    // Deterministic pseudo-counts so the UI feels alive without a backend.
    const seed = play.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const out: Record<string, number> = {};
    REACTION_EMOJIS.forEach((e, i) => {
      out[e] = (seed * (i + 3)) % 17;
    });
    return out;
  });
  const [mine, setMine] = useState<string[]>([]);
  const [shared, setShared] = useState(false);

  const kind = playKind(play);
  const teamAbbrev = play.abbrev ?? play.possessionAbbrev;
  const team = teamAbbrev === data.home.abbrev ? data.home : teamAbbrev === data.away.abbrev ? data.away : null;
  const player = playerFromText(play.text);

  const tone =
    kind.tone === 'score'
      ? 'border-brand-accent/60 bg-brand-accent/5'
      : kind.tone === 'turnover'
        ? 'border-red-500/50 bg-red-500/5'
        : 'border-brand-border bg-brand-surface';

  const toggle = (emoji: string) => {
    const has = mine.includes(emoji);
    setMine((prev) => (has ? prev.filter((e) => e !== emoji) : [...prev, emoji]));
    setReactions((prev) => ({ ...prev, [emoji]: Math.max(0, (prev[emoji] || 0) + (has ? -1 : 1)) }));
  };

  return (
    <div
      className={`lg-play-enter relative overflow-hidden rounded-xl border p-3 ${tone}`}
    >
      {/* Scoring plays get a slow gold sweep instead of a hard flash. */}
      {kind.tone === 'score' && (
        <span className="lg-score-sweep pointer-events-none absolute inset-0 rounded-xl" />
      )}
      <div className="relative flex items-start gap-3">
        {/* Avatar */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-elevated">
          {team?.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={team.logo} alt="" className="h-6 w-6 object-contain" />
          ) : (
            <Shield className="h-4 w-4 text-brand-muted" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                kind.tone === 'score'
                  ? 'bg-brand-accent/20 text-brand-accent'
                  : kind.tone === 'turnover'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-brand-elevated text-brand-muted'
              }`}
            >
              {kind.label}
            </span>
            {play.isRedZone && (
              <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold text-red-400">RZ</span>
            )}
            {play.downDistanceText && (
              <span className="text-[10px] font-medium text-brand-muted">{play.downDistanceText}</span>
            )}
          </div>

          <p className="mt-1 text-[13px] leading-snug text-brand-text">{play.text}</p>

          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-brand-muted">
            {player && <span className="font-semibold text-brand-primaryText">{player}</span>}
            {play.period != null && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {periodLabel(play.period)} {play.clock ?? ''}
              </span>
            )}
            {play.homeScore != null && play.awayScore != null && (
              <span className="font-bold tabular-nums text-brand-text">
                {data.away.abbrev} {play.awayScore}–{play.homeScore} {data.home.abbrev}
              </span>
            )}
            {play.statYardage != null && play.statYardage !== 0 && (
              <span className={play.statYardage > 0 ? 'text-emerald-400' : 'text-red-400'}>
                {play.statYardage > 0 ? '+' : ''}
                {play.statYardage} yds
              </span>
            )}
          </div>

          {/* Reactions + actions */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {REACTION_EMOJIS.map((emoji) => {
              const active = mine.includes(emoji);
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => toggle(emoji)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-all ${
                    active
                      ? 'border-brand-accent/70 bg-brand-accent/15 scale-105'
                      : 'border-brand-border bg-brand-elevated hover:border-brand-primary/60'
                  }`}
                >
                  <span>{emoji}</span>
                  <span className="tabular-nums text-brand-muted">{reactions[emoji] ?? 0}</span>
                </button>
              );
            })}
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShared(true)}
                className="inline-flex items-center gap-1 rounded-full border border-brand-border bg-brand-elevated px-2 py-0.5 text-[11px] text-brand-muted hover:text-brand-text"
              >
                <Share2 className="h-3 w-3" /> {shared ? 'Shared' : 'Share'}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-brand-border bg-brand-elevated px-2 py-0.5 text-[11px] text-brand-muted hover:text-brand-text"
              >
                <MessageCircle className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayLog({ data }: { data: LiveGameGraphicData }) {
  const [expanded, setExpanded] = useState(false);
  const plays = data.plays.filter((p) => p.text && p.text.trim().length > 0);
  const shown = expanded ? plays : plays.slice(0, 6);

  if (plays.length === 0) {
    return (
      <div className="rounded-2xl border border-brand-border bg-brand-surface p-6 text-center text-sm text-brand-muted">
        No plays yet — the feed will populate once the game kicks off.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-muted">
          <Radio className={`h-3.5 w-3.5 ${data.isLive ? 'animate-pulse text-brand-accent' : ''}`} />
          Play-by-Play
        </div>
        <span className="text-[10px] text-brand-muted">{plays.length} plays</span>
      </div>
      {shown.map((p) => (
        <PlayCard key={p.id} play={p} data={data} />
      ))}
      {plays.length > 6 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-1 rounded-lg border border-brand-border bg-brand-surface py-2 text-xs font-semibold text-brand-muted hover:text-brand-text"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" /> Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" /> Show all {plays.length} plays
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Odds cards
// ─────────────────────────────────────────────────────────────────────────────

function OddsCards({ data }: { data: LiveGameGraphicData }) {
  const { odds, home, away, winProbability } = data;
  if (!odds && !winProbability) return null;

  const homePct = winProbability ? Math.round(winProbability.home * 100) : null;
  const awayPct = winProbability ? Math.round(winProbability.away * 100) : null;

  const mlToDecimal = (ml: number | null): string => {
    if (ml == null) return '—';
    const dec = ml > 0 ? ml / 100 + 1 : 100 / Math.abs(ml) + 1;
    return `${dec.toFixed(2)}x`;
  };

  const Card = ({ team, pct, ml }: { team: Team; pct: number | null; ml: number | null }) => {
    const color = hex(team.color, '#4f46e5');
    return (
      <div className="flex flex-1 items-center gap-3 rounded-xl border border-brand-border bg-brand-surface p-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: `${color}22`, border: `1.5px solid ${color}` }}
        >
          {team.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={team.logo} alt="" className="h-7 w-7 object-contain" />
          ) : (
            <span className="text-[10px] font-bold">{team.abbrev}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-bold">{team.abbrev}</div>
          <div className="text-[10px] text-brand-muted">
            {pct != null ? `${pct}% win` : '—'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-black tabular-nums text-brand-accent">{mlToDecimal(ml)}</div>
          <div className="text-[9px] uppercase tracking-wider text-brand-muted">ML</div>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-brand-border bg-brand-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-muted">
          <Zap className="h-3.5 w-3.5 text-brand-accent" /> Live Odds
        </div>
        {odds?.provider && (
          <span className="flex items-center gap-1.5 text-[10px] text-brand-muted">
            {odds.providerLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={odds.providerLogo} alt="" className="h-3.5 object-contain" />
            )}
            {odds.provider}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <Card team={away} pct={awayPct} ml={odds?.awayMoneyLine ?? null} />
        <Card team={home} pct={homePct} ml={odds?.homeMoneyLine ?? null} />
      </div>
      {odds && (odds.spread != null || odds.overUnder != null) && (
        <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-brand-muted">
          {odds.details && <span className="font-semibold text-brand-text">{odds.details}</span>}
          {odds.overUnder != null && <span>O/U {odds.overUnder}</span>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function LiveGameGraphic({
  sport,
  homeTeam,
  awayTeam,
  espnEventId,
  initialData,
}: {
  sport: string;
  homeTeam: string;
  awayTeam: string;
  espnEventId?: string | null;
  initialData?: LiveGameGraphicData | null;
}) {
  const [data, setData] = useState<LiveGameGraphicData | null>(initialData ?? null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(!initialData);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const params = new URLSearchParams({ sport, home: homeTeam, away: awayTeam });
        if (espnEventId) params.set('event', espnEventId);
        const res = await fetch(`/api/public/live-game?${params.toString()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        setData(json.data ?? null);
        setError(false);
        setLoading(false);
        // Keep polling while the game is live.
        if (json.data?.isLive) {
          timerRef.current = setTimeout(load, 12000);
        }
      } catch {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [sport, homeTeam, awayTeam, espnEventId]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-brand-muted">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading live game…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card p-6 text-center text-sm text-brand-muted">
        {error ? "Couldn't load the live game graphic right now." : 'Live game data unavailable.'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Scoreboard data={data} />
      <FieldDiagram data={data} />
      <WinProbChart data={data} />
      <OddsCards data={data} />
      <PlayLog data={data} />
    </div>
  );
}
