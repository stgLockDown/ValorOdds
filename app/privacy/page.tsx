import type { Metadata } from 'next';
import Navbar from '@/components/MarketingNavbar';
import Footer from '@/components/Footer';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Privacy Policy',
  description: 'How Valor Odds collects, uses, and protects your data. Read our full privacy policy.',
  path: '/privacy',
});

// Static effective date for this document revision. Update this constant
// only when the actual policy content below changes — do NOT derive it from
// the current render time, which would misleadingly show "today" on every
// page load regardless of when the policy last changed.
const LAST_UPDATED = 'August 12, 2026';

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <main className="container-px mx-auto max-w-3xl py-16 prose-chat">
        <h1 className="text-3xl font-bold mb-4">Privacy Policy</h1>
        <p className="text-brand-muted">Last updated: {LAST_UPDATED}</p>
        <p className="mt-6">
          We respect your privacy. We collect only the data required to operate the service: email,
          optional display name, Discord ID (if linked), subscription status, and usage events.
          IP addresses are stored only as salted hashes and are not linked to identifiable data.
          We do not sell personal data. Payment details are handled by Stripe and never touch our servers.
        </p>
        <h2 className="text-xl font-semibold mt-8">Cookies</h2>
        <p>
          We use a single first-party authentication cookie for session management, which is always
          active and required for the service to function. Separately, with your explicit consent
          via the cookie banner, we use Google Analytics (GA4) to understand aggregate site traffic
          and improve the product. Analytics cookies are only set after you click &quot;Accept&quot;
          on the cookie banner — if you click &quot;Deny,&quot; no analytics cookies are set and no
          analytics data is collected. You can review or change your choice anytime via the
          &quot;Cookie settings&quot; link in the footer. We do not use third-party advertising
          trackers.
        </p>
        <h2 className="text-xl font-semibold mt-8">Your rights</h2>
        <p>You can request data export or deletion anytime by contacting support in our Discord server.</p>
      </main>
      <Footer />
    </>
  );
}