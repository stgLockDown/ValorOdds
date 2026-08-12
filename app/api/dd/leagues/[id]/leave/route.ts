import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { queryOne, tx } from '@/lib/db';

// ─── POST /api/dd/leagues/[id]/leave ── Leave a league ────────────────────────
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = BigInt(session.user.id);
  const leagueId = BigInt(params.id);

  const membership = await queryOne<{
    id: string; is_commissioner: boolean; league_status: string;
  }>(
    `SELECT m.id::text, m.is_commissioner, l.status AS league_status
     FROM dd_league_members m
     JOIN dd_leagues l ON l.id = m.league_id
     WHERE m.league_id = $1 AND m.user_id = $2`,
    [leagueId, userId]
  );

  if (!membership) {
    return NextResponse.json({ error: 'You are not a member of this league' }, { status: 404 });
  }

  // Can't leave once draft has started
  if (membership.league_status === 'drafting' || membership.league_status === 'in_season') {
    return NextResponse.json({ error: 'Cannot leave a league that is in progress' }, { status: 409 });
  }

  const memberCount = await queryOne<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM dd_league_members WHERE league_id = $1`,
    [leagueId]
  );
  const count = Number(memberCount?.cnt ?? '0');

  await tx(async (client) => {
    await client.query(
      `DELETE FROM dd_league_members WHERE league_id = $1 AND user_id = $2`,
      [leagueId, userId]
    );

    // If commissioner leaves, reassign commissioner to earliest remaining member
    if (membership.is_commissioner && count > 1) {
      await client.query(
        `UPDATE dd_league_members SET is_commissioner = true
         WHERE id = (
           SELECT id FROM dd_league_members
           WHERE league_id = $1
           ORDER BY joined_at ASC LIMIT 1
         )`,
        [leagueId]
      );
      // Also update dd_leagues.commissioner_id
      await client.query(
        `UPDATE dd_leagues SET commissioner_id = (
           SELECT user_id FROM dd_league_members
           WHERE league_id = $1
           ORDER BY joined_at ASC LIMIT 1
         ), updated_at = NOW()
         WHERE id = $1`,
        [leagueId]
      );
    } else if (count <= 1) {
      // Last member leaving → disband
      await client.query(`DELETE FROM dd_leagues WHERE id = $1`, [leagueId]);
    } else {
      // Re-number draft positions for remaining members
      await client.query(
        `UPDATE dd_league_members m
         SET draft_position = sub.new_pos
         FROM (
           SELECT id, ROW_NUMBER() OVER (ORDER BY draft_position, joined_at) AS new_pos
           FROM dd_league_members WHERE league_id = $1
         ) sub
         WHERE m.id = sub.id`,
        [leagueId]
      );
      // Move back to recruiting if not full
      await client.query(
        `UPDATE dd_leagues SET status = 'recruiting', updated_at = NOW() WHERE id = $1 AND status = 'pre_draft'`,
        [leagueId]
      );
    }
  });

  return NextResponse.json({ success: true });
}
