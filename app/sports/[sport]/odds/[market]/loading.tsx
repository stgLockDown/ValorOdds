/**
 * Route-level loading UI for /sports/[sport]/odds/[market]. Skeleton matches
 * the odds comparison table layout to keep CLS near zero on navigation.
 */
export default function MarketLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 animate-pulse">
      <div className="h-4 w-72 rounded bg-white/10 mb-6" aria-hidden />
      <div className="h-9 w-96 rounded bg-white/15 mb-3" aria-hidden />
      <div className="h-4 w-[70ch] max-w-full rounded bg-white/10 mb-8" aria-hidden />

      <div className="space-y-2">
        <div className="h-10 rounded bg-white/5" aria-hidden />
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-14 rounded bg-white/[0.03]" aria-hidden />
        ))}
      </div>

      <span className="sr-only">Loading odds comparison…</span>
    </div>
  );
}