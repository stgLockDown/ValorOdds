# Railway Setup Guide — Valor Odds Web Platform

This guide walks you through configuring the Railway deployment so auth, Stripe, and Discord integration all work.

## Required Environment Variables

Set these in **Railway → your service → Variables** tab.

### 1. Core (required for auth to work)

| Variable | Example / How to get it |
| --- | --- |
| `NEXTAUTH_SECRET` | Run `openssl rand -base64 32` locally. Any strong random string. |
| `NEXTAUTH_URL` | Your public URL, e.g. `https://valorodds.com` (no trailing slash). |
| `DATABASE_URL` | Railway Postgres internal URL — click your Postgres service → Connect → "Postgres Connection URL". Use the **internal** one (reference: `${{ Postgres.DATABASE_URL }}`). |

### 2. Discord OAuth (optional — enables "Continue with Discord")

| Variable | How to get it |
| --- | --- |
| `DISCORD_CLIENT_ID` | Discord Developer Portal → Your App → OAuth2 → Client ID |
| `DISCORD_CLIENT_SECRET` | Same page → Client Secret |

Then in the Discord Dev Portal, add this **Redirect URL**:
```
https://valorodds.com/api/auth/callback/discord
```
Replace with your actual Railway URL during staging.

Without these, the "Continue with Discord" button is hidden automatically — the app won't crash.

### 3. Stripe (optional — enables payments)

| Variable | How to get it |
| --- | --- |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys → Secret key (live or test) |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Developers → Webhooks → Add endpoint `https://valorodds.com/api/stripe/webhook`, select these events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` → copy the Signing secret |
| `STRIPE_PREMIUM_PRICE_ID` | Stripe Dashboard → Products → Premium (prod_UPYSeWPotixwU2) → Pricing → copy the Price ID (starts with `price_`) |
| `STRIPE_VIP_PRICE_ID` | Stripe Dashboard → Products → VIP (prod_UPYWwtSNL1LAqR) → Pricing → copy the Price ID |

### 4. Email via Resend (optional — enables verification / receipts)

| Variable | How to get it |
| --- | --- |
| `RESEND_API_KEY` | resend.com → API Keys → Create API Key |
| `EMAIL_FROM` | `Valor Odds <noreply@valorodds.com>` (must be a verified sender domain in Resend) |

### 5. Bot integration (optional — enables role sync + in-dashboard chat)

| Variable | How to get it |
| --- | --- |
| `INTERNAL_API_KEY` | Any strong random string. **Must match the same var set on the bot service.** |
| `BOT_INTERNAL_BASE_URL` | The bot's Railway internal URL, e.g. `http://${{ValorOddsDiscordBot.RAILWAY_PRIVATE_DOMAIN}}:3001` |

---

## Database Migration

After setting `DATABASE_URL`, run this **once** to create the `web_users`, `web_subscriptions`, `web_usage_events`, `web_stripe_events`, and `tokens` tables.

From your local machine:
```bash
# Pull the DATABASE_URL from Railway (Railway CLI: railway variables)
psql "$DATABASE_URL" -f db/migrations/001_web_platform.sql
```

Or use Railway's built-in database UI (Data tab → Query) and paste the contents of `db/migrations/001_web_platform.sql`.

---

## Graceful Degradation

The app is designed to boot even without any env vars set:

| Missing var | What happens |
| --- | --- |
| `NEXTAUTH_SECRET` | Warning logged; sessions won't persist but the app renders. |
| `DATABASE_URL` | Sign-up returns a friendly 503 ("database not configured"); read-only pages still render. |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | Discord button is hidden entirely. Email auth still works. |
| `STRIPE_SECRET_KEY` | Checkout buttons return a 503. Marketing pages still render. |
| `RESEND_API_KEY` | Verification emails silently skipped; account still created and usable. |

So you can deploy incrementally — set `NEXTAUTH_SECRET` + `DATABASE_URL` first, verify email auth works, then layer on Discord OAuth, then Stripe, etc.

---

## Minimum-Viable First Deploy Checklist

- [ ] Set `NEXTAUTH_SECRET` (run `openssl rand -base64 32`)
- [ ] Set `NEXTAUTH_URL` to your Railway public URL
- [ ] Attach a Postgres service and set `DATABASE_URL` to `${{ Postgres.DATABASE_URL }}`
- [ ] Run `db/migrations/001_web_platform.sql` against the Postgres instance
- [ ] Trigger a redeploy (push any commit to `main`, or Railway → Redeploy)
- [ ] Visit `/auth/signup`, create a test account, confirm you land on the dashboard

Once that works, add Discord OAuth and Stripe in any order.

---

## Troubleshooting

**Healthcheck keeps failing after deploy**
- Check deploy logs for `[env] WARNING:` lines — those tell you which env vars are missing.
- The app boots without env vars, so the only hard crash would be a syntax error or missing dependency. Run `npm run build` locally to reproduce.

**"Continue with Discord" button missing**
- Means `DISCORD_CLIENT_ID` or `DISCORD_CLIENT_SECRET` is unset. Check Railway vars and redeploy.

**Sign-up returns "database not configured"**
- `DATABASE_URL` isn't set or isn't reachable. Verify by running `railway run psql $DATABASE_URL -c "select 1"`.

**Sign-in says "Invalid credentials" even for a fresh account**
- The `web_users` table likely doesn't exist yet — run the migration `db/migrations/001_web_platform.sql`.

**Stripe webhook 400s**
- The `STRIPE_WEBHOOK_SECRET` doesn't match the endpoint in Stripe. Regenerate on the Stripe side and update the Railway var.