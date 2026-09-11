import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { createEpisode, listEpisodes, extractYoutubeId } from '@/lib/podcast';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin management API for the "Beyond the Odds" podcast (hidden from the
 * public pre-launch; /podcast itself 404s for non-admins).
 *
 * GET  /api/admin/podcast/episodes?status=draft|published&limit=…
 * POST /api/admin/podcast/episodes   { title, description?, showNotesMd?,
 *       youtubeIdOrUrl?, audioUrl?, …, status? }
 */

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.isAdmin) return null;
  return session;
}

export async function GET(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const statusParam = url.searchParams.get('status');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, 200);

  const status = statusParam === 'draft' || statusParam === 'published' ? statusParam : null;

  const episodes = await listEpisodes({ status, limit });
  return NextResponse.json({ episodes });
}

const CreateSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(500).nullable().optional(),
  showNotesMd: z.string().max(50_000).nullable().optional(),
  youtubeIdOrUrl: z.string().trim().max(300).nullable().optional(),
  audioUrl: z.string().url().max(1000).nullable().optional(),
  coverImageUrl: z.string().url().max(1000).nullable().optional(),
  imageCredit: z.string().max(200).nullable().optional(),
  durationSeconds: z.number().int().min(0).max(86_400).nullable().optional(),
  season: z.number().int().min(1).max(100).nullable().optional(),
  episodeNumber: z.number().int().min(1).max(10_000).nullable().optional(),
  sport: z.string().trim().max(50).nullable().optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
  status: z.enum(['draft', 'published']).optional(),
  relatedArticleId: z.string().regex(/^\d+$/).nullable().optional(),
});

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let input: z.infer<typeof CreateSchema>;
  try {
    input = CreateSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'Invalid input', detail: String(e).slice(0, 300) }, { status: 400 });
  }

  const youtubeId = extractYoutubeId(input.youtubeIdOrUrl);
  if (input.youtubeIdOrUrl && !youtubeId) {
    return NextResponse.json(
      { error: 'Could not parse a YouTube video id from youtubeIdOrUrl (expected a youtube.com/youtu.be URL or an 11-character id)' },
      { status: 400 }
    );
  }

  const episode = await createEpisode({
    title: input.title,
    description: input.description ?? null,
    showNotesMd: input.showNotesMd ?? null,
    youtubeId,
    audioUrl: input.audioUrl ?? null,
    coverImageUrl: input.coverImageUrl ?? null,
    imageCredit: input.imageCredit ?? null,
    durationSeconds: input.durationSeconds ?? null,
    season: input.season ?? null,
    episodeNumber: input.episodeNumber ?? null,
    sport: input.sport ?? null,
    tags: input.tags ?? [],
    status: input.status ?? 'draft',
    relatedArticleId: input.relatedArticleId ?? null,
    createdBy: session.user.id ?? null,
  });

  console.error(
    `[admin-podcast] created episode ${episode.id} "${episode.title}" (${episode.status}) by ${session.user.email}`
  );
  return NextResponse.json({ episode }, { status: 201 });
}
