/**
 * Centralized, type-safe environment variable access.
 *
 * Design principles:
 * 1. During `next build`, env vars may legitimately be absent. We return
 *    harmless placeholders so module imports don't crash.
 * 2. At runtime (server start / request), we are LENIENT by default:
 *    - Missing vars produce a loud console.error and return a safe
 *      placeholder so the app can still boot (e.g. marketing pages work
 *      so Railway's healthcheck passes).
 *    - Features that actually need the var (DB queries, Stripe calls,
 *      Discord OAuth) will fail on their own with a clear error when
 *      the user exercises them, instead of the whole server crashing.
 * 3. If you need strict behavior inside a request handler, call
 *    `env.assertRequired(['NEXTAUTH_SECRET', 'DATABASE_URL'])`.
 */

const isBuildPhase =
  process.env.NEXT_PHASE === 'phase-production-build' ||
  (process.env.NODE_ENV === 'production' &&
    !process.env.__NEXT_PRIVATE_ORIGIN &&
    process.argv.join(' ').includes('next build'));

const warnedFor = new Set<string>();

function readOptionalWithWarning(name: string, fallback: string): string {
  const v = process.env[name];
  if (v !== undefined && v !== '') return v;

  if (isBuildPhase) return `__buildtime_placeholder_${name}__`;

  if (!warnedFor.has(name)) {
    warnedFor.add(name);
    console.error(
      `[env] WARNING: ${name} is not set. Using placeholder. Features that need this variable will fail until you configure it in Railway.`,
    );
  }
  return fallback;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

// Stable placeholder so NextAuth doesn't reject the secret outright.
// Real auth still won't work, but the app will start and landing pages render.
const PLACEHOLDER_SECRET =
  'placeholder-secret-not-configured-please-set-real-value-in-railway-env-vars-now';

export const env = {
  NODE_ENV: (process.env.NODE_ENV ?? 'development') as 'development' | 'production' | 'test',
  isProd: process.env.NODE_ENV === 'production',
  appUrl: optional('NEXT_PUBLIC_APP_URL', 'http://localhost:3000'),
  appName: optional('NEXT_PUBLIC_APP_NAME', 'Valor Odds'),

  // Database — lenient: queries fail with their own clear error if unset.
  databaseUrl: () => readOptionalWithWarning('DATABASE_URL', ''),

  // NextAuth — must return something or NextAuth refuses to boot.
  nextauthSecret: () => readOptionalWithWarning('NEXTAUTH_SECRET', PLACEHOLDER_SECRET),
  nextauthUrl: () => optional('NEXTAUTH_URL', 'http://localhost:3000'),

  // Discord — empty string means "not configured"; auth.ts will skip registering the provider.
  discordClientId: () => optional('DISCORD_CLIENT_ID', ''),
  discordClientSecret: () => optional('DISCORD_CLIENT_SECRET', ''),
  discordGuildId: () => optional('DISCORD_GUILD_ID'),
  discordRolePremium: () => optional('DISCORD_ROLE_PREMIUM'),
  discordRoleVip: () => optional('DISCORD_ROLE_VIP'),

  // Internal API
  internalApiKey: () => readOptionalWithWarning('INTERNAL_API_KEY', ''),
  adminSetupToken: () => readOptionalWithWarning('ADMIN_SETUP_TOKEN', ''),
  botApiBaseUrl: () =>
    optional('BOT_API_BASE_URL', 'https://valoroddsdiscordbot-production.up.railway.app'),

  // API Gateway internal key — used by the samples preview route to fetch
  // real data from the backend sport/odds services for the API Access page.
  gatewayInternalKey: () => optional('GATEWAY_INTERNAL_KEY', ''),

  // Stripe
  stripeSecretKey: () => readOptionalWithWarning('STRIPE_SECRET_KEY', ''),
  stripePublishableKey: optional('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'),
  stripeWebhookSecret: () => readOptionalWithWarning('STRIPE_WEBHOOK_SECRET', ''),
  stripeProductBasic: () => optional('STRIPE_PRODUCT_BASIC', ''),
  stripeProductPremium: () => optional('STRIPE_PRODUCT_PREMIUM', 'prod_UPYSeWPotixwU2'),
  stripeProductVip: () => optional('STRIPE_PRODUCT_VIP', 'prod_UPYWwtSNL1LAqR'),

  // Email
  resendApiKey: () => readOptionalWithWarning('RESEND_API_KEY', ''),
  resendFromEmail: () => optional('RESEND_FROM_EMAIL', 'Valor Odds <noreply@valorodds.com>'),

  // Admin
  adminEmails: () =>
    optional('ADMIN_EMAILS', '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),

  /**
   * Strict assertion helper. Call inside a request handler when you
   * absolutely need these vars. Throws a clear error for a useful 500.
   */
  assertRequired(names: string[]): void {
    const missing = names.filter((n) => !process.env[n]);
    if (missing.length > 0) {
      throw new Error(
        `Missing required env vars: ${missing.join(', ')}. Set them in Railway → Variables.`,
      );
    }
  },
};

export type Tier = 'free' | 'basic' | 'premium' | 'vip';

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return env.adminEmails().includes(email.toLowerCase());
}

/** Returns true if Discord OAuth is fully configured and can be used as a provider. */
export function isDiscordConfigured(): boolean {
  return Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
}

/** Returns true if a working NEXTAUTH_SECRET was provided. */
export function isAuthSecretConfigured(): boolean {
  const s = process.env.NEXTAUTH_SECRET;
  return Boolean(s && s.length >= 16);
}