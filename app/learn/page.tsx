import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/MarketingNavbar';
import Footer from '@/components/Footer';
import { buildMetadata, breadcrumbJsonLd, canonical } from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';
import { allArticles } from '@/components/learn';

export const metadata: Metadata = buildMetadata({
  title: 'Learn — Sports Betting Guides, Strategy & Glossary',
  description:
    'Learn sports betting the right way. Free guides on arbitrage, +EV betting, closing line value, Kelly staking, player props, and sport-specific strategy for MLB, NFL, NBA, NHL, soccer, and UFC.',
  path: '/learn',
  keywords: [
    'sports betting strategy',
    'arbitrage betting guide',
    'positive ev explained',
    'closing line value',
    'how to bet sports',
  ],
});

export default function LearnHubPage() {
  const articles = allArticles();
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', url: canonical('/') },
          { name: 'Learn', url: canonical('/learn') },
        ])}
      />
      <Navbar />
      <main className="container-px mx-auto max-w-6xl py-16">
        <header className="max-w-3xl">
          <div className="text-xs uppercase tracking-widest text-brand-accent">Learn</div>
          <h1 className="mt-2 text-4xl sm:text-5xl font-extrabold">
            Sports betting guides, strategy & glossary
          </h1>
          <p className="mt-4 text-brand-muted text-lg">
            Free, in-depth guides written for bettors who want to move from casual to sharp. No
            fluff, no affiliate spam — just the math, the edges, and the mistakes to avoid.
          </p>
        </header>

        <section className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((a) => (
            <Link
              key={a.slug}
              href={`/learn/${a.slug}`}
              className="block rounded-xl border border-brand-border bg-brand-surface p-5 hover:border-brand-accent transition-colors"
            >
              <div className="text-xs uppercase tracking-wider text-brand-accent">
                {a.category}
              </div>
              <h2 className="mt-2 text-lg font-bold">{a.title}</h2>
              <p className="mt-2 text-sm text-brand-muted">{a.description}</p>
              <div className="mt-3 text-xs text-brand-muted">
                {a.readingMinutes} min read
              </div>
            </Link>
          ))}
        </section>

        <aside className="mt-16 rounded-2xl border border-brand-border bg-brand-surface p-6 sm:p-8">
          <h2 className="text-2xl font-bold">Glossary of betting terms</h2>
          <p className="mt-2 text-brand-muted">
            Every term a sharp bettor actually uses — arbitrage, CLV, EV, juice, steam, middle,
            limit, and more.
          </p>
          <Link
            href="/learn/glossary"
            className="mt-4 inline-flex items-center gap-2 text-brand-accent font-semibold hover:underline"
          >
            Open the glossary →
          </Link>
        </aside>
      </main>
      <Footer />
    </>
  );
}