import Link from 'next/link';
import { auth } from '@/lib/auth';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { LayoutDashboard, MessageSquare, BarChart3, User as UserIcon, Shield, Link as LinkIcon } from 'lucide-react';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user;

  const nav = [
    { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { href: '/dashboard/chat', label: 'AI Chat', icon: MessageSquare },
    { href: '/dashboard/stats', label: 'Your stats', icon: BarChart3 },
    { href: '/account', label: 'Account', icon: UserIcon },
    { href: '/account/link-discord', label: 'Link Discord', icon: LinkIcon },
  ];

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
          </nav>
        </aside>
        <main>{children}</main>
      </div>
      <Footer />
    </>
  );
}