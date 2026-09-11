import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import {
  getEpisodeById,
  updateEpisode,
  deleteEpisode,
  extractYoutubeId,
} from '@/lib/podcast';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Single-episode admin operations for the "Beyond the Odds" podcast.
 *
 * GET    /api/admin/podcast/episodes/[id]
 * PATCH  /api/admin/podcast/episodes/[id]   { title?, …, status? }
 *        — status 'published' publishes (stamps published_at on first publish).
 * DELETE /api/admin/podcast/episodes/[id]
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

  const episode = await getEpisodeById(params.id);
  if (!episode) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ episode });
}

const UpdateSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
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

export async function PATCH(req: Request, { params }: Params) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let input: z.infer<typeof UpdateSchema>;
  try {
    input = UpdateSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'Invalid input', detail: String(e).slice(0, 300) }, { status: 400 });
  }

  const existing = await getEpisodeById(params.id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // youtubeIdOrUrl: accept "leave unchanged" (undefined), a full YouTube URL,
  // or a bare 11-char id. Explicit null clears the YouTube link.
  let youtubeId: string | null;
  if (input.youtubeIdOrUrl === undefined) {
    youtubeId = existing.youtubeId;
  } else {
    youtubeId = input.youtubeIdOrUrl === null ? null : extractYoutubeId(input.youtubeIdOrUrl);
    if (input.youtubeIdOrUrl && !youtubeId) {
      return NextResponse.json(
        { error: 'Could not parse a YouTube video id from youtubeIdOrUrl' },
        { status: 400 }
      );
    }
  }

  const updated = await updateEpisode(params.id, {
    title: input.title,
    description: input.description,
    showNotesMd: input.showNotesMd,
    youtubeId,
    audioUrl: input.audioUrl,
    coverImageUrl: input.coverImageUrl,
    imageCredit: input.imageCredit,
    durationSeconds: input.durationSeconds,
    season: input.season,
    episodeNumber: input.episodeNumber,
    sport: input.sport,
    tags: input.tags,
    status: input.status,
    relatedArticleId: input.relatedArticleId,
  });

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  console.error(
    `[admin-podcast] updated episode ${params.id} (status: ${input.status ?? existing.status}) by ${session.user.email}`
  );
  return NextResponse.json({ episode: updated });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const existing = await getEpisodeById(params.id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await deleteEpisode(params.id);
  console.error(
    `[admin-podcast] deleted episode ${params.id} "${existing.title}" by ${session.user.email}`
  );
  return NextResponse.json({ ok: true });
}
