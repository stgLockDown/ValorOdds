import Link from 'next/link';
import { ShieldLogo } from '@/components/ShieldLogo';
import NavbarAuth from './NavbarAuth';

/**
 * Static marketing navbar.
 *
 * Unlike the auth-aware <Navbar> (which calls `await auth()` and forces the
 * page into dynamic rendering), this component is a plain, synchronous server
 * component. It renders no personalized data on the server, so any page using
 * it can be statically generated and CDN-cached — giving crawlers a fast,
 * cacheable response with full content.
 *
 * The signed-in / signed-out buttons are delegated to <NavbarAuth>, a small
 * client island that resolves the session after hydration.
 */
export default function MarketingNavbar() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-brand-bg/80 border-b border-brand-border">
      <nav
        className="container-px mx-auto max-w-7xl flex h-16 items-center justify-between"
        aria-label="Primary"
      >
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <ShieldLogo className="h-6 w-6" />
          <span>Valor Odds</span>
        </Link>

        <div className="hidden md:flex items-center gap-6 text-sm text-brand-muted">
          <Link href="/sports" className="hover:text-brand-text transition-colors">
            Sports
          </Link>
          <Link href="/arbitrage" className="hover:text-brand-text transition-colors">
            Arbitrage
          </Link>
          <Link
            href="/market-intelligence"
            className="flex items-center gap-1 hover:text-brand-text transition-colors"
          >
            Market Intel
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </Link>
          <Link href="/learn" className="hover:text-brand-text transition-colors">
            Learn
          </Link>
          <Link href="/pricing" className="hover:text-brand-text transition-colors">
            Pricing
          </Link>
          <Link href="/api-access" className="hover:text-brand-text transition-colors">
            API Access
          </Link>
          <Link href="/docs" className="hover:text-brand-text transition-colors">
            Docs
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <NavbarAuth />
        </div>
      </nav>
    </header>
  );
}
