# Valor Odds Web Platform

The customer-facing Next.js 14 platform for Valor Odds: marketing site, authentication (Discord OAuth + email/password), Stripe billing, embedded dashboard, Discord role sync, email receipts, and usage analytics.

## Architecture

```
┌──────────────────────────┐          ┌────────────────────────────────┐
│   valorodds-web (this)   │◄────────►│  ValorOddsDiscordBot (bot API) │
│   Next.js 14 (App)       │  HTTPS   │  Express + Discord.js          │
│   - Marketing pages      │   REST   │  - /api/internal/chat/stream   │
│   - Auth (Discord/Creds) │   SSE    │  - /api/internal/sync-role     │
│   - Stripe checkout      │          │  - /api/internal/account-link  │
│   - Embedded dashboard   │          │  - /api/internal/dashboard/*   │
└──────────────┬───────────┘          └───────────────┬────────────────┘
               │                                      │
               └──────────────┐      ┌────────────────┘
                              ▼      ▼
                      ┌──────────────────┐
                      │   PostgreSQL      │
                      │   (shared on      │
                      │    Railway)       │
                      └──────────────────┘
```

## Local development

```bash
cp .env.example .env.local
# fill in DATABASE_URL, NEXTAUTH_SECRET, Discord keys, Stripe keys, Resend key...

npm install
npm run dev
# → http://localhost:3000
```

## First-time DB setup

The web tables live alongside the bot's tables in the same Postgres database.
Apply the migration once:

```bash
psql "$DATABASE_URL" -f db/migrations/001_web_platform.sql
```

All tables are prefixed `web_*` so they never conflict with the bot's tables.

## Deploy (Railway)

This repo ships with `nixpacks.toml` + `railway.json`. Create a new Railway service pointing at this repo's main branch and set all env vars from `.env.example`.

- Set **NEXTAUTH_URL** to your public URL.
- Add a Stripe webhook endpoint at `https://<your-url>/api/stripe/webhook` — Stripe gives you the signing secret.
- Point custom domain `valorodds.com` at the service.

## Repo layout

```
app/            Next.js App Router pages + API routes
  auth/           signin, signup, forgot/reset password, verify
  account/        profile, billing, link-discord
  dashboard/      overview, chat (streaming), stats
  admin/          admin analytics
  api/            REST + SSE endpoints
components/     Shared UI components (Navbar, Footer, PricingCards)
lib/            auth, db, stripe, email, bot-client, analytics, tokens, env
db/migrations/  SQL migrations
legacy-static/  Old static marketing page (reference only)
```

## Stripe setup

Products already exist:
- Premium: `prod_UPYSeWPotixwU2`
- VIP: `prod_UPYWwtSNL1LAqR`

Prices are resolved dynamically from active monthly prices on these products. Add new prices in Stripe and they'll be picked up on next boot (cache TTL = 10 min).

## Bot API contract

The Next.js app calls the Discord bot for:

- `POST /api/internal/sync-role` — apply/remove Discord role for a tier change
- `POST /api/internal/account-link` — consume a 6-char link code when user runs `/link` in Discord
- `POST /api/internal/chat/stream` — SSE chat passthrough (Next.js forwards user identity headers)
- `GET  /api/internal/chat/export` — chat history export (JSON or CSV)
- `GET  /api/internal/dashboard/summary` — dashboard stats by Discord ID

All calls are authenticated with `Authorization: Bearer $INTERNAL_API_KEY` plus `X-Web-User-*` identity headers.

See the companion tracking issue in the bot repo for the server-side implementation checklist.

## License

Proprietary — all rights reserved.