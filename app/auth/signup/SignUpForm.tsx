'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { Loader2 } from 'lucide-react';

const DiscordIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037 19.736 19.736 0 0 0-4.885 1.515.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);

export default function SignUpForm({ next }: { next: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<null | 'creds' | 'discord'>(null);
  const [discordEnabled, setDiscordEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/auth/config')
      .then((r) => r.json())
      .then((d) => setDiscordEnabled(Boolean(d.discordEnabled)))
      .catch(() => setDiscordEnabled(false));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading('creds');
    try {
      const resp = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName: displayName || undefined }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data?.error || 'Signup failed. Please try again.');
        setLoading(null);
        return;
      }
      // Auto sign-in immediately after account creation
      const s = await signIn('credentials', {
        email,
        password,
        redirect: false,
        callbackUrl: next,
      });
      if (s?.error) {
        setError('Account created! Please sign in manually.');
        setLoading(null);
        return;
      }
      window.location.href = s?.url ?? next;
    } catch {
      setError('Network error. Please try again.');
      setLoading(null);
    }
  }

  return (
    <>
      {/* Discord OAuth button — only shown when configured */}
      {discordEnabled === true && (
        <>
          <button
            type="button"
            onClick={() => {
              setLoading('discord');
              signIn('discord', { callbackUrl: next });
            }}
            disabled={loading !== null}
            className="btn w-full bg-[#5865F2] text-white hover:bg-[#4752C4]"
          >
            {loading === 'discord' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <DiscordIcon />
            )}
            Continue with Discord
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-brand-muted">
            <div className="h-px flex-1 bg-brand-border" />
            <span>or sign up with email</span>
            <div className="h-px flex-1 bg-brand-border" />
          </div>
        </>
      )}

      {/* Email / password form */}
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="displayName" className="label">
            Display name <span className="text-brand-muted">(optional)</span>
          </label>
          <input
            id="displayName"
            type="text"
            className="input"
            autoComplete="name"
            maxLength={80}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input
            id="email"
            type="email"
            className="input"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input
            id="password"
            type="password"
            className="input"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-brand-muted mt-1">At least 8 characters.</p>
        </div>

        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            {error}
          </div>
        )}

        <button type="submit" className="btn-primary w-full" disabled={loading !== null}>
          {loading === 'creds' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create account'}
        </button>
        <p className="text-xs text-brand-muted text-center">
          By creating an account you agree to our{' '}
          <a href="/terms" className="text-brand-primary hover:underline">Terms</a> and{' '}
          <a href="/privacy" className="text-brand-primary hover:underline">Privacy Policy</a>.
        </p>
      </form>
    </>
  );
}