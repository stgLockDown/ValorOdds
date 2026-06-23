import type { Metadata } from 'next';
import Navbar from '@/components/MarketingNavbar';
import Footer from '@/components/Footer';
import PricingCards from '@/components/PricingCards';
import CheckoutNotice from '@/components/CheckoutNotice';
import { buildMetadata, breadcrumbJsonLd, faqJsonLd, canonical } from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';

export const metadata: Metadata = buildMetadata({
  title: 'Pricing',
  description:
    'Simple, transparent pricing for Valor Odds. Start free, upgrade to Premium for AI-powered player props and advanced arbitrage filters, or go VIP for our full sharp-bettor toolkit.',
  path: '/pricing',
  keywords: [
    'valor odds pricing',
    'sports betting subscription',
    'arbitrage betting service',
    'ev betting tool cost',
  ],
});

const PRICING_FAQS = [
  {
    q: 'Can I cancel my subscription at any time?',
    a: 'Yes. You can cancel from your account settings at any time. Your plan remains active through the end of the billing period.',
  },
  {
    q: 'Do you offer refunds?',
    a: 'We offer a 7-day satisfaction guarantee on annual plans. Monthly plans are non-refundable but can be canceled at any time.',
  },
  {
    q: 'What payment methods are accepted?',
    a: 'We accept all major credit and debit cards, and Apple / Google Pay, via Stripe.',
  },
  {
    q: 'Is there a free tier?',
    a: 'Yes. Our Free tier includes live arbitrage scanning and basic tools so you can evaluate the platform before upgrading.',
  },
];

export default function PricingPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', url: canonical('/') },
            { name: 'Pricing', url: canonical('/pricing') },
          ]),
          faqJsonLd(PRICING_FAQS),
        ]}
      />
      <Navbar />
      <main className="container-px mx-auto max-w-7xl py-16">
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-extrabold">Choose your plan</h1>
          <p className="mt-3 text-brand-muted">
            Transparent pricing. Cancel anytime. Your Discord role is synced automatically.
          </p>
          <CheckoutNotice />
        </div>
        <div className="mt-12">
          <PricingCards />
        </div>
        <div className="mt-14 text-center text-sm text-brand-muted space-y-1">
          <p>💳 Payments processed securely by Stripe</p>
          <p>🔄 Cancel anytime, no questions asked</p>
          <p>📱 VIP members get early access to the upcoming Valor Odds mobile app</p>
        </div>
      </main>
      <Footer />
    </>
  );
}