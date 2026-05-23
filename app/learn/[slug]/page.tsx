import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  buildMetadata,
  breadcrumbJsonLd,
  articleJsonLd,
  canonical,
} from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';
import { getArticle, allArticles } from '@/components/learn';
import { ARTICLE_MANIFEST } from '@/components/learn/manifest';

export const revalidate = 86400; // daily ISR is fine for articles

export function generateStaticParams() {
  return ARTICLE_MANIFEST.map((a) => ({ slug: a.slug }));
}

type Params = { params: { slug: string } };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const article = getArticle(params.slug);
  if (!article) return { title: 'Not Found' };
  const meta = article.meta;
  return buildMetadata({
    title: meta.title,
    description: meta.description,
    path: `/learn/${meta.slug}`,
    type: 'article',
    keywords: meta.keywords,
    publishedTime: meta.published,
    modifiedTime: meta.updated || meta.published,
    authors: [meta.author || 'Valor Odds'],
    image: `/api/og?title=${encodeURIComponent(meta.title)}&subtitle=${encodeURIComponent(meta.category)}&kicker=${encodeURIComponent('Learn')}`,
  });
}

export default function ArticlePage({ params }: Params) {
  const article = getArticle(params.slug);
  if (!article) notFound();
  const { meta, Body } = article;

  const related = allArticles()
    .filter((a) => a.slug !== meta.slug && a.category === meta.category)
    .slice(0, 3);

  return (
    <>
      <JsonLd
        data={[
          articleJsonLd({
            title: meta.title,
            description: meta.description,
            url: canonical(`/learn/${meta.slug}`),
            datePublished: meta.published,
            dateModified: meta.updated || meta.published,
            author: meta.author,
          }),
          breadcrumbJsonLd([
            { name: 'Home', url: canonical('/') },
            { name: 'Learn', url: canonical('/learn') },
            { name: meta.title, url: canonical(`/learn/${meta.slug}`) },
          ]),
        ]}
      />
      <Navbar />

      <article className="container-px mx-auto max-w-3xl py-12">
        <nav aria-label="Breadcrumb" className="text-xs text-brand-muted mb-6">
          <Link href="/" className="hover:underline">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/learn" className="hover:underline">Learn</Link>
          <span className="mx-2">/</span>
          <span className="text-white">{meta.category}</span>
        </nav>

        <header>
          <div className="text-xs uppercase tracking-widest text-brand-accent">
            {meta.category}
          </div>
          <h1 className="mt-2 text-3xl sm:text-5xl font-extrabold leading-tight">
            {meta.title}
          </h1>
          <div className="mt-4 text-sm text-brand-muted">
            <time dateTime={meta.published}>
              {new Date(meta.published).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </time>
            <span className="mx-2">·</span>
            <span>{meta.readingMinutes} min read</span>
            <span className="mx-2">·</span>
            <span>{meta.author || 'Valor Odds'}</span>
          </div>
        </header>

        <div className="prose-learn mt-10">
          <Body />
        </div>

        {related.length > 0 && (
          <aside className="mt-16 rounded-2xl border border-brand-border bg-brand-surface p-6">
            <h2 className="text-lg font-bold">More in {meta.category}</h2>
            <ul className="mt-3 space-y-2">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link href={`/learn/${r.slug}`} className="text-brand-accent hover:underline">
                    {r.title}
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </article>

      <Footer />
    </>
  );
}