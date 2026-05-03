import { SPORTS, buildMetadata, canonical, breadcrumbJsonLd, SITE } from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';
import { EmbedBuilder } from './EmbedBuilder';

/**
 * Public embed builder — the landing page partners hit to grab an iframe
 * snippet. Gives them a live preview, a sport / theme / size picker, and
 * a one-click "copy snippet" button.
 *
 * The page itself is an organic SEO target ("valor odds embed",
 * "free sports odds widget", "embed odds widget on blog") and a
 * backlink funnel — every embed carries an attributed link back.
 */

export const metadata = buildMetadata({
  title: 'Free Embeddable Sports Odds Widgets',
  description:
    'Embed live best-odds and arbitrage widgets from Valor Odds on your blog or podcast site. Free, no API key required, auto-updates every two minutes.',
  path: '/embed',
  keywords: [
    'embed sports odds',
    'sports odds widget',
    'free odds widget',
    'embeddable arbitrage widget',
    'valor odds embed',
  ],
});

export default function EmbedPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', url: SITE.url },
          { name: 'Embed', url: canonical('/embed') },
        ])}
      />

      <nav className="text-xs text-slate-400 mb-6" aria-label="Breadcrumb">
        <a href="/" className="hover:text-slate-200">Home</a>
        <span className="mx-2">/</span>
        <span className="text-slate-300">Embed</span>
      </nav>

      <h1 className="text-3xl sm:text-4xl font-bold mb-3">
        Embeddable sports odds widgets
      </h1>
      <p className="text-slate-300 text-lg mb-8 max-w-3xl">
        Drop a live best-odds table into any blog, podcast page, or newsletter.
        Widgets update every two minutes, work on mobile, and require no API
        key. You keep the content; we keep the data fresh.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-8 items-start">
        <section
          aria-labelledby="why-heading"
          className="rounded-xl border border-white/10 bg-white/[0.02] p-6"
        >
          <h2 id="why-heading" className="text-lg font-semibold mb-3">
            Why embed?
          </h2>
          <ul className="space-y-3 text-sm text-slate-300">
            <li><strong className="text-slate-100">Always-fresh data.</strong> Best prices from 30+ books, refreshed every 2 minutes.</li>
            <li><strong className="text-slate-100">Zero maintenance.</strong> No API key, no backend, no cron jobs. Drop the snippet and walk away.</li>
            <li><strong className="text-slate-100">Mobile-friendly.</strong> Responsive layout, dark and light themes.</li>
            <li><strong className="text-slate-100">Compliance-safe.</strong> 21+ and responsible-gambling messaging is built in.</li>
            <li><strong className="text-slate-100">Affiliate-friendly.</strong> Pair with our <a className="text-teal-300 underline" href="/partners">partner program</a> for revenue share on referred signups.</li>
          </ul>

          <h2 className="text-lg font-semibold mt-6 mb-2">Terms of use</h2>
          <p className="text-xs text-slate-400">
            Widgets are free for editorial use on content sites with a visible
            "Powered by Valor Odds" link (included by default). Bulk
            redistribution, data scraping, or removing attribution is
            prohibited — get in touch for a data licensing agreement.
          </p>
        </section>

        <EmbedBuilder
          sports={SPORTS.map((s) => ({ slug: s.slug, fullName: s.fullName }))}
          siteUrl={SITE.url}
        />
      </div>

      <section aria-labelledby="faq-heading" className="mt-16">
        <h2 id="faq-heading" className="text-2xl font-semibold mb-4">
          Embed FAQ
        </h2>
        <div className="space-y-4 text-sm text-slate-300 max-w-3xl">
          <details className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <summary className="cursor-pointer font-medium text-slate-100">Does the widget count as a backlink?</summary>
            <p className="mt-2">
              Yes. The "Powered by Valor Odds" attribution is a real anchor tag pointing at our site, so it counts for link equity. The widget HTML itself loads in an iframe, but the attribution link lives on the host page.
            </p>
          </details>
          <details className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <summary className="cursor-pointer font-medium text-slate-100">How often does the data refresh?</summary>
            <p className="mt-2">
              Every 120 seconds. The widget page itself uses incremental static
              regeneration, so the cost to us is constant regardless of how
              many sites embed it.
            </p>
          </details>
          <details className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <summary className="cursor-pointer font-medium text-slate-100">Can I customize the look?</summary>
            <p className="mt-2">
              Dark and light themes are supported out of the box (the{' '}
              <code>theme</code> query parameter). Custom branding,
              multi-market variants, and white-label embeds are part of the
              paid data partnership tier — see{' '}
              <a className="text-teal-300 underline" href="/partners/data">Data partners</a>.
            </p>
          </details>
          <details className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <summary className="cursor-pointer font-medium text-slate-100">What's the tracking parameter for?</summary>
            <p className="mt-2">
              The optional <code>ref</code> parameter tags outbound clicks
              with a UTM source so you can see in your analytics how much
              traffic the widget drives. It does not track your visitors.
            </p>
          </details>
        </div>
      </section>
    </main>
  );
}