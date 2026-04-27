/**
 * Centralized, type-safe environment variable access.
 * Fails fast at runtime if required vars are missing.
 */

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    if (typeof window === 'undefined') {
      // Only throw server-side; NEXT_PUBLIC_* are handled by Next.js
      throw new Error(`Missing required env var: ${name}`);
    }
    return '';
  }
  return v;
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
  databaseUrl: () => required('DATABASE_URL'),

  // NextAuth
  nextauthSecret: () => required('NEXTAUTH_SECRET'),
  nextauthUrl: () => optional('NEXTAUTH_URL', 'http://localhost:3000'),

  // Discord
  discordClientId: () => required('DISCORD_CLIENT_ID'),
  discordClientSecret: () => required('DISCORD_CLIENT_SECRET'),
  discordGuildId: () => optional('DISCORD_GUILD_ID'),
  discordRolePremium: () => optional('DISCORD_ROLE_PREMIUM'),
  discordRoleVip: () => optional('DISCORD_ROLE_VIP'),

  // Internal API
  internalApiKey: () => required('INTERNAL_API_KEY'),
  botApiBaseUrl: () =>
    optional('BOT_API_BASE_URL', 'https://valoroddsdiscordbot-production.up.railway.app'),

  // Stripe
  stripeSecretKey: () => required('STRIPE_SECRET_KEY'),
  stripePublishableKey: optional('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'),
  stripeWebhookSecret: () => required('STRIPE_WEBHOOK_SECRET'),
  stripeProductPremium: () => optional('STRIPE_PRODUCT_PREMIUM', 'prod_UPYSeWPotixwU2'),
  stripeProductVip: () => optional('STRIPE_PRODUCT_VIP', 'prod_UPYWwtSNL1LAqR'),

  // Email
  resendApiKey: () => required('RESEND_API_KEY'),
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