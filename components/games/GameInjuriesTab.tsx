import { getInjuriesForGame, type GameCard, type GameInjuryRow } from '@/lib/games-data';

/**
 * Injuries tab — both teams' full injury reports from the `injuries` table
 * (populated by the ValorOddsDiscordBot's injury feed, refreshed daily).
 */
export default async function GameInjuriesTab({ game }: { game: GameCard }) {
  const injuries = await getInjuriesForGame(game.sport, game.homeTeam, game.awayTeam);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <InjuryColumn title={`${game.awayTeam} Injuries`} rows={injuries.away} />
      <InjuryColumn title={`${game.homeTeam} Injuries`} rows={injuries.home} />
    </div>
  );
}

function InjuryColumn({ title, rows }: { title: string; rows: ReturnType<typeof getInjuriesForGame> extends Promise<infer T> ? T extends { away: infer R } ? R : never : never }) {
  return (
    <section className="rounded-xl border border-brand-border bg-brand-surface">
      <div className="border-b border-brand-border bg-brand-elevated/40 px-4 py-3">
        <h3 className="font-bold">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-brand-muted">No injuries reported in the last 10 days.</p>
      ) : (
        <ul className="divide-y divide-brand-border">
          {rows.map((inj) => (
            <li key={`${inj.playerName}-${inj.team}`} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm">{inj.playerName}</span>
                <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ${statusColor(inj.status)}`}>
                  {inj.status}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-brand-muted">
                {inj.position ? `${inj.position} · ` : ''}{inj.team}
                {inj.injuryType ? ` · ${inj.injuryType}` : ''}
                {inj.reportedDate ? ` · reported ${inj.reportedDate}` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function statusColor(status: string): string {
  const s = (status || '').toLowerCase();
  if (s.includes('out') || s.includes('ir') || s.includes('injured reserve') || s.includes('pup')) return 'bg-red-500/20 text-red-400';
  if (s.includes('quest') || s.includes('doubt')) return 'bg-amber-500/20 text-amber-400';
  if (s.includes('day') || s.includes('prob') || s.includes('quest')) return 'bg-blue-500/20 text-blue-400';
  return 'bg-brand-elevated text-brand-muted';
}
