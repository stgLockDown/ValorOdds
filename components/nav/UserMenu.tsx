'use client';

/**
 * Profile dropdown shown in the top navbar on every authenticated page.
 *
 * Fixes the "my profile isn't accessible from the dashboard" problem: the
 * dashboard's own chrome has no sidebar, so previously the only route to
 * /account was a small unlabeled icon button. This menu surfaces Account,
 * DiamondDraft, API keys, Support and Admin from anywhere in the product.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, LogOut } from 'lucide-react';
import { PRIMARY_LINKS, ACCOUNT_LINKS, ADMIN_LINKS } from '@/lib/nav-links';

export interface UserMenuUser {
  name?: string | null;
  email?: string | null;
  tier?: string | null;
  isAdmin?: boolean;
}

export default function UserMenu({
  user,
  signOutAction,
}: {
  user: UserMenuUser;
  /** Server action that signs the user out. */
  signOutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const displayName = user.name || user.email || 'Account';
  const initial = (user.name || user.email || '?').charAt(0).toUpperCase();
  const tier = user.tier && user.tier !== 'free' ? user.tier.toUpperCase() : null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open account menu"
        className="flex items-center gap-2 rounded-lg border border-brand-border bg-brand-surface px-2 py-1.5 text-sm transition-colors hover:border-brand-primary"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-white">
          {initial}
        </span>
        <span className="hidden max-w-[140px] truncate sm:inline">{displayName}</span>
        {tier && <span className="badge-primary hidden sm:inline">{tier}</span>}
        <ChevronDown className={`h-4 w-4 text-brand-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-brand-border bg-brand-surface shadow-2xl"
        >
          <div className="border-b border-brand-border px-4 py-3">
            <p className="truncate text-sm font-semibold text-brand-text">{displayName}</p>
            {user.email && <p className="truncate text-xs text-brand-muted">{user.email}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="badge">{user.tier ? user.tier.toUpperCase() : 'FREE'}</span>
              {user.isAdmin && <span className="badge-warning">ADMIN</span>}
            </div>
          </div>

          <MenuSection title="Product" links={PRIMARY_LINKS} onNavigate={() => setOpen(false)} />
          <MenuSection title="Account" links={ACCOUNT_LINKS} onNavigate={() => setOpen(false)} />
          {user.isAdmin && (
            <MenuSection title="Admin" links={ADMIN_LINKS} onNavigate={() => setOpen(false)} accent />
          )}

          <form action={signOutAction} className="border-t border-brand-border">
            <button
              type="submit"
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-brand-muted transition-colors hover:bg-brand-elevated hover:text-brand-text"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function MenuSection({
  title,
  links,
  onNavigate,
  accent,
}: {
  title: string;
  links: typeof PRIMARY_LINKS;
  onNavigate: () => void;
  accent?: boolean;
}) {
  return (
    <div className="border-b border-brand-border py-1.5 last:border-b-0">
      <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-brand-muted">
        {title}
      </p>
      {links.map((link) => {
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            role="menuitem"
            className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-brand-elevated ${
              accent ? 'text-amber-300' : 'text-brand-muted hover:text-brand-text'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{link.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
