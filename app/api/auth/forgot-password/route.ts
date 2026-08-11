import { NextResponse } from 'next/server';
import { z } from 'zod';
import { findUserByEmail } from '@/lib/auth';
import { createPasswordReset } from '@/lib/tokens';
import { sendEmail, passwordResetEmail } from '@/lib/email';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
// Keep the route alive long enough for the Resend API call to complete.
export const maxDuration = 30;

const Body = z.object({ email: z.string().email().max(200) });

export async function POST(req: Request) {
  try {
    const { email } = Body.parse(await req.json());
    const user = await findUserByEmail(email);
    if (user) {
      const { token } = await createPasswordReset(user.id);
      const url = `${env.appUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;
      const tmpl = passwordResetEmail(url);
      // Await the email send so the serverless function doesn't terminate
      // before Resend finishes. Errors are swallowed inside sendEmail()
      // so a Resend outage never leaks whether the account exists.
      await sendEmail({ to: user.email, ...tmpl });
    }
  } catch {
    /* swallow — always return ok to avoid user enumeration */
  }
  return NextResponse.json({ ok: true });
}