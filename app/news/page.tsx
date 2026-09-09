import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/MarketingNavbar';
import Footer from '@/components/Footer';
import NewsReel from '@/components/NewsReel';
import ArticleCard from '@/components/ArticleCard';
import { JsonLd } from '@/components/JsonLd';
import { buildMetadata, breadcrumbJsonLd, canonical, SPORTS } from '@/lib/seo';
import { getPublishedFeed } from '@/lib/news-platform';
import { getTopNews } from '@/lib/espn-news';

export const revalidate = 300;

export const metadata: Metadata = buildMetadata({
  title: 'Sports News \u2014 ValorOdds Originals & Live Headlines',
  description:
    'ValorOdds original sports analysis and editorials alongside the top headlines from around the sports world \u2014 player and team spotlights, betting market reads, and breaking news.',
  path: '/news',
  keywords: [
    'sports news',
    'sports analysis articles',
    'player spotlight',
    'team spotlight',
    'sports betting news',
  ],
});

export default async function NewsIndexPage() {
  const [articles, espn] = await Promise.all([getPublishedFeed({ limit: 24 }), getTopNews(6)]);

  const [lead, ...rest] = articles;

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', url: canonical('/') },
          { name: 'News', url: canonical('/news') },
        ])}
      />
      <Navbar />
      <main className="container-px mx-auto max-w-7xl py-16">
        <header className="max-w-3xl">
          <div className="text-xs uppercase tracking-widest text-brand-accent">Newsroom</div>
          <h1 className="mt-2 text-4xl sm:text-5xl font-extrabold">
            ValorOdds Originals &amp; live sports headlines
          </h1>
          <p className="mt-4 text-brand-muted text-lg">
            In-house analysis and editorials from the ValorOdds team \u2014 weekly player and team
            spotlights, market reads, and breaking news from around the sports world.
          </p>
        </header>

        {articles.length === 0 && (
          <section className="mt-12 rounded-xl border border-brand-border bg-brand-surface p-8 text-center">
            <h2 className="text-lg font-bold">The newsroom is warming up</h2>
            <p className="mt-2 text-sm text-brand-muted">
              Original ValorOdds articles are on the way. Meanwhile, catch the latest headlines
              from around the sports world below.
            </p>
          </section>
        )}

        {lead && (
          <section className="mt-12" aria-label="ValorOdds Originals">
            <h2 className="mb-3 text-lg font-bold text-brand-heading">ValorOdds Originals</h2>
            <ArticleCard article={lead} sizes="(max-width: 768px) 100vw, 100vw" />
            {rest.length > 0 && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((a) => (
                  <ArticleCard key={a.id} article={a} />
                ))}
              </div>
            )}
          </section>
        )}

        {espn.length > 0 && (
          <section className="mt-16" aria-label="Latest ESPN headlines">
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-brand-heading">Latest Headlines</h2>
                <p className="text-sm text-brand-muted">Live from the ESPN wire</p>
              </div>
            </div>
            <NewsReel articles={espn} />
          </section>
        )}

        <section className="mt-16" aria-label="Explore sports hubs">
          <h2 className="mb-3 text-lg font-bold text-brand-heading">Explore by sport</h2>
          <div className="flex flex-wrap gap-2">
            {SPORTS.map((s) => (
              <Link
                key={s.slug}
                href={`/games/${s.slug}`}
                className="badge-secondary"
              >
                {s.name}
              </Link>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
