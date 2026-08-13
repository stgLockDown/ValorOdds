import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import SignInForm from './SignInForm';
import { buildMetadata } from '@/lib/seo';
import { auth } from '@/lib/auth';

export const metadata: Metadata = buildMetadata({
  title: 'Sign in',
  description:
    'Sign in to Valor Odds to access live sports arbitrage, AI-powered player props, and your personalized analytics dashboard.',
  path: '/auth/signin',
});

export default async function SignInPage({ searchParams }: { searchParams: { callbackUrl?: string; error?: string } }) {
  // Already-authenticated users have no reason to see the signin form again
  // — send them straight to wherever they were headed (or the dashboard).
  const session = await auth();
  if (session?.user) {
    redirect(searchParams.callbackUrl ?? '/dashboard');
  }

  return (
    <>
      <Navbar />
      <main className="container-px mx-auto max-w-md py-16">
        <div className="card">
          <h1 className="text-2xl font-bold">Sign in</h1>
          <p className="text-sm text-brand-muted mt-1">
            Welcome back! Sign in to access your dashboard.
          </p>
          <div className="mt-6">
            <SignInForm callbackUrl={searchParams.callbackUrl ?? '/dashboard'} initialError={searchParams.error} />
          </div>
          <p className="mt-6 text-sm text-center text-brand-muted">
            Don't have an account?{' '}
            <Link href="/auth/signup" className="text-brand-primary hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}