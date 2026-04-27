import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createEmailUser } from '@/lib/auth';
import { createEmailVerification } from '@/lib/tokens';
import { sendEmail, verifyEmail, welcomeEmail } from '@/lib/email';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

const Body = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(80).optional(),
});

export async function POST(req: Request) {
  let input: z.infer<typeof Body>;
  try {
    input = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid input. Email must be valid and password at least 8 characters.' },
      { status: 400 }
    );
  }

  try {
    const user = await createEmailUser(input);
    // Fire and forget emails.
    const { token } = await createEmailVerification(user.id);
    const verifyUrl = `${env.appUrl}/auth/verify?token=${encodeURIComponent(token)}`;
    const welcome = welcomeEmail(user.display_name ?? input.email.split('@')[0], env.appUrl);
    const verify = verifyEmail(verifyUrl);
    sendEmail({ to: user.email, ...welcome });
    sendEmail({ to: user.email, ...verify });

    return NextResponse.json({ ok: true, userId: user.id });
  } catch (err: any) {
    const msg = typeof err?.message === 'string' ? err.message : 'Signup failed';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}