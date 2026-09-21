'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Trophy, Crown, Loader2, ArrowLeft, TrendingUp, TrendingDown,
  Sparkles, BarChart3, ChevronDown, ChevronUp, Medal, AlertCircle,
} from 'lucide-react';
import { getPositionColor } from '@/lib/dd/position-colors';

// ────────────────────────────────────────────────────────────────────────────
// Types (mirror lib/dd/team-grades.ts)
// ────────────────────────────────────────────────────────────────────────────

interface GradePlayer {
  key: string; name: string; position: string; eligible: string[];
  team: string | null; projectedPoints: number; rank: number | null;
  adp: number | null; headshot: string | null;
}
interface LineupSlot { slot: string; label: string; player: GradePlayer | null }
interface GroupBreakdown {
  group: string; label: string; points: number; leagueAvg: number;
  delta: number; score: number;
}
interface TeamGrade {
  memberId: string; teamName: string; displayName: string; isBot: boolean;
  rank: number; projectedPoints: number; benchPoints: number;
  grade: string; score: number; zScore: number;
  lineup: LineupSlot[]; bench: GradePlayer[];
  strengths: GroupBreakdown[]; weaknesses: GroupBreakdown[];
  groups: GroupBreakdown[]; playerCount: number;
}
interface LeagueGrades {
  sport: string; teams: TeamGrade[]; bestTeamId: string | null;
  leagueAvg: number; leagueStdDev: number; summary: string;
  groupAverages: Record<string, number>;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Grade → color classes. */
function gradeStyle(grade: string): { text: string; bg: string; border: string } {
  if (grade.startsWith('A')) return { text: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40' };
  if (grade.startsWith('B')) return { text: 'text-sky-300', bg: 'bg-sky-500/15', border: 'border-sky-500/40' };
  if (grade.startsWith('C')) return { text: 'text-amber-300', bg: 'bg-amber-500/15', border: 'border-amber-500/40' };
  if (grade.startsWith('D')) return { text: 'text-orange-300', bg: 'bg-orange-500/15', border: 'border-orange-500/40' };
  return { text: 'text-red-300', bg: 'bg-red-500/15', border: 'border-red-500/40' };
}

function medalFor(rank: number) {
  if (rank === 1) return <Medal className="w-4 h-4 text-yellow-400" />;
  if (rank === 2) return <Medal className="w-4 h-4 text-slate-300" />;
  if (rank === 3) return <Medal className="w-4 h-4 text-amber-600" />;
  return null;
}

function PosBadge({ sport, position }: { sport: string; position: string }) {
  const c = getPositionColor(sport, position);
  return (
    <span
      className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded"
      style={{ color: c.fg, background: c.bg, border: `1px solid ${c.border}` }}
    >
      {position}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Team card
// ────────────────────────────────────────────────────────────────────────────

function TeamCard({
  team, sport, isBest, isMe, defaultOpen,
}: {
  team: TeamGrade; sport: string; isBest: boolean; isMe: boolean; defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const gs = gradeStyle(team.grade);

  return (
    <div
      className={`rounded-xl border bg-brand-surface overflow-hidden ${
        isBest ? 'border-brand-accent shadow-lg shadow-brand-accent/10' : 'border-brand-border'
      }`}
    >
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left p-4 flex items-center gap-3 hover:bg-brand-elevated/40 transition-colors"
      >
        <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg border ${gs.bg} ${gs.border} ${gs.text}`}>
          {team.grade}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-brand-text truncate">{team.teamName}</span>
            {isBest && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-brand-accent bg-brand-accent/15 border border-brand-accent/40 px-1.5 py-0.5 rounded">
                <Crown className="w-3 h-3" /> AI Best
              </span>
            )}
            {isMe && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-brand-primaryText bg-brand-primary/15 border border-brand-primary/40 px-1.5 py-0.5 rounded">
                You
              </span>
            )}
            {team.isBot && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-muted bg-brand-elevated border border-brand-border px-1.5 py-0.5 rounded">
                AI
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-brand-muted">
            <span className="inline-flex items-center gap-1">
              {medalFor(team.rank)} Rank #{team.rank}
            </span>
            <span>{team.projectedPoints} proj pts</span>
            <span className="hidden sm:inline">{team.playerCount} players</span>
          </div>
        </div>

        <div className="flex-shrink-0 text-right">
          <div className="text-xs text-brand-muted">Score</div>
          <div className={`text-lg font-bold ${gs.text}`}>{team.score}</div>
        </div>

        {open ? <ChevronUp className="w-4 h-4 text-brand-muted flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-brand-muted flex-shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-brand-border p-4 space-y-4">
          {/* Strengths / weaknesses */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300 mb-2">
                <TrendingUp className="w-3.5 h-3.5" /> Strengths
              </div>
              {team.strengths.length ? (
                <ul className="space-y-1">
                  {team.strengths.slice(0, 3).map((s) => (
                    <li key={s.group} className="flex items-center justify-between text-xs">
                      <span className="text-brand-text">{s.label}</span>
                      <span className="text-emerald-300 font-semibold">+{s.delta}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-brand-muted">No position group above league average.</p>
              )}
            </div>

            <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-red-300 mb-2">
                <TrendingDown className="w-3.5 h-3.5" /> Weaknesses
              </div>
              {team.weaknesses.length ? (
                <ul className="space-y-1">
                  {team.weaknesses.slice(0, 3).map((s) => (
                    <li key={s.group} className="flex items-center justify-between text-xs">
                      <span className="text-brand-text">{s.label}</span>
                      <span className="text-red-300 font-semibold">{s.delta}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-brand-muted">No position group below league average.</p>
              )}
            </div>
          </div>

          {/* Group bars */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-muted mb-2">
              <BarChart3 className="w-3.5 h-3.5" /> Position Group Grades
            </div>
            <div className="space-y-2">
              {team.groups.map((g) => (
                <div key={g.group} className="flex items-center gap-2">
                  <span className="w-24 text-xs text-brand-muted truncate">{g.label}</span>
                  <div className="flex-1 h-2 rounded-full bg-brand-elevated overflow-hidden">
                    <div
                      className={`h-full rounded-full ${g.delta >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.max(4, Math.min(100, g.score))}%` }}
                    />
                  </div>
                  <span className={`w-12 text-right text-xs font-semibold ${g.delta >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                    {g.delta >= 0 ? '+' : ''}{g.delta}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Optimal lineup */}
          <div>
            <div className="text-xs font-semibold text-brand-muted mb-2">
              Optimal Starting Lineup ({team.projectedPoints} proj pts)
            </div>
            <div className="grid sm:grid-cols-2 gap-1.5">
              {team.lineup.map((s, i) => (
                <div
                  key={`${s.slot}-${i}`}
                  className="flex items-center gap-2 rounded-lg bg-brand-elevated/50 border border-brand-border px-2.5 py-1.5"
                >
                  <span className="w-12 text-[10px] font-bold uppercase tracking-wide text-brand-muted flex-shrink-0">
                    {s.slot}
                  </span>
                  {s.player ? (
                    <>
                      <PosBadge sport={sport} position={s.player.position} />
                      <span className="flex-1 text-xs text-brand-text truncate">{s.player.name}</span>
                      <span className="text-xs font-semibold text-brand-primaryText flex-shrink-0">
                        {s.player.projectedPoints}
                      </span>
                    </>
                  ) : (
                    <span className="flex-1 text-xs text-brand-muted italic">Empty</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Bench */}
          {team.bench.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-brand-muted mb-2">
                Bench ({team.benchPoints} proj pts)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {team.bench.map((p) => (
                  <span
                    key={p.key}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-elevated/50 border border-brand-border px-2 py-1 text-xs text-brand-muted"
                  >
                    <PosBadge sport={sport} position={p.position} />
                    {p.name}
                    <span className="text-brand-primaryText font-semibold">{p.projectedPoints}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

export default function GradesClient({
  leagueId, leagueName, currentMemberId,
}: {
  leagueId: string; leagueName: string; currentMemberId: string | null;
}) {
  const [grades, setGrades] = useState<LeagueGrades | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/dd/leagues/${leagueId}/grades`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || 'Failed to load grades');
        setGrades(data.grades ?? null);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load grades');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [leagueId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-brand-muted">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Analyzing every roster…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-brand-danger/40 bg-brand-danger/10 p-6 text-center">
        <AlertCircle className="w-8 h-8 text-brand-danger mx-auto mb-2" />
        <p className="text-brand-text font-semibold">Could not load grades</p>
        <p className="text-brand-muted text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (!grades || !grades.teams.length) {
    return (
      <div className="rounded-xl border border-brand-border bg-brand-surface p-8 text-center">
        <Sparkles className="w-8 h-8 text-brand-muted mx-auto mb-2" />
        <p className="text-brand-text font-semibold">No grades yet</p>
        <p className="text-brand-muted text-sm mt-1">
          Once your league draft is complete, the AI will grade every roster here.
        </p>
        <Link href={`/dd/league/${leagueId}`} className="btn-secondary mt-4 inline-block">
          Back to League
        </Link>
      </div>
    );
  }

  const best = grades.teams.find((t) => t.memberId === grades.bestTeamId);

  return (
    <div className="space-y-5">
      {/* AI verdict banner */}
      <div className="rounded-xl border-2 border-brand-accent/50 bg-gradient-to-br from-brand-accent/10 to-transparent p-5">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-brand-accent/20 border border-brand-accent/40 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-brand-accent" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-brand-text flex items-center gap-2">
              AI Draft Grades
              {best && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-accent">
                  <Crown className="w-3.5 h-3.5" /> {best.teamName} rated best
                </span>
              )}
            </h2>
            <p className="text-sm text-brand-muted mt-2 leading-relaxed">{grades.summary}</p>
            <div className="flex flex-wrap gap-4 mt-3 text-xs text-brand-muted">
              <span>League avg: <strong className="text-brand-text">{grades.leagueAvg}</strong> proj pts</span>
              <span>Spread (σ): <strong className="text-brand-text">{grades.leagueStdDev}</strong></span>
              <span>Teams graded: <strong className="text-brand-text">{grades.teams.length}</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="space-y-3">
        {grades.teams.map((t) => (
          <TeamCard
            key={t.memberId}
            team={t}
            sport={grades.sport}
            isBest={t.memberId === grades.bestTeamId}
            isMe={t.memberId === currentMemberId}
            defaultOpen={t.memberId === grades.bestTeamId || t.memberId === currentMemberId}
          />
        ))}
      </div>

      <div className="text-center pt-2">
        <Link href={`/dd/league/${leagueId}`} className="btn-secondary inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to {leagueName}
        </Link>
      </div>
    </div>
  );
}
