import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { issueApiKeyForPlan } from '@/lib/api-monetization/keys';
import { logEvent } from '@/lib/analytics';

export const runtime = 'nodejs';

const Body = z.object({ planId: z.union([z.string(), z.number()]) });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let input: z.infer<typeof Body>;
  try {
    input = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const plan = await queryOne<{ id: string }>(
    `SELECT id::text FROM customer_api_plans WHERE id = $1::bigint AND user_id = $2::bigint LIMIT 1`,
    [input.planId, session.user.id]
  );
  if (!plan) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
  }

  const rawKey = await issueApiKeyForPlan(Number(plan.id));

  await logEvent({
    userId: session.user.id,
    discordId: session.user.discordId ?? null,
    eventType: 'api_key_regenerated',
    metadata: { planId: plan.id },
  });

  // Shown exactly once — the client must display + let the user copy it now.
  return NextResponse.json({ apiKey: rawKey });
}
