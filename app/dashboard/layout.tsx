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
