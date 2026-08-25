import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPlayerInfo } from '@/lib/dd/player-info';
import type { Sport } from '@/lib/dd/presets';

// ─── GET /api/dd/players/[id]/info ─── Full player info for hover card ────
// Returns bio, career stats, and AI analytics for a player.
// The [id] is the dd_player_pool id.
export async function GET(
  req: NextRequest,
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

  // Optional: allow lookup by sport + playerName instead of poolId
  const { searchParams } = new URL(req.url);
  const sport = searchParams.get('sport') as Sport | null;
  const seasonYear = searchParams.get('seasonYear');
  const playerName = searchParams.get('playerName');

  let info;
  if (sport && seasonYear && playerName && poolId === 'lookup') {
    info = await getPlayerInfo({
      sport,
      seasonYear: parseInt(seasonYear, 10),
      playerName,
    });
  } else {
    info = await getPlayerInfo({ poolId });
  }

  if (!info) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  return NextResponse.json(info);
}
