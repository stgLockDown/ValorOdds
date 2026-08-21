import type { Metadata } from 'next';

/**
 * Root layout for all /account/* pages.
 *
 * Account pages are authenticated-only and must never be indexed. We set
 * `noindex, nofollow` here as the authoritative signal to search engines,
 * complementing the robots.txt disallow rule.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
