import { SITE, SPORTS } from '@/lib/seo';
import { getAllUpcomingGames } from '@/lib/public-data';

export const runtime = 'nodejs';
export const revalidate = 600;

/**
 * Secondary sitemap of per-game pages (/games/[sport]/[gameId]).
 *
 * Generated from the live upcoming-games slate. Kept separate from the main
 * static sitemap so the high-churn URLs don't force the primary sitemap to
 * regenerate constantly, and so we stay well within the 50k-URL limit.
 */
export async function GET() {
  const codes = SPORTS.map((s) => s.code);
  let games: Awaited<ReturnType<typeof getAllUpcomingGames>> = [];
  try {
    games = await getAllUpcomingGames(codes, 60);
  } catch {
    games = [];
  }

  const now = new Date().toISOString();
  const urls = games
    .map((g) => {
      const loc = `${SITE.url}/games/${g.slug}/${encodeURIComponent(g.gameId)}`;
      return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>hourly</changefreq>\n    <priority>0.6</priority>\n  </url>`;
    })
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=600, s-maxage=600, stale-while-revalidate=1800',
    },
  });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
