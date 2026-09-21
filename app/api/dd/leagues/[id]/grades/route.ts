import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { computeLeagueGrades, type GradePlayer } from '@/lib/dd/team-grades';
import type { RosterConfig, Sport } from '@/lib/dd/presets';

// ────────────────────────────────────────────────────────────────────────────
// GET /api/dd/leagues/[id]/grades
//
// Post-draft AI analytics. Returns a full team-vs-team grade report:
//   • each team's optimal starting lineup + projected points
//   • a letter grade + rank for every team
//   • per-position strengths & weaknesses vs the league average
//   • the AI's pick for the best roster, plus a written summary
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
    is_public: boolean;
    roster_config: any;
    season_year: number;
  }>(
    `SELECT id::text, name, sport, is_public, roster_config, season_year
     FROM dd_leagues WHERE id = $1`,
    [leagueId]
  );

  if (!league) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 });
  }

  // Private leagues are members-only.
  if (!league.is_public) {
    const membership = await queryOne<{ id: string }>(
      `SELECT id::text FROM dd_league_members WHERE league_id = $1 AND user_id = $2`,
      [leagueId, BigInt(session.user.id)]
    );
    if (!membership) {
      return NextResponse.json({ error: 'League not found' }, { status: 404 });
    }
  }

  const rosterConfig: RosterConfig =
    typeof league.roster_config === 'string'
      ? JSON.parse(league.roster_config)
      : league.roster_config;

  // Members (with bot detection).
  const membersRes = await query<{
    id: string;
    team_name: string;
    display_name: string | null;
    is_bot: boolean;
  }>(
    `SELECT m.id::text, m.team_name, u.display_name,
            (u.password_hash = 'bot_no_login') AS is_bot
     FROM dd_league_members m
     JOIN web_users u ON u.id = m.user_id
     WHERE m.league_id = $1
     ORDER BY m.draft_position NULLS LAST, m.joined_at`,
    [leagueId]
  );

  // Latest draft for the league.
  const draft = await queryOne<{ id: string; status: string }>(
    `SELECT id::text, status FROM dd_drafts
     WHERE league_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [leagueId]
  );

  if (!draft) {
    return NextResponse.json({
      grades: null,
      message: 'No draft has been started for this league yet.',
    });
  }

  // Every pick, joined to the pool for projections + eligibility.
  // NOTE: dd_draft_picks.player_id stores the ESPN athlete id, which is NOT
  // dd_player_pool.id — the reliable join key is (player_name, sport).
  const picksRes = await query<{
    member_id: string;
    player_name: string;
    position: string | null;
    team: string | null;
    sport: string | null;
    projected_points: string | null;
    eligible_pos: string[] | null;
    rank: number | null;
    adp: string | null;
    headshot_url: string | null;
  }>(
    `SELECT dp.member_id::text, dp.player_name, dp.position, dp.team, dp.sport,
            pp.projected_points, pp.eligible_pos, pp.rank, pp.adp, pp.headshot_url
     FROM dd_draft_picks dp
     LEFT JOIN dd_player_pool pp
       ON pp.player_name = dp.player_name
      AND pp.sport = dp.sport
     WHERE dp.draft_id = $1
     ORDER BY dp.overall_pick`,
    [BigInt(draft.id)]
  );

  // Group picks by member.
  const byMember = new Map<string, GradePlayer[]>();
  for (const m of membersRes.rows) byMember.set(m.id, []);

  picksRes.rows.forEach((p, idx) => {
    const list = byMember.get(p.member_id);
    if (!list) return;
    const position = p.position ?? 'BN';
    list.push({
      key: `${p.member_id}-${idx}`,
      name: p.player_name,
      position,
      eligible: Array.isArray(p.eligible_pos) ? p.eligible_pos : [position],
      team: p.team,
      projectedPoints: p.projected_points != null ? Number(p.projected_points) : 0,
      rank: p.rank ?? null,
      adp: p.adp != null ? Number(p.adp) : null,
      headshot: p.headshot_url ?? null,
    });
  });

  const grades = computeLeagueGrades(
    league.sport as Sport,
    rosterConfig,
    membersRes.rows.map((m) => ({
      memberId: m.id,
      teamName: m.team_name,
      displayName: m.display_name ?? m.team_name,
      isBot: m.is_bot,
      players: byMember.get(m.id) ?? [],
    }))
  );

  return NextResponse.json({
    league: {
      id: league.id,
      name: league.name,
      sport: league.sport,
      seasonYear: league.season_year,
    },
    draft: { id: draft.id, status: draft.status },
    grades,
  });
}
