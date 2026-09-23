'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Loader2, ArrowLeft, Trophy, Crown, Users, Calendar,
  AlertCircle, Sparkles, ChevronLeft, ChevronRight, Swords, Medal,
  UserPlus, Play, RotateCcw, Radio,
} from 'lucide-react';
import { ToastProvider, useToast } from '@/components/dd/ToastProvider';
import NotificationBell from '@/components/dd/NotificationBell';
import WaiversPanel from '@/components/dd/WaiversPanel';
import OddsMeter from '@/components/dd/OddsMeter';
import CelebrationOverlay from '@/components/dd/CelebrationOverlay';
import MatchupBoard, {
  type WeeklyRoster as BoardRoster,
  type BoardMatchup,
} from '@/components/dd/MatchupBoard';
import LineupEditor from '@/components/dd/LineupEditor';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface RosterPlayer {
  playerName: string; playerId: string | null; team: string | null;
  position: string | null; sport: string | null; slot: string;
  projectedPoints: number; headshot: string | null;
}
interface Member {
  id: string; teamName: string; displayName: string; draftPosition: number | null;
  isBot: boolean; isCommissioner: boolean;
  record: { wins: number; losses: number; ties: number; pointsFor: number };
}
interface Matchup {
  id: string; week: number; homeMemberId: string; awayMemberId: string;
  homeScore: number | null; awayScore: number | null;
  winnerMemberId: string | null; isTie: boolean; status: string;
}
interface RosterSlotDef { slot: string; label: string; count: number; eligible: string[]; isStarter: boolean }
interface SeasonData {
  league: {
    id: string; name: string; sport: string; status: string; seasonYear: number;
    lineupSetting: string; rosterConfig: { slots: RosterSlotDef[]; name?: string };
  };
  draft: { id: string; status: string } | null;
  members: Member[];
  rosters: Record<string, RosterPlayer[]>;
  matchups: Matchup[];
  weeks: number;
  currentWeek: number;
  currentMemberId: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

export default function SeasonClient({
  leagueId, leagueName,
}: {
  leagueId: string; leagueName: string;
}) {
  return (
    <ToastProvider>
      <SeasonInner leagueId={leagueId} leagueName={leagueName} />
    </ToastProvider>
  );
}

function SeasonInner({
  leagueId, leagueName,
}: {
  leagueId: string; leagueName: string;
}) {
  const { push } = useToast();
  const [data, setData] = useState<SeasonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'matchup' | 'lineup' | 'standings' | 'waivers'>('matchup');
  const [week, setWeek] = useState(1);
  const [scoring, setScoring] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [live, setLive] = useState<{ hasLiveData: boolean; liveGames: number } | null>(null);
  const [board, setBoard] = useState<{
    rosters: BoardRoster[];
    matchups: BoardMatchup[];
    liveGames: number;
    hasLiveData: boolean;
    calendarWeek: number | null;
    isFutureWeek: boolean;
    isProjectedWeek: boolean;
  } | null>(null);
  const [odds, setOdds] = useState<{
    homeWinPct: number; awayWinPct: number; tiePct: number;
    homeProjected: number; awayProjected: number; confidence: number;
    reason: string; favored: 'home' | 'away' | 'even';
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/dd/leagues/${leagueId}/season`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load season');
      setData(json);
      setWeek(json.currentWeek ?? 1);
    } catch (e: any) {
      setError(e.message || 'Failed to load season');
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  useEffect(() => { load(); }, [load]);

  // Fetch the live win-probability for the selected week (drives the odds meter)
  // plus the live-game signal. Polls every 30s while any game is in progress so
  // scores and the odds meter move as real games play out.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fetchOdds = async () => {
      try {
        const res = await fetch(`/api/dd/leagues/${leagueId}/home?week=${week}`);
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        setOdds(json.odds ?? null);
        setLive({
          hasLiveData: Boolean(json.hasLiveData),
          liveGames: Number(json.liveGames ?? 0),
        });
        setBoard({
          rosters: json.rosters ?? [],
          matchups: json.matchups ?? [],
          liveGames: Number(json.liveGames ?? 0),
          hasLiveData: Boolean(json.hasLiveData),
          calendarWeek: json.calendarWeek ?? null,
          isFutureWeek: Boolean(json.isFutureWeek),
          isProjectedWeek: Boolean(json.isProjectedWeek),
        });
        // Keep polling while games are live.
        if (Number(json.liveGames ?? 0) > 0) {
          timer = setTimeout(fetchOdds, 30000);
        }
      } catch {
        /* odds are a nice-to-have */
      }
    };

    fetchOdds();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [leagueId, week]);

  // Deep-link support: /season?tab=waivers
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'waivers' || t === 'lineup' || t === 'standings' || t === 'matchup') {
      setTab(t);
    }
  }, []);

  const scoreWeek = async () => {
    setScoring(true);
    try {
      const res = await fetch(`/api/dd/leagues/${leagueId}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to score week');
      const n = json.scored?.length ?? 0;
      push({
        kind: 'score',
        title: n ? `Week ${week} scored` : 'Nothing to score',
        body: n ? `${n} matchup${n === 1 ? '' : 's'} went final.` : 'This week is already final.',
      });
      await load();
    } catch (e: any) {
      push({ kind: 'league', title: 'Scoring failed', body: e.message });
    } finally {
      setScoring(false);
    }
  };

  // Commissioner-only: un-final a week (or the whole season) so it can be
  // re-scored from live game stats. Clears scores/winner, removes that week's
  // score notifications, and reverses the XP those results awarded.
  const resetWeeks = async (target: number | null) => {
    const label = target == null ? 'the entire season' : `Week ${target}`;
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        `Reset ${label}? This clears scores and winners, removes score notifications, and reverses the XP awarded for those results. This cannot be undone.`
      );
      if (!ok) return;
    }
    setResetting(true);
    try {
      const res = await fetch(`/api/dd/leagues/${leagueId}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(target == null ? {} : { week: target }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to reset');
      push({
        kind: 'league',
        title: `${label} reset`,
        body: `${json.matchupsReset ?? 0} matchup${json.matchupsReset === 1 ? '' : 's'} reopened${
          json.xpEventsRemoved ? `, ${json.xpEventsRemoved} XP event${json.xpEventsRemoved === 1 ? '' : 's'} reversed` : ''
        }.`,
      });
      await load();
    } catch (e: any) {
      push({ kind: 'league', title: 'Reset failed', body: e.message });
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-brand-muted">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading your season…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-brand-danger/40 bg-brand-danger/10 p-6 text-center">
        <AlertCircle className="w-8 h-8 text-brand-danger mx-auto mb-2" />
        <p className="text-brand-text font-semibold">Could not load season</p>
        <p className="text-brand-muted text-sm mt-1">{error}</p>
        <Link href={`/dd/league/${leagueId}`} className="btn-secondary mt-4 inline-block">Back to League</Link>
      </div>
    );
  }

  const memberById = new Map(data.members.map((m) => [m.id, m]));
  const isCommissioner =
    data.members.find((m) => m.id === data.currentMemberId)?.isCommissioner === true;
  const myRoster = data.currentMemberId ? (data.rosters[data.currentMemberId] ?? []) : [];
  const weekMatchups = data.matchups.filter((m) => m.week === week);
  const myMatchup = weekMatchups.find(
    (m) => m.homeMemberId === data.currentMemberId || m.awayMemberId === data.currentMemberId
  );

  // Standings sorted by wins then points.
  const standings = [...data.members].sort((a, b) => {
    if (b.record.wins !== a.record.wins) return b.record.wins - a.record.wins;
    if (b.record.ties !== a.record.ties) return b.record.ties - a.record.ties;
    return b.record.pointsFor - a.record.pointsFor;
  });

  const hasSeason = data.matchups.length > 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-primaryText">{leagueName}</p>
          <h1 className="text-2xl font-bold text-brand-text mt-1 flex items-center gap-2">
            <Swords className="w-6 h-6 text-brand-accent" /> Head-to-Head
          </h1>
          <p className="text-sm text-brand-muted mt-1">
            Week {week} of {data.weeks} · {data.league.lineupSetting === 'weekly' ? 'Weekly' : 'Daily'} lineups
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell leagueId={leagueId} />
          <Link href={`/dd/league/${leagueId}/home`} className="btn-primary inline-flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Fantasy Home
          </Link>
          <Link href={`/dd/league/${leagueId}/grades`} className="btn-secondary inline-flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> AI Grades
          </Link>
          <Link href={`/dd/league/${leagueId}`} className="btn-ghost inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> League
          </Link>
        </div>
      </div>

      {!hasSeason && (
        <div className="rounded-xl border border-brand-accent/40 bg-brand-accent/10 p-5 text-center">
          <Calendar className="w-8 h-8 text-brand-accent mx-auto mb-2" />
          <p className="text-brand-text font-semibold">Your season hasn&apos;t been scheduled yet</p>
          <p className="text-brand-muted text-sm mt-1">
            The head-to-head schedule is generated automatically once your league draft is complete.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-brand-border">
        {([
          ['matchup', 'Matchup', Swords],
          ['lineup', 'Set Lineup', Users],
          ['waivers', 'Waivers', UserPlus],
          ['standings', 'Standings', Trophy],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-brand-primary text-brand-text'
                : 'border-transparent text-brand-muted hover:text-brand-text'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* ── Matchup tab ── */}
      {tab === 'matchup' && (
        <div className="space-y-4">
          {/* Week nav */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setWeek((w) => Math.max(1, w - 1))}
              disabled={week <= 1}
              className="btn-ghost p-2 disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-brand-text">Week {week}</span>
            <button
              onClick={() => setWeek((w) => Math.min(data.weeks, w + 1))}
              disabled={week >= data.weeks}
              className="btn-ghost p-2 disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {hasSeason && (
              <button
                onClick={scoreWeek}
                disabled={scoring}
                className="btn-secondary inline-flex items-center gap-2 text-xs ml-2"
                title="Score this week's matchups"
              >
                {scoring ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                Score Week
              </button>
            )}
            {live?.liveGames ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-danger ml-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-danger opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-danger" />
                </span>
                <Radio className="w-3.5 h-3.5" />
                {live.liveGames} live
              </span>
            ) : null}
            {isCommissioner && hasSeason && (
              <>
                <button
                  onClick={() => resetWeeks(week)}
                  disabled={resetting}
                  className="btn-ghost inline-flex items-center gap-2 text-xs ml-2 text-brand-danger hover:bg-brand-danger/10"
                  title="Commissioner: reopen this week so it can be re-scored from live stats"
                >
                  {resetting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" />
                  )}
                  Reset Week
                </button>
                <button
                  onClick={() => resetWeeks(null)}
                  disabled={resetting}
                  className="btn-ghost inline-flex items-center gap-2 text-xs text-brand-danger hover:bg-brand-danger/10"
                  title="Commissioner: reopen every week in the season"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Season
                </button>
              </>
            )}
          </div>

          {/* Full matchup board — both teams' starters + benches, live scores,
              big-play animations, and interactables. */}
          {board && board.matchups.length > 0 && (
            <MatchupBoard
              leagueId={leagueId}
              sport={data.league.sport}
              seasonYear={data.league.seasonYear}
              week={week}
              rosters={board.rosters}
              matchups={board.matchups}
              members={data.members}
              currentMemberId={data.currentMemberId}
              liveGames={board.liveGames}
              hasLiveData={board.hasLiveData}
              calendarWeek={board.calendarWeek}
              isFutureWeek={board.isFutureWeek}
              isProjectedWeek={board.isProjectedWeek}
            />
          )}

          {/* My matchup (fallback when the board payload isn't loaded yet) */}
          {!board && myMatchup ? (
            <div className="rounded-xl border-2 border-brand-primary/40 bg-brand-primary/5 p-5">
              <div className="text-center text-xs font-semibold uppercase tracking-wide text-brand-primaryText mb-4">
                Your Matchup
              </div>
              <div className="grid grid-cols-3 items-center gap-3">
                {[myMatchup.homeMemberId, myMatchup.awayMemberId].map((mid, idx) => {
                  const m = memberById.get(mid);
                  const isMe = mid === data.currentMemberId;
                  const score = idx === 0 ? myMatchup.homeScore : myMatchup.awayScore;
                  const won = myMatchup.winnerMemberId === mid;
                  return (
                    <div key={mid} className={`text-center ${idx === 1 ? 'order-3' : ''}`}>
                      <div className={`text-sm font-semibold truncate ${isMe ? 'text-brand-accent' : 'text-brand-text'}`}>
                        {m?.teamName ?? 'Unknown'}
                        {isMe && <span className="ml-1 text-[10px] text-brand-accent">(You)</span>}
                      </div>
                      <div className="text-2xl font-bold text-brand-text mt-1">
                        {score != null ? score.toFixed(1) : '—'}
                      </div>
                      {won && <div className="text-[10px] font-bold text-brand-success mt-0.5">WIN</div>}
                    </div>
                  );
                }).reduce((acc, el, i) => {
                  if (i === 1) acc.push(<div key="vs" className="order-2 text-center text-xs font-bold text-brand-muted">VS</div>);
                  acc.push(el);
                  return acc;
                }, [] as any[])}
              </div>
              <div className="text-center text-xs text-brand-muted mt-3">
                {myMatchup.status === 'final' ? (
                  'Final'
                ) : myMatchup.status === 'in_progress' && (live?.liveGames ?? 0) > 0 ? (
                  <span className="inline-flex items-center gap-1.5 font-bold text-brand-danger">
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
          ) : hasSeason && (
            <div className="rounded-xl border border-brand-border bg-brand-surface p-5 text-center text-sm text-brand-muted">
              You have a bye this week.
            </div>
          )}

          {/* Odds meter — live win probability for my matchup */}
          {myMatchup && odds && (() => {
            const isHome = myMatchup.homeMemberId === data.currentMemberId;
            const myWin = isHome ? odds.homeWinPct : odds.awayWinPct;
            const oppWin = isHome ? odds.awayWinPct : odds.homeWinPct;
            const myProj = isHome ? odds.homeProjected : odds.awayProjected;
            const oppProj = isHome ? odds.awayProjected : odds.homeProjected;
            const oppId = isHome ? myMatchup.awayMemberId : myMatchup.homeMemberId;
            const favored: 'me' | 'opp' | 'even' =
              odds.favored === 'even' ? 'even' : (odds.favored === 'home') === isHome ? 'me' : 'opp';
            return (
              <OddsMeter
                myWinPct={myWin}
                oppWinPct={oppWin}
                tiePct={odds.tiePct}
                myProjected={myProj}
                oppProjected={oppProj}
                confidence={odds.confidence}
                reason={odds.reason}
                favored={favored}
                myTeamName={memberById.get(data.currentMemberId ?? '')?.teamName ?? 'You'}
                oppTeamName={memberById.get(oppId)?.teamName ?? 'Opponent'}
                isFinal={myMatchup.status === 'final'}
              />
            );
          })()}

          {/* All matchups this week */}
          {weekMatchups.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-brand-text mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-brand-primaryText" /> Week {week} Matchups
              </h3>
              <div className="space-y-2">
                {weekMatchups.map((g) => {
                  const h = memberById.get(g.homeMemberId);
                  const a = memberById.get(g.awayMemberId);
                  return (
                    <div key={g.id} className="flex items-center gap-2 text-sm rounded-lg bg-brand-elevated/40 px-3 py-2">
                      <span className={`flex-1 text-right truncate ${g.winnerMemberId === g.homeMemberId ? 'font-semibold text-brand-text' : 'text-brand-muted'}`}>
                        {h?.teamName ?? '?'}
                      </span>
                      <span className="text-xs font-bold text-brand-text px-2">
                        {g.homeScore != null ? g.homeScore.toFixed(1) : '—'} – {g.awayScore != null ? g.awayScore.toFixed(1) : '—'}
                      </span>
                      <span className={`flex-1 truncate ${g.winnerMemberId === g.awayMemberId ? 'font-semibold text-brand-text' : 'text-brand-muted'}`}>
                        {a?.teamName ?? '?'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Lineup tab ── */}
      {tab === 'lineup' && (
        <div className="card">
          <h3 className="font-semibold text-brand-text mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-brand-primaryText" /> Set Your Lineup
          </h3>
          {myRoster.length ? (
            <LineupEditor
              leagueId={leagueId}
              sport={data.league.sport}
              rosterConfig={data.league.rosterConfig}
              roster={myRoster}
              onSaved={load}
            />
          ) : (
            <p className="text-sm text-brand-muted">
              You don&apos;t have a roster yet. Complete your league draft first.
            </p>
          )}
        </div>
      )}

      {/* ── Waivers tab ── */}
      {tab === 'waivers' && (
        <div className="card">
          <h3 className="font-semibold text-brand-text mb-4 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-brand-success" /> Waiver Wire
          </h3>
          <WaiversPanel
            leagueId={leagueId}
            sport={data.league.sport}
            roster={myRoster}
            isCommissioner={
              data.members.find((m) => m.id === data.currentMemberId)?.isCommissioner === true
            }
            onChanged={load}
          />
        </div>
      )}

      {/* ── Standings tab ── */}
      {tab === 'standings' && (
        <div className="card">
          <h3 className="font-semibold text-brand-text mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-brand-accent" /> Standings
          </h3>
          <div className="space-y-1.5">
            {standings.map((m, i) => (
              <div
                key={m.id}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                  m.id === data.currentMemberId ? 'bg-brand-primary/10 border border-brand-primary/30' : 'bg-brand-elevated/40'
                }`}
              >
                <span className="w-6 text-center text-sm font-bold text-brand-muted">
                  {i === 0 ? <Medal className="w-4 h-4 text-yellow-400 inline" /> : i + 1}
                </span>
                <span className="flex-1 text-sm text-brand-text truncate">
                  {m.teamName}
                  {m.id === data.currentMemberId && <span className="ml-1 text-[10px] text-brand-accent">(You)</span>}
                  {m.isBot && <span className="ml-1 text-[10px] text-brand-muted">AI</span>}
                </span>
                <span className="text-sm font-semibold text-brand-text">
                  {m.record.wins}-{m.record.losses}{m.record.ties ? `-${m.record.ties}` : ''}
                </span>
                <span className="w-16 text-right text-xs text-brand-muted">
                  {m.record.pointsFor.toFixed(1)} PF
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Celebration on a final matchup ── */}
      {myMatchup && myMatchup.status === 'final' && (() => {
        const isHome = myMatchup.homeMemberId === data.currentMemberId;
        const myScore = (isHome ? myMatchup.homeScore : myMatchup.awayScore) ?? 0;
        const oppScore = (isHome ? myMatchup.awayScore : myMatchup.homeScore) ?? 0;
        const oppId = isHome ? myMatchup.awayMemberId : myMatchup.homeMemberId;
        const result: 'win' | 'loss' | 'tie' = myMatchup.isTie
          ? 'tie'
          : myMatchup.winnerMemberId === data.currentMemberId
          ? 'win'
          : 'loss';
        return (
          <CelebrationOverlay
            celebrationKey={`season-matchup-${myMatchup.id}-${myMatchup.week}`}
            result={result}
            myTeamName={memberById.get(data.currentMemberId ?? '')?.teamName ?? 'You'}
            oppTeamName={memberById.get(oppId)?.teamName ?? 'Opponent'}
            myScore={myScore}
            oppScore={oppScore}
            xpAwarded={result === 'win' ? 50 : result === 'tie' ? 15 : undefined}
          />
        );
      })()}
    </div>
  );
}
