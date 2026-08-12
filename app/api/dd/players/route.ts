import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { queryPlayerPool, ensurePlayerPool } from '@/lib/dd/player-pool';
import type { Sport } from '@/lib/dd/presets';

// ─── GET /api/dd/players ── Query player pool (for draft room, research) ──────
// ?sport=NFL|MLB &seasonYear=2024 &position=QB &search=name &excludeDrafted=leagueId
//   &sort=rank|projected_points|adp|name &limit=50 &offset=0
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sport = (searchParams.get('sport') ?? 'MLB') as Sport;
  const seasonYear = parseInt(searchParams.get('seasonYear') ?? '2024', 10);
  const position = searchParams.get('position') ?? undefined;
  const search = searchParams.get('search') ?? undefined;
  const sortBy = (searchParams.get('sort') as any) ?? 'rank';
  const limit = parseInt(searchParams.get('limit') ?? '50', 10);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  // Ensure pool exists (use default scoring preset based on sport)
  const scoringPreset = sport === 'MLB' ? 'standard_points' : 'standard_ppr';
  await ensurePlayerPool(sport, seasonYear, scoringPreset).catch((e) => {
    console.error('[dd/players] ensurePlayerPool error:', e);
  });

  // If excludeDrafted provided, get drafted names for that league
  let excludeNames: string[] | undefined;
  const excludeDraftedParam = searchParams.get('excludeDrafted');
  if (excludeDraftedParam) {
    // We need to query drafted players for this league
    const { query } = await import('@/lib/db');
    const draftedRes = await query<{ player_name: string }>(
      `SELECT DISTINCT p.player_name
       FROM dd_draft_picks p
       JOIN dd_drafts d ON d.id = p.draft_id
       WHERE d.league_id = $1`,
      [BigInt(excludeDraftedParam)]
    );
    excludeNames = draftedRes.rows.map((r) => r.player_name);
  }

  const result = await queryPlayerPool({
    sport,
    seasonYear,
    position,
    search,
    excludeNames,
    sortBy,
    limit,
    offset,
  });

  return NextResponse.json({
    sport,
    seasonYear,
    players: result.players,
    total: result.total,
    limit,
    offset,
  });
}
