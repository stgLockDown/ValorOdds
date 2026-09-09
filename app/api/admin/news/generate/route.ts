import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { generateArticleDraft, previewWeeklySubjects } from '@/lib/article-generator';
import { createArticle, setAuthorByline } from '@/lib/news-platform';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // AI generation can take a couple minutes

/**
 * Admin-only AI article generation for News Studio.
 *
 * GET  /api/admin/news/generate
 *      → weekly rotation preview: week number, focus mode (player/team),
 *        trending subject candidates with mention counts + images.
 *
 * POST /api/admin/news/generate
 *      { subjectName?, subjectType? }
 *      → runs the full generate pipeline (subject → context harvest → AI →
 *        image harvest) and stores the draft with status 'pending_review'.
 *        Nothing is published — approval is a separate explicit action.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const preview = await previewWeeklySubjects();
    return NextResponse.json(preview);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Preview failed' },
      { status: 500 }
    );
  }
}

const Body = z.object({
  subjectName: z.string().trim().min(2).max(120).optional().nullable(),
  subjectType: z.enum(['player', 'team']).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!session.user.id) {
    return NextResponse.json({ error: 'No user id on session' }, { status: 401 });
  }

  let input: z.infer<typeof Body>;
  try {
    input = Body.parse(await req.json().catch(() => ({})));
  } catch {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  try {
    const draft = await generateArticleDraft({
      subjectName: input.subjectName ?? null,
      subjectType: input.subjectType,
    });

    const byline = await setAuthorByline(session.user.id);
    const article = await createArticle({
      title: draft.title,
      subtitle: draft.subtitle,
      body_md: draft.body_md,
      cover_image_url: draft.cover_image_url,
      image_credit: draft.image_credit,
      sport: draft.sport,
      subject_type: draft.subject_type,
      subject_name: draft.subject_name,
      tags: draft.tags,
      status: 'pending_review',
      author_id: session.user.id,
      byline,
      is_ai_generated: true,
      generator_model: draft.generator_model,
      generator_prompt_subject: `${draft.subject_type}: ${draft.subject_name}`,
      source_links: draft.source_links,
    });

    console.error(
      `[admin-news] AI article generated: "${article.title}" (subject: ${draft.subject_name}, model: ${draft.generator_model}) by ${session.user.email}`
    );
    return NextResponse.json({ article });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed';
    console.error('[admin-news] generation failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
