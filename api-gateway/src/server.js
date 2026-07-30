require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const { query, queryOne } = require('./db');
const { PRODUCT_BACKENDS, SPORT_PRODUCT_CODES } = require('./productMap');
const {
  authenticateKey,
  planHasProduct,
  consumePings,
  logUsageEvent,
} = require('./quota');
const intelligenceRouter = require('./intelligence');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

const GATEWAY_INTERNAL_KEY = process.env.GATEWAY_INTERNAL_KEY || '';

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'valorodds-api-gateway' }));

// Public catalog — which products exist / are enabled for purchase.
app.get('/v1/catalog', async (req, res) => {
  try {
    const products = await query(
      `SELECT code, name, category, ping_weight, addon_monthly_price_cents,
              standalone_monthly_price_cents, standalone_monthly_pings
       FROM api_products WHERE active = true ORDER BY sort_order`
    );
    const tiers = await query(
      `SELECT code, name, monthly_pings, monthly_price_cents
       FROM api_ping_tiers WHERE active = true ORDER BY sort_order`
    );
    res.json({ products: products.rows, ping_tiers: tiers.rows });
  } catch (err) {
    console.error('[catalog] error', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * Main proxy route: /v1/proxy/:product/*
 * Customer calls e.g. GET /v1/proxy/baseball/v1/leagues with X-API-Key header.
 * Gateway: authenticates key -> checks product entitlement -> checks/consumes
 * quota -> proxies to the real backend service -> logs usage.
 */
app.all('/v1/proxy/:product/*', async (req, res) => {
  const { product } = req.params;
  const rawKey = req.header('X-API-Key');
  const subPath = req.params[0] || '';

  if (!PRODUCT_BACKENDS[product]) {
    return res.status(404).json({ error: 'unknown_product', product });
  }

  // Intelligence products have null backends — they use /v1/intelligence/* routes.
  if (PRODUCT_BACKENDS[product] === null) {
    return res.status(404).json({
      error: 'wrong_endpoint',
      message: `Product "${product}" is served at /v1/intelligence/${product.replace(/_/g, '-')}, not /v1/proxy/${product}.`,
      correct_path: `/v1/intelligence/${product.replace(/_/g, '-')}`,
    });
  }

  if (!rawKey) {
    return res.status(401).json({ error: 'missing_api_key' });
  }

  let plan;
  try {
    plan = await authenticateKey(rawKey);
  } catch (err) {
    console.error('[auth] db error', err);
    return res.status(500).json({ error: 'internal_error' });
  }
  if (!plan) {
    return res.status(401).json({ error: 'invalid_or_inactive_api_key' });
  }

  let hasAccess;
  try {
    hasAccess = await planHasProduct(plan, product);
  } catch (err) {
    console.error('[entitlement] db error', err);
    return res.status(500).json({ error: 'internal_error' });
  }
  if (!hasAccess) {
    return res.status(403).json({
      error: 'product_not_in_plan',
      message: `Your plan does not include access to "${product}". Add it in your API dashboard.`,
    });
  }

  const productRow = await queryOne(`SELECT ping_weight FROM api_products WHERE code = $1`, [product]);
  const weight = productRow ? Number(productRow.ping_weight) : 1;

  let consumeResult;
  try {
    consumeResult = await consumePings(plan, weight);
  } catch (err) {
    console.error('[quota] db error', err);
    return res.status(500).json({ error: 'internal_error' });
  }

  if (!consumeResult.allowed) {
    logUsageEvent({
      keyId: plan.key_id,
      planId: plan.plan_id,
      productCode: product,
      endpoint: subPath,
      weight,
      statusCode: 429,
    });
    return res.status(429).json({
      error: 'quota_exceeded',
      message:
        'You have used all pings included in your plan this billing period. Upgrade your plan or enable pay-per-overage in your API dashboard to continue.',
      retry_after: 'next_billing_period',
    });
  }

  // Proxy the request to the real backend service.
  const backendHost = PRODUCT_BACKENDS[product];
  const targetUrl = `https://${backendHost}/${subPath}${req.originalUrl.includes('?') ? '?' + req.originalUrl.split('?')[1] : ''}`;

  const backendKey =
    product === 'odds' ? GATEWAY_INTERNAL_KEY : GATEWAY_INTERNAL_KEY; // same internal gateway key registered in every sport schema

  try {
    const backendResp = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'X-API-Key': backendKey,
        'Content-Type': 'application/json',
      },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body || {}),
      timeout: 20000,
    });

    const text = await backendResp.text();
    logUsageEvent({
      keyId: plan.key_id,
      planId: plan.plan_id,
      productCode: product,
      endpoint: subPath,
      weight,
      statusCode: backendResp.status,
    });

    res.status(backendResp.status);
    res.set('X-Pings-Consumed', String(weight));
    res.set('X-Overage-Applied', String(consumeResult.overage));
    const contentType = backendResp.headers.get('content-type') || 'application/json';
    res.set('Content-Type', contentType);
    res.send(text);
  } catch (err) {
    console.error('[proxy] backend fetch failed', product, err.message);
    logUsageEvent({
      keyId: plan.key_id,
      planId: plan.plan_id,
      productCode: product,
      endpoint: subPath,
      weight,
      statusCode: 502,
    });
    res.status(502).json({ error: 'backend_unavailable', product });
  }
});

/**
 * Intelligence product routes — DB-sourced premium feeds (arbitrage,
 * steam-moves, injuries, ai-analysis). These query the ValorOdds Postgres
 * database directly rather than proxying to a backend service.
 *   GET /v1/intelligence/arbitrage
 *   GET /v1/intelligence/steam-moves
 *   GET /v1/intelligence/injuries
 *   GET /v1/intelligence/ai-analysis
 */
app.use('/v1/intelligence', intelligenceRouter);

// Usage snapshot for a given key (used by the customer dashboard indirectly
// via the ValorOdds web app's own /api/api-access/usage route which calls
// this gateway server-to-server, OR queries Postgres directly — see below).
app.get('/v1/usage', async (req, res) => {
  const rawKey = req.header('X-API-Key');
  if (!rawKey) return res.status(401).json({ error: 'missing_api_key' });
  const plan = await authenticateKey(rawKey);
  if (!plan) return res.status(401).json({ error: 'invalid_or_inactive_api_key' });

  const { currentPeriodBounds } = require('./quota');
  const { periodStart } = currentPeriodBounds();
  const period = await queryOne(
    `SELECT * FROM api_key_usage_periods WHERE plan_id = $1 AND period_start = $2`,
    [plan.plan_id, periodStart]
  );
  res.json({
    plan_type: plan.plan_type,
    all_access: plan.all_access,
    odds_addon: plan.odds_addon,
    overage_enabled: plan.overage_enabled,
    period: period || { pings_included: 0, pings_used: 0, overage_pings: 0 },
  });
});

const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
  console.log(`[api-gateway] listening on :${PORT}`);
});
