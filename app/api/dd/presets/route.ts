import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  listRosterPresets,
  listScoringPresets,
  getRosterPreset,
  getScoringPreset,
  DRAFT_TYPES,
  KEEPER_TYPES,
  LEAGUE_FORMATS,
  SEASON_STRUCTURES,
  type Sport,
} from '@/lib/dd/presets';

// ─── GET /api/dd/presets ── Get all sport-specific presets for UI ─────────────
// ?sport=NFL|MLB  (optional — returns both if omitted)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sportParam = searchParams.get('sport') as Sport | null;
  const sports: Sport[] = sportParam ? [sportParam] : ['NFL', 'MLB'];

  const result: Record<string, any> = {};
  for (const sport of sports) {
    result[sport] = {
      rosterPresets: listRosterPresets(sport),
      scoringPresets: listScoringPresets(sport),
      seasonStructure: SEASON_STRUCTURES[sport],
    };
  }

  return NextResponse.json({
    sports: result,
    draftTypes: DRAFT_TYPES,
    keeperTypes: KEEPER_TYPES,
    leagueFormats: LEAGUE_FORMATS,
  });
}
