import Link from 'next/link';
import { auth, signOut } from '@/lib/auth';
import { LogOut, LayoutDashboard, User as UserIcon } from 'lucide-react';
import { ShieldLogo } from '@/components/ShieldLogo';

export default async function Navbar() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-brand-bg/80 border-b border-brand-border">
      <nav className="container-px mx-auto max-w-7xl flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <ShieldLogo className="h-6 w-6" />
          <span>Valor Odds</span>
        </Link>

        <div className="hidden md:flex items-center gap-6 text-sm text-brand-muted">
          <Link href="/#features" className="hover:text-brand-text transition-colors">Features</Link>
          <Link href="/#examples" className="hover:text-brand-text transition-colors">Live Examples</Link>
          <Link href="/pricing" className="hover:text-brand-text transition-colors">Pricing</Link>
          <Link href="/api-access" className="hover:text-brand-text transition-colors">API Access</Link>
          <Link href="/docs" className="hover:text-brand-text transition-colors">Docs</Link>
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link href="/dashboard" className="btn-ghost hidden sm:inline-flex">
                <LayoutDashboard className="h-4 w-4" /> Dashboard
              </Link>
              <Link href="/account" className="btn-ghost">
                <UserIcon className="h-4 w-4" />
                <span className="hidden sm:inline">{user.name || user.email}</span>
                {user.tier && user.tier !== 'free' && (
                  <span className="badge-primary ml-1">{user.tier.toUpperCase()}</span>
                )}
              </Link>
              <form
                action={async () => {
                  'use server';
                  await signOut({ redirectTo: '/' });
                }}
              >
                <button className="btn-ghost" type="submit" aria-label="Sign out">
                  <LogOut className="h-4 w-4" />
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/auth/signin" className="btn-ghost">Sign in</Link>
              <Link href="/auth/signup" className="btn-primary">Get started</Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}