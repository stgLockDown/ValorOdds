import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin-only user management endpoint.
 *
 * GET  /api/admin/users?search=&limit=&offset=
 *      → paginated list of web_users (id, email, display_name, is_admin, created_at)
 *
 * POST /api/admin/users
 *      { action: 'reset_password', email, password }
 *      { action: 'set_admin', email, isAdmin: boolean }
 *      { action: 'verify_email', email }
 *
 * All actions are audit-logged to stderr with the acting admin's email.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const search = (url.searchParams.get('search') ?? '').trim();
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200);
  const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0);

  const params: (string | number)[] = [limit, offset];
  let where = '';
  if (search) {
    where = `WHERE lower(email) LIKE lower($${params.length + 1})`;
    params.push(`%${search}%`);
  }

  const users = await query<{
    id: string;
    email: string;
    display_name: string | null;
    is_admin: boolean;
    email_verified_at: string | null;
    created_at: string;
  }>(
    `SELECT id::text, email, display_name, is_admin, email_verified_at, created_at
     FROM web_users
     ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return NextResponse.json({ users });
}

const ActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('reset_password'),
    email: z.string().email().max(200),
    password: z.string().min(8).max(128),
  }),
  z.object({
    action: z.literal('set_admin'),
    email: z.string().email().max(200),
    isAdmin: z.boolean(),
  }),
  z.object({
    action: z.literal('verify_email'),
    email: z.string().email().max(200),
  }),
]);

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let input: z.infer<typeof ActionSchema>;
  try {
    input = ActionSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  // Look up the target user
  const target = await queryOne<{ id: string; email: string; is_admin: boolean }>(
    `SELECT id::text, email, is_admin FROM web_users WHERE lower(email) = lower($1)`,
    [input.email]
  );
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const actingAdmin = session.user.email ?? 'unknown';

  switch (input.action) {
    case 'reset_password': {
      // Dynamically import bcryptjs to keep the module light
      const bcrypt = (await import('bcryptjs')).default;
      const hash = await bcrypt.hash(input.password, 12);
      await query(
        `UPDATE web_users SET password_hash = $1, updated_at = NOW() WHERE id = $2::bigint`,
        [hash, target.id]
      );
      // Invalidate any outstanding password-reset tokens for this user
      await query(
        `UPDATE web_password_resets SET consumed_at = NOW()
         WHERE user_id = $1::bigint AND consumed_at IS NULL`,
        [target.id]
      );
      // eslint-disable-next-line no-console
      console.error(`[admin] ${actingAdmin} reset password for ${target.email}`);
      return NextResponse.json({ ok: true, action: 'reset_password', email: target.email });
    }

    case 'set_admin': {
      await query(
        `UPDATE web_users SET is_admin = $1, updated_at = NOW() WHERE id = $2::bigint`,
        [input.isAdmin, target.id]
      );
      // eslint-disable-next-line no-console
      console.error(
        `[admin] ${actingAdmin} ${input.isAdmin ? 'granted' : 'revoked'} admin for ${target.email}`
      );
      return NextResponse.json({ ok: true, action: 'set_admin', email: target.email, isAdmin: input.isAdmin });
    }

    case 'verify_email': {
      await query(
        `UPDATE web_users SET email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW()
         WHERE id = $1::bigint`,
        [target.id]
      );
      // eslint-disable-next-line no-console
      console.error(`[admin] ${actingAdmin} verified email for ${target.email}`);
      return NextResponse.json({ ok: true, action: 'verify_email', email: target.email });
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
}
