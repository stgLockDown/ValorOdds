import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne, tx } from '@/lib/db';
import { ensurePlayerPool } from '@/lib/dd/player-pool';

// ─── GET /api/dd/leagues/[id] ── League detail (members, draft summary) ───────
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = BigInt(session.user.id);
  const leagueId = BigInt(params.id);

  const league = await queryOne<{
    id: string; name: string; sport: string; commissioner_id: string;
    format: string; scoring_preset: string; roster_preset: string;
    num_teams: number; status: string; season_year: number;
    is_public: boolean; invite_code: string; settings: any;
    keeper_type: string; draft_type: string;
    created_at: string;
  }>(
    `SELECT id::text, name, sport, commissioner_id::text, format, scoring_preset,
            roster_config->>'name' AS roster_preset,
            num_teams, status, season_year, is_public, invite_code,
            settings, keeper_type, settings->>'draftType' AS draft_type, created_at
     FROM dd_leagues WHERE id = $1`,
    [leagueId]
  );

  if (!league) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 });
  }

  const membership = await queryOne<{ id: string; is_commissioner: boolean }>(
    `SELECT id::text, is_commissioner FROM dd_league_members
     WHERE league_id = $1 AND user_id = $2`,
    [leagueId, userId]
  );

  // Restrict private leagues to members
  if (!league.is_public && !membership) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 });
  }

  const membersRes = await query<{
    id: string; user_id: string; team_name: string; is_commissioner: boolean;
    draft_position: number | null; joined_at: string;
    display_name: string | null; email: string;
  }>(
    `SELECT m.id::text, m.user_id::text, m.team_name, m.is_commissioner,
            m.draft_position, m.joined_at,
            u.display_name, u.email
     FROM dd_league_members m
     JOIN web_users u ON u.id = m.user_id
     WHERE m.league_id = $1
     ORDER BY m.is_commissioner DESC, m.draft_position NULLS LAST, m.joined_at`,
    [leagueId]
  );

  const draftRes = await queryOne<{
    id: string; status: string; draft_type: string; current_round: number;
    current_pick: number; timer_seconds: number | null;
  }>(
    `SELECT id::text, status, draft_type, current_round, current_pick, pick_timer_seconds AS timer_seconds
     FROM dd_drafts WHERE league_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [leagueId]
  );

  return NextResponse.json({
    league: {
      ...league,
      commissioner_id: league.commissioner_id,
    },
    members: membersRes.rows.map((m) => ({
      id: m.id,
      userId: m.user_id,
      teamName: m.team_name,
      isCommissioner: m.is_commissioner,
      draftPosition: m.draft_position,
      joinedAt: m.joined_at,
      displayName: m.display_name ?? m.email.split('@')[0],
    })),
    draft: draftRes ?? null,
    membership: membership
      ? { id: membership.id, isCommissioner: membership.is_commissioner }
      : null,
    isCommissioner:
      league.commissioner_id === String(userId) || membership?.is_commissioner,
  });
}

// ─── PATCH /api/dd/leagues/[id] ── Commissioner updates league settings ───────
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = BigInt(session.user.id);
  const leagueId = BigInt(params.id);
  const body = await req.json();

  // Verify commissioner
  const league = await queryOne<{
    commissioner_id: string; status: string; sport: string; season_year: number;
  }>(
    `SELECT commissioner_id::text, status, sport, season_year FROM dd_leagues WHERE id = $1`,
    [leagueId]
  );

  if (!league) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 });
  }

  const isComm =
    league.commissioner_id === String(userId) ||
    (await queryOne<{ id: string }>(
      `SELECT id::text FROM dd_league_members WHERE league_id = $1 AND user_id = $2 AND is_commissioner = true`,
      [leagueId, userId]
    )) != null;

  if (!isComm) {
    return NextResponse.json({ error: 'Only the commissioner can update the league' }, { status: 403 });
  }

  // Only allow updates if league is in pre-draft or recruiting state
  if (league.status !== 'recruiting' && league.status !== 'pre_draft') {
    return NextResponse.json({ error: 'League settings are locked after draft begins' }, { status: 409 });
  }

  // Whitelist updatable fields
  const updates: string[] = [];
  const values: any[] = [];
  let idx = 1;

  const allowed = ['name', 'is_public', 'num_teams', 'settings'];
  for (const field of allowed) {
    if (body[field] !== undefined) {
      if (field === 'num_teams') {
        const nt = Number(body[field]);
        if (nt < 2 || nt > 20) {
          return NextResponse.json({ error: 'Teams must be between 2 and 20' }, { status: 400 });
        }
        // Check current member count
        const count = await queryOne<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt FROM dd_league_members WHERE league_id = $1`,
          [leagueId]
        );
        if (BigInt(count?.cnt ?? '0') > BigInt(nt)) {
          return NextResponse.json({ error: 'Cannot reduce teams below current member count' }, { status: 400 });
        }
        updates.push(`num_teams = $${idx++}`);
        values.push(nt);
      } else if (field === 'settings') {
        updates.push(`settings = $${idx++}::jsonb`);
        values.push(JSON.stringify(body[field]));
      } else {
        updates.push(`${field} = $${idx++}`);
        values.push(body[field]);
      }
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  values.push(leagueId);

  await tx(async (client) => {
    await client.query(
      `UPDATE dd_leagues SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx}`,
      values
    );
  });

  return NextResponse.json({ success: true });
}

// ─── DELETE /api/dd/leagues/[id] ── Commissioner deletes (disbands) league ────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = BigInt(session.user.id);
  const leagueId = BigInt(params.id);

  const league = await queryOne<{ commissioner_id: string; status: string }>(
    `SELECT commissioner_id::text, status FROM dd_leagues WHERE id = $1`,
    [leagueId]
  );

  if (!league) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 });
  }

  if (league.commissioner_id !== String(userId)) {
    return NextResponse.json({ error: 'Only the commissioner can disband the league' }, { status: 403 });
  }

  // Only allow deletion if no draft has started
  if (league.status === 'drafting' || league.status === 'in_season' || league.status === 'completed') {
    return NextResponse.json({ error: 'Cannot disband a league that is in progress' }, { status: 409 });
  }

  await tx(async (client) => {
    // Cascade delete handles child tables via FK constraints
    await client.query(`DELETE FROM dd_leagues WHERE id = $1`, [leagueId]);
  });

  return NextResponse.json({ success: true });
}
