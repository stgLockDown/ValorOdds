'use client';

/**
 * A small inline button that re-opens the cookie consent banner.
 * <ConsentManager> registers `window.openCookieSettings`; this just calls it.
 * Falls back gracefully (no-op) if the manager hasn't mounted yet.
 */
export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.openCookieSettings?.()}
      className={className ?? 'hover:text-brand-text'}
    >
      Cookie settings
    </button>
  );
}
