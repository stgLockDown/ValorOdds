import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPlayerByIdFromPool } from '@/lib/dd/player-pool';
import { getPlayerNews } from '@/lib/espn-news';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/dd/players/[id]/news — ESPN articles relevant to a player
// The [id] is the dd_player_pool id. Returns { player, articles[] }.
// Soft-fails to { articles: [] } so the hover card never breaks.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const poolId = params.id;
  if (!poolId) {
    return NextResponse.json({ error: 'Missing player id' }, { status: 400 });
  }

  try {
    const player = await getPlayerByIdFromPool(poolId);
    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    const articles = await getPlayerNews(player.playerName, player.sport, {
      espnId: player.espnId ?? null,
      limit: 5,
    });

    return NextResponse.json({
      player: {
        id: player.id,
        playerName: player.playerName,
        sport: player.sport,
        team: player.team,
      },
      articles,
    });
  } catch (err) {
    console.error('[player-news] failed:', err);
    return NextResponse.json({ articles: [] });
  }
}
