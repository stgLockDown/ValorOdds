import { jsonLdScript } from '@/lib/seo';

/**
 * Server-rendered JSON-LD script tag.
 *
 * Use one JsonLd component per structured-data payload. Multiple payloads on
 * a single page are fine and are how Google/Bing prefer to ingest them
 * (vs. a single @graph blob). We emit with `dangerouslySetInnerHTML` because
 * Next's `<Script>` serializes as data blobs that crawlers don't always
 * pick up; inline script tags are the most widely supported path.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  const payloads = Array.isArray(data) ? data : [data];
  return (
    <>
      {payloads.map((p, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(p) }}
        />
      ))}
    </>
  );
}