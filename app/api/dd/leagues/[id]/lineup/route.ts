import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne, tx } from '@/lib/db';
import type { RosterConfig } from '@/lib/dd/presets';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/dd/leagues/[id]/lineup
//
// Save a team's starting lineup. Body:
//   { assignments: { [playerName]: slot } }
//
// Validates that every assigned slot exists in the league's roster config,
// that the player is eligible for the slot, and that no slot is over-filled.
// Unassigned players fall back to 'BN'.
// ────────────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const leagueId = BigInt(params.id);
  const body = await req.json().catch(() => null);
  const assignments: Record<string, string> = body?.assignments ?? {};

  const league = await queryOne<{ roster_config: any; status: string }>(
    `SELECT roster_config, status FROM dd_leagues WHERE id = $1`,
    [leagueId]
  );
  if (!league) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 });
  }

  const membership = await queryOne<{ id: string }>(
    `SELECT id::text FROM dd_league_members WHERE league_id = $1 AND user_id = $2`,
    [leagueId, BigInt(session.user.id)]
  );
  if (!membership) {
    return NextResponse.json({ error: 'You are not in this league' }, { status: 403 });
  }

  const rosterConfig: RosterConfig =
    typeof league.roster_config === 'string'
      ? JSON.parse(league.roster_config)
      : league.roster_config;
  const slots = rosterConfig?.slots ?? [];

  // Slot lookup + capacity.
  const slotByName = new Map(slots.map((s) => [s.slot, s]));
  const capacity: Record<string, number> = {};
  for (const s of slots) capacity[s.slot] = (capacity[s.slot] ?? 0) + (s.count ?? 0);

  // Load this team's roster.
  const rosterRes = await query<{
    id: string;
    player_name: string;
    position: string | null;
    eligible_pos: string[] | null;
  }>(
    `SELECT r.id::text, r.player_name, r.position, pp.eligible_pos
     FROM dd_rosters r
     LEFT JOIN dd_player_pool pp ON pp.player_name = r.player_name AND pp.sport = r.sport
     WHERE r.league_id = $1 AND r.member_id = $2`,
    [leagueId, BigInt(membership.id)]
  );

  const rosterByName = new Map(rosterRes.rows.map((r) => [r.player_name, r]));

  // Validate assignments.
  const used: Record<string, number> = {};
  const errors: string[] = [];

  for (const [playerName, slot] of Object.entries(assignments)) {
    const row = rosterByName.get(playerName);
    if (!row) {
      errors.push(`${playerName} is not on your roster.`);
      continue;
    }
    const slotDef = slotByName.get(slot);
    if (!slotDef) {
      errors.push(`Unknown lineup slot "${slot}".`);
      continue;
    }
    if (!slotDef.isStarter) {
      errors.push(`"${slot}" is not a starting slot.`);
      continue;
    }
    // Eligibility check.
    const eligible = Array.isArray(row.eligible_pos) && row.eligible_pos.length
      ? row.eligible_pos
      : [row.position ?? ''];
    const fits =
      slotDef.eligible.includes('*') ||
      slotDef.eligible.includes(row.position ?? '') ||
      eligible.some((e) => slotDef.eligible.includes(e));
    if (!fits) {
      errors.push(`${playerName} (${row.position}) is not eligible for ${slot}.`);
      continue;
    }
    used[slot] = (used[slot] ?? 0) + 1;
  }

  for (const [slot, count] of Object.entries(used)) {
    if (count > (capacity[slot] ?? 0)) {
      errors.push(`Too many players assigned to ${slot} (${count}/${capacity[slot] ?? 0}).`);
    }
  }

  if (errors.length) {
    return NextResponse.json({ error: errors.join(' ') }, { status: 400 });
  }

  // Apply: assigned players get their slot, everyone else → BN.
  await tx(async (client) => {
    for (const row of rosterRes.rows) {
      const slot = assignments[row.player_name];
      const target = slot && slotByName.get(slot)?.isStarter ? slot : 'BN';
      await client.query(`UPDATE dd_rosters SET slot = $1 WHERE id = $2`, [
        target,
        BigInt(row.id),
      ]);
    }
  });

  return NextResponse.json({ ok: true, updated: rosterRes.rows.length });
}
