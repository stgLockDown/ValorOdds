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
 * Output is wrapped in `.prose-learn`, the editorial typography scale.
 */

import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';
import { sanitizeLegacyCitations } from '@/lib/citations';

marked.setOptions({ gfm: true, breaks: false });

export default function ArticleBody({ markdown }: { markdown: string }) {
  const cleaned = sanitizeLegacyCitations(String(markdown || ''));
  const raw = marked.parse(cleaned, { async: false }) as string;
  const html = DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'iframe', 'script'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'style'],
    ADD_ATTR: ['target', 'rel'],
  });
  return <div className="prose-learn" dangerouslySetInnerHTML={{ __html: html }} />;
}
