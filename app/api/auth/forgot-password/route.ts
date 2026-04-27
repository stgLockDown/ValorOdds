import { NextResponse } from 'next/server';
import { z } from 'zod';
import { findUserByEmail } from '@/lib/auth';
import { createPasswordReset } from '@/lib/tokens';
import { sendEmail, passwordResetEmail } from '@/lib/email';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

const Body = z.object({ email: z.string().email().max(200) });

export async function POST(req: Request) {
  try {
    const { email } = Body.parse(await req.json());
    const user = await findUserByEmail(email);
    if (user) {
      const { token } = await createPasswordReset(user.id);
      const url = `${env.appUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;
      const tmpl = passwordResetEmail(url);
      sendEmail({ to: user.email, ...tmpl });
    }
  } catch {
    /* swallow — always return ok to avoid user enumeration */
  }
  return NextResponse.json({ ok: true });
}