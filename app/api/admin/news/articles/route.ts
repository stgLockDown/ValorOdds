import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { listArticles } from '@/lib/news-platform';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/news/articles?status=…&limit=…
 * Admin list of all articles across the workflow, review queues first.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const statusParam = url.searchParams.get('status');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '60', 10) || 60, 200);

  const status = statusParam
    ? (statusParam.split(',') as Array<string>).filter((s) =>
        ['draft', 'in_review', 'pending_review', 'approved', 'rejected', 'published'].includes(s)
      )
    : null;

  const articles = await listArticles({
    status: (status as never) ?? null,
    limit,
  });
  return NextResponse.json({ articles });
}
