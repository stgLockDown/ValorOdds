import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/MarketingNavbar';
import Footer from '@/components/Footer';
import { buildMetadata, breadcrumbJsonLd, canonical, orgJsonLd } from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';

export const metadata: Metadata = buildMetadata({
  title: 'Press & Media Kit',
  description:
    'Press resources for Valor Odds, the AI-powered sports betting intelligence platform. Download our brand assets, read recent coverage, and get in touch for interviews or partnerships.',
  path: '/press',
});

const COVERAGE: { outlet: string; headline: string; url: string; date: string }[] = [
  // Populate with real press hits as they land. Kept empty rather than faked.
];

export default function PressPage() {
  return (
    <>
      <JsonLd
        data={[
          orgJsonLd(),
          breadcrumbJsonLd([
            { name: 'Home', url: canonical('/') },
            { name: 'Press', url: canonical('/press') },
          ]),
        ]}
      />
      <Navbar />
      <main className="container-px mx-auto max-w-4xl py-16">
        <h1 className="text-4xl font-extrabold">Press & media kit</h1>
        <p className="mt-4 text-brand-muted">
          Valor Odds is an AI-powered sports betting intelligence platform combining real-time
          arbitrage detection, +EV analysis, and native Discord delivery across 25+ sports. For
          press inquiries, interviews, or partnership discussions, reach us at{' '}
          <a href="mailto:press@valorodds.com" className="text-brand-accent underline">
            press@valorodds.com
          </a>
          .
        </p>

        <section className="mt-12">
          <h2 className="text-2xl font-bold">Brand assets</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            <li className="rounded-lg border border-brand-border bg-brand-surface p-4">
              <a href="/logo.png" className="font-semibold hover:underline">Logo (PNG, 1024px)</a>
              <p className="text-sm text-brand-muted mt-1">Primary mark on dark background.</p>
            </li>
            <li className="rounded-lg border border-brand-border bg-brand-surface p-4">
              <a href="/icon.svg" className="font-semibold hover:underline">App icon (SVG)</a>
              <p className="text-sm text-brand-muted mt-1">Vector icon for favicons and app tiles.</p>
            </li>
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-bold">Fact sheet</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
            <div className="rounded-lg border border-brand-border bg-brand-surface p-4">
              <dt className="text-brand-muted">Founded</dt>
              <dd className="font-semibold mt-1">2024</dd>
            </div>
            <div className="rounded-lg border border-brand-border bg-brand-surface p-4">
              <dt className="text-brand-muted">Headquarters</dt>
              <dd className="font-semibold mt-1">United States</dd>
            </div>
            <div className="rounded-lg border border-brand-border bg-brand-surface p-4">
              <dt className="text-brand-muted">Category</dt>
              <dd className="font-semibold mt-1">Sports betting intelligence / analytics</dd>
            </div>
            <div className="rounded-lg border border-brand-border bg-brand-surface p-4">
              <dt className="text-brand-muted">Sports covered</dt>
              <dd className="font-semibold mt-1">MLB, NFL, NBA, NHL, NCAA, Soccer, UFC, Tennis, Boxing & more</dd>
            </div>
          </dl>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-bold">In the news</h2>
          {COVERAGE.length === 0 ? (
            <p className="mt-4 text-brand-muted">Coverage is updated as articles go live.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {COVERAGE.map((c, i) => (
                <li key={i} className="rounded-lg border border-brand-border bg-brand-surface p-4">
                  <Link href={c.url} className="font-semibold hover:underline">
                    {c.headline}
                  </Link>
                  <div className="text-xs text-brand-muted mt-1">
                    {c.outlet} &middot; {c.date}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}