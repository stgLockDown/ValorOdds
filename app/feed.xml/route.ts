import { SITE } from '@/lib/seo';
import { allArticleMeta } from '@/components/learn/manifest';

/**
 * RSS 2.0 feed at /feed.xml covering the Learn article stream.
 *
 * Some crawlers (e.g., Feedly, Flipboard) and partner sites use RSS as a
 * discovery path; Google also uses feeds as a sitemap substitute for news.
 */

export const runtime = 'nodejs';
export const revalidate = 3600;

function esc(s: string): string {
  return s
    .replace(/&/g, "&" + "amp;")
    .replace(/</g, "&" + "lt;")
    .replace(/>/g, "&" + "gt;")
    .replace(/"/g, "&" + "quot;")
    .replace(/'/g, "&" + "apos;");
}

export async function GET() {
  const articles = allArticleMeta();
  const buildDate = new Date().toUTCString();

  const items = articles
    .map((a) => {
      const url = `${SITE.url}/learn/${a.slug}`;
      const pubDate = new Date(a.published).toUTCString();
      return `    <item>
      <title>${esc(a.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${pubDate}</pubDate>
      <category>${esc(a.category)}</category>
      <description>${esc(a.description)}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(SITE.name)} - Learn</title>
    <link>${SITE.url}/learn</link>
    <description>Sports betting guides, strategy, and analysis from Valor Odds.</description>
    <language>en-us</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <atom:link href="${SITE.url}/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
