import type { Metadata } from 'next';
import Navbar from '@/components/MarketingNavbar';
import Footer from '@/components/Footer';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Privacy Policy',
  description: 'How Valor Odds collects, uses, and protects your data. Read our full privacy policy.',
  path: '/privacy',
});

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <main className="container-px mx-auto max-w-3xl py-16 prose-chat">
        <h1 className="text-3xl font-bold mb-4">Privacy Policy</h1>
        <p className="text-brand-muted">Last updated: {new Date().toLocaleDateString()}</p>
        <p className="mt-6">
          We respect your privacy. We collect only the data required to operate the service: email,
          optional display name, Discord ID (if linked), subscription status, and usage events.
          IP addresses are stored only as salted hashes and are not linked to identifiable data.
          We do not sell personal data. Payment details are handled by Stripe and never touch our servers.
        </p>
        <h2 className="text-xl font-semibold mt-8">Cookies</h2>
        <p>We use a single authentication cookie for session management. No third-party trackers.</p>
        <h2 className="text-xl font-semibold mt-8">Your rights</h2>
        <p>You can request data export or deletion anytime by contacting support in our Discord server.</p>
      </main>
      <Footer />
    </>
  );
}