/**
 * Centralized, type-safe environment variable access.
 *
 * IMPORTANT: During `next build`, Next.js collects page data by importing
 * every route module. At that point env vars may legitimately be absent
 * (CI, Railway build stage). We therefore defer all strict checks to
 * first *runtime* use via `requiredAtRuntime`, which returns a harmless
 * placeholder during build and throws only when actually invoked on a
 * request.
 */

const isBuildPhase =
  process.env.NEXT_PHASE === 'phase-production-build' ||
  process.env.NODE_ENV === 'production' && !process.env.__NEXT_PRIVATE_ORIGIN && process.argv.join(' ').includes('next build');

function readRequired(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v !== undefined && v !== '') return v;

  // During the build phase, return a placeholder so module-load doesn't crash.
  if (isBuildPhase || process.env.NEXT_PHASE === 'phase-production-build') {
    return `__buildtime_placeholder_${name}__`;
  }

  // Only throw at real runtime.
  throw new Error(`Missing required env var: ${name}`);
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const env = {
  NODE_ENV: (process.env.NODE_ENV ?? 'development') as 'development' | 'production' | 'test',
  isProd: process.env.NODE_ENV === 'production',
  appUrl: optional('NEXT_PUBLIC_APP_URL', 'http://localhost:3000'),
  appName: optional('NEXT_PUBLIC_APP_NAME', 'Valor Odds'),

  // Database
  databaseUrl: () => readRequired('DATABASE_URL'),

  // NextAuth
  nextauthSecret: () => readRequired('NEXTAUTH_SECRET'),
  nextauthUrl: () => optional('NEXTAUTH_URL', 'http://localhost:3000'),

  // Discord
  discordClientId: () => readRequired('DISCORD_CLIENT_ID'),
  discordClientSecret: () => readRequired('DISCORD_CLIENT_SECRET'),
  discordGuildId: () => optional('DISCORD_GUILD_ID'),
  discordRolePremium: () => optional('DISCORD_ROLE_PREMIUM'),
  discordRoleVip: () => optional('DISCORD_ROLE_VIP'),

  // Internal API
  internalApiKey: () => readRequired('INTERNAL_API_KEY'),
  botApiBaseUrl: () =>
    optional('BOT_API_BASE_URL', 'https://valoroddsdiscordbot-production.up.railway.app'),

  // Stripe
  stripeSecretKey: () => readRequired('STRIPE_SECRET_KEY'),
  stripePublishableKey: optional('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'),
  stripeWebhookSecret: () => readRequired('STRIPE_WEBHOOK_SECRET'),
  stripeProductPremium: () => optional('STRIPE_PRODUCT_PREMIUM', 'prod_UPYSeWPotixwU2'),
  stripeProductVip: () => optional('STRIPE_PRODUCT_VIP', 'prod_UPYWwtSNL1LAqR'),

  // Email
  resendApiKey: () => readRequired('RESEND_API_KEY'),
  resendFromEmail: () => optional('RESEND_FROM_EMAIL', 'Valor Odds <noreply@valorodds.com>'),

  // Admin
  adminEmails: () =>
    optional('ADMIN_EMAILS', '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
};

export type Tier = 'free' | 'premium' | 'vip';

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return env.adminEmails().includes(email.toLowerCase());
}