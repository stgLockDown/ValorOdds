import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * IndexNow key file, served at a fixed, collision-free path.
 *
 * IndexNow (Bing / Yandex instant indexing) lets you host the key file at any
 * URL as long as you pass `keyLocation` in the submit call pointing here. We
 * use this instead of the root /<key>.txt convention so we never add a
 * top-level catch-all route that could shadow other pages.
 *
 * Returns 404 when INDEXNOW_KEY is unset so the feature is simply inert until
 * configured.
 */
export async function GET() {
  const key = process.env.INDEXNOW_KEY;
  if (!key) return new NextResponse('Not Found', { status: 404 });
  return new NextResponse(key, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
