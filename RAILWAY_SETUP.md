# Railway Setup — Valor Odds Web

This guide walks you through wiring the website up on Railway so Stripe checkout, auth, and the Discord bot integration all work.

## 1. Required environment variables (minimum viable)

Set these in **Railway → your web service → Variables** to get the site fully functional. Anything missing will surface as a clear error message in the UI (no more "Network error").

### Core app
```
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://valorodds.com           # your production URL
NEXT_PUBLIC_APP_NAME=Valor Odds
```

### Database (shared with Discord bot)
```
DATABASE_URL=postgresql://…
```

### NextAuth
```
NEXTAUTH_SECRET=<run `openssl rand -base64 32`>
NEXTAUTH_URL=https://valorodds.com
```

### Stripe (THE FIX for "Network error")
The pricing page shows **"Network error"** when the checkout API can't find Stripe credentials. Set:

```
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...     # from your Stripe Dashboard webhook endpoint

# Launch tier (required for Beta Access button on /pricing)
STRIPE_PRICE_BETA=price_...         # $10.59/month beta access

# Optional — only needed if those buttons are enabled on pricing page
STRIPE_PRICE_PREMIUM=price_...      # $29/month
STRIPE_PRICE_VIP=price_...          # $79/month
```

**Recommendation**: use `STRIPE_PRICE_<TIER>` (exact price ID) instead of `STRIPE_PRODUCT_<TIER>` (requires a lookup). It's faster and avoids picking the wrong price when a product has multiple.

### Discord OAuth + role sync
```
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_GUILD_ID=
DISCORD_ROLE_BETA=
DISCORD_ROLE_PREMIUM=
DISCORD_ROLE_VIP=
```

### Bot bridge
```
INTERNAL_API_KEY=<same value as set on the Discord bot side>
BOT_API_BASE_URL=https://valoroddsdiscordbot-production.up.railway.app
```

### Email (for password reset)
```
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL="Valor Odds <noreply@valorodds.com>"
```

### Admin access
```
ADMIN_EMAILS=you@example.com,teammate@example.com
```

---

## 2. Create the Stripe "Beta Access" product

1. Go to https://dashboard.stripe.com/products
2. Click **+ Add product**
3. Name: `Valor Odds Beta Access`
4. Pricing: **Recurring**, `$10.59 USD / month`
   * The odd price covers Stripe's fee (~2.9% + 30¢ on $10 → ~$0.59)
5. Save → copy the **price ID** (starts with `price_`)
6. Paste as `STRIPE_PRICE_BETA` in Railway

Repeat for Premium ($29) and VIP ($79) if you want those tiers live too.

---

## 3. Configure the Stripe webhook

1. https://dashboard.stripe.com/webhooks → **+ Add endpoint**
2. Endpoint URL: `https://valorodds.com/api/stripe/webhook`
3. Listen for these events:
   * `checkout.session.completed`
   * `customer.subscription.created`
   * `customer.subscription.updated`
   * `customer.subscription.deleted`
   * `invoice.payment_succeeded`
   * `invoice.payment_failed`
4. After creation, copy the **Signing secret** (starts with `whsec_`) and set it as `STRIPE_WEBHOOK_SECRET`

---

## 4. Run database migrations

On first deploy (or when a new migration is added), connect to Railway Postgres and run:

```sql
-- Main schema
\i db/migrations/001_web_platform.sql
\i db/migrations/002_user_preferences.sql
\i db/migrations/003_web_chat_history.sql

-- NEW: adds 'beta' tier to web_subscriptions.tier check constraint
\i db/migrations/004_add_beta_tier.sql
```

Or via `railway run psql $DATABASE_URL -f db/migrations/004_add_beta_tier.sql` locally.

---

## 5. Smoke-test checkout

1. Sign up with a test email on `/auth/signup`
2. Go to `/pricing`
3. Click **Join Beta**. You should be redirected to Stripe Checkout.
4. If you see a red error banner ("Billing is not configured yet", etc.) → check the Railway logs for the exact missing env var.

---

## 6. Troubleshooting

| Symptom on site | Likely cause |
| --- | --- |
| "Billing is not configured yet" | `STRIPE_SECRET_KEY` is missing in Railway |
| "Unable to load pricing for the beta tier" | Neither `STRIPE_PRICE_BETA` nor `STRIPE_PRODUCT_BETA` is set |
| "Checkout failed (HTTP 500)" | Check Railway logs for the real error (often DB not reachable) |
| "You must be signed in to start checkout" | User hit `/api/stripe/checkout` without an active session |

All server-side errors now log to stderr with the `[stripe/checkout]` prefix so they're easy to grep in the Railway log stream.