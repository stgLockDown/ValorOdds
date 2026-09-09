import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import {
  createArticle,
  isWriterUser,
  listArticles,
  setAuthorByline,
  type Article,
} from '@/lib/news-platform';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Writer workspace API.
 *
 * Writers (role granted by an admin, or admins themselves) draft articles
 * here. Writer-submitted work always lands as 'draft' and can be submitted
 * for review ('in_review') — publishing is an admin-only action.
 *
 * GET  /api/writer/articles        → the signed-in writer's own articles
 * POST /api/writer/articles        → create a new draft
 */

async function requireWriter() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const ok = await isWriterUser(session.user.id);
  if (!ok) return null;
  return session;
}

export async function GET() {
  const session = await requireWriter();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const articles = await listArticles({ authorId: session.user.id, limit: 100 });
  return NextResponse.json({ articles });
}

const CreateSchema = z.object({
  title: z.string().trim().min(3).max(200),
  subtitle: z.string().trim().max(300).nullable().optional(),
  body_md: z.string().min(1).max(60000),
  cover_image_url: z.string().url().max(1000).nullable().optional(),
  image_credit: z.string().max(200).nullable().optional(),
  sport: z.string().max(50).nullable().optional(),
  subject_type: z.enum(['player', 'team', 'general']).optional(),
  subject_name: z.string().max(120).nullable().optional(),
  tags: z.array(z.string().max(40)).max(8).optional(),
  // writers may only ever start drafts from this endpoint
  status: z.literal('draft').optional(),
});

export async function POST(req: Request) {
  const session = await requireWriter();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let input: z.infer<typeof CreateSchema>;
  try {
    input = CreateSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'Invalid input', detail: String(e).slice(0, 300) }, { status: 400 });
  }

  const byline = await setAuthorByline(session.user.id);
  const article: Article = await createArticle({
    title: input.title,
    subtitle: input.subtitle ?? null,
    body_md: input.body_md,
    cover_image_url: input.cover_image_url ?? null,
    image_credit: input.image_credit ?? null,
    sport: input.sport ?? null,
    subject_type: input.subject_type ?? 'general',
    subject_name: input.subject_name ?? null,
    tags: input.tags ?? [],
    status: 'draft',
    author_id: session.user.id,
    byline,
    is_ai_generated: false,
  });

  console.error(`[writer-news] draft created (id=${article.id}) by ${session.user.email}`);
  return NextResponse.json({ article }, { status: 201 });
}
