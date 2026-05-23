'use client';

/**
 * Root-level error boundary for errors that escape the route-segment
 * boundary (e.g. errors thrown from the root layout itself). Must include
 * its own <html>/<body> per Next.js docs.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const msg = error?.message ?? '';
  const isStaleAction =
    /Server Action/i.test(msg) ||
    /Failed to find Server Action/i.test(msg);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          background: '#0b0d12',
          color: '#e6e8ee',
          minHeight: '100vh',
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
        }}
      >
        <div
          style={{
            maxWidth: 480,
            textAlign: 'center',
            border: '1px solid #1f242e',
            borderRadius: 12,
            padding: '2rem',
            background: '#11141b',
          }}
        >
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#9aa3b2', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
            {isStaleAction
              ? 'We just shipped an update and this tab is out of date. Refreshing will fix it.'
              : 'An unexpected error occurred. Please try again.'}
          </p>
          {error?.digest ? (
            <p style={{ color: '#6b7280', fontSize: '0.75rem', marginBottom: '1rem' }}>
              Reference: {error.digest}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            {isStaleAction ? (
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') window.location.reload();
                }}
                style={{
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  padding: '0.6rem 1.1rem',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                }}
              >
                Refresh page
              </button>
            ) : (
              <button
                type="button"
                onClick={() => reset()}
                style={{
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  padding: '0.6rem 1.1rem',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                }}
              >
                Try again
              </button>
            )}
            <a
              href="/"
              style={{
                background: 'transparent',
                color: '#e6e8ee',
                border: '1px solid #2a3140',
                borderRadius: 8,
                padding: '0.6rem 1.1rem',
                fontSize: '0.9rem',
                textDecoration: 'none',
              }}
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
