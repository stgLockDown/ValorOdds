/**
 * DiamondDraft — Week / season reset.
 *
 * Un-finals scored matchups so a week can be re-scored from live game stats.
 * A reset reverses everything a scoring run produced:
 *   * clears `home_score`, `away_score`, `winner_member_id`, `is_tie`
 *   * sets `status` back to `scheduled`
 *   * deletes that week's score notifications (dedupe keys `score:wN:*` and
 *     `weekfinal:wN`)
 *   * reverses the gamification XP awarded for those matchups and rolls back
 *     the affected users' win streaks
 *
 * Commissioner-only at the API layer; this module is pure data work.
 */
import { query, tx } from '@/lib/db';
import type { PoolClient } from 'pg';

export interface ResetResult {
  week: number | 'all';
  matchupsReset: number;
  notificationsRemoved: number;
  xpEventsRemoved: number;
  xpReversed: number;
}

/**
 * Reset a single week (or every week when `week` is null) for a league.
 */
export async function resetWeeks(
  leagueId: bigint,
  week: number | null
): Promise<ResetResult> {
  const weekFilter = week != null ? `AND week_num = $2` : '';
  const params: any[] = week != null ? [leagueId, week] : [leagueId];

  // Which matchups are we un-finalizing?
  const matchups = await query<{ id: string; week_num: number }>(
    `SELECT id::text, week_num FROM dd_matchups
     WHERE league_id = $1 ${weekFilter} AND status <> 'scheduled'`,
    params
  );
  const matchupIds = matchups.rows.map((m) => m.id);
  const weeks = [...new Set(matchups.rows.map((m) => m.week_num))];

  let notificationsRemoved = 0;
  let xpEventsRemoved = 0;
  let xpReversed = 0;

  await tx(async (client) => {
    // 1. Un-finalize the matchups.
    if (matchupIds.length) {
      await client.query(
        `UPDATE dd_matchups
         SET home_score = NULL, away_score = NULL, winner_member_id = NULL,
             is_tie = false, status = 'scheduled'
         WHERE id = ANY($1::bigint[])`,
        [matchupIds.map((id) => BigInt(id))]
      );
    }

    // 2. Remove the score notifications for the affected weeks.
    if (weeks.length) {
      const notif = await client.query(
        `DELETE FROM dd_notifications
         WHERE league_id = $1
           AND (dedupe_key LIKE ANY($2::text[]) OR dedupe_key LIKE ANY($3::text[]))`,
        [
          leagueId,
          weeks.map((w) => `score:w${w}:%`),
          weeks.map((w) => `weekfinal:w${w}%`),
        ]
      );
      notificationsRemoved = notif.rowCount ?? 0;
    }

    // 3. Reverse gamification XP for these matchups.
    //    XP events for a matchup carry metadata.matchupId. We subtract the
    //    awarded amount from the user's total and delete the event rows.
    if (matchupIds.length) {
      const events = await client.query<{
        id: string;
        user_id: string;
        xp_amount: number;
        event_type: string;
      }>(
        `SELECT id::text, user_id::text, xp_amount, event_type
         FROM dd_xp_events
         WHERE league_id = $1
           AND event_type IN ('win_matchup', 'tie_matchup', 'lose_matchup')
           AND metadata->>'matchupId' = ANY($2::text[])`,
        [leagueId, matchupIds]
      );

      // Sum the XP to remove per user.
      const perUser = new Map<string, number>();
      for (const e of events.rows) {
        perUser.set(e.user_id, (perUser.get(e.user_id) ?? 0) + Number(e.xp_amount));
      }

      for (const [userId, amount] of perUser) {
        if (amount !== 0) {
          await client.query(
            `UPDATE dd_user_xp
             SET total_xp = GREATEST(0, total_xp - $2),
                 updated_at = NOW()
             WHERE user_id = $1`,
            [userId, amount]
          );
          xpReversed += amount;
        }
      }

      if (events.rows.length) {
        const del = await client.query(
          `DELETE FROM dd_xp_events WHERE id = ANY($1::bigint[])`,
          [events.rows.map((e) => BigInt(e.id))]
        );
        xpEventsRemoved = del.rowCount ?? 0;
      }

      // Recompute level + streak for affected users from the remaining events.
      for (const userId of perUser.keys()) {
        await recomputeUserGamification(client, userId);
      }
    }
  });

  return {
    week: week ?? 'all',
    matchupsReset: matchupIds.length,
    notificationsRemoved,
    xpEventsRemoved,
    xpReversed,
  };
}

/**
 * Recompute a user's level from their remaining XP and reset their current
 * streak to 0 (a reset invalidates the streak history we can no longer trust).
 */
async function recomputeUserGamification(client: PoolClient, userId: string): Promise<void> {
  const row = await client.query<{ total_xp: string }>(
    `SELECT total_xp::text FROM dd_user_xp WHERE user_id = $1`,
    [userId]
  );
  const totalXp = parseInt(row.rows[0]?.total_xp ?? '0', 10);

  // Mirror lib/dd/gamification.ts levelFromXp without importing (keeps this
  // module dependency-free inside the transaction).
  const xpForLevel = (level: number) =>
    level <= 1 ? 0 : Math.round(100 * Math.pow(level - 1, 1.5));
  let level = 1;
  for (let l = 1; l <= 50; l++) {
    if (totalXp >= xpForLevel(l)) level = l;
    else break;
  }
  const titles = [
    'Rookie', 'Rookie', 'Rookie', 'Prospect', 'Prospect',
    'Prospect', 'Starter', 'Starter', 'Starter', 'Double-A',
    'Double-A', 'Double-A', 'Double-A', 'Triple-A', 'Triple-A',
    'Triple-A', 'Triple-A', 'All-Star', 'All-Star', 'All-Star',
    'Major Leaguer', 'Major Leaguer', 'Major Leaguer', 'Major Leaguer', 'Pro Bowler',
    'Pro Bowler', 'Pro Bowler', 'Silver Slugger', 'Silver Slugger', 'Silver Slugger',
    'MVP Candidate', 'MVP Candidate', 'MVP Candidate', 'MVP Candidate', 'MVP Candidate',
    'MVP Candidate', 'MVP', 'MVP', 'MVP', 'MVP',
    'MVP', 'Hall of Fame', 'Hall of Fame', 'Hall of Fame', 'Hall of Fame',
    'Hall of Fame', 'Hall of Fame', 'Hall of Fame', 'Hall of Fame', 'Hall of Fame',
  ];
  const title = titles[level - 1] ?? 'Rookie';

  await client.query(
    `UPDATE dd_user_xp
     SET level = $2, level_title = $3, current_streak = 0, updated_at = NOW()
     WHERE user_id = $1`,
    [userId, level, title]
  );
}
