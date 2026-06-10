'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

type Status = 'loading' | 'complete' | 'open' | 'expired' | 'error';

export default function ReturnClient({ sessionId }: { sessionId: string | null }) {
  const [status, setStatus] = useState<Status>('loading');
  const [tier, setTier] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setStatus('error');
      return;
    }
    fetch(`/api/stripe/session-status?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.status === 'complete') {
          setStatus('complete');
          setTier(d.tier ?? null);
          setEmail(d.customerEmail ?? null);
        } else if (d?.status === 'open') {
          // Payment not finished — send them back to retry.
          setStatus('open');
        } else if (d?.status === 'expired') {
          setStatus('expired');
        } else {
          setStatus('error');
        }
      })
      .catch(() => setStatus('error'));
  }, [sessionId]);

  if (status === 'loading') {
    return (
      <div className="card max-w-lg mx-auto text-center py-12">
        <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-brand-primary" />
        <p className="text-brand-muted">Confirming your subscription…</p>
      </div>
    );
  }

  if (status === 'complete') {
    return (
      <div className="card max-w-lg mx-auto text-center py-10">
        <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-400" />
        <h1 className="text-2xl font-bold">You&apos;re subscribed! 🎉</h1>
        <p className="text-brand-muted mt-2">
          Welcome to <strong className="capitalize">{tier || 'your plan'}</strong>.
          {email ? <> A receipt is on its way to {email}.</> : null}
        </p>
        <p className="text-brand-muted text-sm mt-2">
          Your access (and Discord role, if linked) updates within a few seconds.
        </p>
        <div className="flex gap-3 justify-center mt-6">
          <Link href="/dashboard" className="btn-primary">Go to dashboard</Link>
          <Link href="/account" className="btn-secondary">View account</Link>
        </div>
      </div>
    );
  }

  if (status === 'open') {
    return (
      <div className="card max-w-lg mx-auto text-center py-10">
        <XCircle className="h-12 w-12 mx-auto mb-4 text-yellow-400" />
        <h1 className="text-xl font-bold">Payment not completed</h1>
        <p className="text-brand-muted mt-2">It looks like checkout wasn&apos;t finished.</p>
        <Link href="/pricing" className="btn-primary mt-6 w-fit mx-auto">Back to pricing</Link>
      </div>
    );
  }

  return (
    <div className="card max-w-lg mx-auto text-center py-10">
      <XCircle className="h-12 w-12 mx-auto mb-4 text-red-400" />
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="text-brand-muted mt-2">
        {status === 'expired'
          ? 'This checkout session expired.'
          : 'We couldn’t confirm your checkout. If you were charged, your access will still activate automatically.'}
      </p>
      <div className="flex gap-3 justify-center mt-6">
        <Link href="/pricing" className="btn-primary">Back to pricing</Link>
        <Link href="/account" className="btn-secondary">View account</Link>
      </div>
    </div>
  );
}
