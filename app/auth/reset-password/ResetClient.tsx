'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

export default function ResetClient({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError('Passwords do not match.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');

    setLoading(true);
    try {
      const resp = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data?.error || 'Reset failed');
      } else {
        setSuccess(true);
      }
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div>
        <div className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
          Password updated. You can now <a href="/auth/signin" className="underline">sign in</a>.
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="pw" className="label">New password</label>
        <input id="pw" type="password" required minLength={8} autoComplete="new-password"
               className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div>
        <label htmlFor="cf" className="label">Confirm password</label>
        <input id="cf" type="password" required minLength={8} autoComplete="new-password"
               className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">{error}</div>
      )}
      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update password'}
      </button>
    </form>
  );
}