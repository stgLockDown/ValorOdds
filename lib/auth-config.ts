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
    // Map custom JWT claims (isAdmin, tier, userId, discordId) onto the
    // session.user object so middleware can read session.user.isAdmin without
    // needing the full Node-based auth.ts callbacks.
    jwt({ token }) {
      // Custom claims are already on the token from the Node-side jwt callback.
      // Nothing to do here — just pass through.
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as any).id = String(token.userId ?? token.sub ?? '');
        (session.user as any).discordId = (token.discordId as string | null | undefined) ?? null;
        (session.user as any).tier = (token.tier as string | undefined) ?? 'free';
        (session.user as any).isAdmin = Boolean(token.isAdmin);
      }
      return session;
    },
  },
};