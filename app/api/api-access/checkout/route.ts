import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { getStripe, isStripeConfigured, StripeNotConfiguredError } from '@/lib/stripe';
import { env } from '@/lib/env';
import { query, queryOne } from '@/lib/db';
import { isSportCode } from '@/lib/api-monetization/pricing';

export const runtime = 'nodejs';

const Body = z.object({
  planType: z.enum(['bundle', 'odds_standalone']),
  pingTierCode: z.enum(['t10k', 't50k', 't250k', 't1m']).optional(),
  sports: z.array(z.string()).optional().default([]),
  allAccess: z.boolean().optional().default(false),
  oddsAddon: z.boolean().optional().default(false),
});

export async function POST(req: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Billing temporarily unavailable' }, { status: 503 });
  }

  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let input: z.infer<typeof Body>;
  try {
    input = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (input.planType === 'bundle' && !input.pingTierCode) {
    return NextResponse.json({ error: 'pingTierCode is required for a bundle plan' }, { status: 400 });
  }
  const badSports = input.sports.filter((s) => !isSportCode(s));
  if (badSports.length > 0) {
    return NextResponse.json({ error: `Unknown sport code(s): ${badSports.join(', ')}` }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const lineItems: { price: string; quantity: number }[] = [];

    if (input.planType === 'odds_standalone') {
      const odds = await queryOne<{ stripe_price_id_standalone: string | null }>(
        `SELECT stripe_price_id_standalone FROM api_products WHERE code = 'odds'`
      );
      if (!odds?.stripe_price_id_standalone) {
        return NextResponse.json(
          { error: 'Odds API standalone price not configured yet. Contact support.' },
          { status: 503 }
        );
      }
      lineItems.push({ price: odds.stripe_price_id_standalone, quantity: 1 });
    } else {
      const tier = await queryOne<{ stripe_price_id: string | null }>(
        `SELECT stripe_price_id FROM api_ping_tiers WHERE code = $1`,
        [input.pingTierCode]
      );
      if (!tier?.stripe_price_id) {
        return NextResponse.json({ error: 'Ping tier price not configured yet. Contact support.' }, { status: 503 });
      }
      lineItems.push({ price: tier.stripe_price_id, quantity: 1 });

      if (input.allAccess) {
        const allAccess = await queryOne<{ stripe_price_id_addon: string | null }>(
          `SELECT stripe_price_id_addon FROM api_products WHERE code = 'all_access'`
        );
        if (allAccess?.stripe_price_id_addon) {
          lineItems.push({ price: allAccess.stripe_price_id_addon, quantity: 1 });
        }
      } else if (input.sports.length > 0) {
        const rows = await query<{ code: string; stripe_price_id_addon: string | null }>(
          `SELECT code, stripe_price_id_addon FROM api_products WHERE code = ANY($1::text[])`,
          [input.sports]
        );
        for (const r of rows.rows) {
          if (r.stripe_price_id_addon) lineItems.push({ price: r.stripe_price_id_addon, quantity: 1 });
        }
      }

      if (input.oddsAddon) {
        const odds = await queryOne<{ stripe_price_id_addon: string | null }>(
          `SELECT stripe_price_id_addon FROM api_products WHERE code = 'odds'`
        );
        if (odds?.stripe_price_id_addon) {
          lineItems.push({ price: odds.stripe_price_id_addon, quantity: 1 });
        }
      }
    }

    if (lineItems.length === 0) {
      return NextResponse.json({ error: 'No purchasable items selected' }, { status: 400 });
    }

    const existingSub = await queryOne<{ stripe_customer_id: string }>(
      `SELECT stripe_customer_id FROM customer_api_plans WHERE user_id = $1::bigint AND stripe_customer_id IS NOT NULL ORDER BY id DESC LIMIT 1`,
      [session.user.id]
    );

    const metadata = {
      webUserId: session.user.id,
      apiPlanType: input.planType,
      apiPingTierCode: input.pingTierCode ?? '',
      apiAllAccess: String(input.allAccess),
      apiOddsAddon: String(input.oddsAddon),
      apiSports: input.sports.join(','),
    };

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: lineItems,
      client_reference_id: session.user.id,
      customer: existingSub?.stripe_customer_id ?? undefined,
      customer_email: existingSub?.stripe_customer_id ? undefined : session.user.email,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      success_url: `${env.appUrl}/api-access/manage?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.appUrl}/api-access?checkout=cancelled`,
      metadata,
      subscription_data: { metadata },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return NextResponse.json({ error: 'Billing temporarily unavailable' }, { status: 503 });
    }
    console.error('[api-access/checkout] failed:', err);
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 });
  }
}
