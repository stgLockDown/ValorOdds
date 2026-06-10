import type { Metadata } from 'next';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ReturnClient from './ReturnClient';

export const metadata: Metadata = {
  title: 'Checkout complete',
  robots: { index: false, follow: false },
};

export default function CheckoutReturnPage({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  return (
    <>
      <Navbar />
      <main className="container-px mx-auto max-w-7xl py-16">
        <ReturnClient sessionId={searchParams.session_id ?? null} />
      </main>
      <Footer />
    </>
  );
}
