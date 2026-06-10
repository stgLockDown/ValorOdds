import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { auth } from '@/lib/auth';
import CheckoutClient from './CheckoutClient';

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

const VALID_TIERS = ['basic', 'premium', 'vip'] as const;
type Tier = (typeof VALID_TIERS)[number];

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: { tier?: string };
}) {
  const tierParam = (searchParams.tier || '').toLowerCase();
  if (!VALID_TIERS.includes(tierParam as Tier)) {
    redirect('/pricing');
  }
  const tier = tierParam as Tier;

  const session = await auth();
  if (!session?.user) {
    redirect(`/auth/signin?next=${encodeURIComponent(`/checkout?tier=${tier}`)}`);
  }

  return (
    <>
      <Navbar />
      <main className="container-px mx-auto max-w-7xl py-12">
        <CheckoutClient tier={tier} />
      </main>
      <Footer />
    </>
  );
}
