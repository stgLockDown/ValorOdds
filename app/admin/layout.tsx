import type { Metadata } from 'next';

/**
 * Root layout for all /admin/* pages.
 *
 * The admin console is authenticated-only and must never appear in search
 * results. We set `noindex, nofollow` here as the authoritative signal to
 * search engines (complementing the robots.txt disallow, which only prevents
 * crawling — not indexing of URLs that are already known/discovered).
 *
 * This single metadata export covers every page under /admin/ so individual
 * admin pages don't each need to repeat the robots directive.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
