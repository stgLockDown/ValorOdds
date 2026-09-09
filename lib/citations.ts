/**
 * Citation helpers for AI-generated article bodies.
 *
 * Why this exists: when the generator's context headlines carry no source
 * URLs (they historically didn't — the ingestion pipeline wrote url=''),
 * models cite the numbered context entries instead, producing placeholder
 * links like `[source 3](source-3)`. Those render as dead relative links
 * labeled "source 3" on the public article page.
 *
 * Two defenses live here:
 *  1. mapPlaceholderCitations — generation time: rewrite placeholder links
 *     to the real source URL (label = source name or host), or drop them
 *     when no URL exists.
 *  2. sanitizeLegacyCitations — render-time guard: strip any placeholder
 *     citation that still made it into a stored body (legacy rows).
 */

export interface CitationSource {
  /** Story URL (may be null/empty when the harvest had none). */
  url: string | null;
  /** Human source name, e.g. "ESPN". */
  name?: string | null;
}

/** hrefs that are placeholder refs: `source-3`, `#source 3`, `3`. */
const PLACEHOLDER_HREF = /^#?(?:source[\s-]*(\d+)|(\d+))$/i;
/** link labels like "source 3" or "3". */
const PLACEHOLDER_LABEL = /^#?(?:source[\s-]*\d+|\d+)$/i;

function hostLabel(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return 'source';
  }
}

function isRealUrl(u: string | null | undefined): u is string {
  if (!u) return false;
  return /^https?:\/\//i.test(u.trim());
}

/** Tidy whitespace left by dropped citations. */
function tidySpacing(s: string): string {
  return s
    .replace(/ {2,}/g, ' ')
    .replace(/ +([.,;:!?)])/g, '$1')
    .replace(/\( +/g, '(');
}

/**
 * Generation-time normalization. `sources` is the 1-ordered context list
 * (index 0 = [1]) the model was prompted with.
 */
export function mapPlaceholderCitations(body: string, sources: CitationSource[]): string {
  // URL → preferred label (source name), for relabeling real links that
  // still carry a placeholder label.
  const labelByUrl = new Map<string, string>();
  for (const s of sources) {
    if (isRealUrl(s.url) && s.name?.trim()) labelByUrl.set(s.url.trim(), s.name.trim());
  }

  const out = body.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (full, label: string, href: string) => {
    const h = (href || '').trim();
    const m = PLACEHOLDER_HREF.exec(h);
    if (m) {
      const n = parseInt(m[1] ?? m[2], 10);
      const src = Number.isInteger(n) && n >= 1 && n <= sources.length ? sources[n - 1] : null;
      const url = isRealUrl(src?.url) ? src!.url!.trim() : null;
      if (!url) return ''; // unknown source → drop the citation
      const name = labelByUrl.get(url) || hostLabel(url);
      return `[${name}](${url})`;
    }
    if (isRealUrl(h) && PLACEHOLDER_LABEL.test((label || '').trim())) {
      // Real URL but placeholder label → relabel with source name/host.
      const name = labelByUrl.get(h) || hostLabel(h);
      return `[${name}](${h})`;
    }
    return full;
  });

  return tidySpacing(out);
}

/**
 * Render-time guard for legacy bodies: removes placeholder citations
 * outright. No index→URL mapping is attempted — headline dedup in the
 * original harvest context makes Nth-link mapping unreliable, and a wrong
 * URL attached to a factual claim is worse than no link.
 */
export function sanitizeLegacyCitations(body: string): string {
  const out = body.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (full, label: string, href: string) => {
    const h = (href || '').trim();
    if (PLACEHOLDER_HREF.test(h)) return '';
    return full;
  });
  return tidySpacing(out);
}
