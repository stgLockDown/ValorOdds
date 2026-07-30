/**
 * Intelligence product routes — DB-sourced premium feeds.
 *
 * Unlike the 26 sport APIs (which proxy to separate Railway backend services),
 * these four products query the ValorOdds Postgres database directly:
 *
 *   /v1/intelligence/arbitrage     — sure-bet opportunities from custom_api_compare
 *   /v1/intelligence/steam-moves   — line-movement alerts from steam_moves
 *   /v1/intelligence/injuries      — injury reports from injuries
 *   /v1/intelligence/ai-analysis   — GPT-4o betting analysis from ai_analysis
 *
 * Each route follows the same flow as the proxy:
 *   authenticate key → check product entitlement → consume pings → query DB → respond
 *
 * The product codes ('arbitrage', 'steam_moves', 'injuries', 'ai_analysis')
 * are registered in api_products (migration 005) and in productMap.js so the
 * existing entitlement / quota machinery works uniformly.
 */
const express = require('express');
const { query } = require('./db');
const {
  authenticateKey,
  planHasProduct,
  consumePings,
  logUsageEvent,
} = require('./quota');

const router = express.Router();

// ---------------------------------------------------------------------------
// Shared middleware: authenticate + entitlement check + ping consumption.
// Returns { plan, weight } on success, or sends an error response and returns
// null on failure.
// ---------------------------------------------------------------------------
async function gate(req, res, productCode) {
  const rawKey = req.header('X-API-Key');
  if (!rawKey) {
    res.status(401).json({ error: 'missing_api_key' });
    return null;
  }

  let plan;
  try {
    plan = await authenticateKey(rawKey);
  } catch (err) {
    console.error('[intel] auth db error', err);
    res.status(500).json({ error: 'internal_error' });
    return null;
  }
  if (!plan) {
    res.status(401).json({ error: 'invalid_or_inactive_api_key' });
    return null;
  }

  let hasAccess;
  try {
    hasAccess = await planHasProduct(plan, productCode);
  } catch (err) {
    console.error('[intel] entitlement db error', err);
    res.status(500).json({ error: 'internal_error' });
    return null;
  }
  if (!hasAccess) {
    res.status(403).json({
      error: 'product_not_in_plan',
      message: `Your plan does not include access to "${productCode}". Add it in your API dashboard.`,
    });
    return null;
  }

  // Look up the ping weight for this product from api_products.
  const productRow = await query(
    `SELECT ping_weight FROM api_products WHERE code = $1`,
    [productCode]
  );
  const weight = productRow.rows[0] ? Number(productRow.rows[0].ping_weight) : 5;

  let consumeResult;
  try {
    consumeResult = await consumePings(plan, weight);
  } catch (err) {
    console.error('[intel] quota db error', err);
    res.status(500).json({ error: 'internal_error' });
    return null;
  }

  if (!consumeResult.allowed) {
    logUsageEvent({
      keyId: plan.key_id,
      planId: plan.plan_id,
      productCode,
      endpoint: req.path,
      weight,
      statusCode: 429,
    });
    res.status(429).json({
      error: 'quota_exceeded',
      message:
        'You have used all pings included in your plan this billing period. Upgrade your plan or enable pay-per-overage in your API dashboard to continue.',
      retry_after: 'next_billing_period',
    });
    return null;
  }

  res.set('X-Pings-Consumed', String(weight));
  res.set('X-Overage-Applied', String(consumeResult.overage));

  return { plan, weight };
}

// Helper to parse positive int query param with a default and max cap.
function posInt(req, key, def, max) {
  const v = parseInt(req.query[key], 10);
  if (!v || Number.isNaN(v) || v < 1) return def;
  return Math.min(v, max);
}

function posFloat(req, key, def) {
  const v = parseFloat(req.query[key]);
  if (Number.isNaN(v)) return def;
  return v;
}

// ===========================================================================
// GET /v1/intelligence/arbitrage
//   Query params:
//     sport     — filter by sport (e.g. "soccer", case-insensitive)
//     min_profit — minimum profit percentage (default 0)
//     limit     — max results (default 50, max 200)
//     stake     — bankroll for stake calculation (default 100, max 1000000)
//     window    — lookback in minutes (default 35, max 1440)
// ===========================================================================
router.get('/arbitrage', async (req, res) => {
  const g = await gate(req, res, 'arbitrage');
  if (!g) return;

  const sport = (req.query.sport || '').trim();
  const minProfit = posFloat(req, 'min_profit', 0);
  const limit = posInt(req, 'limit', 50, 200);
  const stakeTotal = Math.min(Math.max(1, posFloat(req, 'stake', 100)), 1_000_000);
  const windowMin = Math.min(Math.max(1, posInt(req, 'window', 35, 1440)), 1440);

  const params = [minProfit, limit, windowMin];
  let sportFilter = '';
  if (sport) {
    params.push(sport);
    sportFilter = `AND UPPER(sport) = UPPER($${params.length})`;
  }

  try {
    const result = await query(
      `SELECT id, sport, event_name, home_team, away_team,
              best_home_odds, best_home_book,
              best_away_odds, best_away_book,
              best_draw_odds, best_draw_book,
              implied_total, is_arbitrage, profit_percentage,
              raw_data, fetched_at
       FROM custom_api_compare
       WHERE is_arbitrage = TRUE
         AND profit_percentage >= $1
         AND fetched_at > NOW() - ($3 || ' minutes')::interval
         ${sportFilter}
       ORDER BY profit_percentage DESC NULLS LAST
       LIMIT $2`,
      params
    );

    const data = result.rows.map((r) => {
      const raw =
        typeof r.raw_data === 'string' ? safeJson(r.raw_data) : r.raw_data;
      const stakes = computeStakes(
        Number(r.best_home_odds),
        Number(r.best_away_odds),
        stakeTotal
      );
      return {
        id: r.id,
        sport: r.sport,
        event_name: r.event_name,
        home_team: r.home_team,
        away_team: r.away_team,
        best_home_odds: Number(r.best_home_odds),
        best_home_book: r.best_home_book,
        best_away_odds: Number(r.best_away_odds),
        best_away_book: r.best_away_book,
        best_draw_odds: r.best_draw_odds ? Number(r.best_draw_odds) : null,
        best_draw_book: r.best_draw_book || null,
        implied_total: r.implied_total ? Number(r.implied_total) : null,
        profit_percentage: Number(r.profit_percentage),
        stake_total: stakeTotal,
        side1_stake: stakes?.side1_stake ?? null,
        side2_stake: stakes?.side2_stake ?? null,
        guaranteed_profit: stakes?.guaranteed_profit ?? null,
        payout: stakes?.payout ?? null,
        all_odds: raw?.all_odds ?? null,
        market: raw?.market ?? null,
        detected_at: r.fetched_at,
      };
    });

    finishOk(req, res, g, 'arbitrage', { count: data.length, data });
  } catch (err) {
    console.error('[intel/arbitrage] query error', err);
    finishErr(req, res, g, 'arbitrage', 500, { error: 'internal_error' });
  }
});

// ===========================================================================
// GET /v1/intelligence/steam-moves
//   Query params:
//     sport     — filter by sport (case-insensitive)
//     direction — 'UP' or 'DOWN' (optional)
//     market    — market type e.g. 'spreads', 'totals' (optional)
//     min_books — minimum books_moved (default 1)
//     limit     — max results (default 50, max 200)
//     window    — lookback in minutes (default 60, max 1440)
// ===========================================================================
router.get('/steam-moves', async (req, res) => {
  const g = await gate(req, res, 'steam_moves');
  if (!g) return;

  const sport = (req.query.sport || '').trim();
  const direction = (req.query.direction || '').trim().toUpperCase();
  const market = (req.query.market || '').trim();
  const minBooks = posInt(req, 'min_books', 1, 100);
  const limit = posInt(req, 'limit', 50, 200);
  const windowMin = Math.min(Math.max(1, posInt(req, 'window', 60, 1440)), 1440);

  const params = [minBooks, limit, windowMin];
  const filters = [`books_moved >= $1`, `detected_at > NOW() - ($3 || ' minutes')::interval`];
  if (sport) {
    params.push(sport);
    filters.push(`UPPER(sport) = UPPER($${params.length})`);
  }
  if (direction && ['UP', 'DOWN'].includes(direction)) {
    params.push(direction);
    filters.push(`direction = $${params.length}`);
  }
  if (market) {
    params.push(market);
    filters.push(`LOWER(market_type) = LOWER($${params.length})`);
  }

  try {
    const result = await query(
      `SELECT id, sport, game_id, home_team, away_team,
              market_type, outcome_name,
              before_avg_price, after_avg_price,
              before_avg_point, after_avg_point,
              books_moved, total_books,
              window_seconds, direction, detected_at
       FROM steam_moves
       WHERE ${filters.join(' AND ')}
       ORDER BY detected_at DESC
       LIMIT $2`,
      params
    );

    const data = result.rows.map((r) => ({
      id: r.id,
      sport: r.sport,
      game_id: r.game_id,
      home_team: r.home_team,
      away_team: r.away_team,
      market_type: r.market_type,
      outcome_name: r.outcome_name,
      before_avg_price: r.before_avg_price != null ? Number(r.before_avg_price) : null,
      after_avg_price: r.after_avg_price != null ? Number(r.after_avg_price) : null,
      before_avg_point: r.before_avg_point != null ? Number(r.before_avg_point) : null,
      after_avg_point: r.after_avg_point != null ? Number(r.after_avg_point) : null,
      price_movement:
        r.before_avg_price != null && r.after_avg_price != null
          ? Number(r.after_avg_price) - Number(r.before_avg_price)
          : null,
      books_moved: r.books_moved,
      total_books: r.total_books,
      window_seconds: r.window_seconds,
      direction: r.direction,
      detected_at: r.detected_at,
    }));

    finishOk(req, res, g, 'steam_moves', { count: data.length, data });
  } catch (err) {
    console.error('[intel/steam-moves] query error', err);
    finishErr(req, res, g, 'steam_moves', 500, { error: 'internal_error' });
  }
});

// ===========================================================================
// GET /v1/intelligence/injuries
//   Query params:
//     sport     — filter by sport (e.g. "MLB", "NBA", case-insensitive)
//     team      — filter by team name (case-insensitive partial match)
//     status    — filter by status (e.g. "Day-To-Day", "Out", "IL")
//     limit     — max results (default 50, max 200)
//     window    — lookback in hours (default 48, max 720 = 30 days)
// ===========================================================================
router.get('/injuries', async (req, res) => {
  const g = await gate(req, res, 'injuries');
  if (!g) return;

  const sport = (req.query.sport || '').trim();
  const team = (req.query.team || '').trim();
  const status = (req.query.status || '').trim();
  const limit = posInt(req, 'limit', 50, 200);
  const windowHours = Math.min(Math.max(1, posInt(req, 'window', 48, 720)), 720);

  const params = [limit, windowHours];
  const filters = [`fetched_at > NOW() - ($2 || ' hours')::interval`];
  if (sport) {
    params.push(sport);
    filters.push(`UPPER(sport) = UPPER($${params.length})`);
  }
  if (team) {
    params.push(`%${team}%`);
    filters.push(`team ILIKE $${params.length}`);
  }
  if (status) {
    params.push(status);
    filters.push(`UPPER(status) = UPPER($${params.length})`);
  }

  try {
    const result = await query(
      `SELECT id, sport, player_name, team, position, status,
              injury_type, description, source, reported_date, fetched_at
       FROM injuries
       WHERE ${filters.join(' AND ')}
       ORDER BY fetched_at DESC, reported_date DESC NULLS LAST
       LIMIT $1`,
      params
    );

    const data = result.rows.map((r) => ({
      id: r.id,
      sport: r.sport,
      player_name: r.player_name,
      team: r.team,
      position: r.position,
      status: r.status,
      injury_type: r.injury_type,
      description: r.description,
      source: r.source,
      reported_date: r.reported_date,
      fetched_at: r.fetched_at,
    }));

    finishOk(req, res, g, 'injuries', { count: data.length, data });
  } catch (err) {
    console.error('[intel/injuries] query error', err);
    finishErr(req, res, g, 'injuries', 500, { error: 'internal_error' });
  }
});

// ===========================================================================
// GET /v1/intelligence/ai-analysis
//   Query params:
//     analysis_type — filter (default 'depthAnalysis')
//     model         — filter by model (e.g. 'gpt-4o')
//     limit         — max results (default 20, max 100)
//     include_content — 'true' to include full markdown content (default true)
//     include_sports_data — 'true' to include the sports_data JSONB (default false)
// ===========================================================================
router.get('/ai-analysis', async (req, res) => {
  const g = await gate(req, res, 'ai_analysis');
  if (!g) return;

  const analysisType = (req.query.analysis_type || 'depthAnalysis').trim();
  const model = (req.query.model || '').trim();
  const limit = posInt(req, 'limit', 20, 100);
  const includeContent = (req.query.include_content || 'true').toLowerCase() !== 'false';
  const includeSportsData = (req.query.include_sports_data || 'false').toLowerCase() === 'true';

  const params = [analysisType, limit];
  const filters = [`analysis_type = $1`];
  if (model) {
    params.push(model);
    filters.push(`model = $${params.length}`);
  }

  const contentSelect = includeContent ? 'content' : 'NULL as content';
  const sportsDataSelect = includeSportsData ? 'sports_data' : 'NULL as sports_data';

  try {
    const result = await query(
      `SELECT id, analysis_type, model,
              ${contentSelect},
              ${sportsDataSelect},
              confidence, generated_at
       FROM ai_analysis
       WHERE ${filters.join(' AND ')}
       ORDER BY generated_at DESC
       LIMIT $2`,
      params
    );

    const data = result.rows.map((r) => ({
      id: r.id,
      analysis_type: r.analysis_type,
      model: r.model,
      content: r.content || null,
      sports_data: r.sports_data || null,
      confidence: r.confidence != null ? Number(r.confidence) : null,
      generated_at: r.generated_at,
    }));

    finishOk(req, res, g, 'ai_analysis', { count: data.length, data });
  } catch (err) {
    console.error('[intel/ai-analysis] query error', err);
    finishErr(req, res, g, 'ai_analysis', 500, { error: 'internal_error' });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/** American odds → decimal odds. */
function americanToDecimal(odds) {
  const o = Number(odds);
  if (!o || Number.isNaN(o)) return 0;
  return o > 0 ? o / 100 + 1 : 100 / Math.abs(o) + 1;
}

/** Two-sided arbitrage stake plan for a given total bankroll. */
function computeStakes(homeOdds, awayOdds, total) {
  const decHome = americanToDecimal(homeOdds);
  const decAway = americanToDecimal(awayOdds);
  if (!(decHome > 0) || !(decAway > 0)) return null;
  const totalInverse = 1 / decHome + 1 / decAway;
  if (!(totalInverse > 0)) return null;
  const homeStake = (total / decHome) / totalInverse;
  const awayStake = (total / decAway) / totalInverse;
  const payout = homeStake * decHome;
  const profit = payout - total;
  return {
    side1_stake: Number(homeStake.toFixed(2)),
    side2_stake: Number(awayStake.toFixed(2)),
    payout: Number(payout.toFixed(2)),
    guaranteed_profit: Number(profit.toFixed(2)),
  };
}

function finishOk(req, res, g, productCode, body) {
  logUsageEvent({
    keyId: g.plan.key_id,
    planId: g.plan.plan_id,
    productCode,
    endpoint: req.path,
    weight: g.weight,
    statusCode: 200,
  });
  res.json(body);
}

function finishErr(req, res, g, productCode, status, body) {
  if (g) {
    logUsageEvent({
      keyId: g.plan.key_id,
      planId: g.plan.plan_id,
      productCode,
      endpoint: req.path,
      weight: g.weight,
      statusCode: status,
    });
  }
  res.status(status).json(body);
}

module.exports = router;
