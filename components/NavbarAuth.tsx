'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LayoutDashboard, User as UserIcon } from 'lucide-react';

/**
 * Client-side auth island for the marketing navbar.
 *
 * Why this exists: the marketing pages (home, sports hubs, learn, pricing,
 * legal, etc.) are pure static content and should be statically rendered so
 * Cloudflare/CDN can cache them and crawlers get a fast TTFB. The previous
 * shared <Navbar> was an async server component that called `await auth()`,
 * which reads cookies and forced EVERY page that rendered it into dynamic
 * (no-store) rendering — killing cacheability and Core Web Vitals on pages
 * that have zero personalized content.
 *
 * By moving only the auth-dependent buttons into this tiny client island we
 * keep the navbar (and the whole page) statically renderable while still
 * showing the correct signed-in / signed-out actions after hydration. The
 * session check hits the lightweight /api/account/me endpoint.
 *
 * SEO note: search engines index the static signed-out shell (Sign in / Get
 * started) which is exactly what we want them to see and follow.
 */

type MeResponse = {
  user?: { display_name: string | null; email: string } | null;
  tier?: string | null;
};

export default function NavbarAuth() {
  const [state, setState] = useState<'loading' | 'authed' | 'guest'>('loading');
  const [label, setLabel] = useState<string>('');
  const [tier, setTier] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/account/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: MeResponse | null) => {
        if (cancelled) return;
        if (data?.user) {
          setLabel(data.user.display_name || data.user.email || 'Account');
          setTier(data.tier && data.tier !== 'free' ? data.tier : null);
          setState('authed');
        } else {
          setState('guest');
        }
      })
      .catch(() => {
        if (!cancelled) setState('guest');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // While we don't yet know the session, render the guest CTA shell. This is
  // also what crawlers see (no JS execution), and it avoids layout shift since
  // the authed state has a similar footprint.
  if (state === 'loading' || state === 'guest') {
    return (
      <>
        <Link href="/auth/signin" className="btn-ghost">
          Sign in
        </Link>
        <Link href="/auth/signup" className="btn-primary">
          Get started
        </Link>
      </>
    );
  }

  return (
    <>
      <Link href="/dashboard" className="btn-ghost hidden sm:inline-flex">
        <LayoutDashboard className="h-4 w-4" /> Dashboard
      </Link>
      <Link href="/account" className="btn-ghost">
        <UserIcon className="h-4 w-4" />
        <span className="hidden sm:inline">{label}</span>
        {tier && <span className="badge-primary ml-1">{tier.toUpperCase()}</span>}
      </Link>
    </>
  );
}
