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
 * A photo already used as the article's hero/cover image must never also
 * appear inline — the reader would see the exact same image twice. Pass the
 * cover URL via `excludeUrls` (or pre-filter the pool with
 * `inlinePoolExcludingCover`) and any inline attempt at the cover is
 * substituted with the next distinct pool photo.
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

/** Match an image filename tail: `…/853/photo.jpg` → `photo.jpg`. */
const IMAGE_FILE_KEY = /\/([^/?#]+)\.(jpe?g|png|webp|gif|avif)(?:[?#].*)?$/i;

function imageFileKey(u: string): string | null {
  const m = IMAGE_FILE_KEY.exec(u.trim());
  return m ? `${m[1]}.${m[2]}` : null;
}

/**
 * True when two image URLs point at the same underlying photo — either the
 * exact same URL, or the same filename served from a different CDN path /
 * resize variant (e.g. `…/photo.jpg` vs `…/853/photo.jpg`).
 */
export function isSameImage(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = (a ?? '').trim();
  const y = (b ?? '').trim();
  if (!x || !y) return false;
  if (x === y || x.toLowerCase() === y.toLowerCase()) return true;
  const kx = imageFileKey(x);
  const ky = imageFileKey(y);
  return Boolean(kx && ky && kx.toLowerCase() === ky.toLowerCase());
}

/**
 * The photos that are safe to embed mid-article: everything in `pool`
 * except whichever one the article uses as its hero/cover image. The hero
 * already renders at the top of the page, so embedding the same photo again
 * inline would show the reader the exact same image twice.
 */
export function inlinePoolExcludingCover(
  pool: InlineImage[],
  coverUrl: string | null | undefined,
): InlineImage[] {
  if (!coverUrl) return [...pool];
  return pool.filter((p) => !isSameImage(p.url, coverUrl));
}

function isRealUrl(u: string | null | undefined): u is string {
  if (!u) return false;
  return /^https?:\/\//i.test(u.trim());
}

/**
 * Rewrite image markdown in `body` against `pool`.
 * @param body     article body markdown (already citation-normalized)
 * @param pool     available real photos, in prompt order
 * @param maxImages maximum inline images to keep (default 2)
 * @param excludeUrls URLs that must never appear inline — pass the article's
 *                   cover/hero image so an inline attempt at it (same URL or
 *                   a CDN resize variant of it) is substituted with the next
 *                   distinct pool photo instead of kept
 */
export function normalizeInlineImages(
  body: string,
  pool: InlineImage[],
  maxImages = 2,
  excludeUrls: string[] = [],
): string {
  const excluded = excludeUrls.map((u) => (u ?? '').trim()).filter(Boolean);
  const isExcluded = (u: string) => excluded.some((e) => isSameImage(e, u));
  const avail = pool.filter((p) => !isExcluded(p.url));
  if (!avail.length) {
    return body
      .replace(/!\[[^\]]*\]\([^)]*\)\s*/g, '')
      .replace(/\n{3,}/g, '\n\n');
  }

  const byUrl = new Map<string, InlineImage>(avail.map((p) => [p.url, p]));
  const used = new Set<string>();
  let kept = 0;

  const nextUnused = (): InlineImage | undefined => avail.find((p) => !used.has(p.url));

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
        (Number.isInteger(n) && n >= 1 && n <= avail.length ? avail[n - 1] : undefined) ??
        nextUnused(); // positional placeholder → that entry (or next free)
    } else {
      img = nextUnused(); // invented/unknown URL → substitute a real one
    }
    if (!img || used.has(img.url)) return '';
    used.add(img.url);
    kept += 1;
    let caption = (alt || img.caption || '').trim().replace(/\s+/g, ' ').slice(0, 140);
    // The prompt tells the model to append the credit itself; if it did,
    // strip the trailing duplicate before re-adding the canonical one.
    const credit = (img.credit ?? '').trim();
    if (credit && caption.toLowerCase().endsWith(credit.toLowerCase())) {
      caption = caption.slice(0, caption.length - credit.length).replace(/\s*[—–-]\s*$/, '').trim();
    }
    const creditSuffix = credit ? ` — ${credit}` : '';
    return `![${caption}${creditSuffix}](${img.url})`;
  });

  // Tidy any doubled blank lines left by dropped images.
  return out.replace(/\n{3,}/g, '\n\n');
}
