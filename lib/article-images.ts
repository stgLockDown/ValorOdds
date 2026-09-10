/**
 * Inline-image helpers for AI-generated article bodies.
 *
 * The article generator gives the model a small pool of REAL photos
 * harvested with the headlines (news.image_url + news.image_credit). The
 * model is instructed to embed exactly two of them mid-article as markdown
 * images. Models being models, they sometimes:
 *   - invent image URLs (guaranteed 404s),
 *   - reference the pool entries as `image-2` / `image 2` placeholders, or
 *   - embed more than the allowed number.
 *
 * `normalizeInlineImages` runs at generation time, right after the JSON
 * parse, and rewrites every image in the body to a real pool URL:
 *   - pool URL used verbatim          → keep, rebuild the caption (alt text
 *                                       + photo credit appended),
 *   - placeholder or invented URL     → substitute the next unused pool
 *                                       image in order,
 *   - beyond the max count            → dropped.
 * With an empty pool every image is stripped — an article whose harvest had
 * no photos gets zero inline images rather than broken ones.
 *
 * Captions end up as the markdown alt text, which ArticleBody's renderer
 * surfaces as a <figcaption> under the photo.
 */

export interface InlineImage {
  /** Real photo URL from the harvested news context. */
  url: string;
  /** Fallback caption (the story headline the photo shipped with). */
  caption: string;
  /** Photo agency/photographer (e.g. "Getty Images") or outlet credit. */
  credit: string | null;
}

/** hrefs that reference pool entries by position: `image-2`, `image 2`. */
const PLACEHOLDER_IMAGE_HREF = /^#?image[\s-]*(\d+)$/i;

function isRealUrl(u: string | null | undefined): u is string {
  if (!u) return false;
  return /^https?:\/\//i.test(u.trim());
}

/**
 * Rewrite image markdown in `body` against `pool`.
 * @param body     article body markdown (already citation-normalized)
 * @param pool     available real photos, in prompt order
 * @param maxImages maximum inline images to keep (default 2)
 */
export function normalizeInlineImages(body: string, pool: InlineImage[], maxImages = 2): string {
  if (!pool.length) {
    return body
      .replace(/!\[[^\]]*\]\([^)]*\)\s*/g, '')
      .replace(/\n{3,}/g, '\n\n');
  }

  const byUrl = new Map<string, InlineImage>(pool.map((p) => [p.url, p]));
  const used = new Set<string>();
  let kept = 0;

  const nextUnused = (): InlineImage | undefined => pool.find((p) => !used.has(p.url));

  const out = body.replace(/!\[([^\]]*)\]\(([^)]*)\)/g, (_full, alt: string, href: string) => {
    if (kept >= maxImages) return '';
    const h = (href || '').trim();
    const ph = PLACEHOLDER_IMAGE_HREF.exec(h);
    let img: InlineImage | undefined;
    if (isRealUrl(h) && byUrl.has(h)) {
      img = byUrl.get(h); // pool URL, used verbatim
    } else if (ph) {
      const n = parseInt(ph[1], 10);
      img =
        (Number.isInteger(n) && n >= 1 && n <= pool.length ? pool[n - 1] : undefined) ??
        nextUnused(); // positional placeholder → that entry (or next free)
    } else {
      img = nextUnused(); // invented/unknown URL → substitute a real one
    }
    if (!img || used.has(img.url)) return '';
    used.add(img.url);
    kept += 1;
    const caption = (alt || img.caption || '').trim().replace(/\s+/g, ' ').slice(0, 140);
    const credit = img.credit ? ` — ${img.credit}` : '';
    return `![${caption}${credit}](${img.url})`;
  });

  // Tidy any doubled blank lines left by dropped images.
  return out.replace(/\n{3,}/g, '\n\n');
}
