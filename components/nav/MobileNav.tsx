'use client';

/**
 * Slide-out mobile navigation drawer.
 *
 * The old navbar hid every nav link behind `hidden md:flex`, which meant phone
 * users had essentially no way to reach most of the product. This drawer lists
 * every destination, grouped by section, plus a quick search box.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, Search, LogOut } from 'lucide-react';
import { getNavSections } from '@/lib/nav-links';

export default function MobileNav({
  isAdmin = false,
  isAuthed = false,
  signOutAction,
}: {
  isAdmin?: boolean;
  isAuthed?: boolean;
  signOutAction?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const pathname = usePathname();

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const sections = getNavSections(isAdmin);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? sections
        .map((s) => ({
          ...s,
          links: s.links.filter(
            (l) =>
              l.label.toLowerCase().includes(q) ||
              l.description?.toLowerCase().includes(q) ||
              l.keywords?.some((k) => k.includes(q)),
          ),
        }))
        .filter((s) => s.links.length > 0)
    : sections;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        className="btn-ghost md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] md:hidden">
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          {/* Drawer */}
          <div className="absolute right-0 top-0 flex h-full w-[85%] max-w-sm flex-col border-l border-brand-border bg-brand-bg shadow-2xl">
            <div className="flex items-center justify-between border-b border-brand-border px-4 py-3">
              <span className="text-sm font-semibold text-brand-text">Navigation</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation menu"
                className="btn-ghost"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="border-b border-brand-border px-4 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search pages..."
                  aria-label="Search pages"
                  className="input w-full pl-9"
                />
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto px-2 py-3">
              {filtered.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-brand-muted">
                  No pages match &ldquo;{query}&rdquo;
                </p>
              )}
              {filtered.map((section) => (
                <div key={section.title} className="mb-4">
                  <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-brand-muted">
                    {section.title}
                  </p>
                  {section.links.map((link) => {
                    const Icon = link.icon;
                    const active = pathname === link.href;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={`flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                          active
                            ? 'bg-brand-primary/15 text-brand-primary'
                            : section.title === 'Admin'
                              ? 'text-amber-300 hover:bg-brand-surface'
                              : 'text-brand-muted hover:bg-brand-surface hover:text-brand-text'
                        }`}
                      >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{link.label}</span>
                          {link.description && (
                            <span className="block truncate text-xs text-brand-muted">
                              {link.description}
                            </span>
                          )}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>

            {isAuthed && signOutAction && (
              <form action={signOutAction} className="border-t border-brand-border p-3">
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-brand-muted transition-colors hover:bg-brand-surface hover:text-brand-text"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            )}

            {!isAuthed && (
              <div className="flex gap-2 border-t border-brand-border p-3">
                <Link href="/auth/signin" className="btn-ghost flex-1 justify-center">
                  Sign in
                </Link>
                <Link href="/auth/signup" className="btn-primary flex-1 justify-center">
                  Get started
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
