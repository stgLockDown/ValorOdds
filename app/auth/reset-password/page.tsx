import type { Metadata } from 'next';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ResetClient from './ResetClient';

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function ResetPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token ?? '';
  return (
    <>
      <Navbar />
      <main className="container-px mx-auto max-w-md py-16">
        <div className="card">
          <h1 className="text-2xl font-bold">Reset your password</h1>
          <p className="text-sm text-brand-muted mt-1">Enter a new password below.</p>
          <div className="mt-6">
            {token ? <ResetClient token={token} /> : (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                Invalid reset link.
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}