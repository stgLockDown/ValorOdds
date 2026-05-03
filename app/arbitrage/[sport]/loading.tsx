/**
 * Route-level loading UI for /arbitrage/[sport].
 */
export default function ArbSportLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 animate-pulse">
      <div className="h-4 w-64 rounded bg-white/10 mb-6" aria-hidden />
      <div className="h-9 w-96 rounded bg-white/15 mb-3" aria-hidden />
      <div className="h-4 w-[60ch] max-w-full rounded bg-white/10 mb-8" aria-hidden />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
        <div className="h-28 rounded-xl bg-white/5" aria-hidden />
        <div className="h-28 rounded-xl bg-white/5" aria-hidden />
      </div>
      <span className="sr-only">Loading arbitrage data…</span>
    </div>
  );
}