import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query, queryOne } from '@/lib/db';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Bootstrap / emergency setup endpoint.
 *
 * Protected by the ADMIN_SETUP_TOKEN env var (a shared secret the operator
 * sets on Railway only when they need to bootstrap or recover admin access).
 *
 * POST /api/setup/bootstrap
 *   Headers: X-Setup-Token: <ADMIN_SETUP_TOKEN value>
 *   Body:    { email, password, grantAdmin? }
 *
 * - If the user exists: resets their password and optionally grants admin.
 * - If the user does NOT exist: creates the account with the given password,
 *   email_verified_at = NOW(), and is_admin = grantAdmin ?? true.
 * - Always returns ok (does not leak whether the account exists) but the
 *   response body includes a `created` boolean for the operator's convenience.
 *
 * SECURITY: Remove ADMIN_SETUP_TOKEN from Railway variables after use.
 */
const Body = z.object({
  email: z.string().email().max(200).toLowerCase(),
  password: z.string().min(8).max(128),
  grantAdmin: z.boolean().optional().default(true),
});

export async function POST(req: Request) {
  // --- Token gate ---
  const expectedToken = env.adminSetupToken();
  if (!expectedToken || expectedToken.startsWith('__buildtime_placeholder')) {
    return NextResponse.json(
      { error: 'Setup token not configured. Set ADMIN_SETUP_TOKEN on Railway to use this endpoint.' },
      { status: 503 }
    );
  }
  const providedToken = req.headers.get('x-setup-token') ?? '';
  if (!providedToken || providedToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // --- Parse body ---
  let input: z.infer<typeof Body>;
  try {
    input = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const bcrypt = (await import('bcryptjs')).default;
  const hash = await bcrypt.hash(input.password, 12);

  // Check if user exists
  const existing = await queryOne<{ id: string; email: string }>(
    `SELECT id::text, email FROM web_users WHERE lower(email) = lower($1)`,
    [input.email]
  );

  if (existing) {
    // Reset password + optionally grant admin
    await query(
      `UPDATE web_users
       SET password_hash = $1,
           is_admin = CASE WHEN $2 THEN TRUE ELSE is_admin END,
           email_verified_at = COALESCE(email_verified_at, NOW()),
           updated_at = NOW()
       WHERE id = $3::bigint`,
      [hash, input.grantAdmin, existing.id]
    );
    // Invalidate outstanding reset tokens
    await query(
      `UPDATE web_password_resets SET consumed_at = NOW()
       WHERE user_id = $1::bigint AND consumed_at IS NULL`,
      [existing.id]
    );
    // eslint-disable-next-line no-console
    console.error(`[setup] password reset for ${existing.email}, admin=${input.grantAdmin}`);
    return NextResponse.json({ ok: true, created: false, email: existing.email });
  }

  // Create new account
  const created = await queryOne<{ id: string; email: string }>(
    `INSERT INTO web_users (email, password_hash, is_admin, email_verified_at)
     VALUES ($1, $2, $3, NOW())
     RETURNING id::text, email`,
    [input.email, hash, input.grantAdmin]
  );
  // eslint-disable-next-line no-console
  console.error(`[setup] created account ${created?.email}, admin=${input.grantAdmin}`);
  return NextResponse.json({ ok: true, created: true, email: created?.email });
}
