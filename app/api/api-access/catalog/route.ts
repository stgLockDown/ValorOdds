import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Public catalog for the /api-access bundle builder — no auth required. */
export async function GET() {
  try {
    const [products, tiers] = await Promise.all([
      query(
        `SELECT code, name, category, ping_weight, addon_monthly_price_cents,
                standalone_monthly_price_cents, standalone_monthly_pings
         FROM api_products WHERE active = true ORDER BY sort_order`
      ),
      query(
        `SELECT code, name, monthly_pings, monthly_price_cents
         FROM api_ping_tiers WHERE active = true ORDER BY sort_order`
      ),
    ]);
    return NextResponse.json({ products: products.rows, ping_tiers: tiers.rows });
  } catch (err) {
    console.error('[api-access/catalog] failed:', err);
    return NextResponse.json({ error: 'Could not load catalog' }, { status: 500 });
  }
}
