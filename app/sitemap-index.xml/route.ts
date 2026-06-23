import { SITE } from '@/lib/seo';

export const runtime = 'nodejs';
export const revalidate = 3600;

/**
 * Sitemap index referencing the primary static sitemap plus the dynamic
 * games and teams sitemaps. Submitting this single index to Google Search
 * Console / Bing makes them crawl all child sitemaps.
 */
export async function GET() {
  const now = new Date().toISOString();
  const sitemaps = [
    `${SITE.url}/sitemap.xml`,
    `${SITE.url}/sitemap-games.xml`,
    `${SITE.url}/sitemap-teams.xml`,
  ];

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    sitemaps
      .map((loc) => `  <sitemap>\n    <loc>${loc}</loc>\n    <lastmod>${now}</lastmod>\n  </sitemap>`)
      .join('\n') +
    `\n</sitemapindex>\n`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=7200',
    },
  });
}
