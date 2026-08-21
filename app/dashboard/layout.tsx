import type { Metadata } from 'next';

/**
 * Root layout for `/dashboard/*`.
 *
 * The dashboard is authenticated-only and must never appear in search
 * results. `noindex, nofollow` is set here as the authoritative signal to
 * search engines, complementing the robots.txt disallow rule. This covers
 * every page under /dashboard/ including the route-group sub-pages.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Root layout for `/dashboard/*`.
 *
 * This is intentionally a pass-through — the actual chrome is provided by each
 * route group's own layout:
 *   - `(main)` → wide, full-bleed layout for the main dashboard command center
 *     (Navbar + wide container + FloatingSupportButton + Footer). The dashboard
 *     renders its own internal tab sidebar, so it must NOT also get the shared
 *     AuthedSidebarLayout (that double-nav collision crushed the Live Scores /
 *     Top Arbitrage / AI Analyst panels).
 *   - `(sub)`  → AuthedSidebarLayout for /dashboard/chat, /dashboard/stats,
 *     /dashboard/support — consistent sidebar nav with /account pages.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
