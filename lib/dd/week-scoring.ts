/**
 * DiamondDraft — Weekly matchup scoring.
 *
 * Turns a scheduled week of head-to-head matchups into final results. Each
 * team's score is the sum of its *starting* lineup's projected points (players
 * in a non-'BN' slot). Ties are broken by the higher-scoring bench, then
 * declared a tie.
 *
 * Scoring is idempotent: a matchup already marked `completed` is skipped, and
 * the notifications it emits carry a dedupe key, so re-running a week is safe.
 *
 * When a week is scored we emit:
 *   * a per-manager notification with their own result and score, and
 *   * a league-wide broadcast announcing the week is final.
 */
import { query, queryOne, tx } from '@/lib/db';
import { scoreH2HMatchup } from './scoring';
import { emitNotification, emitLeagueNotification } from './notifications';
import { awardXp } from './gamification';

export interface ScoredMatchup {
  matchupId: string;
  week: number;
  homeMemberId: string;
  awayMemberId: string;
  homeScore: number;
  awayScore: number;
  winnerMemberId: string | null;
  isTie: boolean;
}

export interface ScoreWeekResult {
  week: number;
  scored: ScoredMatchup[];
  skipped: number;
}

interface RosterRow {
  member_id: string;
  player_name: string;
  slot: string;
  projected_points: string | null;
}

/**
 * Score every not-yet-completed matchup in a given week.
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
  if (!pending.length) return { week, scored: [], skipped };

  // Every roster row in the league, with its projected points.
  const rosters = await query<RosterRow>(
    `SELECT r.member_id::text, r.player_name, r.slot, pp.projected_points
     FROM dd_rosters r
     LEFT JOIN dd_player_pool pp
       ON pp.player_name = r.player_name AND pp.sport = r.sport
     WHERE r.league_id = $1`,
    [leagueId]
  );

  // memberId → { starters, bench } point totals.
  const totals = new Map<string, { starters: number; bench: number }>();
  for (const r of rosters.rows) {
    const pts = r.projected_points != null ? Number(r.projected_points) : 0;
    const entry = totals.get(r.member_id) ?? { starters: 0, bench: 0 };
    if (r.slot && r.slot !== 'BN') entry.starters += pts;
    else entry.bench += pts;
    totals.set(r.member_id, entry);
  }

  const scored: ScoredMatchup[] = [];

  await tx(async (client) => {
    for (const m of pending) {
      const home = totals.get(m.home_member_id) ?? { starters: 0, bench: 0 };
      const away = totals.get(m.away_member_id) ?? { starters: 0, bench: 0 };

      const homeScore = round1(home.starters);
      const awayScore = round1(away.starters);

      const outcome = scoreH2HMatchup(homeScore, awayScore, 'h2h_points');
      let winnerMemberId: string | null = null;
      let isTie = false;
      if (outcome.winner === 'home') winnerMemberId = m.home_member_id;
      else if (outcome.winner === 'away') winnerMemberId = m.away_member_id;
      else if (home.bench !== away.bench) {
        // Bench tiebreak (standard "total points" fallback).
        winnerMemberId = home.bench > away.bench ? m.home_member_id : m.away_member_id;
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
      });
    }
  });

  // ── Notify ────────────────────────────────────────────────────────────────
  const names = await query<{ id: string; team_name: string }>(
    `SELECT id::text, team_name FROM dd_league_members WHERE league_id = $1`,
    [leagueId]
  );
  const nameById = new Map(names.rows.map((n) => [n.id, n.team_name]));

  for (const s of scored) {
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
    body: `${scored.length} matchup${scored.length === 1 ? '' : 's'} scored in ${league.name}.`,
    url: `/dd/league/${leagueId}/season`,
    data: { week, count: scored.length },
    dedupeKey: `weekfinal:w${week}`,
  });

  // ── Award XP for the week's results ──────────────────────────────────────
  // Each manager earns XP for a win/tie (and a streak reset on a loss). Bots
  // have no user account, so we only award to real users.
  await awardMatchupXp(leagueId, scored);

  return { week, scored, skipped };
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
