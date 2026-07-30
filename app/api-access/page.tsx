import type { Metadata } from 'next';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import Navbar from '@/components/MarketingNavbar';
import Footer from '@/components/Footer';
import BundleBuilder from '@/components/api-access/BundleBuilder';
import { buildMetadata, breadcrumbJsonLd, faqJsonLd, canonical } from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';

export const metadata: Metadata = buildMetadata({
  title: 'API Access',
  description:
    'Purchase direct API access to Valor Odds real-time sports data and the Odds API. Build your own bundle across 26 sports, or get standalone Odds API access, with a monthly ping pool and optional pay-per-overage billing.',
  path: '/api-access',
  keywords: [
    'sports data api',
    'odds api',
    'sports betting api',
    'real-time sports api',
    'sports data purchase',
    'api pricing',
  ],
});

export const dynamic = 'force-dynamic';

const API_FAQS = [
  {
    q: 'What is a "ping"?',
    a: 'A ping is one API call. Most sport-data endpoints consume 1 ping per call. Odds API calls consume 5 pings per call because that data is more expensive for us to source and refresh in real time.',
  },
  {
    q: 'Can I mix and match sports?',
    a: 'Yes. Build your own bundle by picking a monthly ping pool size, then choosing exactly which sports you want access to (or select All-Access for all 26 at a flat monthly rate). Add the Odds API on top of any bundle.',
  },
  {
    q: 'What happens if I run out of pings?',
    a: 'By default, calls beyond your monthly pool are cut off (HTTP 429) so you never get a surprise bill. If you enable pay-per-overage from your API dashboard, calls keep working past your quota and overage is billed at a flat per-1,000-ping rate.',
  },
  {
    q: 'Do I need a bundle to get the Odds API?',
    a: 'No. The Odds API is also available standalone with its own dedicated monthly ping pool, completely independent of the sport-data bundles.',
  },
  {
    q: 'How do I authenticate my API calls?',
    a: 'Every plan gets a unique API key, sent once by email and viewable (masked) in your API dashboard. Pass it as the X-API-Key header on every request to the gateway.',
  },
];

export default async function ApiAccessPage() {
  const session = await auth();
  const isAuthenticated = Boolean(session?.user);

  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', url: canonical('/') },
            { name: 'API Access', url: canonical('/api-access') },
          ]),
          faqJsonLd(API_FAQS),
        ]}
      />
      <Navbar />
      <main className="container-px mx-auto max-w-7xl py-16">
        <div className="text-center max-w-2xl mx-auto">
          <span className="inline-block rounded-full bg-brand-primary/10 text-brand-primary text-xs font-semibold px-3 py-1 mb-3">
            DEVELOPER / API PLATFORM
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold">Valor Odds API Access</h1>
          <p className="mt-3 text-brand-muted">
            Build your own bundle across 26 sports of real-time data, or grab standalone access to
            our Odds API. Pick a monthly ping pool, pick your sports, and go — with a live usage
            dashboard, key management, and optional pay-per-overage billing.
          </p>
          {isAuthenticated && (
            <p className="mt-4 text-sm">
              Already have a plan?{' '}
              <Link href="/api-access/manage" className="text-brand-primary font-semibold underline">
                Go to your API dashboard →
              </Link>
            </p>
          )}
        </div>

        <div className="mt-12">
          <BundleBuilder isAuthenticated={isAuthenticated} />
        </div>

        <div className="mt-16 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-6">Frequently asked questions</h2>
          <div className="space-y-4">
            {API_FAQS.map((f) => (
              <div key={f.q} className="card p-4">
                <h3 className="font-semibold">{f.q}</h3>
                <p className="text-sm text-brand-muted mt-1">{f.a}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 text-center text-sm text-brand-muted space-y-1">
          <p>💳 Payments processed securely by Stripe</p>
          <p>🔄 Cancel anytime, no questions asked</p>
          <p>📊 Live usage tracking with per-endpoint breakdowns in your dashboard</p>
        </div>
      </main>
      <Footer />
    </>
  );
}
