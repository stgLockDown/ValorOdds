/**
 * DiamondDraft — Shared draft-state loader.
 *
 * Centralizes the "whose turn is it / is the draft done" computation so the
 * pick route, auto-pick route, and SSE stream all agree. The key invariant:
 * a team whose roster is full is SKIPPED in the order, and the draft ends
 * once no team has remaining capacity (or the order is exhausted).
 */
import type { PoolClient } from 'pg';
import { query, queryOne, tx } from '@/lib/db';
import { generateDraftOrder, type Sport, type RosterConfig } from '@/lib/dd/presets';
import { computeDraftProgress, type DraftProgress } from '@/lib/dd/draft-progress';
import { initializeSeason } from '@/lib/dd/season';

/**
 * Minimal query surface shared by the pool helpers and a transaction client.
 * Passing a `PoolClient` lets callers read their own uncommitted writes.
 */
type Queryable = {
  query: <T = any>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>;
};

/** Run a query through either the shared pool or a transaction client. */
async function q<T = any>(
  client: PoolClient | undefined,
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  if (client) {
    const r = await client.query(text, params as never[]);
    return r.rows as T[];
  }
  const r = await query<any>(text, params);
  return r.rows as T[];
}

export interface DraftMember {
  id: string;
  userId: string;
  teamName: string;
  draftPosition: number | null;
  displayName: string | null;
  isBot: boolean;
}

export interface LoadedDraftState {
  draft: {
    id: string;
    leagueId: string;
    draftType: string;
    status: string;
    roundCount: number;
    currentRound: number;
    currentPick: number;
    timerSeconds: number;
    isMock: boolean;
    startedAt: string | null;
    completedAt: string | null;
    leagueName: string;
    sport: Sport;
    numTeams: number;
    commissionerId: string;
    seasonYear: number;
    rosterConfig: RosterConfig;
    rosterCapacity: number;
  };
  members: DraftMember[];
  picks: {
    id: string;
    roundNum: number;
    pickInRound: number;
    overallPick: number;
    memberId: string;
    playerName: string;
    playerId: string | null;
    team: string | null;
    position: string | null;
    sport: string | null;
    isAutoPicked: boolean;
    pickedAt: string;
    headshot: string | null;
  }[];
  progress: DraftProgress;
  /** The member id on the clock (null when complete) */
  onClockMemberId: string | null;
  /** The order entry on the clock (null when complete) */
  onClockEntry: { round: number; pickInRound: number; overallPick: number; slot: number } | null;
  /** The most recent pick (for cursor derivation) */
  lastPick: { round: number; pickInRound: number } | null;
}

/** Sum of all roster slot counts — the hard per-team ceiling. */
export function rosterCapacityOf(rosterConfig: RosterConfig | null | undefined): number {
  const slots = rosterConfig?.slots ?? [];
  return slots.reduce((sum, s) => sum + (s.count ?? 0), 0);
}

/**
 * Mark a draft complete and move the league into its in-season phase.
 * Idempotent — safe to call when the draft is already completed.
 *
 * Also seeds the in-season game: copies drafted players into `dd_rosters`
 * (with an optimal starting lineup) and generates the weekly head-to-head
 * schedule into `dd_matchups`.
 */
export async function finalizeDraft(
  draftId: bigint,
  leagueId: bigint,
  roundCount: number,
  numTeams: number
): Promise<void> {
  await tx(async (client) => {
    await client.query(
      `UPDATE dd_drafts
         SET status = 'completed', current_round = $1, current_pick = $2, completed_at = NOW()
       WHERE id = $3 AND status != 'completed'`,
      [roundCount, numTeams, draftId]
    );
    await client.query(
      `UPDATE dd_leagues SET status = 'in_season', updated_at = NOW() WHERE id = $1`,
      [leagueId]
    );
  });

  // Seed rosters + schedule. Best-effort: a failure here must not roll back
  // the draft completion itself (the season can be re-initialized later).
  try {
    await initializeSeason(leagueId, draftId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[dd] initializeSeason failed after draft finalize', err);
  }
}

/**
 * Load the full draft state.
 *
 * Pass `client` (a transaction `PoolClient`) when calling from inside a
 * transaction that has just written a pick — otherwise the read goes through
 * a different pooled connection and cannot see the uncommitted row, which
 * makes the completion check one pick stale and prevents the draft from ever
 * finalizing.
 */
export async function loadDraftState(
  draftId: bigint,
  client?: PoolClient
): Promise<LoadedDraftState | null> {
  const draftRows = await q<any>(
    client,
    `SELECT d.id::text, d.league_id::text, d.draft_type, d.status, d.round_count,
            d.current_round, d.current_pick, d.pick_timer_seconds, d.is_mock,
            d.started_at, d.completed_at,
            l.name AS league_name, l.sport, l.num_teams, l.roster_config,
            l.commissioner_id::text AS commissioner_id
     FROM dd_drafts d
     JOIN dd_leagues l ON l.id = d.league_id
     WHERE d.id = $1`,
    [draftId]
  );
  const draftRow = draftRows[0];
  if (!draftRow) return null;

  const leagueId = BigInt(draftRow.league_id);

  const memberCountRows = await q<{ cnt: string }>(
    client,
    `SELECT COUNT(*)::text AS cnt FROM dd_league_members WHERE league_id = $1`,
    [leagueId]
  );
  const memberCount = Number(memberCountRows[0]?.cnt ?? '0');
  const numTeams = memberCount >= 2 ? memberCount : draftRow.num_teams;

  const rosterConfig: RosterConfig =
    typeof draftRow.roster_config === 'string'
      ? JSON.parse(draftRow.roster_config)
      : draftRow.roster_config;
  const rosterCapacity = rosterCapacityOf(rosterConfig);
  const rounds = draftRow.round_count;

  const membersRes = await q<{
    id: string; user_id: string; team_name: string; draft_position: number | null;
    display_name: string | null; is_bot: boolean;
  }>(
    client,
    `SELECT m.id::text, m.user_id::text, m.team_name, m.draft_position, u.display_name,
            (u.password_hash = 'bot_no_login') AS is_bot
     FROM dd_league_members m
     JOIN web_users u ON u.id = m.user_id
     WHERE m.league_id = $1
     ORDER BY m.draft_position NULLS LAST`,
    [leagueId]
  );

  const members: DraftMember[] = membersRes.map((m) => ({
    id: m.id,
    userId: m.user_id,
    teamName: m.team_name,
    draftPosition: m.draft_position,
    displayName: m.display_name ?? m.team_name,
    isBot: m.is_bot,
  }));

  const slotToMember = new Map<number, DraftMember>();
  for (const m of members) {
    if (m.draftPosition != null) slotToMember.set(m.draftPosition - 1, m);
  }

  const picksRes = await q<any>(
    client,
    `SELECT dp.id::text, dp.round_num, dp.pick_in_round, dp.overall_pick, dp.member_id::text,
            dp.player_name, dp.player_id, dp.team, dp.position, dp.sport, dp.is_auto_picked, dp.picked_at,
            pp.headshot_url AS headshot
     FROM dd_draft_picks dp
     LEFT JOIN dd_player_pool pp ON pp.id::text = dp.player_id
     WHERE dp.draft_id = $1
     ORDER BY dp.overall_pick`,
    [draftId]
  );

  const picks = picksRes.map((p) => ({
    id: p.id,
    roundNum: p.round_num,
    pickInRound: p.pick_in_round,
    overallPick: p.overall_pick,
    memberId: p.member_id,
    playerName: p.player_name,
    playerId: p.player_id,
    team: p.team,
    position: p.position,
    sport: p.sport,
    isAutoPicked: p.is_auto_picked,
    pickedAt: p.picked_at,
    headshot: p.headshot ?? null,
  }));

  const picksByMember: Record<string, number> = {};
  for (const p of picks) {
    picksByMember[p.memberId] = (picksByMember[p.memberId] ?? 0) + 1;
  }

  const fullOrder = generateDraftOrder(draftRow.draft_type, numTeams, rounds);
  const lastPickRow = picks.length
    ? picks[picks.length - 1]
    : null;
  const lastPick = lastPickRow
    ? { round: lastPickRow.roundNum, pickInRound: lastPickRow.pickInRound }
    : null;

  const progress = computeDraftProgress({
    fullOrder,
    slotToMemberId: (slot) => slotToMember.get(slot)?.id ?? null,
    memberIds: members.map((m) => m.id),
    picksByMember,
    rosterCapacity,
    lastPick,
  });

  const onClockEntry = progress.nextEntry;
  const onClockMemberId = onClockEntry
    ? slotToMember.get(onClockEntry.slot)?.id ?? null
    : null;

  return {
    draft: {
      id: draftRow.id,
      leagueId: draftRow.league_id,
      draftType: draftRow.draft_type,
      status: draftRow.status,
      roundCount: rounds,
      currentRound: draftRow.current_round,
      currentPick: draftRow.current_pick,
      timerSeconds: draftRow.pick_timer_seconds,
      isMock: draftRow.is_mock ?? false,
      startedAt: draftRow.started_at,
      completedAt: draftRow.completed_at,
      leagueName: draftRow.league_name,
      sport: draftRow.sport as Sport,
      numTeams,
      commissionerId: draftRow.commissioner_id,
      seasonYear: draftRow.season_year,
      rosterConfig,
      rosterCapacity,
    },
    members,
    picks,
    progress,
    onClockMemberId,
    onClockEntry,
    lastPick,
  };
}
