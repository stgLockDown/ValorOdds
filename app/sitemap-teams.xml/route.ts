import { SITE, SPORTS } from '@/lib/seo';
import { getTeamsBySport, teamSlug } from '@/lib/public-data';

export const runtime = 'nodejs';
export const revalidate = 3600;

/**
 * Secondary sitemap of per-team hub pages
 * (/sports/[sport]/teams/[team]). Built from the distinct teams currently in
 * the odds feed for each sport.
 */
export async function GET() {
  const now = new Date().toISOString();
  const lines: string[] = [];

  for (const sport of SPORTS) {
    let teams: string[] = [];
    try {
      teams = await getTeamsBySport(sport.code);
    } catch {
      teams = [];
    }
    for (const team of teams) {
      const loc = `${SITE.url}/sports/${sport.slug}/teams/${teamSlug(team)}`;
      lines.push(
        `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.6</priority>\n  </url>`,
      );
    }
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${lines.join('\n')}\n</urlset>\n`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=7200',
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
