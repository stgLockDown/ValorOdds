'use client';

/**
 * Command palette — press Cmd/Ctrl+K anywhere to jump to any page.
 *
 * With 50+ routes, menu hierarchies alone still leave things hard to find.
 * This gives a keyboard-first way to reach any destination in two keystrokes,
 * and doubles as a discovery tool (the full list is shown when the query is
 * empty, so users can see everything the product offers).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, CornerDownLeft } from 'lucide-react';
import { getAllNavLinks, type NavLink } from '@/lib/nav-links';

export default function CommandPalette({ isAdmin = false }: { isAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const links = useMemo(() => getAllNavLinks(isAdmin), [isAdmin]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return links;
    const scored = links
      .map((link) => {
        const label = link.label.toLowerCase();
        let score = -1;
        if (label === q) score = 0;
        else if (label.startsWith(q)) score = 1;
        else if (label.includes(q)) score = 2;
        else if (link.keywords?.some((k) => k.includes(q))) score = 3;
        else if (link.description?.toLowerCase().includes(q)) score = 4;
        return { link, score };
      })
      .filter((r) => r.score >= 0)
      .sort((a, b) => a.score - b.score);
    return scored.map((r) => r.link);
  }, [links, query]);

  // Global Cmd/Ctrl+K listener.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Reset + focus when opened.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setIndex(0);
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  const go = useCallback(
    (link: NavLink) => {
      setOpen(false);
      router.push(link.href);
    },
    [router],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = results[index];
      if (target) go(target);
    }
  };

  // Keep the highlighted row scrolled into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${index}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  return (
    <>
      {/* Trigger — visible affordance so users discover the shortcut. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search pages (Command K)"
        className="hidden items-center gap-2 rounded-lg border border-brand-border bg-brand-surface px-3 py-1.5 text-sm text-brand-muted transition-colors hover:border-brand-primary hover:text-brand-text lg:flex"
      >
        <Search className="h-4 w-4" />
        <span>Search...</span>
        <kbd className="ml-2 rounded border border-brand-border bg-brand-elevated px-1.5 py-0.5 font-mono text-[10px]">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[10vh]">
          <button
            type="button"
            aria-label="Close search"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search pages"
            className="relative flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-brand-border bg-brand-surface shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-brand-border px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-brand-muted" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Jump to a page..."
                aria-label="Search pages"
                className="w-full bg-transparent text-sm text-brand-text outline-none placeholder:text-brand-muted"
              />
              <kbd className="hidden rounded border border-brand-border px-1.5 py-0.5 font-mono text-[10px] text-brand-muted sm:block">
                ESC
              </kbd>
            </div>

            <div ref={listRef} className="flex-1 overflow-y-auto py-2">
              {results.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-brand-muted">
                  No pages match &ldquo;{query}&rdquo;
                </p>
              )}
              {results.map((link, i) => {
                const Icon = link.icon;
                const active = i === index;
                return (
                  <button
                    key={link.href}
                    type="button"
                    data-idx={i}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => go(link)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      active ? 'bg-brand-primary/15' : 'hover:bg-brand-elevated'
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${active ? 'text-brand-primary' : 'text-brand-muted'}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-sm font-medium ${
                          active ? 'text-brand-primary' : 'text-brand-text'
                        }`}
                      >
                        {link.label}
                      </span>
                      {link.description && (
                        <span className="block truncate text-xs text-brand-muted">
                          {link.description}
                        </span>
                      )}
                    </span>
                    {active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-brand-muted" />}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-4 border-t border-brand-border px-4 py-2 text-[11px] text-brand-muted">
              <span>↑↓ navigate</span>
              <span>↵ open</span>
              <span>esc close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
