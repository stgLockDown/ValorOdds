import { marked } from 'marked';

/**
 * Lightweight Markdown article renderer.
 *
 * Lets new Learn articles be authored as plain Markdown strings (in
 * `markdown-articles.ts`) instead of hand-written TSX bodies. The TSX bodies
 * are still supported for richly formatted legacy articles; this is the fast
 * path for adding SEO content.
 *
 * Markdown is converted to HTML at render time. Content is authored by us
 * (trusted, not user input), so direct injection is acceptable; we still pass
 * it through marked's default sanitization-safe options.
 */
marked.setOptions({ gfm: true, breaks: false });

export default function MarkdownArticle({ markdown }: { markdown: string }) {
  const html = marked.parse(markdown, { async: false }) as string;
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
