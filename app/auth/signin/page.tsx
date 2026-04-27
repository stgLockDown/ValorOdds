import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import SignInForm from './SignInForm';

export const metadata: Metadata = { title: 'Sign in' };

export default function SignInPage({ searchParams }: { searchParams: { callbackUrl?: string; error?: string } }) {
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