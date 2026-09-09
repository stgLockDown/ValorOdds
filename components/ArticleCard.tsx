/**
 * ArticleCard — presentational card for a ValorOdds Original (web_articles).
 * Server-component friendly; image failure falls back to the brand
 * placeholder (hotlinked editorial photos occasionally move).
 *
 * Used on: /news index, /games hub rails.
 */

import Link from 'next/link';
import NewsImage from '@/components/NewsImage';
import type { Article } from '@/lib/news-platform';

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  if (diff < 0) return '';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function articleSportLabel(article: Article): string {
  if (article.sport) return article.sport.toUpperCase();
  if (article.subject_type === 'player') return 'PLAYER SPOTLIGHT';
  if (article.subject_type === 'team') return 'TEAM SPOTLIGHT';
  return 'VALORODDS';
}

export default function ArticleCard({
  article,
  sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw',
}: {
  article: Article;
  sizes?: string;
}) {
  const ago = timeAgo(article.published_at ?? article.created_at);
  const label = articleSportLabel(article);

  return (
    <Link
      href={`/news/${article.slug}`}
      className="group card-interactive flex w-full flex-col overflow-hidden rounded-xl border border-brand-border bg-brand-surface"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-brand-elevated">
        {article.cover_image_url ? (
          <NewsImage
            src={article.cover_image_url}
            sizes={sizes}
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand-muted">
              ValorOdds
            </span>
          </div>
        )}
        {article.is_ai_generated && (
          <span className="absolute left-2 top-2 rounded bg-brand-primary/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            AI Drafted
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-center gap-2 text-[11px] text-brand-muted">
          <span className="font-semibold uppercase tracking-wide text-brand-primary">{label}</span>
          {ago && <span aria-hidden>•</span>}
          {ago && <span>{ago}</span>}
        </div>
        <h3 className="text-sm font-semibold leading-snug text-brand-heading group-hover:text-brand-primary">
          {article.title}
        </h3>
        {article.subtitle && (
          <p className="line-clamp-2 text-xs text-brand-muted">{article.subtitle}</p>
        )}
        <p className="mt-auto pt-1 text-[11px] text-brand-muted">
          By <span className="font-medium text-brand-heading">{article.byline}</span>
        </p>
      </div>
    </Link>
  );
}
