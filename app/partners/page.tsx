import { buildMetadata, canonical, breadcrumbJsonLd, SITE, faqJsonLd } from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';

/**
 * Partner / affiliate landing page. Dual purpose:
 *   1. SEO target for "valor odds affiliate", "sports odds affiliate program",
 *      "odds api affiliate", etc.
 *   2. Conversion surface for real affiliate signups.
 *
 * The FAQ on this page is wrapped in FAQPage JSON-LD so it can show as
 * rich snippets in SERP.
 */

export const metadata = buildMetadata({
  title: 'Partner & Affiliate Program',
  description:
    'Earn recurring revenue sending traffic to Valor Odds. 30% revenue share, 90-day cookie, dedicated affiliate dashboard.',
  path: '/partners',
  keywords: [
    'valor odds affiliate',
    'sports betting affiliate program',
    'odds affiliate',
    'arbitrage affiliate',
    'revenue share',
  ],
});

const FAQS = [
  {
    q: 'How does the Valor Odds affiliate program work?',
    a: 'Sign up, get a unique tracking link, share it on your blog, podcast, newsletter, or social. We pay 30% recurring revenue share on every paid subscription your referrals generate, for the lifetime of the subscription.',
  },
  {
    q: 'What counts as a referral?',
    a: 'Any user who arrives at valorodds.com via your tracking link (or embedded widget with your ref tag) and subsequently subscribes to a paid plan. The attribution cookie lasts 90 days, so a user who reads your post today and subscribes next month still counts.',
  },
  {
    q: 'How and when do I get paid?',
    a: 'Monthly via Stripe Connect, PayPal, or ACH once your balance clears $50. Dashboards show every referral, status, and pending / paid amounts in real time.',
  },
  {
    q: 'Can I use the embeddable widget without being an affiliate?',
    a: 'Yes. The widget is free for any editorial site with attribution. Joining the affiliate program is optional — it just adds revenue share on top.',
  },
];

export default function PartnersPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', url: SITE.url },
            { name: 'Partners', url: canonical('/partners') },
          ]),
          faqJsonLd(FAQS),
        ]}
      />

      <nav className="text-xs text-slate-400 mb-6" aria-label="Breadcrumb">
        <a href="/" className="hover:text-slate-200">Home</a>
        <span className="mx-2">/</span>
        <span className="text-slate-300">Partners</span>
      </nav>

      <div className="max-w-3xl">
        <h1 className="text-4xl sm:text-5xl font-bold mb-4">
          Earn 30% recurring sending sports bettors to smarter tools
        </h1>
        <p className="text-lg text-slate-300 mb-8">
          If you run a sports betting blog, podcast, YouTube channel, Discord,
          or newsletter, our affiliate program pays 30% recurring revenue
          share on every paid Valor Odds subscription you drive — for the
          lifetime of the subscription.
        </p>
        <div className="flex flex-wrap gap-3 mb-12">
          <a
            href="/auth/signup?intent=affiliate"
            className="inline-flex items-center rounded-md bg-teal-500 px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-teal-400"
          >
            Apply to the program →
          </a>
          <a
            href="/embed"
            className="inline-flex items-center rounded-md border border-white/15 px-5 py-3 text-sm font-semibold text-slate-100 hover:bg-white/5"
          >
            Grab a free widget
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
        {[
          { v: '30%', l: 'Recurring revenue share' },
          { v: '90d', l: 'Attribution window' },
          { v: '$50', l: 'Minimum payout' },
          { v: '24h', l: 'Approval turnaround' },
        ].map((c) => (
          <div
            key={c.l}
            className="rounded-xl border border-white/10 bg-white/[0.02] p-5"
          >
            <div className="text-3xl font-bold text-teal-300">{c.v}</div>
            <div className="text-xs text-slate-400 mt-1">{c.l}</div>
          </div>
        ))}
      </div>

      <section aria-labelledby="fit-heading" className="mb-16">
        <h2 id="fit-heading" className="text-2xl font-semibold mb-4">
          Who this works for
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-slate-300">
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-5">
            <h3 className="font-semibold text-slate-100 mb-2">Betting content creators</h3>
            <p>
              Blogs, YouTube channels, and podcasts covering arbitrage, +EV,
              DFS, or sharp betting strategy. Embed our widgets, link in your
              show notes, earn on every signup.
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-5">
            <h3 className="font-semibold text-slate-100 mb-2">Discord communities</h3>
            <p>
              Private betting Discords that already share picks and plays. We
              offer a Discord-first affiliate flow: tracked invite links,
              member-role gating, bulk tracking codes.
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-5">
            <h3 className="font-semibold text-slate-100 mb-2">Newsletters</h3>
            <p>
              Sports betting newsletters get tracked links + a weekly data
              digest you can drop into your editorial lineup — links back to
              your own domain, UTM'd so credit flows to you.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="how-heading" className="mb-16">
        <h2 id="how-heading" className="text-2xl font-semibold mb-4">
          How it works
        </h2>
        <ol className="space-y-3 text-sm text-slate-300 list-decimal pl-5">
          <li><strong className="text-slate-100">Apply.</strong> Tell us where your audience lives. Most applications are approved within 24 hours.</li>
          <li><strong className="text-slate-100">Get your dashboard.</strong> Unique tracking link, real-time click and conversion data, payout history.</li>
          <li><strong className="text-slate-100">Publish.</strong> Drop tracked links in posts, embed our widgets, include in newsletters. All materials (logos, screenshots, copy) are in the <a href="/press" className="text-teal-300 underline">press kit</a>.</li>
          <li><strong className="text-slate-100">Earn.</strong> 30% of every referred subscription, every month, for as long as that user stays paid.</li>
          <li><strong className="text-slate-100">Get paid.</strong> Monthly via Stripe Connect, PayPal, or ACH when your balance clears $50.</li>
        </ol>
      </section>

      <section aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="text-2xl font-semibold mb-4">Frequently asked</h2>
        <div className="space-y-3 max-w-3xl">
          {FAQS.map((f) => (
            <details
              key={f.q}
              className="rounded-lg border border-white/10 bg-white/[0.02] p-4"
            >
              <summary className="cursor-pointer font-medium text-slate-100">{f.q}</summary>
              <p className="mt-2 text-sm text-slate-300">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-16 rounded-xl border border-teal-500/30 bg-teal-500/5 p-6">
        <h2 className="text-xl font-semibold mb-2">Need something custom?</h2>
        <p className="text-sm text-slate-300 mb-3">
          API access, white-label data feeds, revenue-share partnerships for
          sportsbooks, DFS operators, or media properties — see{' '}
          <a href="/partners/data" className="text-teal-300 underline">Data partners</a>{' '}
          for enterprise terms.
        </p>
      </section>
    </main>
  );
}