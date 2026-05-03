# Performance & Core Web Vitals

This doc explains the performance infrastructure introduced in the SEO
overhaul and, critically, **what you need to do after merging** to actually
turn each piece on in production.

## TL;DR — operator checklist

- [ ] Set `NEXT_PUBLIC_GA_MEASUREMENT_ID` (for real-user CWV via GA4) **or**
      `NEXT_PUBLIC_VITALS_ENDPOINT` (for a custom backend).
- [ ] Set `NEXT_PUBLIC_GOOGLE_VERIFICATION` + `NEXT_PUBLIC_BING_VERIFICATION`.
- [ ] Submit `https://valorodds.com` to https://hstspreload.org once HSTS
      has been live for a week with no issues.
- [ ] Watch `Content-Security-Policy-Report-Only` violations for 7 days, then
      flip the header key to `Content-Security-Policy` in
      `next.config.mjs`.
- [ ] Add `LHCI_GITHUB_APP_TOKEN` to GitHub repo secrets (optional — enables
      Lighthouse CI PR comments).

## Architecture

### 1. Self-hosted fonts via `next/font`

Inter is loaded through `next/font/google` in `app/layout.tsx`. Next fetches
the font files at build time and serves them from `/_next/static/media/`
under the same origin. This eliminates:

- The DNS lookup to `fonts.googleapis.com`
- The DNS lookup to `fonts.gstatic.com`
- The round-trip to fetch the CSS
- The subsequent round-trip to fetch the font file

In production this consistently shaves **200-400ms off LCP** on cold loads
over mobile networks.

The `display: 'swap'` setting means text paints in the fallback stack
(`-apple-system` → `BlinkMacSystemFont` → `Segoe UI` → system) immediately,
then swaps to Inter once it loads. This is the CWV-friendly default — users
see content before the font finishes downloading.

### 2. Real-user Web Vitals via `components/WebVitals.tsx`

Hooks Next.js's built-in `useReportWebVitals` to ship measurements to one of
two destinations:

- **GA4**: set `NEXT_PUBLIC_GA_MEASUREMENT_ID`. The component lazily loads
  `gtag.js` and fires `web_vitals` events with the metric name, value, id,
  and rating (`good` / `needs-improvement` / `poor`).
- **Custom endpoint**: set `NEXT_PUBLIC_VITALS_ENDPOINT`. Metrics are POSTed
  as JSON, preferring `navigator.sendBeacon` so they survive page unload.

Both can be enabled simultaneously. In development the component logs to
the console so regressions are visible in DevTools.

Metrics collected:
- **LCP** — Largest Contentful Paint (target < 2.5s)
- **CLS** — Cumulative Layout Shift (target < 0.1)
- **INP** — Interaction to Next Paint (target < 200ms). Replaced FID in
  Core Web Vitals in March 2024.
- **FCP** — First Contentful Paint
- **TTFB** — Time to First Byte

### 3. HSTS preload + security headers

`next.config.mjs` sets:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  (production only). The 2-year max-age and preload directives are the
  prerequisites for submitting to the Chrome HSTS preload list at
  https://hstspreload.org.
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — locks down camera/microphone/geolocation and
  FLoC/Topics (`interest-cohort=()`).
- `Content-Security-Policy-Report-Only` — starts in report-only mode so we
  can confirm it doesn't break anything in the real world.

**Action required:** After a week of watching CSP violation reports (or
running the app end-to-end on staging), change the header key in
`next.config.mjs` from `Content-Security-Policy-Report-Only` to
`Content-Security-Policy`. The same directive list becomes enforcing.

### 4. Cache-Control headers

`next.config.mjs` sets per-path cache policies:

| Path pattern | Cache-Control |
|--------------|----------------|
| `/_next/static/*` | `public, max-age=31536000, immutable` |
| `*.(woff\|woff2\|ttf\|otf\|eot)` | `public, max-age=31536000` |
| `*.(ico\|svg\|png\|jpg\|jpeg\|gif\|webp\|avif)` | `public, max-age=604800, stale-while-revalidate=86400` |
| `/sitemap.xml`, `/robots.txt`, `/feed.xml` | `public, max-age=3600, stale-while-revalidate=86400` |
| `/api/og` | `public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800` |
| `/.well-known/*` | `public, max-age=86400` |

Static assets under `/_next/static/` are content-hashed, so `immutable` is
safe and tells browsers to never revalidate.

### 5. Image optimization

`next.config.mjs` configures `next/image` to serve AVIF first, then WebP,
falling back to the original format. `OptimizedImage` in `components/`
wraps `next/image` to enforce the three things that actually move CWV:
explicit width + height (prevents CLS), `sizes` attribute (right-sized
downloads), and explicit `priority` only for above-the-fold images.

There are currently no `<img>` tags in the app — everything is either
`next/image` or an SVG icon, so no migration is needed. Future images
should use `OptimizedImage`.

### 6. Package import optimization

`experimental.optimizePackageImports` trims bundle size for three
tree-shake-friendly libraries:

- `lucide-react` (icon library — massive footprint if imported naively)
- `date-fns`
- `@radix-ui/react-icons`

This works by rewriting `import { X } from 'lib'` to the specific sub-path
at build time, so only the parts actually used ship to the client.

### 7. Route-level loading UIs

Added `loading.tsx` at:

- `app/sports/[sport]/loading.tsx`
- `app/sports/[sport]/odds/[market]/loading.tsx`
- `app/arbitrage/[sport]/loading.tsx`

These render skeletons that match the real page structure, which means:

- Navigation feels instant (browser paints the skeleton while data fetches).
- CLS stays near zero on navigation because the skeleton reserves the right
  amount of space.
- Time-to-interactive on the skeleton itself is effectively zero (it ships
  as part of the shell bundle).

### 8. Lighthouse CI

`.lighthouserc.json` + `.github/workflows/lighthouse-ci.yml` run Lighthouse
on every PR against 10 representative URLs:

- `/` (home)
- `/pricing`, `/about`
- `/sports`, `/sports/mlb`
- `/sports/nfl/odds/moneyline` (programmatic)
- `/arbitrage`
- `/learn`, `/learn/what-is-arbitrage-betting`, `/learn/glossary`

The build runs with `NODE_ENV=production` against the empty-DB baseline
(which is the correct surface to measure, since the cold-start user sees
exactly this).

Assertion thresholds (see `.lighthouserc.json`):

| Category | Threshold | Level |
|----------|-----------|-------|
| Performance | >= 0.85 | warn |
| Accessibility | >= 0.9 | error |
| Best practices | >= 0.9 | warn |
| SEO | >= 0.95 | error |
| LCP | <= 2500ms | warn |
| CLS | <= 0.1 | error |
| TBT | <= 300ms | warn |

SEO and accessibility fail the PR on regression. Performance metrics warn
(surface in PR comments) but don't block, because network conditions in
GitHub Actions runners are unstable enough to cause false positives.

To enable PR comments from the Lighthouse CI GitHub App:
1. Install https://github.com/apps/lighthouse-ci on the repo.
2. Add the token as `LHCI_GITHUB_APP_TOKEN` in repo secrets.

### 9. Redirects

`next.config.mjs` `redirects()` canonicalizes common variants:

- `/home`, `/index.html` → `/`
- `/sign-up`, `/register` → `/auth/signup`
- `/sign-in`, `/login` → `/auth/signin`
- `/faq` → `/#faq`

All are permanent (308) so search engines consolidate ranking signal onto
the canonical URL.

## Performance budget

These are the numbers we build against. Anything consistently over these
thresholds in RUM should be investigated.

| Metric | Good | Budget |
|--------|------|--------|
| LCP | < 2.5s | 2.5s |
| CLS | < 0.1 | 0.1 |
| INP | < 200ms | 200ms |
| TTFB | < 800ms | 800ms |
| JS bundle (First Load) | — | 120kB gzipped |
| Total page weight | — | 500kB |

Current first-load JS (from the last build): **87.3 kB** gzipped, which
is comfortably under the 120kB budget.

## What's explicitly not in this PR

- **Edge runtime migration for routes** — investigating which routes can
  move to edge for lower TTFB needs a separate measurement pass.
- **Partytown / third-party script sandboxing** — currently no heavy
  third-party scripts. Revisit if we add analytics beyond GA4 or chat
  widgets.
- **Service worker / offline support** — PWA manifest is live but we are
  not installing a service worker. Requires separate risk review because
  bad service workers can brick a site.
- **Critical CSS inlining** — Next 14 already does this for the app
  router. Monitor and revisit only if Lighthouse flags render-blocking
  CSS in production.