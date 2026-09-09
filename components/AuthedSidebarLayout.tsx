import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import FloatingSupportButton from '@/components/FloatingSupportButton';
import { getNavSections } from '@/lib/nav-links';

export interface AuthedSidebarUser {
  name?: string | null;
  email?: string | null;
  tier?: string;
  discordId?: string | null;
  isAdmin?: boolean;
  isWriter?: boolean;
}

/**
 * Shared authenticated-area layout (navbar + left sidebar + footer). Used by
 * every logged-in page outside the main dashboard overview (Account, Link
 * Discord, dashboard sub-pages, etc.) so the navigation is identical no
 * matter which authenticated page a user lands on.
 *
 * The sidebar renders from `lib/nav-links`, the single source of truth shared
 * with the navbar dropdown, mobile drawer and command palette — so a new
 * destination only has to be added in one place.
 */
export default function AuthedSidebarLayout({
  user,
  children,
}: {
  user: AuthedSidebarUser | null | undefined;
  children: React.ReactNode;
}) {
  const sections = getNavSections(user?.isAdmin ?? false, user?.isWriter ?? false);

  return (
    <>
      <Navbar />
      <div className="container-px mx-auto grid max-w-7xl gap-6 py-8 lg:grid-cols-[240px,1fr]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="card p-4">
            <div className="mb-2 text-xs uppercase tracking-wider text-brand-muted">Signed in</div>
            <div className="truncate font-semibold">{user?.name || user?.email}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {user?.tier && user.tier !== 'free' ? (
                <span className="badge-primary">{user.tier.toUpperCase()}</span>
              ) : (
                <span className="badge">FREE</span>
              )}
              {user?.discordId && <span className="badge-success">Discord linked</span>}
              {user?.isAdmin && <span className="badge-warning">ADMIN</span>}
              {user?.isWriter && !user?.isAdmin && <span className="badge-secondary">WRITER</span>}
            </div>
          </div>

          <nav className="mt-4 space-y-4">
            {sections.map((section) => (
              <div key={section.title}>
                <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-brand-muted">
                  {section.title}
                </p>
                <div className="space-y-1">
                  {section.links.map((link) => {
                    const Icon = link.icon;
                    const isAdminLink = section.title === 'Admin';
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-brand-surface ${
                          isAdminLink
                            ? 'text-amber-300'
                            : 'text-brand-muted hover:text-brand-text'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{link.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
      <FloatingSupportButton isAdmin={user?.isAdmin ?? false} />
      <Footer />
    </>
  );
}
