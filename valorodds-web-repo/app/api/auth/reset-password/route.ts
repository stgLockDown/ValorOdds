import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { consumePasswordReset } from '@/lib/tokens';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

const Body = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  let input: z.infer<typeof Body>;
  try {
    input = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  const userId = await consumePasswordReset(input.token);
  if (!userId) {
    return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 });
  }
  const hash = await bcrypt.hash(input.password, 12);
  await query(`UPDATE web_users SET password_hash = $1 WHERE id = $2::bigint`, [hash, userId]);
  return NextResponse.json({ ok: true });
}