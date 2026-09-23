import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import SignUpForm from './SignUpForm';
import { buildMetadata } from '@/lib/seo';
import { auth } from '@/lib/auth';

const RELATIVE_BASE_A = 'https://a.invalid';
const RELATIVE_BASE_B = 'https://b.invalid';
function isSafeRedirectPath(url?: string | null): boolean {
  if (!url) return false;
  try {
    const s = String(url);
    return (
      new URL(s, RELATIVE_BASE_A).origin === RELATIVE_BASE_A &&
      new URL(s, RELATIVE_BASE_B).origin === RELATIVE_BASE_B
    );
  } catch {
    return false;
  }
}

export const metadata: Metadata = buildMetadata({
  title: 'Create your free account',
  description:
    'Sign up free for Valor Odds and start finding real-time sports arbitrage and AI-driven +EV bets across MLB, NFL, NBA, NHL, soccer, UFC, and more. No credit card required.',
  path: '/auth/signup',
  keywords: ['valor odds signup', 'free arbitrage betting account', 'sports betting tool signup'],
});

export default async function SignUpPage({ searchParams }: { searchParams: { next?: string } }) {
  // Already-authenticated users have no reason to see the signup form again
  // — send them straight to wherever they were headed (or the dashboard).
  const session = await auth();
  if (session?.user) {
    redirect(isSafeRedirectPath(searchParams.next) ? (searchParams.next as string) : '/dashboard');
  }

  return (
    <>
      <Navbar />
      <main className="container-px mx-auto max-w-md py-16">
        <div className="card">
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="text-sm text-brand-muted mt-1">
            Join Valor Odds — get AI-powered betting intelligence in seconds.
          </p>
          <div className="mt-6">
            <SignUpForm next={searchParams.next ?? '/dashboard'} />
          </div>
          <p className="mt-6 text-sm text-center text-brand-muted">
            Already have an account?{' '}
            <Link href="/auth/signin" className="text-brand-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}