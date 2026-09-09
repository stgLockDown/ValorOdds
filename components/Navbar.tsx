import Link from 'next/link';
import { auth, signOut } from '@/lib/auth';
import { LayoutDashboard, Trophy, CalendarDays } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import UserMenu from '@/components/nav/UserMenu';
import MobileNav from '@/components/nav/MobileNav';
import CommandPalette from '@/components/nav/CommandPalette';

/**
 * Authenticated top navigation.
 *
 * Previously this exposed only a handful of marketing links plus a small,
 * easy-to-miss account icon — which is why the profile felt unreachable from
 * the dashboard and DiamondDraft was effectively hidden. Now it provides:
 *   - direct links to the highest-traffic destinations (Dashboard, Games,
 *     DiamondDraft),
 *   - a full profile dropdown (`UserMenu`) reachable from every page,
 *   - a mobile drawer (`MobileNav`) so phones get real navigation,
 *   - a Cmd/Ctrl+K command palette to jump to any of the 50+ pages.
 */
export default async function Navbar() {
  const session = await auth();
  const user = session?.user;

  async function handleSignOut() {
    'use server';
    await signOut({ redirectTo: '/' });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-brand-border bg-brand-bg/80 backdrop-blur-md">
      <nav className="container-px mx-auto flex h-16 max-w-7xl items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <BrandLogo />

          {user && (
            <div className="hidden items-center gap-1 text-sm md:flex">
              <Link
                href="/dashboard"
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-brand-muted transition-colors hover:bg-brand-surface hover:text-brand-text"
              >
                <LayoutDashboard className="h-4 w-4" /> Dashboard
              </Link>
              <Link
                href="/dashboard/games/mlb"
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-brand-muted transition-colors hover:bg-brand-surface hover:text-brand-text"
              >
                <CalendarDays className="h-4 w-4" /> Games
              </Link>
              <Link
                href="/dd"
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-brand-muted transition-colors hover:bg-brand-surface hover:text-brand-text"
              >
                <Trophy className="h-4 w-4" /> DiamondDraft
              </Link>
            </div>
          )}

          {!user && (
            <div className="hidden items-center gap-6 text-sm text-brand-muted md:flex">
              <Link href="/#features" className="transition-colors hover:text-brand-text">
                Features
              </Link>
              <Link href="/pricing" className="transition-colors hover:text-brand-text">
                Pricing
              </Link>
              <Link href="/api-access" className="transition-colors hover:text-brand-text">
                API Access
              </Link>
              <Link href="/docs" className="transition-colors hover:text-brand-text">
                Docs
              </Link>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {user && (
            <CommandPalette isAdmin={user.isAdmin ?? false} isWriter={user.isWriter ?? false} />
          )}

          {user ? (
            <>
              <UserMenu
                user={{
                  name: user.name,
                  email: user.email,
                  tier: user.tier,
                  isAdmin: user.isAdmin ?? false,
                }}
                signOutAction={handleSignOut}
              />
              <MobileNav
                isAdmin={user.isAdmin ?? false}
                isWriter={user.isWriter ?? false}
                isAuthed
                signOutAction={handleSignOut}
              />
            </>
          ) : (
            <>
              <Link href="/auth/signin" className="btn-ghost">
                Sign in
              </Link>
              <Link href="/auth/signup" className="btn-primary">
                Get started
              </Link>
              <MobileNav />
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
