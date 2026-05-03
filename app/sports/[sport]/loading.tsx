/**
 * Route-level loading UI for /sports/[sport].
 *
 * Rendered instantly while the data fetch on the underlying page resolves.
 * Matches the real page's structure so we avoid layout shift when content
 * streams in (keeps CLS near zero on navigation).
 */
export default function SportHubLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 animate-pulse">
      {/* Breadcrumb */}
      <div className="h-4 w-64 rounded bg-white/10 mb-6" aria-hidden />

      {/* H1 */}
      <div className="h-9 w-80 rounded bg-white/15 mb-3" aria-hidden />
      <div className="h-4 w-[60ch] max-w-full rounded bg-white/10 mb-8" aria-hidden />

      {/* Stats strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-white/5" aria-hidden />
        ))}
      </div>

      {/* Market nav */}
      <div className="flex flex-wrap gap-2 mb-8">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="h-8 w-24 rounded-full bg-white/5" aria-hidden />
        ))}
      </div>

      {/* Table */}
      <div className="space-y-2">
        <div className="h-10 rounded bg-white/5" aria-hidden />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="h-12 rounded bg-white/[0.03]" aria-hidden />
        ))}
      </div>

      <span className="sr-only">Loading sport data…</span>
    </div>
  );
}