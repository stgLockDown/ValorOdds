import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'all';
  // Each row's `sports_data` JSONB carries the sport it's actually about
  // (e.g. {"sport": "SOCCER", "home_team": "..."}). Without a sport filter,
  // the feed mixes every sport together, so a card generated for one sport
  // could reference a completely unrelated matchup from another sport in
  // the middle of an otherwise single-sport-focused view (QA audit: "Raw
  // internal data leaking into the AI Best Bets panel" — a mismatched
  // opponent name appearing inside an MLB-focused feed).
  const sport = (searchParams.get('sport') || '').trim().toUpperCase();
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);

  // Match actual database types: bestBets, dailyPicks, depthAnalysis
  const conds: string[] = [
    type === 'all'
      ? `analysis_type IN ('bestBets','dailyPicks','depthAnalysis')`
      : `analysis_type = $${1}`,
  ];
  const params: any[] = [];
  if (type !== 'all') params.push(type);
  if (sport) {
    params.push(sport);
    conds.push(`UPPER(sports_data->>'sport') = $${params.length}`);
  }
  params.push(limit);
  const limitParamIdx = params.length;

  const result = await query(
    `SELECT id, analysis_type, model, content, confidence, sports_data, generated_at
     FROM ai_analysis
     WHERE ${conds.join(' AND ')}
     ORDER BY generated_at DESC
     LIMIT $${limitParamIdx}`,
    params
  );

  return NextResponse.json({ data: result.rows });
}