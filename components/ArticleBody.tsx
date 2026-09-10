/**
 * ArticleBody — server-side markdown renderer for ValorOdds articles.
 *
 * Body markdown is stored verbatim in web_articles. It may originate from
 * our AI generator, admin authors, or granted writers — i.e. not fully
 * trusted input — so it is always parsed with marked and sanitized with
 * isomorphic-dompurify before injection.
 *
 * Before rendering, placeholder citations left by older AI generations
 * (e.g. `[source 3](source-3)` — dead relative links) are stripped by
 * lib/citations. New generations are normalized at generation time.
 *
 * Inline images (generator embeds real harvested photos mid-article) are
 * rendered through a custom marked renderer as <figure> + <figcaption>:
 * rounded, border, and the photo credit appended to the alt text by
 * lib/article-images surfaces as the caption line.
 *
 * Output is wrapped in `.prose-learn`, the editorial typography scale.
 */

import { marked, type Tokens, type RendererObject } from 'marked';
import DOMPurify from 'isomorphic-dompurify';
import { sanitizeLegacyCitations } from '@/lib/citations';

/** Editorial image renderer: <figure><img><figcaption>. */
function renderFigureImage(token: Tokens.Image): string {
  const href = String(token.href || '').trim();
  const rawAlt = String(token.text || '').trim();
  // Only render real http(s) images; anything else (leftover relative or
  // placeholder hrefs) is dropped rather than shown broken.
  if (!/^https?:\/\//i.test(href)) return '';
  const alt = rawAlt
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const src = href.replace(/"/g, '&quot;');
  return (
    `<figure class="article-figure">` +
    `<img src="${src}" alt="${alt}" loading="lazy" />` +
    (rawAlt ? `<figcaption>${alt}</figcaption>` : '') +
    `</figure>`
  );
}

const figureRenderer: RendererObject = {
  image(token) {
    return renderFigureImage(token as Tokens.Image);
  },
};

marked.use({ gfm: true, breaks: false, renderer: figureRenderer });

export default function ArticleBody({ markdown }: { markdown: string }) {
  const cleaned = sanitizeLegacyCitations(String(markdown || ''));
  const raw = marked.parse(cleaned, { async: false }) as string;
  const html = DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'iframe', 'script'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'style'],
    ADD_ATTR: ['target', 'rel', 'loading'],
  });
  return <div className="prose-learn" dangerouslySetInnerHTML={{ __html: html }} />;
}
