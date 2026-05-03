/** @type {import('next').NextConfig} */

/**
 * Production-grade Next.js config focused on Core Web Vitals and SEO.
 *
 * Key performance / CWV levers:
 *  - SWC minification (default in 14+, reaffirmed here).
 *  - Compression enabled at the Next server (Brotli at the CDN edge is still
 *    recommended for maximum savings).
 *  - `optimizePackageImports` trims bundle size for tree-shake-friendly libs.
 *  - `next/image` configured with AVIF + WebP and a conservative 60s
 *    `minimumCacheTTL` so transformed images cache aggressively.
 *  - Static assets under `/_next/static/*` and `/public/*` get long-lived
 *    immutable cache headers (filenames are content-hashed).
 *
 * Security / SEO headers:
 *  - HSTS with preload + includeSubDomains + 2-year max-age (the values
 *    required for https://hstspreload.org submission).
 *  - X-Frame-Options SAMEORIGIN (defense-in-depth; CSP frame-ancestors is
 *    the modern equivalent).
 *  - X-Content-Type-Options nosniff.
 *  - Referrer-Policy strict-origin-when-cross-origin.
 *  - Permissions-Policy locks down sensor/media features we don't use.
 *  - Content-Security-Policy in Report-Only first (flip to enforcing after
 *    a week of clean reports — see docs/performance.md).
 */

const isProd = process.env.NODE_ENV === 'production';

// --- CSP (Report-Only) -------------------------------------------------------
// Designed to allow what the app actually uses while staying strict. The
// directives below permit:
//   - Self-hosted fonts via next/font (served from /_next/static)
//   - Inline JSON-LD via dangerouslySetInnerHTML (still requires
//     'unsafe-inline' until Next app-router ships per-request nonces —
//     tracked in vercel/next.js#49592).
//   - Stripe.js for checkout flows.
//   - GA4 / gtag for Web Vitals reporting.
//   - Discord CDN and Unsplash for images (matches images.remotePatterns).
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://*.stripe.com https://www.googletagmanager.com https://www.google-analytics.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://cdn.discordapp.com https://images.unsplash.com https://www.google-analytics.com",
  "connect-src 'self' https://*.stripe.com https://www.google-analytics.com https://region1.google-analytics.com",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(self), geolocation=(), interest-cohort=()',
  },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Content-Security-Policy-Report-Only', value: CSP_DIRECTIVES },
];

// HSTS only in production. The two-year max-age + preload combo is the
// prerequisite for https://hstspreload.org inclusion.
if (isProd) {
  securityHeaders.push({
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  });
}

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  // Tighter production source maps improve debuggability without inflating
  // client bundles. Disabled by default in Next 14, kept off explicitly here.
  productionBrowserSourceMaps: false,

  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
    // Trim bundle size for tree-shake-friendly libs. Safe list — every entry
    // below is a library the app actually imports.
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      '@radix-ui/react-icons',
    ],
  },

  images: {
    // AVIF first (smaller), then WebP (broader support). Browsers receive the
    // first format they accept via the Accept header.
    formats: ['image/avif', 'image/webp'],
    // Conservative default — individual `next/image` usages can override.
    minimumCacheTTL: 60,
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.discordapp.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },

  async headers() {
    return [
      // Default security headers for every route.
      {
        source: '/:path*',
        headers: securityHeaders,
      },

      // Static assets — filenames are content-hashed so `immutable` is safe.
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // Fonts in /public (if any). These are not content-hashed, so we use a
      // moderately long TTL without `immutable`.
      {
        source: '/:path*\\.(woff|woff2|ttf|otf|eot)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
      // Icons / favicons.
      {
        source: '/:path*\\.(ico|svg|png|jpg|jpeg|gif|webp|avif)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
        ],
      },
      // Sitemap / robots / RSS — short TTL, revalidated frequently by crawlers.
      {
        source: '/(sitemap.xml|robots.txt|feed.xml)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' },
        ],
      },
      // Dynamic OG images — CDN-cached aggressively; Next regenerates them
      // behind the cache as needed.
      {
        source: '/api/og',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800' },
        ],
      },
      // Well-known files.
      {
        source: '/.well-known/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400' },
          { key: 'Content-Type', value: 'text/plain; charset=utf-8' },
        ],
      },
    ];
  },

  // Redirect common aliases / legacy URLs. Centralizes future moves; the
  // redirects themselves are cheap at the edge.
  async redirects() {
    return [
      { source: '/home', destination: '/', permanent: true },
      { source: '/index.html', destination: '/', permanent: true },
      { source: '/sign-up', destination: '/auth/signup', permanent: true },
      { source: '/sign-in', destination: '/auth/signin', permanent: true },
      { source: '/login', destination: '/auth/signin', permanent: true },
      { source: '/register', destination: '/auth/signup', permanent: true },
      { source: '/faq', destination: '/#faq', permanent: true },
    ];
  },
};

export default nextConfig;