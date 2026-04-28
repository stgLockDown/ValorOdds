import type { Metadata } from 'next';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import PricingCards from '@/components/PricingCards';
import { auth } from '@/lib/auth';

export const metadata: Metadata = { title: 'Pricing' };

export default async function PricingPage({ searchParams }: { searchParams: { checkout?: string } }) {
  const session = await auth();

  return (
    <>
      <Navbar />
      <main className="container-px mx-auto max-w-7xl py-16">
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-extrabold">Choose your plan</h1>
          <p className="mt-3 text-brand-muted">
            Transparent pricing. Cancel anytime. Your Discord role is synced automatically.
          </p>
          {searchParams.checkout === 'cancelled' && (
            <div className="mt-6 badge-warning">Checkout canceled — you were not charged.</div>
          )}
        </div>
        <div className="mt-12">
          <PricingCards isAuthenticated={!!session?.user} />
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