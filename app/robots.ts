import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/seo';

/**
 * App Router robots.txt generator.
 *
 * Crawl policy:
 *  - Allow all search engines to index public marketing, sport, and learn pages.
 *  - Block the authenticated dashboard, account, admin, and API routes.
 *  - Block next.js internals and auth callback paths.
 *  - Point crawlers at our sitemap(s).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/'],
        disallow: [
          '/dashboard',
          '/dashboard/',
          '/account',
          '/account/',
          '/admin',
          '/admin/',
          '/api/',
          '/auth/verify',
          '/auth/reset-password',
          '/auth/forgot-password',
          '/_next/',
          '/*.json$',
        ],
      },
      // Honor the most restrictive crawlers explicitly so known aggressive
      // training bots can't slurp content at will.
      { userAgent: 'GPTBot', disallow: ['/'] },
      { userAgent: 'CCBot', disallow: ['/'] },
      { userAgent: 'ClaudeBot', disallow: ['/'] },
      { userAgent: 'anthropic-ai', disallow: ['/'] },
      { userAgent: 'Google-Extended', disallow: ['/'] },
    ],
    sitemap: [`${SITE.url}/sitemap.xml`],
    host: SITE.url,
  };
}