import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import {
  getArticleById,
  updateArticle,
  publishArticle,
  rejectArticle,
  deleteArticle,
} from '@/lib/news-platform';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Single-article admin operations.
 *
 * GET    /api/admin/news/articles/[id]
 * PATCH  /api/admin/news/articles/[id]   { title?, subtitle?, body_md?, …, status? }
 *        — full editor save; status changes stamp the reviewer.
 *        — status 'published' publishes (sets published_at).
 *        — status 'rejected' requires reviewNotes.
 * DELETE /api/admin/news/articles/[id]
 */

type Params = { params: { id: string } };

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.isAdmin) return null;
  return session;
}

export async function GET(_req: Request, { params }: Params) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const article = await getArticleById(params.id);
  if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ article });
}

const UpdateSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  subtitle: z.string().trim().max(300).nullable().optional(),
  body_md: z.string().min(1).optional(),
  cover_image_url: z.string().url().max(1000).nullable().optional(),
  image_credit: z.string().max(200).nullable().optional(),
  sport: z.string().max(50).nullable().optional(),
  subject_name: z.string().max(120).nullable().optional(),
  tags: z.array(z.string().max(40)).max(8).optional(),
  byline: z.string().max(120).optional(),
  status: z
    .enum(['draft', 'in_review', 'pending_review', 'approved', 'rejected', 'published'])
    .optional(),
  review_notes: z.string().max(2000).nullable().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let input: z.infer<typeof UpdateSchema>;
  try {
    input = UpdateSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'Invalid input', detail: String(e).slice(0, 300) }, { status: 400 });
  }

  const existing = await getArticleById(params.id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (input.status === 'rejected' && !input.review_notes && !existing.review_notes) {
    return NextResponse.json(
      { error: 'Rejection requires review notes explaining why' },
      { status: 400 }
    );
  }

  if (input.status === 'published') {
    const published = await publishArticle(params.id, session.user.id!);
    // Re-save any field edits that came with the publish action.
    const { status: _s, ...fieldEdits } = input;
    const merged = { ...fieldEdits, status: 'published' };
    const updated = Object.keys(fieldEdits).length
      ? await updateArticle(params.id, merged as never, session.user.id)
      : published;
    console.error(
      `[admin-news] published article ${params.id} "${existing.title}" by ${session.user.email}`
    );
    return NextResponse.json({ article: updated });
  }

  const updated = await updateArticle(params.id, input as never, session.user.id ?? null);
  console.error(
    `[admin-news] updated article ${params.id} (status: ${input.status ?? existing.status}) by ${session.user.email}`
  );
  return NextResponse.json({ article: updated });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const existing = await getArticleById(params.id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await deleteArticle(params.id);
  console.error(`[admin-news] deleted article ${params.id} "${existing.title}" by ${session.user.email}`);
  return NextResponse.json({ ok: true });
}
