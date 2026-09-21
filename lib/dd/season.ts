/**
 * DiamondDraft — Season lifecycle.
 *
 * Bridges the draft and the in-season game. When a draft completes we:
 *   1. Copy every drafted player into `dd_rosters`, pre-assigning each team's
 *      optimal starting lineup (starters get their slot name, the rest 'BN').
 *   2. Generate the weekly head-to-head schedule into `dd_matchups`.
 *
 * Both steps are idempotent so they can be safely re-run.
 */
import { query, queryOne, tx } from '@/lib/db';
import { generateSchedule, defaultSeasonWeeks } from './schedule';
import { optimizeLineup, type GradePlayer } from './team-grades';
import type { RosterConfig, Sport } from './presets';

export interface SeasonInitResult {
  rosters: number;
  matchups: number;
  weeks: number;
  alreadyInitialized: boolean;
}

/**
 * Initialize the in-season phase for a league. Idempotent.
 */
export async function initializeSeason(
  leagueId: bigint,
  draftId: bigint
): Promise<SeasonInitResult> {
  const league = await queryOne<{
    sport: string;
    season_year: number;
    roster_config: any;
    settings: any;
  }>(
    `SELECT sport, season_year, roster_config, settings FROM dd_leagues WHERE id = $1`,
    [leagueId]
  );
  if (!league) throw new Error('League not found');

  const rosterConfig: RosterConfig =
    typeof league.roster_config === 'string'
      ? JSON.parse(league.roster_config)
      : league.roster_config;
  const settings =
    typeof league.settings === 'string' ? JSON.parse(league.settings) : (league.settings ?? {});
  const sport = league.sport as Sport;

  const membersRes = await query<{ id: string; team_name: string }>(
    `SELECT id::text, team_name FROM dd_league_members
     WHERE league_id = $1 ORDER BY draft_position NULLS LAST, joined_at`,
    [leagueId]
  );
  const members = membersRes.rows;

  // ── 1. Rosters ────────────────────────────────────────────────────────────
  const picksRes = await query<{
    member_id: string;
    player_name: string;
    player_id: string | null;
    team: string | null;
    position: string | null;
    sport: string | null;
    projected_points: string | null;
    eligible_pos: string[] | null;
    rank: number | null;
    adp: string | null;
  }>(
    `SELECT dp.member_id::text, dp.player_name, dp.player_id, dp.team, dp.position, dp.sport,
            pp.projected_points, pp.eligible_pos, pp.rank, pp.adp
     FROM dd_draft_picks dp
     LEFT JOIN dd_player_pool pp
       ON pp.player_name = dp.player_name AND pp.sport = dp.sport
     WHERE dp.draft_id = $1
     ORDER BY dp.overall_pick`,
    [draftId]
  );

  // Per-member list of GradePlayer + a parallel map of raw player ids.
  const byMember = new Map<string, GradePlayer[]>();
  const rawIdByKey = new Map<string, string | null>();
  for (const m of members) byMember.set(m.id, []);

  picksRes.rows.forEach((p, idx) => {
    const list = byMember.get(p.member_id);
    if (!list) return;
    const position = p.position ?? 'BN';
    const key = `${p.member_id}-${idx}`;
    rawIdByKey.set(key, p.player_id);
    list.push({
      key,
      name: p.player_name,
      position,
      eligible: Array.isArray(p.eligible_pos) ? p.eligible_pos : [position],
      team: p.team,
      projectedPoints: p.projected_points != null ? Number(p.projected_points) : 0,
      rank: p.rank ?? null,
      adp: p.adp != null ? Number(p.adp) : null,
      headshot: null,
    });
  });

  let rosterRows = 0;

  await tx(async (client) => {
    for (const m of members) {
      const players = byMember.get(m.id) ?? [];
      const { starters } = optimizeLineup(rosterConfig, players);

      // Map player key → assigned starting slot.
      const slotByKey = new Map<string, string>();
      for (const s of starters) {
        if (s.player) slotByKey.set(s.player.key, s.slot);
      }

      for (const p of players) {
        const slot = slotByKey.get(p.key) ?? 'BN';
        await client.query(
          `INSERT INTO dd_rosters
             (league_id, member_id, player_name, player_id, team, position, sport, slot, acquired_via, acquired_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',NOW())
           ON CONFLICT (league_id, player_name) DO NOTHING`,
          [
            leagueId,
            BigInt(m.id),
            p.name,
            rawIdByKey.get(p.key) ?? null,
            p.team,
            p.position,
            sport,
            slot,
          ]
        );
        rosterRows++;
      }
    }
  });

  // ── 2. Schedule ───────────────────────────────────────────────────────────
  const existing = await queryOne<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM dd_matchups WHERE league_id = $1`,
    [leagueId]
  );
  const alreadyInitialized = Number(existing?.cnt ?? '0') > 0;

  let matchups = 0;
  const weeks = Number(settings?.seasonWeeks) || defaultSeasonWeeks(sport);

  if (!alreadyInitialized && members.length >= 2) {
    const schedule = generateSchedule(members.map((m) => m.id), weeks);
    await tx(async (client) => {
      for (const g of schedule) {
        await client.query(
          `INSERT INTO dd_matchups
             (league_id, week_num, home_member_id, away_member_id, status)
           VALUES ($1,$2,$3,$4,'scheduled')
           ON CONFLICT (league_id, week_num, home_member_id, away_member_id) DO NOTHING`,
          [leagueId, g.week, BigInt(g.homeMemberId), BigInt(g.awayMemberId)]
        );
        matchups++;
      }
    });
  }

  return { rosters: rosterRows, matchups, weeks, alreadyInitialized };
}
