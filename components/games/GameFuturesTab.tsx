/**
 * Futures tab — deferred placeholder per the user's explicit instruction
 * ("defer the futures tab for now"). We don't have a futures odds data
 * source wired up yet; when we do, this is where championship / MVP /
 * division-winner markets for the two teams in this game will live.
 */
export default function GameFuturesTab() {
  return (
    <div className="rounded-xl border border-dashed border-brand-border bg-brand-surface p-10 text-center">
      <div className="text-3xl">🔮</div>
      <h3 className="mt-4 text-lg font-bold">Futures — Coming Soon</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-brand-muted">
        Championship, division-winner, and award futures markets for these teams
        are on the roadmap. We're working on a futures odds feed and will surface
        it here once available.
      </p>
    </div>
  );
}
