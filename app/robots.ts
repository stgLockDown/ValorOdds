import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/seo';

/**
 * App Router robots.txt generator.
 *
 * Crawl policy:
 *  - Allow all legitimate search engines to index public marketing, sport,
 *    arbitrage, and learn pages.
 *  - Block authenticated/private surfaces: dashboard, account, admin.
 *  - Block API routes that return data or perform actions, but explicitly
 *    ALLOW /api/og (our public Open Graph image endpoint) so social cards
 *    and Google image preview can fetch it.
 *  - Block transactional / one-time auth paths (verify, reset, forgot).
 *  - Block Next.js internals and raw JSON.
 *  - Disallow known AI training / scraping bots site-wide (we want to appear
 *    in classic search and AI *search* results, but not be used as free
 *    training data).
 *  - Point crawlers at the sitemap.
 *
 * Note: Cloudflare may also inject a "managed" robots block ahead of this one.
 * We keep our own rules authoritative and non-conflicting: a single
 * `userAgent: '*'` group plus explicit per-bot disallows.
 */

// Bots that scrape content primarily to train/feed LLMs. We opt out of these
// while remaining fully open to Googlebot, Bingbot, DuckDuckBot, etc.
const AI_AND_SCRAPER_BOTS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'CCBot',
  'ClaudeBot',
  'Claude-Web',
  'anthropic-ai',
  'Google-Extended',
  'Applebot-Extended',
  'Amazonbot',
  'Bytespider',
  'meta-externalagent',
  'FacebookBot',
  'Diffbot',
  'Omgilibot',
  'PerplexityBot',
  'cohere-ai',
  'ImagesiftBot',
  'DataForSeoBot',
];

export default function robots(): MetadataRoute.Robots {
  const disallow = [
    '/dashboard',
    '/account',
    '/admin',
    '/checkout',
    '/api/',
    '/auth/verify',
    '/auth/reset-password',
    '/auth/forgot-password',
    '/_next/',
    '/*.json$',
  ];

  return {
    rules: [
      {
        userAgent: '*',
        // Allow everything by default, then carve out private surfaces.
        // Explicitly re-allow the public OG image endpoint.
        allow: ['/', '/api/og'],
        disallow,
      },
      // Opt the site out of AI training / scraping crawlers.
      ...AI_AND_SCRAPER_BOTS.map((userAgent) => ({
        userAgent,
        disallow: ['/'],
      })),
    ],
    sitemap: [`${SITE.url}/sitemap.xml`],
    host: SITE.url,
  };
}
