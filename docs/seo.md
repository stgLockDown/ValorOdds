# Valor Odds — SEO setup & operations

This document covers how search-engine discovery, verification, and structured
data work on valorodds.com, and the few manual steps an operator must do.

## 1. Rendering & caching

Public marketing/content pages are statically rendered (or ISR) so Cloudflare
can cache them and crawlers get a fast TTFB. The auth-aware navbar was split
into a static `MarketingNavbar` + a `NavbarAuth` client island so these pages
no longer get forced into dynamic `no-store` rendering. See `next build`
output — `/`, `/sports/*`, `/learn/*`, `/pricing`, legal pages are `○`/`●`.

## 2. Sitemaps

| URL | Contents | Refresh |
|-----|----------|---------|
| `/sitemap.xml` | Static + sport hubs + market pages + learn articles | per deploy |
| `/sitemap-games.xml` | Per-game pages `/games/[sport]/[gameId]` from the live slate | 10 min |
| `/sitemap-teams.xml` | Per-team hubs `/sports/[sport]/teams/[team]` | 60 min |
| `/sitemap-index.xml` | Index pointing at all three | 60 min |

`robots.txt` advertises all of them. **Submit `/sitemap-index.xml`** in Search
Console and Bing — that pulls in the child sitemaps automatically.

## 3. Search-engine verification (manual, one-time)

Both use the HTML-meta-tag method, wired through env vars in `app/layout.tsx`:

1. **Google Search Console** → https://search.google.com/search-console
   - Add property → URL prefix → `https://valorodds.com`
   - Choose "HTML tag", copy the `content="..."` token.
   - Set Railway var `NEXT_PUBLIC_GOOGLE_VERIFICATION=<token>` and redeploy.
   - Click Verify.
2. **Bing Webmaster Tools** → https://www.bing.com/webmasters
   - Add site → "Add a meta tag", copy the `msvalidate.01` content token.
   - Set Railway var `NEXT_PUBLIC_BING_VERIFICATION=<token>` and redeploy.
   - (Tip: Bing can also import everything directly from Google Search Console.)

After verifying, submit the sitemap index in both tools.

## 4. IndexNow (instant indexing for Bing/Yandex)

1. Generate a hex key (8–128 chars), e.g. `openssl rand -hex 16`.
2. Set Railway var `INDEXNOW_KEY=<key>` and redeploy.
3. The key is served at `https://valorodds.com/indexnow-key.txt`.
4. Call `submitToIndexNow([...urls])` (from `lib/indexnow.ts`) after publishing
   or updating content to ping Bing/Yandex immediately. No-ops if the key is
   unset.

## 5. Structured data (JSON-LD)

- **Global** (`app/layout.tsx`): Organization, WebSite (+ SearchAction),
  SoftwareApplication.
- **Sport hubs / game / team pages**: `SportsEvent` for upcoming games →
  eligible for Google sports rich results.
- **Breadcrumbs**: `BreadcrumbList` on sport/game/team/learn pages via the
  shared `<Breadcrumbs>` component (visible trail + JSON-LD from one source).
- **Learn articles**: `Article` JSON-LD; the hub uses `FAQPage` where relevant.

## 6. Programmatic SEO pages

- `/sports/[sport]` — sport hub (fat-head queries).
- `/sports/[sport]/odds/[market]` — market pages.
- `/sports/[sport]/teams/[team]` — team hubs (long-tail "TEAM odds").
- `/games/[sport]/[gameId]` — per-game pages (long-tail "A vs B odds").

All pull from `lib/public-data.ts` (cached Postgres reads, degrade to empty on
DB error so the page still renders a crawlable shell).
