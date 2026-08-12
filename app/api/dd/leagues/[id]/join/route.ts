import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne, tx } from '@/lib/db';
import { awardXp } from '@/lib/dd/gamification';

// ─── POST /api/dd/leagues/[id]/join ── Join league (by invite code or public) ─
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = BigInt(session.user.id);
  const leagueId = BigInt(params.id);
  const body = await req.json().catch(() => ({}));

  const league = await queryOne<{
    id: string; name: string; sport: string; commissioner_id: string;
    is_public: boolean; invite_code: string; num_teams: number;
    status: string; scoring_preset: string; roster_preset: string;
    season_year: number;
  }>(
    `SELECT id::text, name, sport, commissioner_id::text, is_public, invite_code,
            num_teams, status, scoring_preset, roster_config->>'name' AS roster_preset, season_year
     FROM dd_leagues WHERE id = $1`,
    [leagueId]
  );

  if (!league) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 });
  }

  // Only allow joining during recruiting or pre_draft
  if (league.status !== 'recruiting' && league.status !== 'pre_draft') {
    return NextResponse.json({ error: 'This league is no longer accepting new members' }, { status: 409 });
  }

  // Verify invite code for private leagues
  if (!league.is_public) {
    if (body.inviteCode !== league.invite_code) {
      return NextResponse.json({ error: 'Invalid or missing invite code' }, { status: 403 });
    }
  }

  // Check if already a member
  const existing = await queryOne<{ id: string }>(
    `SELECT id::text FROM dd_league_members WHERE league_id = $1 AND user_id = $2`,
    [leagueId, userId]
  );
  if (existing) {
    return NextResponse.json({ error: 'You are already a member of this league' }, { status: 409 });
  }

  // Check league is full
  const memberCount = await queryOne<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM dd_league_members WHERE league_id = $1`,
    [leagueId]
  );
  const currentCount = BigInt(memberCount?.cnt ?? '0');
  if (currentCount >= BigInt(league.num_teams)) {
    return NextResponse.json({ error: 'League is full' }, { status: 409 });
  }

  // Determine team name: use provided, or user's display name + "'s Team"
  const userRow = await queryOne<{ display_name: string | null; email: string }>(
    `SELECT display_name, email FROM web_users WHERE id = $1`,
    [userId]
  );
  const teamName = body.teamName?.trim() || userRow?.display_name || (userRow?.email?.split('@')[0] ?? 'Team') + "'s Team";

  // Assign next draft position (1-indexed, based on current count)
  const draftPosition = Number(currentCount) + 1;

  const xpResult = await awardXp(session.user.id, 'join_league', {
    leagueId: league.id,
    metadata: { leagueName: league.name },
  });

  await tx(async (client) => {
    await client.query(
      `INSERT INTO dd_league_members (league_id, user_id, team_name, is_commissioner, draft_position, faab_budget)
       VALUES ($1, $2, $3, false, $4, 100)`,
      [leagueId, userId, teamName, draftPosition]
    );

    // If league is now full, mark as pre_draft
    if (draftPosition >= league.num_teams) {
      await client.query(
        `UPDATE dd_leagues SET status = 'pre_draft', updated_at = NOW() WHERE id = $1`,
        [leagueId]
      );
    }
  });

  return NextResponse.json({
    success: true,
    teamName,
    draftPosition,
    xpAwarded: xpResult.awarded,
    leveledUp: xpResult.leveledUp,
    newLevel: xpResult.newLevel,
    newBadges: xpResult.newBadges,
  });
}
