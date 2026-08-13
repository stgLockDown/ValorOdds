import type { Metadata } from 'next';
import Navbar from '@/components/MarketingNavbar';
import Footer from '@/components/Footer';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Terms of Service',
  description: 'Valor Odds Terms of Service. Read the terms that govern your use of valorodds.com and our Discord services.',
  path: '/terms',
});

// Static effective date for this document revision. Update this constant
// only when the actual terms content below changes — do NOT derive it from
// the current render time, which would misleadingly show "today" on every
// page load regardless of when the terms last changed.
const LAST_UPDATED = 'August 12, 2026';

export default function TermsPage() {
  return (
    <>
      <Navbar />
      <main className="container-px mx-auto max-w-3xl py-16 prose-chat">
        <h1 className="text-3xl font-bold mb-4">Terms of Service</h1>
        <p className="text-brand-muted">Last updated: {LAST_UPDATED}</p>
        <p className="mt-6">
          Welcome to Valor Odds. By creating an account or using our services, you agree to these terms.
          Valor Odds provides data and analysis for informational purposes only. We are not a sportsbook,
          do not accept wagers, and do not guarantee profits. Gambling involves risk — never bet more than
          you can afford to lose. You must be of legal gambling age in your jurisdiction to use our service.
        </p>
        <h2 className="text-xl font-semibold mt-8">Accounts & subscriptions</h2>
        <p>
          Subscriptions are billed monthly via Stripe and auto-renew until canceled. You can cancel anytime
          from the Account page; access continues until the end of the current billing period.
        </p>
        <h2 className="text-xl font-semibold mt-8">Contact</h2>
        <p>Questions? Contact us via the Valor Odds Discord server.</p>
      </main>
      <Footer />
    </>
  );
}