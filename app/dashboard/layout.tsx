import Link from 'next/link';
import { auth } from '@/lib/auth';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import FloatingSupportButton from '@/components/FloatingSupportButton';
import { LayoutDashboard, MessageSquare, BarChart3, User as UserIcon, Shield, Link as LinkIcon, LifeBuoy, Headphones, Code2, Activity } from 'lucide-react';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user;

  const nav = [
    { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { href: '/dashboard/chat', label: 'AI Chat', icon: MessageSquare },
    { href: '/dashboard/stats', label: 'Your stats', icon: BarChart3 },
    { href: '/account', label: 'Account', icon: UserIcon },
    { href: '/account/link-discord', label: 'Link Discord', icon: LinkIcon },
    { href: '/dashboard/support', label: 'Support', icon: LifeBuoy },
    { href: '/api-access/manage', label: 'API Dashboard', icon: Code2 },
  ];

  // Check if current page is the main dashboard (DashboardClient)
  const isMainDashboard = children && typeof children === 'object' && 'type' in children && (children.type as any)?.displayName === 'DashboardClient';

  // If main dashboard, use simpler layout without sidebar
  if (isMainDashboard) {
    return (
      <>
        <Navbar />
        <div className="mx-auto max-w-7xl py-3 sm:py-4 px-3 sm:px-4 lg:px-6">
          {children}
        </div>
        <FloatingSupportButton isAdmin={user?.isAdmin ?? false} />
        <Footer />
      </>
    );
  }

  // Other dashboard pages (stats, chat, etc.) show sidebar
  return (
    <>
      <Navbar />
      <div className="container-px mx-auto max-w-7xl py-8 grid gap-6 lg:grid-cols-[240px,1fr]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="card p-4">
            <div className="text-xs text-brand-muted uppercase tracking-wider mb-2">
              Signed in
            </div>
            <div className="font-semibold truncate">{user?.name || user?.email}</div>
            <div className="mt-2 flex gap-2 flex-wrap">
              {user?.tier && user.tier !== 'free' ? (
                <span className="badge-primary">{user.tier.toUpperCase()}</span>
              ) : (
                <span className="badge">FREE</span>
              )}
              {user?.discordId && <span className="badge-success">Discord linked</span>}
              {user?.isAdmin && <span className="badge-warning">ADMIN</span>}
            </div>
          </div>
          <nav className="mt-4 space-y-1">
            {nav.map((n) => {
              const Icon = n.icon;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-brand-muted hover:text-brand-text hover:bg-brand-surface transition-colors"
                >
                  <Icon className="h-4 w-4" />
                  {n.label}
                </Link>
              );
            })}
            {user?.isAdmin && (
              <Link
                href="/admin"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-amber-300 hover:bg-brand-surface transition-colors"
              >
                <Shield className="h-4 w-4" />
                Admin
              </Link>
            )}
            {user?.isAdmin && (
              <Link
                href="/admin/support"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-amber-300 hover:bg-brand-surface transition-colors"
              >
                <Headphones className="h-4 w-4" />
                Support Tickets
              </Link>
            )}
            {user?.isAdmin && (
              <Link
                href="/admin/api-access"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-amber-300 hover:bg-brand-surface transition-colors"
              >
                <Code2 className="h-4 w-4" />
                API Monetization
              </Link>
            )}
          </nav>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
      <FloatingSupportButton isAdmin={user?.isAdmin ?? false} />
      <Footer />
    </>
  );
}