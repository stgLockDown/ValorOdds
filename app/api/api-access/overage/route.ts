import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { logEvent } from '@/lib/analytics';

export const runtime = 'nodejs';

const Body = z.object({
  planId: z.union([z.string(), z.number()]),
  enabled: z.boolean(),
});

/**
 * Toggle pay-per-overage billing for a plan. Checked = metered overage
 * billing kicks in once the ping pool is exhausted (calls keep working,
 * customer gets billed). Unchecked (default) = hard cutoff (429) once the
 * pool hits zero, no surprise charges.
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

  const plan = await queryOne<{ id: string }>(
    `SELECT id::text FROM customer_api_plans WHERE id = $1::bigint AND user_id = $2::bigint LIMIT 1`,
    [input.planId, session.user.id]
  );
  if (!plan) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
  }

  await query(`UPDATE customer_api_plans SET overage_enabled = $1 WHERE id = $2::bigint`, [
    input.enabled,
    plan.id,
  ]);

  await logEvent({
    userId: session.user.id,
    discordId: session.user.discordId ?? null,
    eventType: 'api_overage_toggled',
    metadata: { planId: plan.id, enabled: input.enabled },
  });

  return NextResponse.json({ ok: true, overageEnabled: input.enabled });
}
