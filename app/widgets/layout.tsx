import type { Metadata } from 'next';

/**
 * Root layout for all embeddable widgets.
 *
 * Widgets are rendered inside third-party iframes so the layout intentionally
 * strips every site-global element (header, footer, analytics) and ships only
 * the widget-specific CSS. `noindex` is set here so widget routes don't
 * compete with our canonical pages in search — the iframe pages exist to be
 * embedded, not to be found directly.
 *
 * The iframe-embedding allow-list is configured in next.config.mjs via the
 * per-path `Content-Security-Policy` header override.
 */

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true, // allow link credit to flow out to the host page
    nocache: true,
  },
};

export default function WidgetsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        fontFamily:
          'var(--font-inter), -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
        colorScheme: 'dark',
      }}
    >
      {children}
    </div>
  );
}