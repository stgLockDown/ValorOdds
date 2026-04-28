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
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);

  // Match actual database types: bestBets, dailyPicks, depthAnalysis
  const typeFilter = type === 'all'
    ? `analysis_type IN ('bestBets','dailyPicks','depthAnalysis')`
    : `analysis_type = $2`;

  const params: any[] = [limit];
  if (type !== 'all') params.push(type);

  const result = await query(
    `SELECT id, analysis_type, model, content, confidence, generated_at
     FROM ai_analysis
     WHERE ${typeFilter}
     ORDER BY generated_at DESC
     LIMIT $1`,
    params
  );

  return NextResponse.json({ data: result.rows });
}