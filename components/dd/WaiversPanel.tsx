'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Search, UserPlus, Trash2, AlertCircle, Check, DollarSign,
  TrendingUp, Play, X,
} from 'lucide-react';
import { getPositionColor } from '@/lib/dd/position-colors';
import { useToast } from './ToastProvider';

// ──────────────────────────────────────────────────────────────────────────────
// Waivers panel — browse free agents, submit FAAB claims, manage pending claims.
// ──────────────────────────────────────────────────────────────────────────────

interface FreeAgent {
  playerName: string;
  playerId: string | null;
  team: string | null;
  position: string | null;
  sport: string | null;
  projectedPoints: number;
  rank: number | null;
  adp: number | null;
  headshot: string | null;
  injuryStatus: string | null;
}

interface WaiverClaim {
  id: string;
  memberId: string;
  memberName: string;
  playerName: string;
  dropPlayerName: string | null;
  bidAmount: number;
  priority: number | null;
  status: string;
  claimDate: string;
  createdAt: string;
  headshot: string | null;
  position: string | null;
  team: string | null;
}

interface Board {
  freeAgents: FreeAgent[];
  myClaims: WaiverClaim[];
  myBudget: number;
  mySpent: number;
  faabEnabled: boolean;
  /** Every position with at least one free agent (server-side census). */
  availablePositions?: { position: string; count: number }[];
  /** Wed→Tue waiver window state. */
  window?: {
    waiversOpen: boolean;
    isWaiverProcessingDay: boolean;
    phase: string;
    opensAt: string | null;
    statusText: string;
    currentWeek: number | null;
  };
}

interface RosterPlayer {
  playerName: string;
  position: string | null;
  team: string | null;
  slot: string;
  projectedPoints: number;
  headshot: string | null;
}

function PosBadge({ sport, position }: { sport: string; position: string }) {
  const c = getPositionColor(sport, position);
  return (
    <span
      className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
      style={{ color: c.fg, background: c.bg, border: `1px solid ${c.border}` }}
    >
      {position}
    </span>
  );
}

function Headshot({ src, name, size = 36 }: { src: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  if (!src || failed) {
    return (
      <div
        className="rounded-full bg-brand-elevated border border-brand-border flex items-center justify-center text-[10px] font-bold text-brand-muted flex-shrink-0"
        style={{ width: size, height: size }}
      >
        {initials}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className="rounded-full object-cover bg-brand-elevated border border-brand-border flex-shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'text-brand-accent bg-brand-accent/10 border-brand-accent/30',
  won: 'text-brand-success bg-brand-success/10 border-brand-success/30',
  lost: 'text-brand-danger bg-brand-danger/10 border-brand-danger/30',
  cancelled: 'text-brand-muted bg-brand-elevated border-brand-border',
};

export default function WaiversPanel({
  leagueId,
  sport,
  roster,
  isCommissioner,
  onChanged,
}: {
  leagueId: string;
  sport: string;
  roster: RosterPlayer[];
  isCommissioner: boolean;
  onChanged: () => void;
}) {
  const { push } = useToast();
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  // Claim composer state.
  const [target, setTarget] = useState<FreeAgent | null>(null);
  const [dropName, setDropName] = useState('');
  const [bid, setBid] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/dd/leagues/${leagueId}/waivers`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load waivers');
      setBoard(json);
    } catch (e: any) {
      setError(e.message || 'Failed to load waivers');
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  useEffect(() => {
    load();
  }, [load]);

  // Client-side filtering keeps the list snappy without a round-trip per key.
  const filtered = useMemo(() => {
    if (!board) return [];
    const q = search.trim().toLowerCase();
    return board.freeAgents.filter((p) => {
      if (position && (p.position ?? '').toUpperCase() !== position.toUpperCase()) return false;
      if (q && !p.playerName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [board, search, position]);

  // Position options come from the server-side census so every position with
  // a free agent is selectable — the visible page is only the top slice, so
  // deriving options from it used to hide DEF/K/TE entirely.
  const positions = useMemo(() => {
    if (!board) return [] as { position: string; count: number }[];
    if (board.availablePositions?.length) return board.availablePositions;
    const seen = new Map<string, number>();
    for (const p of board.freeAgents) {
      const key = (p.position ?? '').toUpperCase();
      if (!key) continue;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return [...seen].map(([pos, count]) => ({ position: pos, count }));
  }, [board]);

  const waiverWindow = board?.window;

  const remaining = board ? board.myBudget - board.mySpent : 0;

  const openComposer = (p: FreeAgent) => {
    setTarget(p);
    setDropName('');
    setBid(0);
  };

  const submit = async () => {
    if (!target) return;
    setBusy('submit');
    try {
      const res = await fetch(`/api/dd/leagues/${leagueId}/waivers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerName: target.playerName,
          dropPlayerName: dropName || null,
          bidAmount: bid,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to submit claim');
      push({
        kind: 'waiver',
        title: `Claim submitted: ${target.playerName}`,
        body: `$${bid} FAAB${dropName ? ` · dropping ${dropName}` : ''}`,
      });
      setTarget(null);
      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to submit claim');
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (claimId: string, playerName: string) => {
    setBusy(claimId);
    try {
      const res = await fetch(`/api/dd/leagues/${leagueId}/waivers/${claimId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to cancel claim');
      }
      push({ kind: 'waiver', title: `Claim cancelled: ${playerName}` });
      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to cancel claim');
    } finally {
      setBusy(null);
    }
  };

  const processAll = async () => {
    setBusy('process');
    try {
      const res = await fetch(`/api/dd/leagues/${leagueId}/waivers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'process' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to process waivers');
      push({
        kind: 'waiver',
        title: 'Waivers processed',
        body: `${json.awarded?.length ?? 0} awarded · ${json.failed?.length ?? 0} not awarded`,
      });
      await load();
      onChanged();
    } catch (e: any) {
      setError(e.message || 'Failed to process waivers');
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-brand-muted">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading waiver wire…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* FAAB summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-brand-border bg-brand-elevated/40 p-3 text-center">
          <div className="text-[10px] uppercase tracking-wide text-brand-muted font-semibold">Budget</div>
          <div className="text-lg font-bold text-brand-text mt-0.5">${board?.myBudget ?? 0}</div>
        </div>
        <div className="rounded-xl border border-brand-border bg-brand-elevated/40 p-3 text-center">
          <div className="text-[10px] uppercase tracking-wide text-brand-muted font-semibold">Spent</div>
          <div className="text-lg font-bold text-brand-text mt-0.5">${board?.mySpent ?? 0}</div>
        </div>
        <div className="rounded-xl border border-brand-primary/40 bg-brand-primary/10 p-3 text-center">
          <div className="text-[10px] uppercase tracking-wide text-brand-primaryText font-semibold">Remaining</div>
          <div className="text-lg font-bold text-brand-text mt-0.5">${remaining}</div>
        </div>
      </div>

      {error && (
        <div className="text-sm text-brand-danger bg-brand-danger/10 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="text-brand-danger/70 hover:text-brand-danger">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* My claims */}
      {board && board.myClaims.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-brand-text mb-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-brand-primaryText" /> My Claims
          </h3>
          <div className="space-y-2">
            {board.myClaims.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-lg bg-brand-elevated/40 px-3 py-2"
              >
                <Headshot src={c.headshot} name={c.playerName} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {c.position && <PosBadge sport={sport} position={c.position} />}
                    <span className="text-sm text-brand-text truncate">{c.playerName}</span>
                  </div>
                  <div className="text-[11px] text-brand-muted mt-0.5">
                    Bid ${c.bidAmount}
                    {c.dropPlayerName ? ` · drop ${c.dropPlayerName}` : ''}
                  </div>
                </div>
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                    STATUS_STYLES[c.status] ?? STATUS_STYLES.pending
                  }`}
                >
                  {c.status}
                </span>
                {c.status === 'pending' && (
                  <button
                    onClick={() => cancel(c.id, c.playerName)}
                    disabled={busy === c.id}
                    className="text-brand-muted hover:text-brand-danger transition-colors"
                    aria-label="Cancel claim"
                  >
                    {busy === c.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Free agents */}
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h3 className="font-semibold text-brand-text flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-success" /> Available Players
            <span className="text-xs font-normal text-brand-muted">
              ({filtered.length})
            </span>
          </h3>
          {isCommissioner && (
            <button
              onClick={processAll}
              disabled={busy === 'process'}
              className="btn-secondary inline-flex items-center gap-2 text-xs"
            >
              {busy === 'process' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              Process Waivers
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-[12rem]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search players…"
              className="w-full bg-brand-surface border border-brand-border rounded-lg pl-9 pr-3 py-2 text-sm text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-primary"
            />
          </div>
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            className="bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
          >
            <option value="">All positions</option>
            {positions.map((p) => (
              <option key={p.position} value={p.position}>
                {p.position} ({p.count})
              </option>
            ))}
          </select>
        </div>

        {/* Waiver window — the scoring period ends Tuesday, the wire re-opens
            Wednesday. Informational only; claims are never blocked here. */}
        {waiverWindow && (
          <div
            className={`mb-4 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs ${
              waiverWindow.isWaiverProcessingDay
                ? 'border-brand-accent/30 bg-brand-accent/10 text-brand-accent'
                : 'border-brand-success/25 bg-brand-success/10 text-brand-success'
            }`}
          >
            <span
              className={`mt-0.5 inline-block h-2 w-2 flex-shrink-0 rounded-full ${
                waiverWindow.isWaiverProcessingDay
                  ? 'bg-brand-accent'
                  : 'bg-brand-success animate-pulse'
              }`}
            />
            <div className="leading-relaxed">
              <span className="font-semibold">
                {waiverWindow.isWaiverProcessingDay ? 'Waivers processing' : 'Wire open'}
                {waiverWindow.currentWeek != null && ` · Week ${waiverWindow.currentWeek}`}
              </span>
              <span className="text-brand-muted"> — {waiverWindow.statusText}</span>
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="text-sm text-brand-muted text-center py-8">
            No available players match your filters.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-[32rem] overflow-y-auto pr-1">
            {filtered.map((p) => (
              <div
                key={p.playerName}
                className="flex items-center gap-3 rounded-lg bg-brand-elevated/40 hover:bg-brand-elevated/70 px-3 py-2 transition-colors"
              >
                <Headshot src={p.headshot} name={p.playerName} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {p.position && <PosBadge sport={sport} position={p.position} />}
                    <span className="text-sm text-brand-text truncate">{p.playerName}</span>
                    {p.injuryStatus && (
                      <span className="text-[10px] font-bold text-brand-danger">
                        {p.injuryStatus}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-brand-muted mt-0.5">
                    {p.team ?? 'FA'}
                    {p.rank != null ? ` · Rank ${p.rank}` : ''}
                    {p.adp != null ? ` · ADP ${p.adp.toFixed(1)}` : ''}
                  </div>
                </div>
                <span className="text-sm font-semibold text-brand-primaryText flex-shrink-0">
                  {p.projectedPoints.toFixed(1)}
                </span>
                <button
                  onClick={() => openComposer(p)}
                  className="btn-primary inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 flex-shrink-0"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Claim
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Claim composer modal */}
      {target && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setTarget(null)} />
          <div className="relative w-full max-w-md rounded-xl border border-brand-border bg-brand-surface shadow-2xl p-5">
            <div className="flex items-start gap-3 mb-4">
              <Headshot src={target.headshot} name={target.playerName} size={48} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {target.position && <PosBadge sport={sport} position={target.position} />}
                  <span className="font-semibold text-brand-text truncate">{target.playerName}</span>
                </div>
                <div className="text-xs text-brand-muted mt-0.5">
                  {target.team ?? 'Free Agent'} · {target.projectedPoints.toFixed(1)} proj pts
                </div>
              </div>
              <button
                onClick={() => setTarget(null)}
                className="text-brand-muted hover:text-brand-text"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <label className="block text-xs font-semibold text-brand-muted mb-1.5">
              Drop player (optional)
            </label>
            <select
              value={dropName}
              onChange={(e) => setDropName(e.target.value)}
              className="w-full bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text mb-4 focus:outline-none focus:border-brand-primary"
            >
              <option value="">— No drop —</option>
              {roster.map((r) => (
                <option key={r.playerName} value={r.playerName}>
                  {r.playerName} ({r.position}) · {r.slot}
                </option>
              ))}
            </select>

            <label className="block text-xs font-semibold text-brand-muted mb-1.5">
              FAAB bid (remaining ${remaining})
            </label>
            <div className="relative mb-4">
              <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
              <input
                type="number"
                min={0}
                max={remaining}
                value={bid}
                onChange={(e) => setBid(Math.max(0, Math.min(remaining, Number(e.target.value) || 0)))}
                className="w-full bg-brand-surface border border-brand-border rounded-lg pl-9 pr-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
              />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setTarget(null)} className="btn-ghost flex-1">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={busy === 'submit'}
                className="btn-primary flex-1 inline-flex items-center justify-center gap-2"
              >
                {busy === 'submit' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                Submit Claim
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
