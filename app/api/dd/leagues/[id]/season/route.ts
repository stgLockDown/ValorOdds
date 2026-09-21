import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { initializeSeason } from '@/lib/dd/season';
import { loadDraftState, finalizeDraft } from '@/lib/dd/draft-state';
import { defaultSeasonWeeks } from '@/lib/dd/schedule';
import type { RosterConfig } from '@/lib/dd/presets';

// ────────────────────────────────────────────────────────────────────────────
// GET /api/dd/leagues/[id]/season
//
// The in-season hub payload: every team's roster (with starting lineup),
// the weekly head-to-head schedule, and each team's record.
//
// Lazily initializes the season if the draft is complete but rosters /
// matchups have not been seeded yet (covers drafts that finished before this
// feature shipped).
// ────────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const leagueId = BigInt(params.id);

  const league = await queryOne<{
    id: string;
    name: string;
    sport: string;
    status: string;
    is_public: boolean;
    roster_config: any;
    settings: any;
    season_year: number;
  }>(
    `SELECT id::text, name, sport, status, is_public, roster_config, settings, season_year
     FROM dd_leagues WHERE id = $1`,
    [leagueId]
  );

  if (!league) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 });
  }

  const membership = await queryOne<{ id: string }>(
    `SELECT id::text FROM dd_league_members WHERE league_id = $1 AND user_id = $2`,
    [leagueId, BigInt(session.user.id)]
  );

  if (!league.is_public && !membership) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 });
  }

  const rosterConfig: RosterConfig =
    typeof league.roster_config === 'string'
      ? JSON.parse(league.roster_config)
      : league.roster_config;
  const settings =
    typeof league.settings === 'string' ? JSON.parse(league.settings) : (league.settings ?? {});

  // Latest draft.
  const draft = await queryOne<{ id: string; status: string }>(
    `SELECT id::text, status FROM dd_drafts
     WHERE league_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [leagueId]
  );

  // Reconcile a draft that is complete-by-progress but was never marked
  // completed (e.g. the final pick was made before the completion check was
  // fixed). Without this the season would never seed and the head-to-head
  // area would stay empty forever.
  if (draft && draft.status !== 'completed') {
    const state = await loadDraftState(BigInt(draft.id));
    if (state && state.progress.isComplete) {
      try {
        await finalizeDraft(
          BigInt(draft.id),
          leagueId,
          state.draft.roundCount,
          state.draft.numTeams
        );
        draft.status = 'completed';
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[dd] reconcile finalizeDraft failed', err);
      }
    }
  }

  // Lazily seed the season if the draft is done but nothing was created yet.
  if (draft && draft.status === 'completed') {
    const hasRosters = await queryOne<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM dd_rosters WHERE league_id = $1`,
      [leagueId]
    );
    if (Number(hasRosters?.cnt ?? '0') === 0) {
      try {
        await initializeSeason(leagueId, BigInt(draft.id));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[dd] lazy initializeSeason failed', err);
      }
    }
  }

  const membersRes = await query<{
    id: string;
    team_name: string;
    display_name: string | null;
    draft_position: number | null;
    is_bot: boolean;
  }>(
    `SELECT m.id::text, m.team_name, u.display_name, m.draft_position,
            (u.password_hash = 'bot_no_login') AS is_bot
     FROM dd_league_members m
     JOIN web_users u ON u.id = m.user_id
     WHERE m.league_id = $1
     ORDER BY m.draft_position NULLS LAST, m.joined_at`,
    [leagueId]
  );

  const rostersRes = await query<{
    member_id: string;
    player_name: string;
    player_id: string | null;
    team: string | null;
    position: string | null;
    sport: string | null;
    slot: string | null;
    projected_points: string | null;
    headshot_url: string | null;
  }>(
    `SELECT r.member_id::text, r.player_name, r.player_id, r.team, r.position, r.sport, r.slot,
            pp.projected_points, pp.headshot_url
     FROM dd_rosters r
     LEFT JOIN dd_player_pool pp
       ON pp.player_name = r.player_name AND pp.sport = r.sport
     WHERE r.league_id = $1
     ORDER BY r.member_id, r.slot`,
    [leagueId]
  );

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

  // Group rosters by member.
  const rosterByMember: Record<string, any[]> = {};
  for (const r of rostersRes.rows) {
    (rosterByMember[r.member_id] ??= []).push({
      playerName: r.player_name,
      playerId: r.player_id,
      team: r.team,
      position: r.position,
      sport: r.sport,
      slot: r.slot ?? 'BN',
      projectedPoints: r.projected_points != null ? Number(r.projected_points) : 0,
      headshot: r.headshot_url ?? null,
    });
  }

  // Compute records from completed matchups.
  const records: Record<string, { wins: number; losses: number; ties: number; pointsFor: number }> = {};
  for (const m of membersRes.rows) records[m.id] = { wins: 0, losses: 0, ties: 0, pointsFor: 0 };
  for (const g of matchupsRes.rows) {
    if (g.status !== 'completed') continue;
    const hs = g.home_score != null ? Number(g.home_score) : 0;
    const as = g.away_score != null ? Number(g.away_score) : 0;
    if (records[g.home_member_id]) records[g.home_member_id].pointsFor += hs;
    if (records[g.away_member_id]) records[g.away_member_id].pointsFor += as;
    if (g.is_tie) {
      if (records[g.home_member_id]) records[g.home_member_id].ties++;
      if (records[g.away_member_id]) records[g.away_member_id].ties++;
    } else if (g.winner_member_id) {
      const loser = g.winner_member_id === g.home_member_id ? g.away_member_id : g.home_member_id;
      if (records[g.winner_member_id]) records[g.winner_member_id].wins++;
      if (records[loser]) records[loser].losses++;
    }
  }

  const weeks = Number(settings?.seasonWeeks) || defaultSeasonWeeks(league.sport);
  const currentWeek = matchupsRes.rows.length
    ? Math.min(
        weeks,
        Math.max(
          1,
          ...matchupsRes.rows
            .filter((m) => m.status === 'completed')
            .map((m) => m.week_num + 1)
        )
      )
    : 1;

  return NextResponse.json({
    league: {
      id: league.id,
      name: league.name,
      sport: league.sport,
      status: league.status,
      seasonYear: league.season_year,
      lineupSetting: settings?.lineupSetting ?? 'daily',
      rosterConfig,
    },
    draft: draft ? { id: draft.id, status: draft.status } : null,
    members: membersRes.rows.map((m) => ({
      id: m.id,
      teamName: m.team_name,
      displayName: m.display_name ?? m.team_name,
      draftPosition: m.draft_position,
      isBot: m.is_bot,
      record: records[m.id] ?? { wins: 0, losses: 0, ties: 0, pointsFor: 0 },
    })),
    rosters: rosterByMember,
    matchups: matchupsRes.rows.map((g) => ({
      id: g.id,
      week: g.week_num,
      homeMemberId: g.home_member_id,
      awayMemberId: g.away_member_id,
      homeScore: g.home_score != null ? Number(g.home_score) : null,
      awayScore: g.away_score != null ? Number(g.away_score) : null,
      winnerMemberId: g.winner_member_id,
      isTie: g.is_tie,
      status: g.status,
    })),
    weeks,
    currentWeek,
    currentMemberId: membership?.id ?? null,
  });
}
