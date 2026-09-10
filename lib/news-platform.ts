/**
 * News platform data access — ValorOdds editorial layer.
 *
 * Three authoring paths, one table (web_articles):
 *   1. AI-generated  — admin hits Generate in News Studio; article lands in
 *      'pending_review' until an admin approves + publishes.
 *   2. Admin-written — admins write directly in News Studio and can publish
 *      their own work immediately.
 *   3. Writer-submitted — users granted the writer role draft in the dashboard
 *      workspace and submit; articles land in 'in_review' until an admin
 *      publishes (or rejects).
 *
 * Everything rendered publicly is markdown sanitized at render time
 * (isomorphic-dompurify) — the DB stores the markdown source of truth.
 */

import { query, queryOne, tx } from './db';

export type ArticleStatus =
  | 'draft'
  | 'in_review'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'published';

export interface Article {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  body_md: string;
  cover_image_url: string | null;
  image_credit: string | null;
  sport: string | null;
  subject_type: 'player' | 'team' | 'general' | null;
  subject_name: string | null;
  tags: string[];
  status: ArticleStatus;
  author_id: string | null;
  byline: string;
  is_ai_generated: boolean;
  generator_model: string | null;
  generator_prompt_subject: string | null;
  source_links: string[];
  /** Structured source refs { url, name, headline } (migration 014). */
  sources: { url: string; name: string; headline: string }[];
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  author_name?: string | null;
  author_avatar?: string | null;
}

export interface WriterUser {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  is_writer: boolean;
  is_admin: boolean;
  created_at: string;
}

// ---------- helpers ----------

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'article'
  );
}

/** Unique slug: append -2, -3 … on collision. */
export async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base);
  let candidate = root;
  for (let i = 2; i < 50; i++) {
    const clash = await queryOne<{ id: string }>(
      `SELECT id::text FROM web_articles WHERE slug = $1`,
      [candidate]
    );
    if (!clash) return candidate;
    candidate = `${root}-${i}`;
  }
  return `${root}-${Date.now()}`;
}

const ARTICLE_SELECT = `
  SELECT a.id::text, a.slug, a.title, a.subtitle, a.body_md, a.cover_image_url,
         a.image_credit, a.sport, a.subject_type, a.subject_name, a.tags, a.status,
         a.author_id::text, a.byline, a.is_ai_generated, a.generator_model,
         a.generator_prompt_subject, a.source_links, a.sources, a.review_notes,
         a.reviewed_by::text, a.reviewed_at, a.published_at, a.created_at, a.updated_at,
         u.display_name AS author_name, u.avatar_url AS author_avatar
  FROM web_articles a
  LEFT JOIN web_users u ON u.id = a.author_id`;

function rowToArticle(r: any): Article {
  return {
    ...r,
    tags: r.tags ?? [],
    source_links: r.source_links ?? [],
    sources: Array.isArray(r.sources) ? r.sources : [],
    is_ai_generated: Boolean(r.is_ai_generated),
  };
}

// ---------- public (published) ----------

export interface FeedOptions {
  limit?: number;
  offset?: number;
  sport?: string | null;
}

export async function getPublishedFeed(opts: FeedOptions = {}): Promise<Article[]> {
  const limit = Math.min(Math.max(opts.limit ?? 12, 1), 48);
  const offset = Math.max(opts.offset ?? 0, 0);
  const params: (string | number)[] = [limit, offset];
  let where = `WHERE a.status = 'published'`;
  if (opts.sport) {
    params.push(opts.sport.toUpperCase());
    where += ` AND a.sport = $${params.length}`;
  }
  // Graceful degradation: during \`next build\` (static export) the DB is often
  // unreachable (e.g. Railway's build container can't see postgres.railway.internal).
  // Failures here must not break the build — ISR re-fetches at runtime and the
  // page renders its empty state. Mirrors getTopOpportunities' try/catch.
  try {
    const rows = await query<any>(
      `${ARTICLE_SELECT} ${where}
       ORDER BY a.published_at DESC NULLS LAST, a.created_at DESC
       LIMIT $1 OFFSET $2`,
      params
    );
    return rows.rows.map(rowToArticle);
  } catch (err) {
    console.error('[getPublishedFeed] query failed:', err);
    return [];
  }
}

export async function getPublishedArticleBySlug(slug: string): Promise<Article | null> {
  const row = await queryOne<any>(
    `${ARTICLE_SELECT} WHERE a.slug = $1 AND a.status = 'published'`,
    [slug]
  );
  return row ? rowToArticle(row) : null;
}

export async function countPublished(sport?: string | null): Promise<number> {
  const params: string[] = [];
  let where = `WHERE status = 'published'`;
  if (sport) {
    params.push(sport.toUpperCase());
    where += ` AND sport = $${params.length}`;
  }
  // Same build-time graceful degradation as getPublishedFeed.
  try {
    const row = await queryOne<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM web_articles ${where}`,
      params
    );
    return row ? Number(row.c) : 0;
  } catch (err) {
    console.error('[countPublished] query failed:', err);
    return 0;
  }
}

// ---------- role checks ----------

export async function isWriterUser(userId: string): Promise<boolean> {
  const row = await queryOne<{ is_writer: boolean; is_admin: boolean }>(
    `SELECT is_writer, is_admin FROM web_users WHERE id = $1::bigint`,
    [userId]
  );
  return Boolean(row && (row.is_writer || row.is_admin));
}

export async function listWriters(): Promise<WriterUser[]> {
  const rows = await query<any>(
    `SELECT id::text, email, display_name, avatar_url, is_writer, is_admin, created_at
     FROM web_users
     WHERE is_writer = TRUE OR is_admin = TRUE
     ORDER BY is_admin DESC, display_name NULLS LAST, email`
  );
  return rows.rows;
}

export async function setWriterRole(userId: string, isWriter: boolean): Promise<void> {
  await query(`UPDATE web_users SET is_writer = $1, updated_at = NOW() WHERE id = $2::bigint`, [
    isWriter,
    userId,
  ]);
}

// ---------- admin / writer lists ----------

export interface ListOptions {
  status?: ArticleStatus[] | null;
  authorId?: string | null;
  limit?: number;
}

export async function listArticles(opts: ListOptions = {}): Promise<Article[]> {
  const limit = Math.min(Math.max(opts.limit ?? 60, 1), 200);
  const params: unknown[] = [];
  const wheres: string[] = [];
  if (opts.status && opts.status.length) {
    params.push(opts.status);
    wheres.push(`a.status = ANY($${params.length})`);
  }
  if (opts.authorId) {
    params.push(opts.authorId);
    wheres.push(`a.author_id = $${params.length}::bigint`);
  }
  const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
  const rows = await query<any>(
    `${ARTICLE_SELECT} ${where}
     ORDER BY CASE a.status
                WHEN 'pending_review' THEN 0
                WHEN 'in_review' THEN 1
                WHEN 'approved' THEN 2
                WHEN 'draft' THEN 3
                WHEN 'rejected' THEN 4
                ELSE 5
              END,
              a.updated_at DESC
     LIMIT ${limit}`,
    params
  );
  return rows.rows.map(rowToArticle);
}

export async function getArticleById(id: string): Promise<Article | null> {
  const row = await queryOne<any>(`${ARTICLE_SELECT} WHERE a.id = $1::bigint`, [id]);
  return row ? rowToArticle(row) : null;
}

// ---------- create / update / publish ----------

export interface CreateArticleInput {
  title: string;
  subtitle?: string | null;
  body_md: string;
  cover_image_url?: string | null;
  image_credit?: string | null;
  sport?: string | null;
  subject_type?: 'player' | 'team' | 'general' | null;
  subject_name?: string | null;
  tags?: string[];
  status?: ArticleStatus;
  author_id?: string | null;
  byline?: string;
  is_ai_generated?: boolean;
  generator_model?: string | null;
  generator_prompt_subject?: string | null;
  source_links?: string[];
  /** Structured source refs { url, name, headline } (migration 014). */
  sources?: { url: string; name: string; headline: string }[];
}

export async function createArticle(input: CreateArticleInput): Promise<Article> {
  const slug = await uniqueSlug(input.title);
  const row = await queryOne<any>(
    `INSERT INTO web_articles
       (slug, title, subtitle, body_md, cover_image_url, image_credit, sport,
        subject_type, subject_name, tags, status, author_id, byline,
        is_ai_generated, generator_model, generator_prompt_subject, source_links, sources)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::bigint,$13,$14,$15,$16,$17,$18::jsonb)
     RETURNING id::text`,
    [
      slug,
      input.title,
      input.subtitle ?? null,
      input.body_md,
      input.cover_image_url ?? null,
      input.image_credit ?? null,
      input.sport ?? null,
      input.subject_type ?? 'general',
      input.subject_name ?? null,
      input.tags ?? [],
      input.status ?? 'draft',
      input.author_id ?? null,
      input.byline ?? 'ValorOdds Staff',
      input.is_ai_generated ?? false,
      input.generator_model ?? null,
      input.generator_prompt_subject ?? null,
      input.source_links ?? [],
      JSON.stringify(input.sources ?? []),
    ]
  );
  return (await getArticleById(row.id))!;
}

export interface UpdateArticleInput {
  title?: string;
  subtitle?: string | null;
  body_md?: string;
  cover_image_url?: string | null;
  image_credit?: string | null;
  sport?: string | null;
  subject_name?: string | null;
  tags?: string[];
  status?: ArticleStatus;
  byline?: string;
  review_notes?: string | null;
}

const UPDATABLE = new Set([
  'title',
  'subtitle',
  'body_md',
  'cover_image_url',
  'image_credit',
  'sport',
  'subject_name',
  'tags',
  'status',
  'byline',
  'review_notes',
]);

export async function updateArticle(
  id: string,
  input: UpdateArticleInput,
  reviewerId?: string | null
): Promise<Article | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (!UPDATABLE.has(key) || value === undefined) continue;
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  }
  if (!sets.length) return getArticleById(id);

  // Review stamping: any status change records who decided.
  if (input.status && input.status !== 'draft') {
    params.push(reviewerId ?? null);
    sets.push(`reviewed_by = $${params.length}::bigint, reviewed_at = NOW()`);
  }
  if (input.status === 'published') {
    sets.push(`published_at = COALESCE(published_at, NOW())`);
  }
  params.push(id);
  await query(
    `UPDATE web_articles SET ${sets.join(', ')} WHERE id = $${params.length}::bigint`,
    params
  );
  return getArticleById(id);
}

/** Publish workflow: only admins reach this function (enforced at the route). */
export async function publishArticle(id: string, adminId: string): Promise<Article | null> {
  const article = await getArticleById(id);
  if (!article) return null;
  if (article.status === 'published') return article;
  return updateArticle(
    id,
    { status: 'published', review_notes: article.review_notes ?? null },
    adminId
  );
}

export async function rejectArticle(
  id: string,
  adminId: string,
  notes?: string
): Promise<Article | null> {
  return updateArticle(id, { status: 'rejected', review_notes: notes ?? null }, adminId);
}

export async function deleteArticle(id: string): Promise<void> {
  await query(`DELETE FROM web_articles WHERE id = $1::bigint`, [id]);
}

/** Writer-submitted drafts are visible to their author + admins only. */
export async function getOwnArticle(userId: string, id: string): Promise<Article | null> {
  const row = await queryOne<any>(
    `${ARTICLE_SELECT} WHERE a.id = $1::bigint AND (a.author_id = $2::bigint OR $3::bigint IS NULL)`,
    [id, userId, userId]
  );
  if (row) return rowToArticle(row);
  // admin fallback: admins may open any article
  const adminRow = await queryOne<{ is_admin: boolean }>(
    `SELECT is_admin FROM web_users WHERE id = $1::bigint`,
    [userId]
  );
  if (adminRow?.is_admin) return getArticleById(id);
  return null;
}

export async function setAuthorByline(userId: string): Promise<string> {
  const row = await queryOne<{ display_name: string | null; email: string }>(
    `SELECT display_name, email FROM web_users WHERE id = $1::bigint`,
    [userId]
  );
  if (!row) return 'ValorOdds Staff';
  return row.display_name?.trim() || row.email.split('@')[0];
}

// convenience alias used by routes
export const dbClient = { query, queryOne, tx };
