/**
 * DiamondDraft — Weekly matchup scoring.
 *
 * Turns a week of head-to-head matchups into live and final results. Each
 * team's score is the sum of its *starting* lineup's fantasy points, computed
 * from **real game stats** (via the weekly-stats engine, which pulls live ESPN
 * box scores) with a projection fallback for players whose games haven't
 * started.
 *
 * A week is scored in two phases:
 *   * `in_progress` — some starters' games are still live or upcoming. We
 *     update the running scores so the odds meter and scoreboard move as
 *     points are earned, but we do NOT declare a winner or award XP.
 *   * `final` — every starter's game is over (or the sport has no live feed).
 *     We lock the scores, break ties by bench points, emit notifications, and
 *     award gamification XP.
 *
 * Scoring is idempotent: a matchup already `final` is skipped, and the
 * notifications it emits carry a dedupe key, so re-running a week is safe.
 */
import { query, queryOne, tx } from '@/lib/db';
import { scoreH2HMatchup } from './scoring';
import { emitNotification, emitLeagueNotification } from './notifications';
import { awardXp } from './gamification';
import { getWeeklyStats, type WeeklyRoster } from './weekly-stats';

export interface ScoredMatchup {
  matchupId: string;
  week: number;
  homeMemberId: string;
  awayMemberId: string;
  homeScore: number;
  awayScore: number;
  winnerMemberId: string | null;
  isTie: boolean;
  status: 'in_progress' | 'final';
}

export interface ScoreWeekResult {
  week: number;
  scored: ScoredMatchup[];
  skipped: number;
  /** True when every matchup in the week reached a final state. */
  complete: boolean;
}

/**
 * Score every not-yet-final matchup in a given week from live game stats.
 */
export async function scoreWeek(
  leagueId: bigint,
  week: number
): Promise<ScoreWeekResult> {
  const league = await queryOne<{ name: string; sport: string }>(
    `SELECT name, sport FROM dd_leagues WHERE id = $1`,
    [leagueId]
  );
  if (!league) throw new Error('League not found');

  const matchups = await query<{
    id: string;
    home_member_id: string;
    away_member_id: string;
    status: string;
  }>(
    `SELECT id::text, home_member_id::text, away_member_id::text, status
     FROM dd_matchups
     WHERE league_id = $1 AND week_num = $2
     ORDER BY id`,
    [leagueId, week]
  );

  const pending = matchups.rows.filter((m) => m.status !== 'final');
  const skipped = matchups.rows.length - pending.length;
  if (!pending.length) return { week, scored: [], skipped, complete: true };

  // Live weekly stats for every roster in the league.
  const weekly = await getWeeklyStats(leagueId, week);
  const rosterByMember = new Map<string, WeeklyRoster>();
  for (const r of weekly.rosters) rosterByMember.set(r.memberId, r);

  // A week is "complete" when no starter anywhere still has a game to play.
  // `liveProgress` is non-null only when ESPN returned a real schedule for the
  // week, so we can trust the per-player game states. If the sport has no live
  // feed (or ESPN is unreachable) we treat the week as complete so
  // projection-based leagues still finalize normally.
  const anyLive = weekly.liveProgress != null;
  const anyPending = weekly.rosters.some((r) =>
    r.starters.some((p) => p.week.gameState && p.week.gameState !== 'post')
  );
  // A week that hasn't happened yet is projection-only and must NEVER be
  // finalized — otherwise projected points would be locked in as real results
  // and a winner declared for games that were never played.
  const complete = weekly.isFutureWeek ? false : !anyLive || !anyPending;

  if (weekly.isFutureWeek) {
    // Nothing to record for a future week. Leave the matchups untouched so
    // they stay 'scheduled' rather than being written as in-progress scores.
    return { week, scored: [], skipped: matchups.rows.length, complete: false };
  }

  const scored: ScoredMatchup[] = [];

  await tx(async (client) => {
    for (const m of pending) {
      const home = rosterByMember.get(m.home_member_id);
      const away = rosterByMember.get(m.away_member_id);
      const homeScore = round1(home?.starterPoints ?? 0);
      const awayScore = round1(away?.starterPoints ?? 0);

      if (!complete) {
        // Live update only — no winner, no XP, no notifications.
        await client.query(
          `UPDATE dd_matchups
           SET home_score = $1, away_score = $2, status = 'in_progress'
           WHERE id = $3`,
          [homeScore, awayScore, BigInt(m.id)]
        );
        scored.push({
          matchupId: m.id,
          week,
          homeMemberId: m.home_member_id,
          awayMemberId: m.away_member_id,
          homeScore,
          awayScore,
          winnerMemberId: null,
          isTie: false,
          status: 'in_progress',
        });
        continue;
      }

      const outcome = scoreH2HMatchup(homeScore, awayScore, 'h2h_points');
      let winnerMemberId: string | null = null;
      let isTie = false;
      if (outcome.winner === 'home') winnerMemberId = m.home_member_id;
      else if (outcome.winner === 'away') winnerMemberId = m.away_member_id;
      else if ((home?.benchPoints ?? 0) !== (away?.benchPoints ?? 0)) {
        // Bench tiebreak (standard "total points" fallback).
        winnerMemberId =
          (home?.benchPoints ?? 0) > (away?.benchPoints ?? 0)
            ? m.home_member_id
            : m.away_member_id;
      } else {
        isTie = true;
      }

      await client.query(
        `UPDATE dd_matchups
         SET home_score = $1, away_score = $2, winner_member_id = $3,
             is_tie = $4, status = 'final'
         WHERE id = $5`,
        [
          homeScore,
          awayScore,
          winnerMemberId != null ? BigInt(winnerMemberId) : null,
          isTie,
          BigInt(m.id),
        ]
      );

      scored.push({
        matchupId: m.id,
        week,
        homeMemberId: m.home_member_id,
        awayMemberId: m.away_member_id,
        homeScore,
        awayScore,
        winnerMemberId,
        isTie,
        status: 'final',
      });
    }
  });

  // Only notify / award XP for matchups that actually went final.
  const finals = scored.filter((s) => s.status === 'final');
  if (!finals.length) return { week, scored, skipped, complete };

  // ── Notify ──────────────────────────────────────────────────────────────
  const names = await query<{ id: string; team_name: string }>(
    `SELECT id::text, team_name FROM dd_league_members WHERE league_id = $1`,
    [leagueId]
  );
  const nameById = new Map(names.rows.map((n) => [n.id, n.team_name]));

  for (const s of finals) {
    const pairs: [string, number, string, number][] = [
      [s.homeMemberId, s.homeScore, s.awayMemberId, s.awayScore],
      [s.awayMemberId, s.awayScore, s.homeMemberId, s.homeScore],
    ];
    for (const [mid, myScore, oppId, oppScore] of pairs) {
      const oppName = nameById.get(oppId) ?? 'your opponent';
      const won = s.winnerMemberId === mid;
      const title = s.isTie
        ? `Week ${week} ended in a tie`
        : won
          ? `You won Week ${week}! 🏆`
          : `Week ${week} result`;
      const body = s.isTie
        ? `${myScore.toFixed(1)} – ${oppScore.toFixed(1)} vs ${oppName}`
        : `${won ? 'Beat' : 'Lost to'} ${oppName} ${myScore.toFixed(1)} – ${oppScore.toFixed(1)}`;

      await emitNotification({
        leagueId,
        memberId: BigInt(mid),
        kind: 'score',
        title,
        body,
        url: `/dd/league/${leagueId}/season`,
        data: {
          week,
          matchupId: s.matchupId,
          myScore,
          oppScore,
          opponent: oppName,
          result: s.isTie ? 'tie' : won ? 'win' : 'loss',
        },
        dedupeKey: `score:w${week}:m${s.matchupId}:${mid}`,
      });
    }
  }

  await emitLeagueNotification({
    leagueId,
    kind: 'matchup',
    title: `Week ${week} is final`,
    body: `${finals.length} matchup${finals.length === 1 ? '' : 's'} scored in ${league.name}.`,
    url: `/dd/league/${leagueId}/season`,
    data: { week, count: finals.length },
    dedupeKey: `weekfinal:w${week}`,
  });

  // ── Award XP for the week's results ─────────────────────────────────────
  // Each manager earns XP for a win/tie (and a streak reset on a loss). Bots
  // have no user account, so we only award to real users.
  await awardMatchupXp(leagueId, finals);

  return { week, scored, skipped, complete };
}

/**
 * Award gamification XP to each real (non-bot) manager for a scored week.
 * Best-effort: any failure here must never break scoring.
 */
async function awardMatchupXp(leagueId: bigint, scored: ScoredMatchup[]): Promise<void> {
  try {
    const members = await query<{ id: string; user_id: string | null; is_bot: boolean }>(
      `SELECT m.id::text, m.user_id::text, (u.password_hash = 'bot_no_login') AS is_bot
       FROM dd_league_members m
       LEFT JOIN web_users u ON u.id = m.user_id
       WHERE m.league_id = $1`,
      [leagueId]
    );
    const userByMember = new Map<string, string>();
    for (const m of members.rows) {
      if (m.user_id && !m.is_bot) userByMember.set(m.id, m.user_id);
    }

    for (const s of scored) {
      const pairs: [string, 'win' | 'loss' | 'tie'][] = [
        [s.homeMemberId, s.isTie ? 'tie' : s.winnerMemberId === s.homeMemberId ? 'win' : 'loss'],
        [s.awayMemberId, s.isTie ? 'tie' : s.winnerMemberId === s.awayMemberId ? 'win' : 'loss'],
      ];
      for (const [mid, result] of pairs) {
        const userId = userByMember.get(mid);
        if (!userId) continue;
        const eventType = result === 'win' ? 'win_matchup' : result === 'tie' ? 'tie_matchup' : 'lose_matchup';
        await awardXp(userId, eventType as any, {
          leagueId: leagueId.toString(),
          metadata: { week: s.week, matchupId: s.matchupId, result },
        });
      }
    }
  } catch {
    // Gamification is a bonus — never let it break scoring.
  }
}

/**
 * Score the earliest week that still has unscored matchups. Returns null when
 * the season is fully scored.
 */
export async function scoreNextWeek(leagueId: bigint): Promise<ScoreWeekResult | null> {
  const row = await queryOne<{ week_num: number }>(
    `SELECT week_num FROM dd_matchups
     WHERE league_id = $1 AND status <> 'final'
     ORDER BY week_num LIMIT 1`,
    [leagueId]
  );
  if (!row) return null;
  return scoreWeek(leagueId, row.week_num);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
