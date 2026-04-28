import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getStripe } from '@/lib/stripe';
import { env } from '@/lib/env';
import { queryOne } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const row = await queryOne<{ stripe_customer_id: string }>(
    `SELECT stripe_customer_id FROM web_subscriptions WHERE user_id = $1::bigint ORDER BY id DESC LIMIT 1`,
    [session.user.id]
  );
  if (!row?.stripe_customer_id) {
    return NextResponse.json({ error: 'No subscription found' }, { status: 404 });
  }
  const stripe = getStripe();
  const portal = await stripe.billingPortal.sessions.create({
    customer: row.stripe_customer_id,
    return_url: `${env.appUrl}/account`,
  });
  return NextResponse.json({ url: portal.url });
}