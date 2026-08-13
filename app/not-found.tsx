import Link from 'next/link';
import Navbar from '@/components/MarketingNavbar';
import Footer from '@/components/Footer';
import { Home, Search } from 'lucide-react';

/**
 * Custom 404 page — Next.js renders this for any unmatched route.
 *
 * Fixes audit issue #26: the default Next.js error page has no header,
 * navigation, or branding, leaving a visitor with no way back into the site
 * other than the browser back button. This template wraps the same
 * marketing Navbar/Footer used sitewide and gives a clear path back to the
 * homepage (and a few popular destinations) for anyone who lands here via a
 * typo'd or outdated link.
 */
export default function NotFound() {
  return (
    <>
      <Navbar />
      <main className="container-px mx-auto max-w-2xl py-24 text-center">
        <div className="text-7xl font-extrabold gradient-text">404</div>
        <h1 className="mt-4 text-2xl sm:text-3xl font-bold">Page not found</h1>
        <p className="mt-3 text-brand-muted">
          The page you&apos;re looking for doesn&apos;t exist, may have moved, or the link you
          followed might be outdated.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-semibold text-brand-primaryText hover:opacity-90 transition-opacity"
          >
            <Home className="h-4 w-4" />
            Back to homepage
          </Link>
          <Link
            href="/sports"
            className="inline-flex items-center gap-2 rounded-lg border border-brand-border bg-brand-surface px-5 py-2.5 text-sm font-semibold hover:border-brand-primary/50 transition-colors"
          >
            <Search className="h-4 w-4" />
            Browse all sports
          </Link>
        </div>

        <div className="mt-10 text-sm text-brand-muted">
          Or try one of these:{' '}
          <Link href="/pricing" className="text-brand-accent hover:underline">
            Pricing
          </Link>
          {' · '}
          <Link href="/dashboard" className="text-brand-accent hover:underline">
            Dashboard
          </Link>
          {' · '}
          <Link href="/dashboard/support" className="text-brand-accent hover:underline">
            Support
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
