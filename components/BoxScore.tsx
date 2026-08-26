'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Zap } from 'lucide-react';

// Mirror of the normalized shapes returned by /api/games/[id]/boxscore.
type Linescore = { label: string; home: number | null; away: number | null };
type TeamStat = { label: string; home: string; away: string };
type PlayerRow = { name: string; position: string | null; jersey: string | null; starter: boolean; stats: string[] };
type PlayerStatGroup = { title: string; labels: string[]; players: PlayerRow[] };
type TeamBox = { teamId: string | null; abbrev: string; name: string; score: number; record: string | null; logo: string | null };
type BigPlay = {
  id: string; text: string; kind: string; teamAbbrev: string | null;
  period: string | null; clock: string | null; homeScore: number | null; awayScore: number | null; wallclock: string | null;
};
type GameSummary = {
  eventId: string; sport: string; state: 'pre' | 'in' | 'post'; isLive: boolean; isFinal: boolean;
  statusDetail: string | null; period: number; clock: string | null; venue: string | null;
  home: TeamBox; away: TeamBox; linescores: Linescore[]; teamStats: TeamStat[];
  homePlayers: PlayerStatGroup[]; awayPlayers: PlayerStatGroup[]; bigPlays: BigPlay[];
};

type Props = {
  gameId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  espnEventId?: string | null;
  /** Auto-refresh interval (ms) while the game is live. 0 disables. */
  liveRefreshMs?: number;
  /**
   * API base path to fetch from. Defaults to the authed dashboard route
   * (`/api/games/[id]/boxscore`). Public game-detail pages pass
   * `/api/public/games` to hit the anonymous-safe variant instead.
   */
  apiBase?: string;
};

function StatusBadge({ s }: { s: GameSummary }) {
  if (s.isLive)
    return (
      <span className="inline-flex items-center gap-1 rounded bg-brand-danger/20 px-2 py-0.5 text-xs font-semibold text-red-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> LIVE
      </span>
    );
  if (s.isFinal)
    return <span className="rounded bg-brand-elevated px-2 py-0.5 text-xs font-semibold text-brand-muted">FINAL</span>;
  return <span className="rounded bg-brand-elevated px-2 py-0.5 text-xs font-semibold text-brand-muted">UPCOMING</span>;
}

export default function BoxScore({
  gameId,
  sport,
  homeTeam,
  awayTeam,
  espnEventId,
  liveRefreshMs = 30000,
  apiBase,
}: Props) {
  const [data, setData] = useState<GameSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'home' | 'away'>('away');

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ sport, home: homeTeam, away: awayTeam });
      if (espnEventId) qs.set('event', espnEventId);
      const base = apiBase ?? `/api/games/${encodeURIComponent(gameId)}/boxscore`;
      const res = await fetch(`${base}?${qs.toString()}`);
      if (!res.ok) throw new Error('unavailable');
      const j = await res.json();
      setData(j.data);
      setError(null);
    } catch {
      setError('Box score unavailable right now.');
    } finally {
      setLoading(false);
    }
  }, [gameId, sport, homeTeam, awayTeam, espnEventId, apiBase]);

  useEffect(() => {
    load();
  }, [load]);

  // Live auto-refresh.
  useEffect(() => {
    if (!liveRefreshMs || !data?.isLive) return;
    const t = setInterval(load, liveRefreshMs);
    return () => clearInterval(t);
  }, [load, liveRefreshMs, data?.isLive]);

  if (loading) {
    return (
      <div className="card flex items-center justify-center py-12">
        <RefreshCw className="h-5 w-5 animate-spin text-brand-muted" />
      </div>
    );
  }
  if (error || !data) {
    return <div className="card py-8 text-center text-sm text-brand-muted">{error ?? 'No data.'}</div>;
  }

  const playerGroups = tab === 'home' ? data.homePlayers : data.awayPlayers;
  const playerTeam = tab === 'home' ? data.home : data.away;

  return (
    <div className="space-y-4">
      {/* Scoreboard header */}
      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <StatusBadge s={data} />
          <span className="text-xs text-brand-muted">
            {data.statusDetail}
            {data.venue ? ` • ${data.venue}` : ''}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-brand-muted">
                <th className="py-1 pr-2 font-medium">Team</th>
                {data.linescores.map((ls) => (
                  <th key={ls.label} className="px-2 py-1 text-center font-medium">{ls.label}</th>
                ))}
                <th className="px-2 py-1 text-center font-semibold text-brand-text">T</th>
              </tr>
            </thead>
            <tbody>
              {[
                { team: data.away, key: 'away' as const },
                { team: data.home, key: 'home' as const },
              ].map(({ team, key }) => (
                <tr key={key} className="border-t border-brand-border/60">
                  <td className="py-2 pr-2 font-semibold text-brand-text">{team.abbrev}</td>
                  {data.linescores.map((ls) => (
                    <td key={ls.label} className="px-2 py-2 text-center text-brand-muted">
                      {ls[key] ?? '–'}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center text-base font-bold text-brand-text">{team.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Big plays feed — on top of the detailed box score */}
      {data.bigPlays.length > 0 && (
        <div className="card">
          <div className="mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4 text-brand-accent" />
            <h3 className="text-sm font-semibold text-brand-text">Big Plays</h3>
            <span className="rounded bg-brand-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-accent">
              {data.bigPlays.length}
            </span>
          </div>
          <ul className="space-y-2">
            {data.bigPlays.map((p) => (
              <li key={p.id} className="flex items-start gap-3 rounded-lg bg-brand-elevated/60 px-3 py-2">
                <span className="mt-0.5 inline-flex shrink-0 items-center rounded bg-brand-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-brand-primaryText">
                  {p.kind}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug text-brand-text">{p.text}</p>
                  <p className="mt-0.5 text-xs text-brand-muted">
                    {[p.teamAbbrev, p.period, p.clock].filter(Boolean).join(' • ')}
                    {p.homeScore != null && p.awayScore != null
                      ? `  —  ${data.away.abbrev} ${p.awayScore}, ${data.home.abbrev} ${p.homeScore}`
                      : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Player stats with home/away toggle */}
      {playerGroups.length > 0 && (
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-brand-text">Player Stats</h3>
            <div className="flex rounded-lg bg-brand-elevated p-0.5">
              {(['away', 'home'] as const).map((side) => {
                const team = side === 'home' ? data.home : data.away;
                return (
                  <button
                    key={side}
                    onClick={() => setTab(side)}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      tab === side ? 'bg-brand-primary text-white' : 'text-brand-muted hover:text-brand-text'
                    }`}
                  >
                    {team.abbrev}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-5">
            {playerGroups.map((g) => (
              <div key={g.title}>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-brand-muted">
                  {playerTeam.abbrev} — {g.title}
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wider text-brand-muted">
                        <th className="py-1 pr-2 font-medium">Player</th>
                        {g.labels.map((l) => (
                          <th key={l} className="px-1.5 py-1 text-right font-medium">{l}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {g.players.map((p, i) => (
                        <tr key={`${p.name}-${i}`} className="border-t border-brand-border/40">
                          <td className="py-1.5 pr-2 text-brand-text">
                            <span className={p.starter ? 'font-medium' : 'text-brand-muted'}>{p.name}</span>
                            {p.position ? <span className="ml-1 text-[10px] text-brand-muted">{p.position}</span> : null}
                          </td>
                          {g.labels.map((_, li) => (
                            <td key={li} className="px-1.5 py-1.5 text-right tabular-nums text-brand-muted">
                              {p.stats[li] ?? '–'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Team stats comparison */}
      {data.teamStats.length > 0 && (
        <div className="card">
          <h3 className="mb-3 text-sm font-semibold text-brand-text">Team Stats</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-brand-muted">
                  <th className="py-1 text-left font-medium">{data.away.abbrev}</th>
                  <th className="py-1 text-center font-medium"></th>
                  <th className="py-1 text-right font-medium">{data.home.abbrev}</th>
                </tr>
              </thead>
              <tbody>
                {data.teamStats.map((s) => (
                  <tr key={s.label} className="border-t border-brand-border/50">
                    <td className="py-1.5 text-left text-brand-text">{s.away}</td>
                    <td className="py-1.5 text-center text-xs text-brand-muted">{s.label}</td>
                    <td className="py-1.5 text-right text-brand-text">{s.home}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
