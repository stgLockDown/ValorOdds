import Image from 'next/image';
import Link from 'next/link';
import {
  getBatterVsPitcherMatchups,
  getInjuriesForGame,
  getWeatherForTeam,
  fmtAmerican,
  type GameCard,
} from '@/lib/games-data';

/**
 * Details tab — the landing tab for a per-game detail page.
 *
 * For MLB: Batter-vs-Pitcher matchup widget with player headshots (the
 * feature the user explicitly asked to replicate from the competitor site),
 * a key-injuries snippet, and stadium weather (outdoor games only).
 *
 * For NFL: a compact "what to watch" snapshot — best moneyline/spread/total,
 * key injuries snippet. No BvP widget (that's baseball-specific).
 */
export default async function GameDetailsTab({
  game,
  injuriesHref,
}: {
  game: GameCard;
  /** Absolute path to the injuries tab, e.g. /games/mlb/x-y-2026-08-25/injuries */
  injuriesHref?: string;
}) {
  const isMlb = game.sport === 'MLB';
  const [bvPitcher, injuries, weather] = await Promise.all([
    isMlb ? getBatterVsPitcherMatchups(game.homeTeam, game.awayTeam, 12) : Promise.resolve([]),
    getInjuriesForGame(game.sport, game.homeTeam, game.awayTeam),
    isMlb ? getWeatherForTeam(game.homeTeam) : Promise.resolve(null),
  ]);
  const allInjuries = [...injuries.away, ...injuries.home];

  return (
    <div className="space-y-6">
      {/* Snapshot odds strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-brand-border bg-brand-surface p-4 text-center">
          <div className="text-[11px] uppercase tracking-wider text-brand-muted">Moneyline</div>
          <div className="mt-2 space-y-1 font-mono text-sm">
            <div className="flex justify-between gap-2">
              <span className="truncate text-xs">{game.awayTeam}</span>
              <span className="text-brand-accent">
                {game.bestMoneyline[0]?.price != null ? fmtAmerican(game.bestMoneyline[0].price) : '—'}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="truncate text-xs">{game.homeTeam}</span>
              <span className="text-brand-accent">
                {game.bestMoneyline[1]?.price != null ? fmtAmerican(game.bestMoneyline[1].price) : '—'}
              </span>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-brand-border bg-brand-surface p-4 text-center">
          <div className="text-[11px] uppercase tracking-wider text-brand-muted">Spread</div>
          <div className="mt-2 space-y-1 font-mono text-sm">
            <div className="flex justify-between gap-2">
              <span className="truncate text-xs">{game.awayTeam}</span>
              <span className="text-brand-text">
                {game.bestSpread[0]?.point != null
                  ? `${game.bestSpread[0].point > 0 ? '+' : ''}${game.bestSpread[0].point}`
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="truncate text-xs">{game.homeTeam}</span>
              <span className="text-brand-text">
                {game.bestSpread[1]?.point != null
                  ? `${game.bestSpread[1].point > 0 ? '+' : ''}${game.bestSpread[1].point}`
                  : '—'}
              </span>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-brand-border bg-brand-surface p-4 text-center">
          <div className="text-[11px] uppercase tracking-wider text-brand-muted">Total (O/U)</div>
          <div className="mt-2 font-mono text-lg font-bold text-brand-accent">
            {game.bestTotal[0]?.point != null ? game.bestTotal[0].point : '—'}
          </div>
          <div className="mt-1 space-y-0.5 font-mono text-[11px] text-brand-muted">
            <div>O {game.bestTotal[0]?.price != null ? fmtAmerican(game.bestTotal[0].price) : '—'}</div>
            <div>U {game.bestTotal[1]?.price != null ? fmtAmerican(game.bestTotal[1].price) : '—'}</div>
          </div>
        </div>
      </div>

      {/* MLB: Batter vs Pitcher with headshots */}
      {isMlb && (
        <section className="rounded-xl border border-brand-border bg-brand-surface p-5">
          <h3 className="text-lg font-bold">Batter vs. Pitcher</h3>
          <p className="mt-1 text-sm text-brand-muted">
            Projected starters and their opposing pitcher for today's matchup.
          </p>
          {bvPitcher.length === 0 ? (
            <p className="mt-4 text-sm text-brand-muted">No projected matchups available yet — check back closer to first pitch.</p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {bvPitcher.map((p) => (
                <div key={`${p.playerName}-${p.team}`} className="flex items-center gap-3 rounded-lg border border-brand-border bg-brand-elevated/40 p-3">
                  {p.headshotUrl ? (
                    <Image
                      src={p.headshotUrl}
                      alt={p.playerName}
                      width={48}
                      height={48}
                      className="h-12 w-12 shrink-0 rounded-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-elevated text-xs text-brand-muted">
                      {p.playerName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{p.playerName}</div>
                    <div className="truncate text-[11px] text-brand-muted">
                      {p.position ? `${p.position} · ` : ''}{p.team}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-brand-accent">
                      vs {p.opposingPitcher}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* MLB: weather strip */}
      {isMlb && weather && (
        <section className="rounded-xl border border-brand-border bg-brand-surface p-5">
          <h3 className="text-lg font-bold">Stadium Weather</h3>
          <div className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
            <span><span className="text-brand-muted">Stadium:</span> {weather.stadium}</span>
            <span><span className="text-brand-muted">Temp:</span> {weather.temperature}°F</span>
            <span><span className="text-brand-muted">Wind:</span> {weather.windSpeed} mph</span>
            <span><span className="text-brand-muted">Conditions:</span> {weather.conditions}</span>
            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${
              weather.impact?.toUpperCase() === 'HIGH' ? 'bg-red-500/20 text-red-400' :
              weather.impact?.toUpperCase() === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400' :
              'bg-brand-elevated text-brand-muted'
            }`}>Impact: {weather.impact}</span>
          </div>
        </section>
      )}

      {/* Key injuries snippet */}
      <section className="rounded-xl border border-brand-border bg-brand-surface p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Key Injuries</h3>
          {injuriesHref && (
            <Link
              href={injuriesHref}
              className="text-xs font-semibold text-brand-accent hover:underline"
            >
              Full injury report →
            </Link>
          )}
        </div>
        {allInjuries.length === 0 ? (
          <p className="mt-3 text-sm text-brand-muted">No injuries reported for either team in the last 10 days.</p>
        ) : (
          <ul className="mt-3 divide-y divide-brand-border">
            {allInjuries.slice(0, 8).map((inj) => (
              <li key={`${inj.playerName}-${inj.team}`} className="flex items-center justify-between py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-semibold">{inj.playerName}</span>
                  <span className="text-brand-muted"> · {inj.team}{inj.position ? ` · ${inj.position}` : ''}</span>
                  {inj.injuryType && <span className="text-brand-muted"> — {inj.injuryType}</span>}
                </span>
                <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ${statusColor(inj.status)}`}>
                  {inj.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function statusColor(status: string): string {
  const s = (status || '').toLowerCase();
  if (s.includes('out') || s.includes('ir') || s.includes('injured reserve')) return 'bg-red-500/20 text-red-400';
  if (s.includes('quest') || s.includes('doubt')) return 'bg-amber-500/20 text-amber-400';
  if (s.includes('day') || s.includes('prob')) return 'bg-brand-elevated text-brand-muted';
  return 'bg-brand-elevated text-brand-muted';
}
