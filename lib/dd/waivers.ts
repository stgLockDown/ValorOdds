/**
 * DiamondDraft — Waiver wire.
 *
 * A FAAB (free-agent acquisition budget) waiver system layered on the
 * pre-existing `dd_waiver_claims` table. Managers submit claims against free
 * agents (pool players not rostered anywhere in the league), optionally
 * naming a player to drop and a blind bid. When claims are processed, the
 * highest bid wins each player; ties break on waiver priority, then on who
 * claimed first.
 *
 * Budgets live on `dd_league_members.faab_budget` (default 100).
 */
import { query, queryOne, tx } from '@/lib/db';
import { emitNotification } from './notifications';
import { getFantasyWeekInfo, waiverStatusText } from './week-calendar';

/**
 * Canonical position ordering for the waiver filter, matching ESPN's dropdown.
 * Unknown positions sort to the end alphabetically rather than being dropped.
 */
const POSITION_ORDER = [
  'QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DST', 'D/ST',
  'DL', 'DE', 'DT', 'LB', 'DB', 'CB', 'S',
  'C', '1B', '2B', '3B', 'SS', 'OF', 'LF', 'CF', 'RF', 'DH', 'SP', 'RP', 'P',
];

function positionRank(pos: string): number {
  const i = POSITION_ORDER.indexOf(String(pos).toUpperCase());
  return i >= 0 ? i : POSITION_ORDER.length;
}

export interface FreeAgent {
  playerName: string;
  playerId: string | null;
  team: string | null;
  position: string | null;
  sport: string | null;
  projectedPoints: number;
  rank: number | null;
  adp: number | null;
  headshot: string | null;
  injuryStatus: string | null;
}

export interface WaiverClaim {
  id: string;
  memberId: string;
  memberName: string;
  playerName: string;
  dropPlayerName: string | null;
  bidAmount: number;
  priority: number | null;
  status: string;
  claimDate: string;
  createdAt: string;
  headshot: string | null;
  position: string | null;
  team: string | null;
}

export interface WaiverBoard {
  freeAgents: FreeAgent[];
  myClaims: WaiverClaim[];
  myBudget: number;
  mySpent: number;
  faabEnabled: boolean;
  /**
   * Every position that actually has at least one free agent in this league,
   * in canonical order. The filter dropdown is built from this rather than
   * from the (truncated) `freeAgents` page, so DEF/K/TE are always selectable.
   */
  availablePositions: { position: string; count: number }[];
  /** Waiver window state, derived from the Wed→Tue fantasy calendar. */
  window: {
    waiversOpen: boolean;
    isWaiverProcessingDay: boolean;
    phase: string;
    opensAt: string | null;
    statusText: string;
    currentWeek: number | null;
  };
}

/** Total FAAB spent by a member (sum of winning bids). */
async function spentByMember(leagueId: bigint, memberId: bigint): Promise<number> {
  const row = await queryOne<{ total: string | null }>(
    `SELECT COALESCE(SUM(bid_amount), 0)::text AS total
     FROM dd_waiver_claims
     WHERE league_id = $1 AND member_id = $2 AND status = 'won'`,
    [leagueId, memberId]
  );
  return Number(row?.total ?? '0');
}

/**
 * The waiver board: free agents available to add, plus the caller's claims.
 *
 * Free agents = pool players for the league's sport/season that do not appear
 * on any `dd_rosters` row in this league. Matched on (player_name, sport) to
 * mirror the rest of the app's join convention.
 */
export async function getWaiverBoard(
  leagueId: bigint,
  memberId: bigint,
  opts: { search?: string; position?: string; limit?: number } = {}
): Promise<WaiverBoard> {
  const league = await queryOne<{ sport: string; season_year: number; settings: any }>(
    `SELECT sport, season_year, settings FROM dd_leagues WHERE id = $1`,
    [leagueId]
  );
  if (!league) throw new Error('League not found');

  const settings =
    typeof league.settings === 'string' ? JSON.parse(league.settings) : (league.settings ?? {});
  const faabEnabled = settings?.faabEnabled !== false;

  const limit = Math.min(Math.max(opts.limit ?? 60, 1), 200);
  const params: unknown[] = [leagueId, league.sport, league.season_year];
  let filters = '';

  if (opts.position) {
    params.push(opts.position.toUpperCase());
    filters += ` AND UPPER(pp.position) = $${params.length}`;
  }
  if (opts.search) {
    params.push(`%${opts.search}%`);
    filters += ` AND pp.player_name ILIKE $${params.length}`;
  }

  // ── Per-position coverage ────────────────────────────────────────────────
  // A flat `ORDER BY projected_points DESC LIMIT 60` is dominated by QB/RB/WR
  // (a DEF projects ~5 pts, a K ~7-9, while a QB projects 20+), so kickers,
  // defenses and even tight ends never made it onto the board at all. We rank
  // WITHIN each position and interleave, guaranteeing every position is
  // represented while still leading with the best players overall.
  //
  // When the caller has already filtered to one position, the guarantee is
  // moot and we just return that position's best N.
  const perPosFloor = opts.position ? limit : 12;
  params.push(perPosFloor);
  const posFloorIdx = params.length;
  params.push(limit);
  const limitIdx = params.length;

  const faRes = await query<any>(
    `WITH available AS (
       SELECT pp.player_name, pp.espn_id, pp.team, pp.position, pp.sport,
              pp.projected_points, pp.rank, pp.adp, pp.headshot_url,
              pp.injury_status
       FROM dd_player_pool pp
       WHERE pp.sport = $2
         AND pp.season_year = $3
         AND NOT EXISTS (
           SELECT 1 FROM dd_rosters r
           WHERE r.league_id = $1
             AND r.player_name = pp.player_name
             AND r.sport = pp.sport
         )
         ${filters}
     ),
     ranked AS (
       SELECT a.*,
              ROW_NUMBER() OVER (
                PARTITION BY UPPER(COALESCE(a.position, '?'))
                ORDER BY a.projected_points DESC NULLS LAST,
                         a.rank ASC NULLS LAST,
                         a.player_name ASC
              ) AS pos_rn
       FROM available a
     )
     SELECT player_name, espn_id, team, position, sport,
            projected_points, rank, adp, headshot_url, injury_status
     FROM ranked
     WHERE pos_rn <= $${posFloorIdx}
     ORDER BY pos_rn ASC,
              projected_points DESC NULLS LAST,
              rank ASC NULLS LAST,
              player_name ASC
     LIMIT $${limitIdx}`,
    params
  );

  // Full position census for the filter dropdown — independent of the page
  // above, so every position with at least one free agent is offered.
  const posRes = await query<{ position: string | null; cnt: string }>(
    `SELECT UPPER(pp.position) AS position, COUNT(*)::text AS cnt
     FROM dd_player_pool pp
     WHERE pp.sport = $2
       AND pp.season_year = $3
       AND pp.position IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM dd_rosters r
         WHERE r.league_id = $1
           AND r.player_name = pp.player_name
           AND r.sport = pp.sport
       )
     GROUP BY UPPER(pp.position)
     ORDER BY 1`,
    [leagueId, league.sport, league.season_year]
  );

  const availablePositions = posRes.rows
    .filter((r) => r.position)
    .map((r) => ({ position: r.position as string, count: Number(r.cnt) }))
    .sort((a, b) => positionRank(a.position) - positionRank(b.position));

  const weekInfo = getFantasyWeekInfo(league.sport, Number(league.season_year));

  const claimsRes = await query<any>(
    `SELECT c.id::text, c.member_id::text, m.team_name, c.player_name,
            c.drop_player_name, c.bid_amount, c.priority, c.status,
            c.claim_date, c.created_at,
            pp.headshot_url, pp.position, pp.team
     FROM dd_waiver_claims c
     JOIN dd_league_members m ON m.id = c.member_id
     LEFT JOIN dd_player_pool pp
       ON pp.player_name = c.player_name AND pp.sport = $3
     WHERE c.league_id = $1 AND c.member_id = $2
     ORDER BY c.created_at DESC
     LIMIT 50`,
    [leagueId, memberId, league.sport]
  );

  const budgetRow = await queryOne<{ faab_budget: number }>(
    `SELECT faab_budget FROM dd_league_members WHERE id = $1`,
    [memberId]
  );

  return {
    freeAgents: faRes.rows.map((r: any) => ({
      playerName: r.player_name,
      playerId: r.espn_id ?? null,
      team: r.team,
      position: r.position,
      sport: r.sport,
      projectedPoints: r.projected_points != null ? Number(r.projected_points) : 0,
      rank: r.rank ?? null,
      adp: r.adp != null ? Number(r.adp) : null,
      headshot: r.headshot_url ?? null,
      injuryStatus: r.injury_status ?? null,
    })),
    myClaims: claimsRes.rows.map((r: any) => ({
      id: r.id,
      memberId: r.member_id,
      memberName: r.team_name,
      playerName: r.player_name,
      dropPlayerName: r.drop_player_name,
      bidAmount: r.bid_amount,
      priority: r.priority,
      status: r.status,
      claimDate: r.claim_date,
      createdAt: new Date(r.created_at).toISOString(),
      headshot: r.headshot_url ?? null,
      position: r.position ?? null,
      team: r.team ?? null,
    })),
    myBudget: budgetRow?.faab_budget ?? 100,
    mySpent: await spentByMember(leagueId, memberId),
    faabEnabled,
    availablePositions,
    window: {
      waiversOpen: weekInfo.waiversOpen,
      isWaiverProcessingDay: weekInfo.isWaiverProcessingDay,
      phase: weekInfo.phase,
      opensAt: weekInfo.waiversOpenAt,
      statusText: waiverStatusText(weekInfo),
      currentWeek: weekInfo.currentWeek,
    },
  };
}

export interface SubmitClaimInput {
  leagueId: bigint;
  memberId: bigint;
  playerName: string;
  dropPlayerName?: string | null;
  bidAmount?: number;
}

/**
 * Submit a waiver claim. Validates that the target is a genuine free agent and
 * that the drop candidate (if any) is actually on the caller's roster.
 */
export async function submitClaim(input: SubmitClaimInput): Promise<WaiverClaim> {
  const { leagueId, memberId } = input;
  const playerName = input.playerName?.trim();
  if (!playerName) throw new HttpError(400, 'playerName is required');

  const league = await queryOne<{ sport: string; season_year: number; status: string }>(
    `SELECT sport, season_year, status FROM dd_leagues WHERE id = $1`,
    [leagueId]
  );
  if (!league) throw new HttpError(404, 'League not found');

  // Target must be a free agent.
  const isRostered = await queryOne<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM dd_rosters
     WHERE league_id = $1 AND player_name = $2`,
    [leagueId, playerName]
  );
  if (Number(isRostered?.cnt ?? '0') > 0) {
    throw new HttpError(409, `${playerName} is already on a roster.`);
  }

  const inPool = await queryOne<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM dd_player_pool
     WHERE sport = $1 AND season_year = $2 AND player_name = $3`,
    [league.sport, league.season_year, playerName]
  );
  if (Number(inPool?.cnt ?? '0') === 0) {
    throw new HttpError(404, `${playerName} is not in the player pool.`);
  }

  // Drop candidate must be on the caller's roster.
  const drop = input.dropPlayerName?.trim() || null;
  if (drop) {
    const onRoster = await queryOne<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM dd_rosters
       WHERE league_id = $1 AND member_id = $2 AND player_name = $3`,
      [leagueId, memberId, drop]
    );
    if (Number(onRoster?.cnt ?? '0') === 0) {
      throw new HttpError(400, `${drop} is not on your roster.`);
    }
  }

  const bid = Math.max(0, Math.floor(input.bidAmount ?? 0));
  const budgetRow = await queryOne<{ faab_budget: number }>(
    `SELECT faab_budget FROM dd_league_members WHERE id = $1`,
    [memberId]
  );
  const budget = budgetRow?.faab_budget ?? 100;
  const spent = await spentByMember(leagueId, memberId);
  if (bid > budget - spent) {
    throw new HttpError(400, `Bid exceeds your remaining FAAB ($${budget - spent}).`);
  }

  // Replace any existing pending claim for the same player by this member.
  await query(
    `DELETE FROM dd_waiver_claims
     WHERE league_id = $1 AND member_id = $2 AND player_name = $3 AND status = 'pending'`,
    [leagueId, memberId, playerName]
  );

  const res = await query<any>(
    `INSERT INTO dd_waiver_claims
       (league_id, member_id, player_name, drop_player_name, bid_amount, status, claim_date)
     VALUES ($1, $2, $3, $4, $5, 'pending', CURRENT_DATE)
     RETURNING id::text, member_id::text, player_name, drop_player_name,
               bid_amount, priority, status, claim_date, created_at`,
    [leagueId, memberId, playerName, drop, bid]
  );

  const r = res.rows[0];
  return {
    id: r.id,
    memberId: r.member_id,
    memberName: '',
    playerName: r.player_name,
    dropPlayerName: r.drop_player_name,
    bidAmount: r.bid_amount,
    priority: r.priority,
    status: r.status,
    claimDate: r.claim_date,
    createdAt: new Date(r.created_at).toISOString(),
    headshot: null,
    position: null,
    team: null,
  };
}

/** Cancel one of the caller's own pending claims. */
export async function cancelClaim(
  leagueId: bigint,
  memberId: bigint,
  claimId: bigint
): Promise<boolean> {
  const res = await query(
    `DELETE FROM dd_waiver_claims
     WHERE id = $1 AND league_id = $2 AND member_id = $3 AND status = 'pending'`,
    [claimId, leagueId, memberId]
  );
  return (res.rowCount ?? 0) > 0;
}

export interface ProcessResult {
  awarded: { playerName: string; memberId: string; bid: number }[];
  failed: { playerName: string; memberId: string; reason: string }[];
}

/**
 * Process all pending claims for a league.
 *
 * For each contested player the highest bid wins; ties break on waiver
 * priority (lower number wins), then on earliest claim. Losing bids are not
 * charged. Winners are charged their bid, the dropped player is released, and
 * the new player is added to the roster.
 */
export async function processWaivers(leagueId: bigint): Promise<ProcessResult> {
  const league = await queryOne<{ sport: string; name: string }>(
    `SELECT sport, name FROM dd_leagues WHERE id = $1`,
    [leagueId]
  );
  if (!league) throw new Error('League not found');

  const claimsRes = await query<any>(
    `SELECT c.id::text, c.member_id::text, c.player_name, c.drop_player_name,
            c.bid_amount, c.priority, c.created_at, m.team_name
     FROM dd_waiver_claims c
     JOIN dd_league_members m ON m.id = c.member_id
     WHERE c.league_id = $1 AND c.status = 'pending'
     ORDER BY c.bid_amount DESC, c.priority ASC NULLS LAST, c.created_at ASC`,
    [leagueId]
  );

  const awarded: ProcessResult['awarded'] = [];
  const failed: ProcessResult['failed'] = [];
  const claimedPlayers = new Set<string>();

  for (const c of claimsRes.rows) {
    // A player can only be awarded once per run.
    if (claimedPlayers.has(c.player_name)) {
      await query(
        `UPDATE dd_waiver_claims SET status = 'lost', processed_at = NOW() WHERE id = $1`,
        [BigInt(c.id)]
      );
      failed.push({
        playerName: c.player_name,
        memberId: c.member_id,
        reason: 'Outbid',
      });
      continue;
    }

    // Still a free agent?
    const rostered = await queryOne<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM dd_rosters
       WHERE league_id = $1 AND player_name = $2`,
      [leagueId, c.player_name]
    );
    if (Number(rostered?.cnt ?? '0') > 0) {
      await query(
        `UPDATE dd_waiver_claims SET status = 'lost', processed_at = NOW() WHERE id = $1`,
        [BigInt(c.id)]
      );
      failed.push({
        playerName: c.player_name,
        memberId: c.member_id,
        reason: 'No longer available',
      });
      continue;
    }

    // Budget check.
    const budgetRow = await queryOne<{ faab_budget: number }>(
      `SELECT faab_budget FROM dd_league_members WHERE id = $1`,
      [BigInt(c.member_id)]
    );
    const budget = budgetRow?.faab_budget ?? 100;
    const spent = await spentByMember(leagueId, BigInt(c.member_id));
    if (c.bid_amount > budget - spent) {
      await query(
        `UPDATE dd_waiver_claims SET status = 'lost', processed_at = NOW() WHERE id = $1`,
        [BigInt(c.id)]
      );
      failed.push({
        playerName: c.player_name,
        memberId: c.member_id,
        reason: 'Insufficient FAAB',
      });
      continue;
    }

    // Award: drop (if any), add the player, charge the bid.
    const poolRow = await queryOne<any>(
      `SELECT espn_id, team, position FROM dd_player_pool
       WHERE sport = $1 AND player_name = $2 LIMIT 1`,
      [league.sport, c.player_name]
    );

    await tx(async (client) => {
      if (c.drop_player_name) {
        await client.query(
          `DELETE FROM dd_rosters
           WHERE league_id = $1 AND member_id = $2 AND player_name = $3`,
          [leagueId, BigInt(c.member_id), c.drop_player_name]
        );
      }
      await client.query(
        `INSERT INTO dd_rosters
           (league_id, member_id, player_name, player_id, team, position, sport,
            slot, acquired_via, acquired_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'BN','waiver',NOW())
         ON CONFLICT (league_id, player_name) DO NOTHING`,
        [
          leagueId,
          BigInt(c.member_id),
          c.player_name,
          poolRow?.espn_id ?? null,
          poolRow?.team ?? null,
          poolRow?.position ?? null,
          league.sport,
        ]
      );
      await client.query(
        `UPDATE dd_waiver_claims
         SET status = 'won', processed_at = NOW()
         WHERE id = $1`,
        [BigInt(c.id)]
      );
    });

    claimedPlayers.add(c.player_name);
    awarded.push({
      playerName: c.player_name,
      memberId: c.member_id,
      bid: c.bid_amount,
    });

    await emitNotification({
      leagueId,
      memberId: BigInt(c.member_id),
      kind: 'waiver',
      title: `Waiver claim won: ${c.player_name}`,
      body: c.drop_player_name
        ? `Added for $${c.bid_amount} FAAB, dropping ${c.drop_player_name}.`
        : `Added for $${c.bid_amount} FAAB.`,
      url: `/dd/league/${leagueId}/season?tab=waivers`,
      data: {
        playerName: c.player_name,
        dropPlayerName: c.drop_player_name,
        bid: c.bid_amount,
      },
      dedupeKey: `waiver:award:${c.id}`,
    });
  }

  return { awarded, failed };
}

/** Small typed error so routes can map failures to status codes. */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
