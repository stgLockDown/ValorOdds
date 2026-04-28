import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { consumeEmailVerification } from '@/lib/tokens';
import Link from 'next/link';

export default async function VerifyPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token ?? '';
  const userId = token ? await consumeEmailVerification(token) : null;

  return (
    <>
      <Navbar />
      <main className="container-px mx-auto max-w-md py-16">
        <div className="card text-center">
          {userId ? (
            <>
              <div className="text-4xl">✅</div>
              <h1 className="text-2xl font-bold mt-3">Email verified</h1>
              <p className="text-brand-muted mt-2">Your email address has been confirmed.</p>
              <Link href="/dashboard" className="btn-primary mt-6">Go to dashboard</Link>
            </>
          ) : (
            <>
              <div className="text-4xl">⚠️</div>
              <h1 className="text-2xl font-bold mt-3">Invalid or expired link</h1>
              <p className="text-brand-muted mt-2">
                This verification link is invalid or has expired. Request a new one from your account page.
              </p>
              <Link href="/account" className="btn-primary mt-6">Go to account</Link>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}