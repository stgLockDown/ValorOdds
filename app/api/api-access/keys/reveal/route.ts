import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { getDecryptedActiveKeyForPlan } from '@/lib/api-monetization/keys';
import { logEvent } from '@/lib/analytics';

export const runtime = 'nodejs';

const Body = z.object({ planId: z.union([z.string(), z.number()]) });

/**
 * POST /api/api-access/keys/reveal
 *
 * Returns the full, raw API key for one of the authenticated user's own plans
 * so they can copy it WITHOUT regenerating. This is the fix for the
 * "no way to copy the key without regenerating it every time" complaint.
 *
 * Security:
 *   - Requires an authenticated session; the plan must belong to the caller.
 *   - The key is stored AES-256-GCM encrypted at rest (never plaintext).
 *   - The event is logged for audit purposes.
 *   - Returns 404 if the key was issued before encrypted storage was enabled
 *     (user must regenerate once to get an encrypted copy).
 */
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

  // Verify the plan belongs to the authenticated user.
  const plan = await queryOne<{ id: string }>(
    `SELECT id::text FROM customer_api_plans
     WHERE id = $1::bigint AND user_id = $2::bigint
       AND status IN ('active','trialing','past_due')
     LIMIT 1`,
    [input.planId, session.user.id],
  );
  if (!plan) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
  }

  const rawKey = await getDecryptedActiveKeyForPlan(Number(plan.id));
  if (!rawKey) {
    return NextResponse.json(
      {
        error:
          'This key was issued before encrypted storage was enabled. Regenerate your key once to enable copy-without-regenerate going forward.',
      },
      { status: 404 },
    );
  }

  await logEvent({
    userId: session.user.id,
    discordId: session.user.discordId ?? null,
    eventType: 'api_key_revealed',
    metadata: { planId: plan.id },
  });

  return NextResponse.json({ apiKey: rawKey });
}
