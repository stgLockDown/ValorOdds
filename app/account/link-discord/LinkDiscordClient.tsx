'use client';

import { useState } from 'react';
import { Loader2, Copy, Check } from 'lucide-react';
import { signIn } from 'next-auth/react';

export default function LinkDiscordClient() {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const resp = await fetch('/api/account/link-code', { method: 'POST' });
      const data = await resp.json();
      if (resp.ok) {
        setCode(data.code);
        setExpiresAt(data.expiresAt);
      } else {
        alert(data?.error || 'Failed to generate link code');
      }
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <div className="card">
        <h2 className="text-lg font-semibold">Option 1 — Link via Discord OAuth</h2>
        <p className="text-sm text-brand-muted mt-1">
          Fastest. Sign in to Discord and we'll link automatically if your email matches.
        </p>
        <button
          onClick={() => signIn('discord', { callbackUrl: '/account' })}
          className="btn w-full mt-4 bg-[#5865F2] text-white hover:bg-[#4752C4] max-w-sm"
        >
          Continue with Discord
        </button>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold">Option 2 — Link with a code</h2>
        <p className="text-sm text-brand-muted mt-1">
          Prefer not to use Discord OAuth? Generate a one-time code and run <code className="text-xs">/link</code> in the
          Valor Odds Discord server.
        </p>
        {code ? (
          <div className="mt-6 rounded-xl bg-brand-elevated border border-brand-border p-6 text-center">
            <div className="text-xs uppercase tracking-wider text-brand-muted">Your link code</div>
            <div className="mt-2 text-4xl font-mono font-bold tracking-[0.3em]">{code}</div>
            {expiresAt && (
              <p className="mt-2 text-xs text-brand-muted">
                Expires at {new Date(expiresAt).toLocaleTimeString()}
              </p>
            )}
            <button onClick={copy} className="btn-secondary mt-4">
              {copied ? <Check className="h-4 w-4 text-brand-success" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied!' : 'Copy code'}
            </button>
            <div className="mt-6 text-sm text-left text-brand-muted space-y-1">
              <p>Next steps:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Join the Valor Odds Discord server (<a href="https://discord.gg/MfD933h9jb" target="_blank" rel="noreferrer" className="text-brand-primary hover:underline">invite</a>)</li>
                <li>In any channel, run <code className="text-xs">/link {code}</code></li>
                <li>Your accounts will be merged instantly.</li>
              </ol>
            </div>
          </div>
        ) : (
          <button onClick={generate} className="btn-primary mt-4" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Generate link code
          </button>
        )}
      </div>
    </>
  );
}