/**
 * Lightweight Auth config for the Edge-runtime middleware.
 * This intentionally avoids importing any Node-only modules (pg, bcrypt, Resend)
 * so middleware can run at the edge.
 */
import type { NextAuthConfig } from 'next-auth';

export const authConfig: NextAuthConfig = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt' },
  trustHost: true,
  pages: { signIn: '/auth/signin' },
  providers: [], // providers only needed server-side
  callbacks: {
    // No DB work here — the JWT is already signed before it hits the edge.
    authorized({ auth }) {
      return !!auth;
    },
  },
};