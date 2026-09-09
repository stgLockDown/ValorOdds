import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { listWriters, setWriterRole } from '@/lib/news-platform';
import { queryOne } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Writer role management.
 *
 * GET  /api/admin/news/writers       → list writers + admins
 * POST /api/admin/news/writers       { email, isWriter }
 *        — grant or revoke the writer role for a user (found by email).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const writers = await listWriters();
  return NextResponse.json({ writers });
}

const Body = z.object({
  email: z.string().email().max(200).toLowerCase(),
  isWriter: z.boolean(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let input: z.infer<typeof Body>;
  try {
    input = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid input — email and isWriter required' }, { status: 400 });
  }

  const target = await queryOne<{ id: string; email: string; display_name: string | null }>(
    `SELECT id::text, email, display_name FROM web_users WHERE lower(email) = lower($1)`,
    [input.email]
  );
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  await setWriterRole(target.id, input.isWriter);
  console.error(
    `[admin-news] writer role ${input.isWriter ? 'granted to' : 'revoked from'} ${target.email} by ${session.user.email}`
  );
  return NextResponse.json({
    ok: true,
    user: { id: target.id, email: target.email, display_name: target.display_name, is_writer: input.isWriter },
  });
}
