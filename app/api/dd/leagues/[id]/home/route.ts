import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { getWeeklyStats } from '@/lib/dd/weekly-stats';
import { computeWinProbability } from '@/lib/dd/win-probability';
import { getGamificationProfile } from '@/lib/dd/gamification';
import { defaultSeasonWeeks } from '@/lib/dd/schedule';

// ────────────────────────────────────────────────────────────────────────────
// GET /api/dd/leagues/[id]/home?week=N
//
// The fantasy home payload. Combines:
//   • league + membership context
//   • every team's weekly stat lines (players, images, points)
//   • the caller's matchup with a live win-probability (odds meter)
//   • a deterministic AI analytics summary
//   • the caller's gamification profile (XP / level / badges)
// ────────────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const leagueId = BigInt(params.id);
  const { searchParams } = new URL(req.url);

  const league = await queryOne<{
    id: string;
    name: string;
    sport: string;
    status: string;
    is_public: boolean;
    season_year: number;
    settings: any;
  }>(
    `SELECT id::text, name, sport, status, is_public, season_year, settings
     FROM dd_leagues WHERE id = $1`,
    [leagueId]
  );
  if (!league) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 });
  }

  const membership = await queryOne<{ id: string; team_name: string; is_commissioner: boolean }>(
    `SELECT id::text, team_name, is_commissioner
     FROM dd_league_members WHERE league_id = $1 AND user_id = $2`,
    [leagueId, BigInt(session.user.id)]
  );
  if (!league.is_public && !membership) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 });
  }

  const settings =
    typeof league.settings === 'string' ? JSON.parse(league.settings) : (league.settings ?? {});
  const weeks = Number(settings?.seasonWeeks) || defaultSeasonWeeks(league.sport);

  // Matchups drive the current week + the caller's opponent.
  const matchupsRes = await query<{
    id: string;
    week_num: number;
    home_member_id: string;
    away_member_id: string;
    home_score: string | null;
    away_score: string | null;
    winner_member_id: string | null;
    is_tie: boolean;
    status: string;
  }>(
    `SELECT id::text, week_num, home_member_id::text, away_member_id::text,
            home_score, away_score, winner_member_id::text, is_tie, status
     FROM dd_matchups
     WHERE league_id = $1
     ORDER BY week_num, id`,
    [leagueId]
  );

  const currentWeek = matchupsRes.rows.length
    ? Math.min(
        weeks,
        Math.max(
          1,
          ...matchupsRes.rows.filter((m) => m.status === 'final').map((m) => m.week_num + 1)
        )
      )
    : 1;

  const requestedWeek = searchParams.get('week');
  const week = requestedWeek ? Math.max(1, Math.min(weeks, Number(requestedWeek))) : currentWeek;

  // Weekly stats for every team.
  const weekly = await getWeeklyStats(leagueId, week);
  const rosterById = new Map(weekly.rosters.map((r) => [r.memberId, r]));

  // The caller's matchup this week.
  const myMatchup = membership
    ? matchupsRes.rows.find(
        (m) =>
          m.week_num === week &&
          (m.home_member_id === membership.id || m.away_member_id === membership.id)
      )
    : undefined;

  let odds: ReturnType<typeof computeWinProbability> | null = null;
  let opponent: { memberId: string; teamName: string } | null = null;

  if (myMatchup && membership) {
    const isHome = myMatchup.home_member_id === membership.id;
    const oppId = isHome ? myMatchup.away_member_id : myMatchup.home_member_id;
    const homeRoster = rosterById.get(myMatchup.home_member_id);
    const awayRoster = rosterById.get(myMatchup.away_member_id);
    const oppRoster = rosterById.get(oppId);

    if (homeRoster && awayRoster) {
      const isFinal = myMatchup.status === 'final';
      // Week progress: prefer the real ESPN game-state signal (how much of the
      // slate has actually been played). Fall back to the league's scored weeks
      // vs. total weeks when we have no live data for the week.
      const scoredWeeks = new Set(
        matchupsRes.rows.filter((m) => m.status === 'final').map((m) => m.week_num)
      ).size;
      const weekProgress = isFinal
        ? 1
        : weekly.liveProgress != null
          ? clamp(weekly.liveProgress, 0, 0.99)
          : clamp(scoredWeeks / Math.max(1, weeks), 0, 0.95);

      odds = computeWinProbability({
        home: homeRoster,
        away: awayRoster,
        weekProgress,
        isFinal,
        finalHomeScore: myMatchup.home_score != null ? Number(myMatchup.home_score) : null,
        finalAwayScore: myMatchup.away_score != null ? Number(myMatchup.away_score) : null,
      });
      opponent = oppRoster ? { memberId: oppId, teamName: oppRoster.teamName } : null;
    }
  }

  // AI analytics summary — deterministic, derived from the weekly lines.
  // Once real games are being played we rank by actual points; before that we
  // rank by the AI projection.
  const analytics = buildAnalytics(
    weekly.rosters,
    membership?.id ?? null,
    week,
    weekly.hasLiveData
  );

  // Gamification profile.
  let gamification = null;
  try {
    gamification = await getGamificationProfile(session.user.id);
  } catch {
    gamification = null;
  }

  return NextResponse.json({
    league: {
      id: league.id,
      name: league.name,
      sport: league.sport,
      status: league.status,
      seasonYear: league.season_year,
    },
    week,
    weeks,
    currentWeek,
    currentMemberId: membership?.id ?? null,
    myTeamName: membership?.team_name ?? null,
    isCommissioner: membership?.is_commissioner ?? false,
    scoringName: weekly.scoringName,
    hasLiveData: weekly.hasLiveData,
    liveProgress: weekly.liveProgress,
    liveGames: weekly.liveGames,
    rosters: weekly.rosters,
    myRoster: membership ? rosterById.get(membership.id) ?? null : null,
    // Every matchup for the selected week — powers the full matchup board
    // (both teams' starters + benches with live per-player scores).
    matchups: matchupsRes.rows
      .filter((m) => m.week_num === week)
      .map((m) => ({
        id: m.id,
        week: m.week_num,
        homeMemberId: m.home_member_id,
        awayMemberId: m.away_member_id,
        homeScore: m.home_score != null ? Number(m.home_score) : null,
        awayScore: m.away_score != null ? Number(m.away_score) : null,
        winnerMemberId: m.winner_member_id,
        isTie: m.is_tie,
        status: m.status,
      })),
    matchup: myMatchup
      ? {
          id: myMatchup.id,
          week: myMatchup.week_num,
          homeMemberId: myMatchup.home_member_id,
          awayMemberId: myMatchup.away_member_id,
          homeScore: myMatchup.home_score != null ? Number(myMatchup.home_score) : null,
          awayScore: myMatchup.away_score != null ? Number(myMatchup.away_score) : null,
          winnerMemberId: myMatchup.winner_member_id,
          isTie: myMatchup.is_tie,
          status: myMatchup.status,
          isHome: membership ? myMatchup.home_member_id === membership.id : false,
        }
      : null,
    opponent,
    odds,
    analytics,
    gamification,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Analytics
// ────────────────────────────────────────────────────────────────────────────

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

function buildAnalytics(
  rosters: { memberId: string; teamName: string; starterPoints: number; projectedStarterPoints: number }[],
  myMemberId: string | null,
  week: number,
  hasLiveData: boolean
): Analytics {
  // Once real games are being played, rank by actual points scored this week.
  // Before that, rank by the AI projection.
  const valueOf = (r: { starterPoints: number; projectedStarterPoints: number }) =>
    hasLiveData ? r.starterPoints : r.projectedStarterPoints;

  const teams: AnalyticsTeam[] = rosters
    .map((r) => ({
      memberId: r.memberId,
      teamName: r.teamName,
      projected: round1(valueOf(r)),
      rank: 0,
    }))
    .sort((a, b) => b.projected - a.projected);

  teams.forEach((t, i) => (t.rank = i + 1));

  const leagueAvg = teams.length
    ? round1(teams.reduce((s, t) => s + t.projected, 0) / teams.length)
    : 0;

  const myRank = myMemberId ? teams.find((t) => t.memberId === myMemberId)?.rank ?? null : null;
  const myTeam = myMemberId ? teams.find((t) => t.memberId === myMemberId) : null;

  const topScorer = teams.length
    ? { teamName: teams[0].teamName, points: teams[0].projected }
    : null;

  const metric = hasLiveData ? 'scored' : 'projected';

  let summary: string;
  if (!myTeam) {
    summary = `Week ${week}: ${teams.length} teams are set. The AI has ${topScorer?.teamName ?? 'the field'} leading at ${topScorer?.points ?? 0} points ${metric}.`;
  } else if (myRank === 1) {
    summary = `The AI has you #1 in Week ${week} with ${myTeam.projected} points ${metric} — ${round1(myTeam.projected - leagueAvg)} above the league average.`;
  } else if (myRank != null && myRank <= Math.ceil(teams.length / 2)) {
    summary = `You're #${myRank} of ${teams.length} in Week ${week} at ${myTeam.projected} points ${metric}. ${topScorer?.teamName} leads at ${topScorer?.points}.`;
  } else {
    summary = `The AI has you #${myRank} of ${teams.length} in Week ${week} at ${myTeam.projected} points ${metric} — ${round1(leagueAvg - myTeam.projected)} below the league average. Look for upside on your bench.`;
  }

  return {
    teams,
    myRank,
    leagueAvg,
    summary,
    topScorer,
    closestGame: null,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
