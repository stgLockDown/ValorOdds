'use client';

/**
 * Route-segment error boundary.
 *
 * Catches errors thrown during render of any nested route. The most common
 * production hit is a stale Server Action ID from a browser tab that was
 * loaded against a previous deployment — Next.js throws "Failed to find
 * Server Action 'xxx'" because the new build assigned a different ID.
 *
 * We detect that case and prompt the user to refresh, which loads a fresh
 * RSC payload with current Action IDs.
 */
import { useEffect } from 'react';
import Link from 'next/link';

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Best-effort detection of "stale deployment" errors so we can show a
  // tailored message. Next.js throws different messages depending on the
  // exact failure mode.
  const msg = error?.message ?? '';
  const isStaleAction =
    /Server Action/i.test(msg) ||
    /Failed to find Server Action/i.test(msg) ||
    /Connection closed/i.test(msg);

  useEffect(() => {
    // Surface to logs on the client so it shows up in browser devtools but
    // doesn't spam the server.
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.warn('[route-error]', { message: msg, digest: error?.digest });
    }
  }, [msg, error?.digest]);

  return (
    <main className="container-px mx-auto max-w-xl py-20 text-center">
      <div className="card">
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        {isStaleAction ? (
          <p className="mt-3 text-sm text-brand-muted">
            We just shipped an update and this tab was loaded against the
            previous version. Refreshing the page will fix it.
          </p>
        ) : (
          <p className="mt-3 text-sm text-brand-muted">
            An unexpected error occurred. You can try again, or head back home.
          </p>
        )}

        {error?.digest ? (
          <p className="mt-2 text-xs text-brand-muted">Reference: {error.digest}</p>
        ) : null}

        <div className="mt-6 flex items-center justify-center gap-3">
          {isStaleAction ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (typeof window !== 'undefined') window.location.reload();
              }}
            >
              Refresh page
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => reset()}>
              Try again
            </button>
          )}
          <Link href="/" className="btn">
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
