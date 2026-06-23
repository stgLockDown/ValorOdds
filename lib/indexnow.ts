import { SITE } from '@/lib/seo';

/**
 * IndexNow client — pings Bing/Yandex to instantly (re)index URLs.
 *
 * No-ops when INDEXNOW_KEY is unset, so it's safe to call unconditionally.
 * Use after publishing/updating content (e.g. a new Learn article) to get
 * faster indexing than waiting for the next crawl.
 */
export async function submitToIndexNow(urls: string[]): Promise<boolean> {
  const key = process.env.INDEXNOW_KEY;
  if (!key || urls.length === 0) return false;

  const host = new URL(SITE.url).host;
  const payload = {
    host,
    key,
    keyLocation: `${SITE.url}/indexnow-key.txt`,
    urlList: urls.slice(0, 10000),
  };

  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
