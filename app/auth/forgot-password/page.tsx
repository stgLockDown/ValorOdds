import type { Metadata } from 'next';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ForgotClient from './ForgotClient';

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function ForgotPage() {
  return (
    <>
      <Navbar />
      <main className="container-px mx-auto max-w-md py-16">
        <div className="card">
          <h1 className="text-2xl font-bold">Forgot your password?</h1>
          <p className="text-sm text-brand-muted mt-1">
            Enter your email and we'll send a reset link if an account exists.
          </p>
          <div className="mt-6">
            <ForgotClient />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}