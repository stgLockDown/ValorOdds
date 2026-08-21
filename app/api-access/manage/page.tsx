import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Navbar from '@/components/MarketingNavbar';
import Footer from '@/components/Footer';
import ApiManageClient from './ApiManageClient';

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = 'force-dynamic';

export default async function ApiAccessManagePage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/signin?callbackUrl=/api-access/manage');

  return (
    <>
      <Navbar />
      <main className="container-px mx-auto max-w-5xl py-16">
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-extrabold">API Dashboard</h1>
          <p className="mt-2 text-brand-muted">
            Manage your API keys, monitor monthly ping usage, and control overage billing.
          </p>
        </div>
        <ApiManageClient />
      </main>
      <Footer />
    </>
  );
}
