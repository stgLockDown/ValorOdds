import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import SignUpForm from './SignUpForm';

export const metadata: Metadata = { title: 'Create account' };

export default function SignUpPage({ searchParams }: { searchParams: { next?: string } }) {
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