'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, ArrowLeftRight, AlertCircle, Check, X, Send, Sparkles,
  ThumbsUp, ThumbsDown, Ban, Play, DollarSign, Ticket, Users,
} from 'lucide-react';
import { getPositionColor } from '@/lib/dd/position-colors';
import { useToast } from './ToastProvider';

// ────────────────────────────────────────────────────────────────────────────
// Trade Center — propose trades, accept/reject, veto voting, execute, analysis.
// ────────────────────────────────────────────────────────────────────────────

interface TradeAsset {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  assetType: 'player' | 'faab' | 'draft_pick';
  assetRef: string;
}
interface TradeVote {
  memberId: string;
  teamName: string;
  vote: 'approve' | 'veto';
  votedAt: string;
}
interface AnalysisSide {
  memberId: string;
  teamName: string;
  gives: { type: string; ref: string; value: number }[];
  receives: { type: string; ref: string; value: number }[];
  netValue: number;
}
interface TradeAnalysis {
  verdict: 'fair' | 'lopsided';
  favoredMemberId: string | null;
  summary: string;
  sides: AnalysisSide[];
  source: 'ai' | 'model';
}
interface Trade {
  id: string;
  status: string;
  proposedBy: string;
  proposerTeamName: string;
  createdAt: string;
  assets: TradeAsset[];
  votes: TradeVote[];
  analysis: TradeAnalysis | null;
  myRole: 'proposer' | 'counterparty' | 'observer';
  canRespond: boolean;
  canExecute: boolean;
  canCancel: boolean;
}

interface RosterPlayer {
  playerName: string;
  position: string | null;
  team: string | null;
  slot: string;
  projectedPoints: number;
  headshot: string | null;
}
interface MemberLite {
  id: string;
  teamName: string;
  isBot: boolean;
  isCommissioner: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  proposed: 'bg-brand-accent/15 text-brand-accent border-brand-accent/40',
  accepted: 'bg-brand-primary/15 text-brand-primaryText border-brand-primary/40',
  voting: 'bg-brand-primary/15 text-brand-primaryText border-brand-primary/40',
  approved: 'bg-brand-primary/15 text-brand-primaryText border-brand-primary/40',
  executed: 'bg-brand-success/15 text-brand-success border-brand-success/40',
  rejected: 'bg-brand-danger/15 text-brand-danger border-brand-danger/40',
  vetoed: 'bg-brand-danger/15 text-brand-danger border-brand-danger/40',
  cancelled: 'bg-brand-elevated text-brand-muted border-brand-border',
};

function PosBadge({ sport, position }: { sport: string; position: string | null }) {
  if (!position) return null;
  const c = getPositionColor(sport, position);
  return (
    <span
      className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
      style={{ color: c.fg, background: c.bg, border: `1px solid ${c.border}` }}
    >
      {position}
    </span>
  );
}

export default function TradeCenter({
  leagueId,
  sport,
  members,
  rosters,
  currentMemberId,
  onChanged,
}: {
  leagueId: string;
  sport: string;
  members: MemberLite[];
  rosters: Record<string, RosterPlayer[]>;
  currentMemberId: string | null;
  onChanged?: () => void;
}) {
  const { push } = useToast();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Builder state
  const [partnerId, setPartnerId] = useState<string>('');
  const [give, setGive] = useState<Set<string>>(new Set());
  const [get, setGet] = useState<Set<string>>(new Set());
  const [faabGive, setFaabGive] = useState('');
  const [faabGet, setFaabGet] = useState('');
  const [pickGive, setPickGive] = useState('');
  const [pickGet, setPickGet] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const others = useMemo(
    () => members.filter((m) => m.id !== currentMemberId),
    [members, currentMemberId]
  );
  const myRoster = currentMemberId ? rosters[currentMemberId] ?? [] : [];
  const partnerRoster = partnerId ? rosters[partnerId] ?? [] : [];

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/dd/leagues/${leagueId}/trades`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load trades');
      setTrades(json.trades ?? []);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load trades');
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  useEffect(() => {
    load();
  }, [load]);

  const resetBuilder = () => {
    setGive(new Set());
    setGet(new Set());
    setFaabGive('');
    setFaabGet('');
    setPickGive('');
    setPickGet('');
  };

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, name: string) => {
    const next = new Set(set);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setter(next);
  };

  const propose = async () => {
    if (!currentMemberId || !partnerId) {
      push({ kind: 'trade', title: 'Pick a trade partner first' });
      return;
    }
    const assets: any[] = [];
    for (const name of give) {
      assets.push({ fromMemberId: currentMemberId, toMemberId: partnerId, assetType: 'player', assetRef: name });
    }
    for (const name of get) {
      assets.push({ fromMemberId: partnerId, toMemberId: currentMemberId, assetType: 'player', assetRef: name });
    }
    if (Number(faabGive) > 0) {
      assets.push({ fromMemberId: currentMemberId, toMemberId: partnerId, assetType: 'faab', assetRef: String(Number(faabGive)) });
    }
    if (Number(faabGet) > 0) {
      assets.push({ fromMemberId: partnerId, toMemberId: currentMemberId, assetType: 'faab', assetRef: String(Number(faabGet)) });
    }
    if (pickGive.trim()) {
      assets.push({ fromMemberId: currentMemberId, toMemberId: partnerId, assetType: 'draft_pick', assetRef: pickGive.trim() });
    }
    if (pickGet.trim()) {
      assets.push({ fromMemberId: partnerId, toMemberId: currentMemberId, assetType: 'draft_pick', assetRef: pickGet.trim() });
    }
    if (!assets.length) {
      push({ kind: 'trade', title: 'Add at least one player, FAAB, or pick' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/dd/leagues/${leagueId}/trades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assets }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to propose trade');
      push({ kind: 'trade', title: 'Trade proposed' });
      resetBuilder();
      await load();
      onChanged?.();
    } catch (e: any) {
      push({ kind: 'trade', title: e.message || 'Failed to propose trade' });
    } finally {
      setSubmitting(false);
    }
  };

  const act = async (tradeId: string, action: string, vote?: 'approve' | 'veto') => {
    setBusyId(tradeId);
    try {
      const res = await fetch(`/api/dd/leagues/${leagueId}/trades/${tradeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, vote }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Action failed');
      const labels: Record<string, string> = {
        accept: 'Trade accepted',
        reject: 'Trade rejected',
        cancel: 'Trade cancelled',
        execute: 'Trade executed',
        vote: 'Vote recorded',
      };
      push({ kind: 'trade', title: labels[action] ?? 'Done' });
      await load();
      onChanged?.();
    } catch (e: any) {
      push({ kind: 'trade', title: e.message || 'Action failed' });
    } finally {
      setBusyId(null);
    }
  };

  const nameOf = useMemo(() => new Map(members.map((m) => [m.id, m.teamName])), [members]);

  const renderAsset = (a: TradeAsset) => {
    if (a.assetType === 'player') {
      const p = (rosters[a.fromMemberId] ?? []).find((r) => r.playerName === a.assetRef);
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-brand-text">
          <PosBadge sport={sport} position={p?.position ?? null} />
          {a.assetRef}
        </span>
      );
    }
    if (a.assetType === 'faab') {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-brand-accent">
          <DollarSign className="w-3 h-3" /> ${a.assetRef} FAAB
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs text-brand-primaryText">
        <Ticket className="w-3 h-3" /> {a.assetRef}
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* ── Builder ── */}
      <div className="card">
        <h3 className="font-semibold text-brand-text mb-4 flex items-center gap-2">
          <ArrowLeftRight className="w-5 h-5 text-brand-primaryText" /> Propose a Trade
        </h3>

        <div className="mb-4">
          <label className="block text-xs font-medium text-brand-muted mb-1.5">Trade with</label>
          <select
            className="input w-full sm:w-72"
            value={partnerId}
            onChange={(e) => {
              setPartnerId(e.target.value);
              setGive(new Set());
              setGet(new Set());
            }}
          >
            <option value="">Select a team…</option>
            {others.map((m) => (
              <option key={m.id} value={m.id}>
                {m.teamName}
                {m.isBot ? ' (AI)' : ''}
              </option>
            ))}
          </select>
        </div>

        {partnerId && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* You send */}
              <div className="rounded-lg border border-brand-border bg-brand-elevated/30 p-3">
                <p className="text-xs font-semibold text-brand-muted uppercase tracking-wide mb-2">
                  You send ({give.size})
                </p>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {myRoster.length ? (
                    myRoster.map((p) => (
                      <button
                        key={p.playerName}
                        onClick={() => toggle(give, setGive, p.playerName)}
                        className={`w-full flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors ${
                          give.has(p.playerName)
                            ? 'bg-brand-primary/20 border border-brand-primary/50'
                            : 'hover:bg-brand-elevated/60 border border-transparent'
                        }`}
                      >
                        <PosBadge sport={sport} position={p.position} />
                        <span className="flex-1 truncate text-brand-text">{p.playerName}</span>
                        <span className="text-[10px] text-brand-muted">{p.slot}</span>
                        <span className="text-xs text-brand-muted">{p.projectedPoints.toFixed(1)}</span>
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-brand-muted">No roster yet.</p>
                  )}
                </div>
              </div>

              {/* You receive */}
              <div className="rounded-lg border border-brand-border bg-brand-elevated/30 p-3">
                <p className="text-xs font-semibold text-brand-muted uppercase tracking-wide mb-2">
                  You receive ({get.size})
                </p>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {partnerRoster.length ? (
                    partnerRoster.map((p) => (
                      <button
                        key={p.playerName}
                        onClick={() => toggle(get, setGet, p.playerName)}
                        className={`w-full flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors ${
                          get.has(p.playerName)
                            ? 'bg-brand-success/20 border border-brand-success/50'
                            : 'hover:bg-brand-elevated/60 border border-transparent'
                        }`}
                      >
                        <PosBadge sport={sport} position={p.position} />
                        <span className="flex-1 truncate text-brand-text">{p.playerName}</span>
                        <span className="text-[10px] text-brand-muted">{p.slot}</span>
                        <span className="text-xs text-brand-muted">{p.projectedPoints.toFixed(1)}</span>
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-brand-muted">No roster yet.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Extras */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              <div>
                <label className="block text-[10px] font-medium text-brand-muted mb-1">FAAB you send</label>
                <input
                  type="number"
                  min={0}
                  className="input w-full"
                  placeholder="0"
                  value={faabGive}
                  onChange={(e) => setFaabGive(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-brand-muted mb-1">FAAB you get</label>
                <input
                  type="number"
                  min={0}
                  className="input w-full"
                  placeholder="0"
                  value={faabGet}
                  onChange={(e) => setFaabGet(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-brand-muted mb-1">Pick you send</label>
                <input
                  className="input w-full"
                  placeholder="e.g. 2027 R1"
                  value={pickGive}
                  onChange={(e) => setPickGive(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-brand-muted mb-1">Pick you get</label>
                <input
                  className="input w-full"
                  placeholder="e.g. 2027 R2"
                  value={pickGet}
                  onChange={(e) => setPickGet(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between mt-4">
              <button onClick={resetBuilder} className="btn-ghost text-sm">
                Clear
              </button>
              <button onClick={propose} disabled={submitting} className="btn-primary flex items-center gap-2">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Propose Trade
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Trades list ── */}
      <div className="card">
        <h3 className="font-semibold text-brand-text mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-brand-accent" /> League Trades
        </h3>

        {loading ? (
          <div className="flex items-center gap-2 text-brand-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading trades…
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-brand-danger text-sm">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        ) : trades.length === 0 ? (
          <p className="text-sm text-brand-muted">
            No trades yet. Propose one above to get started.
          </p>
        ) : (
          <div className="space-y-3">
            {trades.map((t) => {
              const byFrom = new Map<string, TradeAsset[]>();
              for (const a of t.assets) {
                const list = byFrom.get(a.fromMemberId) ?? [];
                list.push(a);
                byFrom.set(a.fromMemberId, list);
              }
              const busy = busyId === t.id;
              return (
                <div key={t.id} className="rounded-lg border border-brand-border bg-brand-elevated/30 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${
                          STATUS_STYLES[t.status] ?? STATUS_STYLES.cancelled
                        }`}
                      >
                        {t.status}
                      </span>
                      <span className="text-xs text-brand-muted">
                        Proposed by {t.proposerTeamName}
                        {t.myRole === 'proposer' ? ' (you)' : ''}
                      </span>
                    </div>
                    {t.analysis && (
                      <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-brand-muted">
                        <Sparkles className="w-3 h-3 text-brand-primaryText" />
                        {t.analysis.source === 'ai' ? 'AI analysis' : 'Value analysis'}
                      </span>
                    )}
                  </div>

                  {/* Assets */}
                  <div className="space-y-1.5 mb-2">
                    {[...byFrom.entries()].map(([fromId, list]) => (
                      <div key={fromId} className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="font-medium text-brand-text">{nameOf.get(fromId) ?? 'Team'}</span>
                        <span className="text-brand-muted">sends</span>
                        {list.map((a) => (
                          <span key={a.id} className="inline-flex items-center gap-1">
                            {renderAsset(a)}
                            <span className="text-brand-muted">→ {nameOf.get(a.toMemberId) ?? 'Team'}</span>
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>

                  {/* Analysis */}
                  {t.analysis && (
                    <div className="rounded bg-brand-primary/10 border border-brand-primary/25 px-2.5 py-1.5 mb-2">
                      <p className="text-xs text-brand-primaryText flex items-start gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        {t.analysis.summary}
                      </p>
                    </div>
                  )}

                  {/* Votes */}
                  {t.status === 'voting' && (
                    <div className="flex flex-wrap items-center gap-2 mb-2 text-[11px]">
                      <span className="text-brand-muted">Votes:</span>
                      {t.votes.length ? (
                        t.votes.map((v) => (
                          <span
                            key={v.memberId}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${
                              v.vote === 'veto'
                                ? 'bg-brand-danger/15 text-brand-danger'
                                : 'bg-brand-success/15 text-brand-success'
                            }`}
                          >
                            {v.vote === 'veto' ? <ThumbsDown className="w-3 h-3" /> : <ThumbsUp className="w-3 h-3" />}
                            {v.teamName}
                          </span>
                        ))
                      ) : (
                        <span className="text-brand-muted">none yet</span>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    {t.canRespond && (
                      <>
                        <button
                          onClick={() => act(t.id, 'accept')}
                          disabled={busy}
                          className="btn-primary text-xs flex items-center gap-1.5 py-1.5"
                        >
                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          Accept
                        </button>
                        <button
                          onClick={() => act(t.id, 'reject')}
                          disabled={busy}
                          className="btn-secondary text-xs flex items-center gap-1.5 py-1.5"
                        >
                          <X className="w-3.5 h-3.5" /> Reject
                        </button>
                      </>
                    )}
                    {t.status === 'voting' && t.myRole !== 'proposer' && (
                      <>
                        <button
                          onClick={() => act(t.id, 'vote', 'approve')}
                          disabled={busy}
                          className="btn-secondary text-xs flex items-center gap-1.5 py-1.5"
                        >
                          <ThumbsUp className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button
                          onClick={() => act(t.id, 'vote', 'veto')}
                          disabled={busy}
                          className="btn-secondary text-xs flex items-center gap-1.5 py-1.5"
                        >
                          <ThumbsDown className="w-3.5 h-3.5" /> Veto
                        </button>
                      </>
                    )}
                    {t.canExecute && (
                      <button
                        onClick={() => act(t.id, 'execute')}
                        disabled={busy}
                        className="btn-primary text-xs flex items-center gap-1.5 py-1.5"
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                        Execute
                      </button>
                    )}
                    {t.canCancel && (
                      <button
                        onClick={() => act(t.id, 'cancel')}
                        disabled={busy}
                        className="btn-ghost text-xs flex items-center gap-1.5 py-1.5"
                      >
                        <Ban className="w-3.5 h-3.5" /> Cancel
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
