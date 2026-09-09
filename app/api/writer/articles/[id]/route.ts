import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import {
  deleteArticle,
  getOwnArticle,
  isWriterUser,
  updateArticle,
  type ArticleStatus,
} from '@/lib/news-platform';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Single-article writer operations (own drafts only).
 *
 * GET    /api/writer/articles/[id]   → own article (author or admin)
 * PATCH  /api/writer/articles/[id]   { title?, body_md?, …, status? }
 *        — save edits; writers may toggle draft ⇄ in_review (submit for
 *          review / withdraw) and move rejected → draft to revise.
 *          Publishing is admin-only.
 * DELETE /api/writer/articles/[id]   → delete own unpublished article
 */

type Params = { params: { id: string } };

async function requireWriter() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const ok = await isWriterUser(session.user.id);
  if (!ok) return null;
  return session;
}

export async function GET(_req: Request, { params }: Params) {
  const session = await requireWriter();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const article = await getOwnArticle(session.user.id, params.id);
  if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ article });
}

const EditSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  subtitle: z.string().trim().max(300).nullable().optional(),
  body_md: z.string().min(1).max(60000).optional(),
  cover_image_url: z.string().url().max(1000).nullable().optional(),
  image_credit: z.string().max(200).nullable().optional(),
  sport: z.string().max(50).nullable().optional(),
  subject_name: z.string().max(120).nullable().optional(),
  tags: z.array(z.string().max(40)).max(8).optional(),
  byline: z.string().max(120).optional(),
  status: z.enum(['draft', 'in_review']).optional(),
});

/** Which status transitions a writer may perform on their own article. */
const WRITER_TRANSITIONS: Record<ArticleStatus, ArticleStatus[]> = {
  draft: ['draft', 'in_review'],
  in_review: ['in_review', 'draft'],
  rejected: ['draft'],
  approved: [],
  pending_review: [],
  published: [],
};

export async function PATCH(req: Request, { params }: Params) {
  const session = await requireWriter();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  // Give writers a specific, friendly error when they attempt to publish —
  // zod would otherwise reject `status: 'published'` as generic invalid input.
  const attempted = (raw as { status?: unknown })?.status;
  if (attempted && attempted !== 'draft' && attempted !== 'in_review') {
    return NextResponse.json(
      { error: 'Publishing is handled by the editorial team. Submit your article for review instead (status: in_review).' },
      { status: 400 }
    );
  }

  let input: z.infer<typeof EditSchema>;
  try {
    input = EditSchema.parse(raw);
  } catch (e) {
    return NextResponse.json({ error: 'Invalid input', detail: String(e).slice(0, 300) }, { status: 400 });
  }

  const existing = await getOwnArticle(session.user.id, params.id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (input.status && !WRITER_TRANSITIONS[existing.status]?.includes(input.status)) {
    return NextResponse.json(
      {
        error: `Cannot change status from '${existing.status}' to '${input.status}'. Publishing is handled by the editorial team.`,
      },
      { status: 400 }
    );
  }

  const article = await updateArticle(params.id, input, session.user.id);
  if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  console.error(
    `[writer-news] article ${params.id} updated (status ${existing.status} → ${article.status}) by ${session.user.email}`
  );
  return NextResponse.json({ article });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await requireWriter();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const existing = await getOwnArticle(session.user.id, params.id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isAdmin = session.user.isAdmin === true;
  if (existing.status === 'published' && !isAdmin) {
    return NextResponse.json(
      { error: 'Published articles can only be removed by an admin.' },
      { status: 403 }
    );
  }

  await deleteArticle(params.id);
  console.error(`[writer-news] article ${params.id} deleted by ${session.user.email}`);
  return NextResponse.json({ ok: true });
}
