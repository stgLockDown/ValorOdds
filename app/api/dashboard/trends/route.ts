import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboard/trends
 *
 * Returns categorized betting trends.
 *
 * Query params:
 *   - sport:     filter by sport (NFL, NBA, etc.)
 *   - category:  'recommendations' | 'patterns' | 'recent' (default = combined)
 *   - limit:     max rows per category (default 20, max 50)
 *
 * Response shape:
 *   {
 *     categories: {
 *       hot_trends:       [...]   // high-confidence patterns from trend_analysis
 *       recommendations:  [...]   // from trend_recommendations (AI-generated)
 *       recent_results:   [...]   // raw recent betting_trends rows
 *     },
 *     sport_counts:  { NFL: 12, NBA: 7, ... }  // available counts for filter chips
 *   }
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sport = (searchParams.get('sport') || '').toUpperCase();
  const category = searchParams.get('category') || 'all';
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10) || 20, 50);

  const categories: Record<string, any[]> = {
    hot_trends: [],
    recommendations: [],
    recent_results: [],
  };

  // --------------------------------------------------------
  // 1. HOT TRENDS — high-confidence patterns from trend_analysis
  // --------------------------------------------------------
  if (category === 'all' || category === 'patterns' || category === 'hot_trends') {
    try {
      const params: any[] = [limit];
      let sportClause = '';
      if (sport) { params.push(sport); sportClause = ` AND UPPER(sport) = $${params.length}`; }

      const res = await query(
        `SELECT id, sport, league, market_type, line_range, trend_direction,
                hit_rate, sample_size, streak_current, streak_max,
                confidence_score, recommendation, last_updated
           FROM trend_analysis
          WHERE is_active = TRUE
            AND sample_size >= 10
            AND hit_rate >= 0.60
            ${sportClause}
          ORDER BY confidence_score DESC NULLS LAST, hit_rate DESC
          LIMIT $1`,
        params
      );
      categories.hot_trends = res.rows.map(categorizeTrendRow);
    } catch (_e) {
      // table may not exist yet in dev environments — gracefully empty.
      categories.hot_trends = [];
    }
  }

  // --------------------------------------------------------
  // 2. RECOMMENDATIONS — AI-generated picks grouped by type
  // --------------------------------------------------------
  if (category === 'all' || category === 'recommendations') {
    try {
      const params: any[] = [limit];
      let sportClause = '';
      if (sport) { params.push(sport); sportClause = ` AND UPPER(sport) = $${params.length}`; }

      const res = await query(
        `SELECT id, sport, league, recommendation_type, title, description,
                confidence, suggested_bets, generated_at
           FROM trend_recommendations
          WHERE generated_at > NOW() - INTERVAL '7 days'
            ${sportClause}
          ORDER BY generated_at DESC
          LIMIT $1`,
        params
      );
      categories.recommendations = res.rows.map(normalizeRecommendation);
    } catch (_e) {
      categories.recommendations = [];
    }
  }

  // --------------------------------------------------------
  // 3. RECENT RESULTS — raw betting_trends rows for history
  // --------------------------------------------------------
  if (category === 'all' || category === 'recent' || category === 'recent_results') {
    try {
      const params: any[] = [limit];
      let sportClause = '';
      if (sport) { params.push(sport); sportClause = ` AND UPPER(sport) = $${params.length}`; }

      const res = await query(
        `SELECT sport, league, market_type, team, opponent,
                outcome, event_date, event_name, final_score, created_at
           FROM betting_trends
          WHERE event_date > NOW() - INTERVAL '30 days'
            ${sportClause}
          ORDER BY event_date DESC
          LIMIT $1`,
        params
      );
      categories.recent_results = res.rows;
    } catch (_e) {
      categories.recent_results = [];
    }
  }

  // --------------------------------------------------------
  // Sport counts for filter chips (trend_analysis)
  // --------------------------------------------------------
  let sportCounts: Record<string, number> = {};
  try {
    const counts = await query(
      `SELECT UPPER(sport) AS sport, COUNT(*)::int AS n
         FROM trend_analysis
        WHERE is_active = TRUE AND sample_size >= 10 AND hit_rate >= 0.60
        GROUP BY UPPER(sport)`
    );
    sportCounts = Object.fromEntries(counts.rows.map((r: any) => [r.sport, r.n]));
  } catch (_e) {
    sportCounts = {};
  }

  // Backward-compatible: if the caller expects the old flat `data` shape,
  // return the recent results there as well.
  return NextResponse.json({
    categories,
    sport_counts: sportCounts,
    data: categories.recent_results, // legacy compatibility
  });
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function categorizeTrendRow(row: any) {
  // Assign a human-readable category so the UI can group/badge these properly.
  const mk = (row.market_type || '').toLowerCase();
  let category = 'General';
  if (/^spread|point.?spread|ats/.test(mk)) category = 'ATS';
  else if (/^total|over.?under|o\/u|ou/.test(mk)) category = 'Totals';
  else if (/^moneyline|ml|win/.test(mk)) category = 'Moneyline';
  else if (/first.?half|halftime|first.?quarter|1h|2h|1q/.test(mk)) category = 'Live / Period';
  else if (/player|prop/.test(mk)) category = 'Player Props';
  else if (/team.?total/.test(mk)) category = 'Team Totals';
  return { ...row, category };
}

function normalizeRecommendation(row: any) {
  // Parse JSON fields if they arrived as strings.
  let suggestedBets = row.suggested_bets;
  if (typeof suggestedBets === 'string') {
    try { suggestedBets = JSON.parse(suggestedBets); } catch { /* leave as-is */ }
  }
  const type = (row.recommendation_type || 'general').toLowerCase();
  const badge =
    type.includes('best')     ? '🔥 Best Bet'   :
    type.includes('value')    ? '💎 Value'      :
    type.includes('fade')     ? '🚫 Fade Alert' :
    type.includes('streak')   ? '📈 Streak'     :
    type.includes('trap')     ? '⚠️ Trap Line'  :
    '🎯 Pick';
  return { ...row, suggested_bets: suggestedBets, badge };
}