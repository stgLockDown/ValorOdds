'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

export default function ForgotClient() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => undefined);
    setSubmitted(true);
    setLoading(false);
  }

  if (submitted) {
    return (
      <div className="text-sm text-brand-muted">
        If an account exists for <strong className="text-brand-text">{email}</strong>, a reset link has been sent.
        Check your inbox (and spam folder).
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input
          id="email" type="email" required className="input" autoComplete="email"
          value={email} onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <button type="submit" className="btn-primary w-full" disabled={loading || !email}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send reset link'}
      </button>
    </form>
  );
}