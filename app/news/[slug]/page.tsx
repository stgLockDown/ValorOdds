import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import Navbar from '@/components/MarketingNavbar';
import Footer from '@/components/Footer';
import Breadcrumbs from '@/components/Breadcrumbs';
import ArticleBody from '@/components/ArticleBody';
import ArticleCard from '@/components/ArticleCard';
import { JsonLd } from '@/components/JsonLd';
import {
  buildMetadata,
  breadcrumbJsonLd,
  canonical,
  articleJsonLd,
  SITE,
} from '@/lib/seo';
import { getPublishedArticleBySlug, getPublishedFeed } from '@/lib/news-platform';

/**
 * Public article page: /news/[slug]
 *
 * Only published articles resolve; drafts/rejected/unpublished 404 (a slug
 * exists but is still in review → also 404 for the public). ISR keeps hot
 * articles fast; body markdown is sanitized at render time.
 */

export const revalidate = 300;

type Params = { params: { slug: string } };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const article = await getPublishedArticleBySlug(params.slug);
  if (!article) {
    return {
      title: 'Article Not Found',
      robots: { index: false, follow: false },
    };
  }
  const description =
    article.subtitle?.slice(0, 300) ||
    article.body_md.replace(/[#*_>\n]/g, ' ').slice(0, 300);
  return buildMetadata({
    title: `${article.title} — ValorOdds`,
    description,
    path: `/news/${article.slug}`,
    type: 'article',
    image: article.cover_image_url ?? undefined,
    imageAlt: article.title,
    keywords: [...(article.tags ?? []), article.subject_name ?? article.sport ?? 'sports news'],
    publishedTime: article.published_at ?? article.created_at,
    modifiedTime: article.updated_at,
    authors: [article.byline],
  });
}

export default async function ArticlePage({ params }: Params) {
  const article = await getPublishedArticleBySlug(params.slug);
  if (!article) notFound();

  const more = await getPublishedFeed({ limit: 4 });
  const related = more.filter((a) => a.id !== article.id).slice(0, 3);

  const publishedDate = article.published_at ?? article.created_at;
  const dateLabel = new Date(publishedDate).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <>
      <JsonLd
        data={articleJsonLd({
          title: article.title,
          description: article.subtitle ?? article.title,
          url: canonical(`/news/${article.slug}`),
          image: article.cover_image_url ?? undefined,
          datePublished: publishedDate,
          dateModified: article.updated_at,
          author: article.byline,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', url: canonical('/') },
          { name: 'News', url: canonical('/news') },
          { name: article.title, url: canonical(`/news/${article.slug}`) },
        ])}
      />
      <Navbar />
      <main className="container-px mx-auto max-w-3xl py-12 sm:py-16">
        <Breadcrumbs
          items={[
            { name: 'News', url: '/news' },
            { name: article.sport ? article.sport.toUpperCase() : 'ValorOdds', url: `/news/${article.slug}` },
          ]}
        />

        <article className="mt-6">
          <header className="mb-8">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-brand-muted">
              <span className="font-semibold uppercase tracking-wide text-brand-primary">
                {article.sport ? article.sport.toUpperCase() : 'ValorOdds Original'}
              </span>
              <span aria-hidden>•</span>
              <time dateTime={publishedDate}>{dateLabel}</time>
              {article.is_ai_generated && (
                <>
                  <span aria-hidden>•</span>
                  <span className="rounded bg-brand-primary/10 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-brand-primary">
                    AI Drafted
                  </span>
                </>
              )}
            </div>
            <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold leading-tight">
              {article.title}
            </h1>
            {article.subtitle && (
              <p className="mt-3 text-lg text-brand-muted">{article.subtitle}</p>
            )}
            <div className="mt-4 flex items-center gap-3 text-sm text-brand-muted">
              <span>
                By <span className="font-medium text-brand-heading">{article.byline}</span>
              </span>
            </div>
          </header>

          {article.cover_image_url && (
            <figure className="mb-8 overflow-hidden rounded-xl border border-brand-border">
              <div className="relative aspect-[16/9] w-full bg-brand-elevated">
                <Image
                  src={article.cover_image_url}
                  alt={article.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 768px"
                  className="object-cover"
                  priority
                />
              </div>
              {article.image_credit && (
                <figcaption className="border-t border-brand-border bg-brand-surface px-3 py-2 text-[11px] text-brand-muted">
                  {article.image_credit}
                </figcaption>
              )}
            </figure>
          )}

          <ArticleBody markdown={article.body_md} />

          {article.tags.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-2">
              {article.tags.map((t) => (
                <span key={t} className="badge-secondary">
                  #{t}
                </span>
              ))}
            </div>
          )}

          {(() => {
            // Sources footer: prefer structured refs (outlet + headline per
            // link, recorded by the generator since migration 014); fall back
            // to the plain source_links URL list for legacy articles.
            const refs =
              article.sources && article.sources.length > 0
                ? article.sources
                : article.source_links.map((u) => ({
                    url: u,
                    name: (() => {
                      try {
                        return new URL(u, SITE.url).hostname.replace(/^www\./, '');
                      } catch {
                        return 'source';
                      }
                    })(),
                    headline: '' as string,
                  }));
            if (refs.length === 0) return null;
            return (
              <section
                className="mt-10 rounded-xl border border-brand-border bg-brand-surface p-5"
                aria-label="Sources"
              >
                <h2 className="text-sm font-bold uppercase tracking-wide text-brand-muted">
                  Sources
                </h2>
                <ul className="mt-3 space-y-2.5">
                  {refs.map((s, i) => (
                    <li key={`${s.url}-${i}`} className="text-sm leading-snug">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-brand-primary hover:underline"
                      >
                        {s.name || 'source'}
                      </a>
                      {s.headline && (
                        <span className="text-brand-muted"> — {s.headline}</span>
                      )}
                      <div className="mt-0.5 text-[11px] text-brand-muted/70 break-all">
                        {s.url}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })()}
        </article>

        {related.length > 0 && (
          <section className="mt-16" aria-label="More from ValorOdds">
            <h2 className="mb-3 text-lg font-bold text-brand-heading">More from ValorOdds</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
