import Image from 'next/image';
import { getStandings, type GameCard } from '@/lib/games-data';
import { normalizeTeam } from '@/lib/espn-scores';

/**
 * Standings tab — full division standings from ESPN, with the two teams in
 * this game highlighted. Shows W-L(-T), win %, games behind, streak.
 */
export default async function GameStandingsTab({ game }: { game: GameCard }) {
  const divisions = await getStandings(game.sport);
  if (divisions.length === 0) {
    return (
      <div className="rounded-xl border border-brand-border bg-brand-surface p-8 text-center text-brand-muted">
        Standings are unavailable right now. Please check back shortly.
      </div>
    );
  }

  const homeNorm = normalizeTeam(game.homeTeam);
  const awayNorm = normalizeTeam(game.awayTeam);
  const isNfl = game.sport === 'NFL';

  return (
    <div className="space-y-6">
      <p className="text-sm text-brand-muted">
        Full {game.sport} division standings. Teams in this game are highlighted.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {divisions.map((div) => (
          <div key={`${div.conference}-${div.division}`} className="overflow-hidden rounded-xl border border-brand-border bg-brand-surface">
            <div className="border-b border-brand-border bg-brand-elevated/40 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-brand-muted">
                {div.conference} · {div.division}
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border text-[11px] uppercase tracking-wider text-brand-muted">
                  <th className="px-3 py-2 text-left">Team</th>
                  <th className="px-2 py-2 text-center">W</th>
                  <th className="px-2 py-2 text-center">L</th>
                  {isNfl && <th className="px-2 py-2 text-center">T</th>}
                  <th className="px-2 py-2 text-center">PCT</th>
                  <th className="px-2 py-2 text-center">GB</th>
                  <th className="px-2 py-2 text-center">STRK</th>
                </tr>
              </thead>
              <tbody>
                {div.teams.map((t) => {
                  const norm = normalizeTeam(t.teamName);
                  const inGame = norm === homeNorm || norm === awayNorm;
                  return (
                    <tr
                      key={t.abbrev || t.teamName}
                      className={`border-b border-brand-border last:border-0 ${inGame ? 'bg-brand-accent/10' : ''}`}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {t.logo && (
                            <Image src={t.logo} alt={t.teamName} width={20} height={20} className="h-5 w-5 object-contain" unoptimized />
                          )}
                          <span className={`truncate ${inGame ? 'font-bold text-brand-accent' : ''}`}>{t.teamName}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center font-mono tabular-nums">{t.wins}</td>
                      <td className="px-2 py-2 text-center font-mono tabular-nums">{t.losses}</td>
                      {isNfl && <td className="px-2 py-2 text-center font-mono tabular-nums">{t.ties}</td>}
                      <td className="px-2 py-2 text-center font-mono tabular-nums text-brand-muted">{t.winPct || '—'}</td>
                      <td className="px-2 py-2 text-center font-mono tabular-nums text-brand-muted">{t.gamesBehind}</td>
                      <td className="px-2 py-2 text-center font-mono tabular-nums text-brand-muted">{t.streak}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
