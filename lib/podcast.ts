import { query, queryOne } from './db';
import { slugify } from './news-platform';

/**
 * Data access for the ValorOdds podcast — "Beyond the Odds".
 *
 * The podcast area is intentionally hidden from the public for now:
 * /podcast returns 404 for non-admins and is disallowed in robots.txt.
 * Everything here is served through admin-gated routes and pages until
 * the show is ready to launch.
 *
 * Episodes are YouTube-first (youtube_id powers the embedded player) with
 * an optional direct audio_url fallback. Show notes are markdown rendered
 * through the same ArticleBody component the news section uses.
 */

export const PODCAST_NAME = 'Beyond the Odds';

export type EpisodeStatus = 'draft' | 'published';

export interface PodcastEpisode {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  showNotesMd: string | null;
  youtubeId: string | null;
  audioUrl: string | null;
  coverImageUrl: string | null;
  imageCredit: string | null;
  durationSeconds: number | null;
  season: number | null;
  episodeNumber: number | null;
  sport: string | null;
  tags: string[];
  status: EpisodeStatus;
  relatedArticleId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EpisodeRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  show_notes_md: string | null;
  youtube_id: string | null;
  audio_url: string | null;
  cover_image_url: string | null;
  image_credit: string | null;
  duration_seconds: number | null;
  season: number | null;
  episode_number: number | null;
  sport: string | null;
  tags: string[] | null;
  status: EpisodeStatus;
  related_article_id: string | null;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const EPISODE_COLUMNS = `
  id::text, slug, title, description, show_notes_md, youtube_id, audio_url,
  cover_image_url, image_credit, duration_seconds, season, episode_number,
  sport, tags, status, related_article_id::text, published_at, created_at, updated_at
`;

function mapRow(r: EpisodeRow): PodcastEpisode {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    showNotesMd: r.show_notes_md,
    youtubeId: r.youtube_id,
    audioUrl: r.audio_url,
    coverImageUrl: r.cover_image_url,
    imageCredit: r.image_credit,
    durationSeconds: r.duration_seconds,
    season: r.season,
    episodeNumber: r.episode_number,
    sport: r.sport,
    tags: r.tags ?? [],
    status: r.status,
    relatedArticleId: r.related_article_id,
    publishedAt: r.published_at ? r.published_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

/** Unique slug from an episode title (ep- prefix keeps URLs tidy). */
export async function uniqueEpisodeSlug(base: string): Promise<string> {
  const root = `ep-${slugify(base)}`.replace(/^-+/, '');
  let candidate = root;
  for (let i = 2; i < 50; i++) {
    const clash = await queryOne<{ id: string }>(
      `SELECT id::text FROM web_podcast_episodes WHERE slug = $1`,
      [candidate]
    );
    if (!clash) return candidate;
    candidate = `${root}-${i}`;
  }
  return `${root}-${Date.now()}`;
}

export interface ListEpisodesOptions {
  status?: EpisodeStatus | null;
  limit?: number;
}

export async function listEpisodes(opts: ListEpisodesOptions = {}): Promise<PodcastEpisode[]> {
  const status = opts.status ?? null;
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);
  const rows = status
    ? await query<EpisodeRow>(
        `SELECT ${EPISODE_COLUMNS}
         FROM web_podcast_episodes
         WHERE status = $1
         ORDER BY COALESCE(published_at, created_at) DESC
         LIMIT $2`,
        [status, limit]
      )
    : await query<EpisodeRow>(
        `SELECT ${EPISODE_COLUMNS}
         FROM web_podcast_episodes
         ORDER BY COALESCE(published_at, created_at) DESC
         LIMIT $1`,
        [limit]
      );
  return rows.rows.map(mapRow);
}

export async function getEpisodeBySlug(slug: string): Promise<PodcastEpisode | null> {
  const row = await queryOne<EpisodeRow>(
    `SELECT ${EPISODE_COLUMNS} FROM web_podcast_episodes WHERE slug = $1`,
    [slug]
  );
  return row ? mapRow(row) : null;
}

export async function getEpisodeById(id: string): Promise<PodcastEpisode | null> {
  const row = await queryOne<EpisodeRow>(
    `SELECT ${EPISODE_COLUMNS} FROM web_podcast_episodes WHERE id = $1::bigint`,
    [id]
  );
  return row ? mapRow(row) : null;
}

export interface CreateEpisodeInput {
  title: string;
  description?: string | null;
  showNotesMd?: string | null;
  youtubeId?: string | null;
  audioUrl?: string | null;
  coverImageUrl?: string | null;
  imageCredit?: string | null;
  durationSeconds?: number | null;
  season?: number | null;
  episodeNumber?: number | null;
  sport?: string | null;
  tags?: string[];
  status?: EpisodeStatus;
  relatedArticleId?: string | null;
  createdBy?: string | null;
}

/** Accepts a full YouTube URL or a bare 11-char video id. */
export function extractYoutubeId(input: string | null | undefined): string | null {
  if (!input) return null;
  const v = input.trim();
  if (!v) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
  const m =
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/.exec(v);
  return m ? m[1] : null;
}

export async function createEpisode(input: CreateEpisodeInput): Promise<PodcastEpisode> {
  const slug = await uniqueEpisodeSlug(input.title);
  const publishNow = input.status === 'published';
  const row = await queryOne<EpisodeRow>(
    `INSERT INTO web_podcast_episodes
       (slug, title, description, show_notes_md, youtube_id, audio_url,
        cover_image_url, image_credit, duration_seconds, season, episode_number,
        sport, tags, status, related_article_id, created_by, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::bigint,$16::bigint,$17)
     RETURNING ${EPISODE_COLUMNS}`,
    [
      slug,
      input.title,
      input.description ?? null,
      input.showNotesMd ?? null,
      input.youtubeId ?? null,
      input.audioUrl ?? null,
      input.coverImageUrl ?? null,
      input.imageCredit ?? null,
      input.durationSeconds ?? null,
      input.season ?? null,
      input.episodeNumber ?? null,
      input.sport ?? null,
      input.tags ?? [],
      input.status ?? 'draft',
      input.relatedArticleId ?? null,
      input.createdBy ?? null,
      publishNow ? new Date() : null,
    ]
  );
  if (!row) throw new Error('Failed to create episode');
  return mapRow(row);
}

export interface UpdateEpisodeInput {
  title?: string;
  description?: string | null;
  showNotesMd?: string | null;
  youtubeId?: string | null;
  audioUrl?: string | null;
  coverImageUrl?: string | null;
  imageCredit?: string | null;
  durationSeconds?: number | null;
  season?: number | null;
  episodeNumber?: number | null;
  sport?: string | null;
  tags?: string[];
  status?: EpisodeStatus;
  relatedArticleId?: string | null;
}

export async function updateEpisode(
  id: string,
  input: UpdateEpisodeInput
): Promise<PodcastEpisode | null> {
  const current = await getEpisodeById(id);
  if (!current) return null;

  const next = {
    title: input.title ?? current.title,
    description: input.description !== undefined ? input.description : current.description,
    showNotesMd: input.showNotesMd !== undefined ? input.showNotesMd : current.showNotesMd,
    youtubeId: input.youtubeId !== undefined ? input.youtubeId : current.youtubeId,
    audioUrl: input.audioUrl !== undefined ? input.audioUrl : current.audioUrl,
    coverImageUrl: input.coverImageUrl !== undefined ? input.coverImageUrl : current.coverImageUrl,
    imageCredit: input.imageCredit !== undefined ? input.imageCredit : current.imageCredit,
    durationSeconds:
      input.durationSeconds !== undefined ? input.durationSeconds : current.durationSeconds,
    season: input.season !== undefined ? input.season : current.season,
    episodeNumber:
      input.episodeNumber !== undefined ? input.episodeNumber : current.episodeNumber,
    sport: input.sport !== undefined ? input.sport : current.sport,
    tags: input.tags ?? current.tags,
    status: input.status ?? current.status,
    relatedArticleId:
      input.relatedArticleId !== undefined ? input.relatedArticleId : current.relatedArticleId,
  };

  // Stamp published_at on the first transition to published.
  const publishAt =
    next.status === 'published' && !current.publishedAt ? new Date() : current.publishedAt;

  const row = await queryOne<EpisodeRow>(
    `UPDATE web_podcast_episodes SET
       title = $1, description = $2, show_notes_md = $3, youtube_id = $4,
       audio_url = $5, cover_image_url = $6, image_credit = $7,
       duration_seconds = $8, season = $9, episode_number = $10, sport = $11,
       tags = $12, status = $13, related_article_id = $14::bigint,
       published_at = $15, updated_at = NOW()
     WHERE id = $16::bigint
     RETURNING ${EPISODE_COLUMNS}`,
    [
      next.title,
      next.description,
      next.showNotesMd,
      next.youtubeId,
      next.audioUrl,
      next.coverImageUrl,
      next.imageCredit,
      next.durationSeconds,
      next.season,
      next.episodeNumber,
      next.sport,
      next.tags,
      next.status,
      next.relatedArticleId,
      publishAt,
      id,
    ]
  );
  return row ? mapRow(row) : null;
}

export async function deleteEpisode(id: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `DELETE FROM web_podcast_episodes WHERE id = $1::bigint RETURNING id::text`,
    [id]
  );
  return Boolean(row);
}

/** "42 min" style duration label for display. */
export function durationLabel(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
