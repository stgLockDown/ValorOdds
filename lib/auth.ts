/**
 * NextAuth v5 / Auth.js configuration.
 * - Discord OAuth (primary path for existing server members)
 * - Credentials (email + password) with bcrypt
 * - Custom Postgres persistence in web_users
 * - JWT strategy enriched with userId, discordId, tier
 */
import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Discord from 'next-auth/providers/discord';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env, isAdmin, isDiscordConfigured, type Tier } from './env';
import { query, queryOne } from './db';

// ---------- Type augmentation ----------
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      discordId?: string | null;
      tier: Tier;
      isAdmin: boolean;
    } & DefaultSession['user'];
  }
}

// JWT payload shape (kept as internal type since next-auth/jwt augmentation
// is tricky with v5 beta; we cast explicitly where needed).
type AppJWT = {
  userId?: string;
  discordId?: string | null;
  tier?: Tier;
  isAdmin?: boolean;
};
export type { AppJWT };

// ---------- Helpers ----------
const signInSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128),
});

interface WebUserRow {
  id: string;
  email: string;
  password_hash: string | null;
  discord_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
}

async function findUserByEmail(email: string): Promise<WebUserRow | null> {
  return queryOne<WebUserRow>(
    `SELECT id::text, email, password_hash, discord_id, display_name, avatar_url, is_admin
     FROM web_users WHERE lower(email) = lower($1) LIMIT 1`,
    [email]
  );
}

async function findUserByDiscordId(discordId: string): Promise<WebUserRow | null> {
  return queryOne<WebUserRow>(
    `SELECT id::text, email, password_hash, discord_id, display_name, avatar_url, is_admin
     FROM web_users WHERE discord_id = $1 LIMIT 1`,
    [discordId]
  );
}

async function upsertDiscordUser(opts: {
  discordId: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
}): Promise<WebUserRow> {
  // 1. Existing by discord_id?
  const byDiscord = await findUserByDiscordId(opts.discordId);
  if (byDiscord) {
    // refresh profile fields
    await query(
      `UPDATE web_users SET display_name = $1, avatar_url = $2 WHERE id = $3`,
      [opts.displayName, opts.avatarUrl ?? null, byDiscord.id]
    );
    return { ...byDiscord, display_name: opts.displayName, avatar_url: opts.avatarUrl ?? null };
  }
  // 2. Existing by email? link discord_id to it.
  const byEmail = await findUserByEmail(opts.email);
  if (byEmail) {
    await query(
      `UPDATE web_users SET discord_id = $1, display_name = COALESCE(display_name, $2), avatar_url = COALESCE(avatar_url, $3), email_verified_at = COALESCE(email_verified_at, NOW())
       WHERE id = $4`,
      [opts.discordId, opts.displayName, opts.avatarUrl ?? null, byEmail.id]
    );
    return { ...byEmail, discord_id: opts.discordId };
  }
  // 3. Fresh create.
  const row = await queryOne<WebUserRow>(
    `INSERT INTO web_users (email, discord_id, display_name, avatar_url, email_verified_at)
     VALUES ($1, $2, $3, $4, NOW())
     RETURNING id::text, email, password_hash, discord_id, display_name, avatar_url, is_admin`,
    [opts.email, opts.discordId, opts.displayName, opts.avatarUrl ?? null]
  );
  if (!row) throw new Error('Failed to create Discord-linked user');
  return row;
}

async function getCurrentTier(userId: string, discordId: string | null): Promise<Tier> {
  // Look up most recent active subscription either by user_id or discord_id.
  const sub = await queryOne<{ tier: string }>(
    `SELECT tier FROM web_subscriptions
     WHERE (user_id = $1::bigint OR ($2::text IS NOT NULL AND discord_id = $2))
       AND status IN ('active','trialing')
     ORDER BY current_period_end DESC NULLS LAST
     LIMIT 1`,
    [userId, discordId]
  );
  if (sub?.tier === 'premium' || sub?.tier === 'vip') return sub.tier;
  return 'free';
}

// ---------- NextAuth config ----------
// Build providers list dynamically so missing Discord creds don't crash boot.
const providers: any[] = [];
if (isDiscordConfigured()) {
  providers.push(
    Discord({
      clientId: env.discordClientId(),
      clientSecret: env.discordClientSecret(),
      authorization: { params: { scope: 'identify email guilds' } },
    }),
  );
} else if (process.env.NEXT_PHASE !== 'phase-production-build') {
  console.error(
    '[auth] Discord OAuth disabled: DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET not set. ' +
      'Email/password sign-in still works.',
  );
}

providers.push(
  Credentials({
    name: 'Email & Password',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(raw) {
      const parsed = signInSchema.safeParse(raw);
      if (!parsed.success) return null;
      const { email, password } = parsed.data;

      const user = await findUserByEmail(email);
      if (!user || !user.password_hash) return null;

      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return null;

      return {
        id: user.id,
        email: user.email,
        name: user.display_name,
        image: user.avatar_url,
      };
    },
  }),
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.nextauthSecret(),
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 /* 30 days */ },
  trustHost: true,
  pages: {
    signIn: '/auth/signin',
  },
  providers,
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'discord' && profile) {
        const email = (profile.email as string | undefined) ?? '';
        if (!email) return false; // we need email to create/link account
        const avatarUrl = profile.image_url as string | undefined
          ?? (profile as any).avatar
            ? `https://cdn.discordapp.com/avatars/${(profile as any).id}/${(profile as any).avatar}.png`
            : null;
        const upserted = await upsertDiscordUser({
          discordId: String((profile as any).id),
          email,
          displayName:
            (profile as any).global_name ||
            (profile as any).username ||
            email.split('@')[0],
          avatarUrl,
        });
        // stash id on the user object for jwt callback
        (user as any).id = upserted.id;
        (user as any).discordId = upserted.discord_id;
      }
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.userId = (user as any).id ?? token.sub;
        token.discordId = (user as any).discordId ?? null;
      }
      if (!token.userId && token.sub) token.userId = token.sub;

      // Load latest tier + admin flag from DB whenever token is minted/refreshed.
      // Wrapped in try/catch so a missing/unreachable DB doesn't nuke the whole
      // app — it just degrades the session to default (free/non-admin).
      if (token.userId) {
        try {
          const row = await queryOne<{ email: string; discord_id: string | null; is_admin: boolean }>(
            `SELECT email, discord_id, is_admin FROM web_users WHERE id = $1::bigint`,
            [token.userId]
          );
          if (row) {
            token.discordId = row.discord_id;
            token.isAdmin = row.is_admin || isAdmin(row.email);
            token.tier = await getCurrentTier(String(token.userId), row.discord_id);
          }
        } catch (err) {
          console.error('[auth.jwt] DB enrichment failed (continuing with default tier):', err);
          token.tier = token.tier ?? 'free';
          token.isAdmin = token.isAdmin ?? false;
        }
      }

      if (trigger === 'update' && session) {
        // Support manual session.refresh()
        if (session.tier) token.tier = session.tier as Tier;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.userId ?? '');
        session.user.discordId = (token.discordId as string | null | undefined) ?? null;
        session.user.tier = (token.tier as Tier | undefined) ?? 'free';
        session.user.isAdmin = Boolean(token.isAdmin);
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      if (user?.email) {
        try {
          await query(
            `INSERT INTO web_usage_events (user_id, event_type, metadata)
             VALUES ($1::bigint, 'login', '{}'::jsonb)`,
            [(user as any).id]
          );
        } catch {
          /* non-fatal */
        }
      }
    },
  },
});

// ---------- Signup helper used by /auth/signup route ----------
const signUpSchema = z.object({
  email: z.string().email().toLowerCase().max(200),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(80).optional(),
});

export async function createEmailUser(input: z.infer<typeof signUpSchema>) {
  const parsed = signUpSchema.parse(input);
  const existing = await findUserByEmail(parsed.email);
  if (existing && existing.password_hash) {
    throw new Error('An account already exists for this email.');
  }
  const hash = await bcrypt.hash(parsed.password, 12);

  if (existing && !existing.password_hash) {
    // User was Discord-only; add a password.
    await query(`UPDATE web_users SET password_hash = $1, display_name = COALESCE(display_name, $2) WHERE id = $3`, [
      hash,
      parsed.displayName ?? null,
      existing.id,
    ]);
    return existing;
  }

  const row = await queryOne<WebUserRow>(
    `INSERT INTO web_users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING id::text, email, password_hash, discord_id, display_name, avatar_url, is_admin`,
    [parsed.email, hash, parsed.displayName ?? null]
  );
  if (!row) throw new Error('Failed to create user');
  await query(
    `INSERT INTO web_usage_events (user_id, event_type, metadata) VALUES ($1::bigint, 'signup', '{}'::jsonb)`,
    [row.id]
  );
  return row;
}

export { findUserByEmail, findUserByDiscordId, getCurrentTier };