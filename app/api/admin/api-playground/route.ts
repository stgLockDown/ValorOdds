import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { queryOne, query } from '@/lib/db';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/api-playground
 *
 * Admin-only API testing playground. Lets an admin send a real request
 * through the API gateway (or directly to a backend service) and see the
 * raw response — status code, headers, body, and ping cost — without
 * needing to use curl or an external tool.
 *
 * Body:
 *   {
 *     product: string,       // e.g. "baseball", "odds", "arbitrage"
 *     path: string,          // e.g. "v1/games", "v1/odds/nba", "" for intelligence
 *     method: "GET" | "POST",
 *     queryParams?: string,  // raw query string, e.g. "limit=10&league=mlb"
 *     useOwnKey?: boolean,   // if true, use the admin's own API key (tests auth+quota)
 *                            // if false, use the gateway internal key (bypasses auth)
 *   }
 *
 * The admin can choose to test with their own customer API key (to verify
 * the full auth → entitlement → quota → proxy flow) or with the internal
 * gateway key (to test backend services directly without quota concerns).
 */

const GATEWAY_BASE = process.env.NEXT_PUBLIC_API_GATEWAY_URL ||
  'https://api-gateway-production-12e8.up.railway.app';

const Body = z.object({
  product: z.string().min(1).max(50),
  path: z.string().max(500).default(''),
  method: z.enum(['GET', 'POST']).default('GET'),
  queryParams: z.string().max(500).optional().default(''),
  useOwnKey: z.boolean().default(false),
});

// Intelligence products are served at /v1/intelligence/:product, not /v1/proxy
const INTELLIGENCE_PRODUCTS = ['arbitrage', 'steam_moves', 'injuries', 'ai_analysis'];

// Backend service hosts (same as productMap.js in the gateway)
const BACKEND_HOSTS: Record<string, string> = {
  baseball: 'baseball-api-production-3f4f.up.railway.app',
  basketball: 'basketball-api-production-31a7.up.railway.app',
  soccer: 'soccer-api-production-e793.up.railway.app',
  hockey: 'hockey-api-production-8ebd.up.railway.app',
  football: 'football-api-production-fa22.up.railway.app',
  fifa: 'fifa-api-production-7ba9.up.railway.app',
  champions_league: 'championsleague-api-production.up.railway.app',
  tennis: 'tennis-api-production-aa3c.up.railway.app',
  golf: 'golf-api-production-b380.up.railway.app',
  cricket: 'cricket-api-production-74d5.up.railway.app',
  cycling: 'cycling-api-production-b319.up.railway.app',
  combat: 'combat-api-production-15fd.up.railway.app',
  rugby: 'rugby-api-production-07f7.up.railway.app',
  rugby_league: 'rugby-league-api-production-1204.up.railway.app',
  swimming: 'swimming-api-production-6bf6.up.railway.app',
  tour_de_france: 'tour-de-france-api-production-4630.up.railway.app',
  track: 'track-api-production-b3a1.up.railway.app',
  volleyball: 'volleyball-api-production-b6bf.up.railway.app',
  wimbledon: 'wimbledon-api-production-4871.up.railway.app',
  world_series: 'worldseries-api-production.up.railway.app',
  xgames: 'xgames-api-production-f430.up.railway.app',
  motorsports: 'motorsports-api-production-1704.up.railway.app',
  olympics: 'olympics-api-production-a850.up.railway.app',
  march_madness: 'march-madness-api-production-f42e.up.railway.app',
  superbowl: 'superbowl-api-production-e2bb.up.railway.app',
  formula1: 'formula1-api-production-452f.up.railway.app',
  odds: 'sportsbook-api-production-296e.up.railway.app',
};

function gatewayKey(): string {
  const fromEnv = env.gatewayInternalKey();
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return 'gw_LRWpxPvq_aDtb7j6bt6fTu9FMA0DyE_Ewsx9lP0IgyY';
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let input: z.infer<typeof Body>;
  try {
    input = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid input' },
      { status: 400 },
    );
  }

  const { product, path: subPath, method, queryParams, useOwnKey } = input;

  // Determine the API key to use
  let apiKey: string;
  let keySource: string;

  if (useOwnKey) {
    // Find the admin's own active API key (decrypted)
    const plan = await queryOne<{ id: string }>(
      `SELECT p.id::text FROM customer_api_plans p
       WHERE p.user_id = $1::bigint AND p.status IN ('active','trialing','past_due')
       ORDER BY p.id DESC LIMIT 1`,
      [session.user.id],
    );
    if (!plan) {
      return NextResponse.json({
        error: 'You do not have an active API plan. Grant yourself access from the API Monetization dashboard, or test with the internal key instead.',
      }, { status: 400 });
    }

    // Get decrypted key
    const keyRow = await queryOne<{ key_encrypted: string | null }>(
      `SELECT key_encrypted FROM customer_api_keys WHERE plan_id = $1::bigint AND active = true ORDER BY id DESC LIMIT 1`,
      [plan.id],
    );
    if (!keyRow?.key_encrypted) {
      return NextResponse.json({
        error: 'Your API key was issued before encrypted storage was enabled. Regenerate it from your API Dashboard to test with your own key.',
      }, { status: 400 });
    }

    // Decrypt
    const { decryptApiKey } = await import('@/lib/api-monetization/keys');
    const rawKey = decryptApiKey(keyRow.key_encrypted);
    if (!rawKey) {
      return NextResponse.json({ error: 'Failed to decrypt your API key.' }, { status: 500 });
    }
    apiKey = rawKey;
    keySource = 'own-key';
  } else {
    apiKey = gatewayKey();
    keySource = 'internal-key';
  }

  // Build the target URL
  // - Intelligence products → /v1/intelligence/:product
  // - Sport/odds products → /v1/proxy/:product/:path
  let targetUrl: string;
  const cleanPath = subPath.replace(/^\/+/, '');
  const qs = queryParams?.trim() || '';
  const qsPrefixed = qs ? (qs.startsWith('?') ? qs : `?${qs}`) : '';

  if (INTELLIGENCE_PRODUCTS.includes(product)) {
    const intelPath = product.replace(/_/g, '-');
    targetUrl = `${GATEWAY_BASE}/v1/intelligence/${intelPath}${cleanPath ? `/${cleanPath}` : ''}${qsPrefixed}`;
  } else if (product === 'catalog') {
    targetUrl = `${GATEWAY_BASE}/v1/catalog${qsPrefixed}`;
  } else if (product === 'usage') {
    targetUrl = `${GATEWAY_BASE}/v1/usage${qsPrefixed}`;
  } else if (BACKEND_HOSTS[product]) {
    targetUrl = `${GATEWAY_BASE}/v1/proxy/${product}/${cleanPath}${qsPrefixed}`;
  } else {
    return NextResponse.json({ error: `Unknown product: ${product}` }, { status: 400 });
  }

  const startedAt = Date.now();

  try {
    const resp = await fetch(targetUrl, {
      method,
      headers: {
        'X-API-Key': apiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
    });

    const elapsed = Date.now() - startedAt;
    const text = await resp.text();

    // Try to parse as JSON; fall back to raw text
    let body: unknown;
    let isJson = false;
    try {
      body = text ? JSON.parse(text) : null;
      isJson = true;
    } catch {
      body = text;
    }

    // Collect relevant response headers
    const interestingHeaders: Record<string, string> = {};
    const headerNames = ['x-pings-consumed', 'x-overage-applied', 'content-type', 'x-rate-limit-remaining'];
    for (const h of headerNames) {
      const val = resp.headers.get(h);
      if (val) interestingHeaders[h] = val;
    }

    return NextResponse.json({
      ok: resp.ok,
      status: resp.status,
      statusText: resp.statusText,
      elapsedMs: elapsed,
      request: {
        url: targetUrl,
        method,
        product,
        keySource,
        path: cleanPath,
        queryParams: qs,
      },
      headers: interestingHeaders,
      body,
      isJson,
      bodySize: text.length,
    });
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : 'Unknown error';

    return NextResponse.json({
      ok: false,
      status: 0,
      statusText: 'Network Error',
      elapsedMs: elapsed,
      request: {
        url: targetUrl,
        method,
        product,
        keySource,
        path: cleanPath,
        queryParams: qs,
      },
      headers: {},
      body: null,
      isJson: false,
      bodySize: 0,
      error: message,
    });
  }
}

/**
 * GET /api/admin/api-playground/products
 *
 * Returns the list of available products and pre-built endpoint templates
 * for the playground UI dropdown.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch product catalog from DB
  const products = await query<{ code: string; name: string; category: string; ping_weight: number }>(
    `SELECT code, name, category, ping_weight
     FROM api_products WHERE active = true ORDER BY sort_order`,
  );

  // Define endpoint templates per product
  const templates: Record<string, { label: string; path: string; queryParams?: string }[]> = {
    baseball: [
      { label: 'List leagues', path: 'v1/leagues' },
      { label: 'List games', path: 'v1/games', queryParams: 'limit=20' },
      { label: 'Team details (ID 15)', path: 'v1/teams/15' },
      { label: 'Team roster (ID 15)', path: 'v1/teams/15/roster' },
      { label: 'Ingestion status', path: 'v1/status' },
    ],
    basketball: [
      { label: 'List leagues', path: 'v1/leagues' },
      { label: 'List games', path: 'v1/games', queryParams: 'limit=20' },
    ],
    soccer: [
      { label: 'List leagues', path: 'v1/leagues' },
      { label: 'List games', path: 'v1/games', queryParams: 'limit=20' },
    ],
    hockey: [
      { label: 'List leagues', path: 'v1/leagues' },
      { label: 'List games', path: 'v1/games', queryParams: 'limit=20' },
    ],
    football: [
      { label: 'List leagues', path: 'v1/leagues' },
      { label: 'List games', path: 'v1/games', queryParams: 'limit=20' },
    ],
    odds: [
      { label: 'All sports', path: 'sports' },
      { label: 'All sportsbooks', path: 'sportsbooks' },
      { label: 'NBA odds', path: 'odds/nba' },
      { label: 'NFL odds', path: 'odds/nfl' },
    ],
    arbitrage: [
      { label: 'Live arbitrage', path: '', queryParams: 'limit=20&min_profit=1' },
    ],
    steam_moves: [
      { label: 'Recent steam moves', path: '', queryParams: 'limit=50' },
    ],
    injuries: [
      { label: 'Recent injuries', path: '', queryParams: 'limit=20' },
    ],
    ai_analysis: [
      { label: 'AI analysis', path: '', queryParams: 'limit=5' },
    ],
    catalog: [
      { label: 'Full catalog', path: '' },
    ],
    usage: [
      { label: 'My usage', path: '' },
    ],
  };

  // Add catalog & usage as pseudo-products
  const allProducts = [
    ...products.rows,
    { code: 'catalog', name: 'Catalog (public)', category: 'meta', ping_weight: 0 },
    { code: 'usage', name: 'Usage (quota snapshot)', category: 'meta', ping_weight: 0 },
  ];

  return NextResponse.json({
    products: allProducts,
    templates,
  });
}
