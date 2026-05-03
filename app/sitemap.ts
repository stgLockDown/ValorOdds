import type { MetadataRoute } from 'next';
import { SITE, SPORTS, MARKETS } from '@/lib/seo';
import { allArticleMeta } from '@/components/learn/manifest';

/**
 * Next.js App Router sitemap generator.
 *
 * Produces an XML sitemap at /sitemap.xml that includes:
 *  - Marketing & product pages (home, pricing, about, etc.)
 *  - Auth landing pages (signin, signup)
 *  - Legal pages (terms, privacy, disclaimer)
 *  - Per-sport hub pages
 *  - Per-sport × per-market category pages
 *  - Learn / content hub
 *
 * Dynamic per-team / per-player / per-game pages are generated in secondary
 * sitemaps to keep this file static-renderable. Next.js automatically
 * respects a 50k URL / 50MB limit per sitemap.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE.url}/`, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE.url}/pricing`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE.url}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE.url}/auth/signin`, lastModified: now, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${SITE.url}/auth/signup`, lastModified: now, changeFrequency: 'yearly', priority: 0.8 },
    { url: `${SITE.url}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE.url}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE.url}/disclaimer`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE.url}/learn`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE.url}/learn/glossary`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE.url}/press`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE.url}/embed`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE.url}/partners`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE.url}/partners/data`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
  ];

  const sportHubs: MetadataRoute.Sitemap = SPORTS.map((s) => ({
    url: `${SITE.url}/sports/${s.slug}`,
    lastModified: now,
    changeFrequency: 'daily',
    priority: 0.9,
  }));

  const sportMarketPages: MetadataRoute.Sitemap = SPORTS.flatMap((s) =>
    MARKETS.map((m) => ({
      url: `${SITE.url}/sports/${s.slug}/odds/${m.slug}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
  );

  const arbitrageHubs: MetadataRoute.Sitemap = [
    {
      url: `${SITE.url}/arbitrage`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    ...SPORTS.map((s) => ({
      url: `${SITE.url}/arbitrage/${s.slug}`,
      lastModified: now,
      changeFrequency: 'hourly' as const,
      priority: 0.8,
    })),
  ];

  const articleRoutes: MetadataRoute.Sitemap = allArticleMeta().map((a) => ({
    url: `${SITE.url}/learn/${a.slug}`,
    lastModified: new Date(a.updated || a.published),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  return [
    ...staticRoutes,
    ...sportHubs,
    ...sportMarketPages,
    ...arbitrageHubs,
    ...articleRoutes,
  ];
}