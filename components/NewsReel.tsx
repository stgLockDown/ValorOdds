/**
 * NewsReel — presentational component rendering a horizontal row of news
 * article cards (desktop) that wraps on mobile. Server-component friendly.
 *
 * Used on: homepage reel, games hub, game detail news tab.
 */

import Link from 'next/link';
import NewsImage from '@/components/NewsImage';
import type { NewsArticle } from '@/lib/espn-news';

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  if (diff < 0) return '';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function NewsCard({ article }: { article: NewsArticle }) {
  const ago = timeAgo(article.publishedAt);
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group card-interactive flex w-full flex-col overflow-hidden rounded-xl border border-brand-border bg-brand-surface"
    >
      {article.imageUrl ? (
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-brand-elevated">
          <NewsImage
            src={article.imageUrl}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {article.premium && (
            <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
              ESPN+
            </span>
          )}
        </div>
      ) : (
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-brand-elevated">
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand-muted">ValorOdds</span>
          </div>
        </div>
      )}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-center gap-2 text-[11px] text-brand-muted">
          <span className="font-semibold uppercase tracking-wide text-brand-primary">ESPN</span>
          {ago && <span aria-hidden>•</span>}
          {ago && <span>{ago}</span>}
        </div>
        <h3 className="text-sm font-semibold leading-snug text-brand-heading group-hover:text-brand-primary">
          {article.headline}
        </h3>
        {article.description && (
          <p className="line-clamp-2 text-xs text-brand-muted">{article.description}</p>
        )}
        {article.byline && (
          <p className="mt-auto pt-1 text-[11px] italic text-brand-muted">{article.byline}</p>
        )}
      </div>
    </a>
  );
}

interface NewsReelProps {
  articles: NewsArticle[];
  /** Optional heading shown above the reel. */
  title?: string;
  /** Optional subtitle shown under the heading. */
  subtitle?: string;
  /** Link rendered at the end of the header row. */
  moreHref?: string;
  moreLabel?: string;
  /** Compact = smaller cards without images (for dense layouts). */
  compact?: boolean;
}

export default function NewsReel({ articles, title, subtitle, moreHref, moreLabel, compact }: NewsReelProps) {
  if (!articles || articles.length === 0) return null;

  return (
    <section className="w-full">
      {(title || moreHref) && (
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            {title && <h2 className="text-lg font-bold text-brand-heading">{title}</h2>}
            {subtitle && <p className="text-sm text-brand-muted">{subtitle}</p>}
          </div>
          {moreHref && (
            <Link href={moreHref} className="shrink-0 text-sm font-semibold text-brand-primary hover:underline">
              {moreLabel || 'View all'} →
            </Link>
          )}
        </div>
      )}
      <div
        className={
          compact
            ? 'flex flex-col gap-2'
            : 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'
        }
      >
        {articles.map((a) => (
          <NewsCard key={a.id} article={a} />
        ))}
      </div>
    </section>
  );
}
