'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save, Check, AlertCircle } from 'lucide-react';
import { getPositionColor } from '@/lib/dd/position-colors';
import { compareSlots } from '@/lib/dd/slot-order';

// ──────────────────────────────────────────────────────────────────────────────
// Shared lineup editor
//
// Used by both the Head-to-Head "Set Lineup" tab and the Fantasy Home page so a
// manager can switch/edit their starters from either surface. Keyed by slot
// INSTANCE (e.g. "RB#0", "RB#1") so each position can be set individually.
// ──────────────────────────────────────────────────────────────────────────────

export interface RosterSlotDef {
  slot: string;
  label: string;
  count: number;
  eligible: string[];
  isStarter: boolean;
}

export interface LineupRosterPlayer {
  playerName: string;
  playerId: string | null;
  team: string | null;
  position: string | null;
  sport: string | null;
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

function eligibleFor(def: RosterSlotDef, position: string | null): boolean {
  const pos = position ?? '';
  return def.eligible.includes('*') || def.eligible.includes(pos);
}

export default function LineupEditor({
  leagueId, sport, rosterConfig, roster, onSaved,
}: {
  leagueId: string;
  sport: string;
  rosterConfig: { slots: RosterSlotDef[] };
  roster: LineupRosterPlayer[];
  onSaved: () => void;
}) {
  // Starter slots in canonical ESPN order (QB, RB, RB, WR, WR, TE, FLEX,
  // FLEX+, D/ST, K) so the lineup editor reads the same as the matchup board.
  const starterSlots = [...(rosterConfig?.slots ?? [])]
    .filter((s) => s.isStarter && !s.eligible.includes('*'))
    .sort((a, b) => compareSlots(a.slot, b.slot, sport));

  // Expand slots by count so every slot INSTANCE (RB1, RB2, WR1..WR3, FLEX1, FLEX2…)
  // gets its own independently editable row.
  const slotOptions: RosterSlotDef[] = [];
  for (const s of starterSlots) {
    for (let i = 0; i < (s.count ?? 0); i++) slotOptions.push(s);
  }
  const slotKeys = slotOptions.map((s, i) => `${s.slot}#${i}`);

  // assignments: slotInstanceKey ("RB#0") → playerName. Keying by slot instance
  // (not by player) is what lets each position be set individually.
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const init: Record<string, string> = {};
    const used = new Set<string>();
    // First pass: honour the saved slot for each player, filling instances in order.
    for (const p of roster) {
      if (!p.slot || p.slot === 'BN') continue;
      const idx = slotKeys.findIndex((k) => k.startsWith(`${p.slot}#`) && !init[k]);
      if (idx >= 0) {
        init[slotKeys[idx]] = p.playerName;
        used.add(p.playerName);
      }
    }
    // Second pass: any remaining starter instance gets the best available eligible player.
    for (const key of slotKeys) {
      if (init[key]) continue;
      const def = slotOptions[slotKeys.indexOf(key)];
      const candidate = roster
        .filter((p) => !used.has(p.playerName) && eligibleFor(def, p.position))
        .sort((a, b) => b.projectedPoints - a.projectedPoints)[0];
      if (candidate) {
        init[key] = candidate.playerName;
        used.add(candidate.playerName);
      }
    }
    setAssignments(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster]);

  const assignedNames = new Set(Object.values(assignments));
  const bench = roster.filter((p) => !assignedNames.has(p.playerName));

  // Assign a player to a specific slot instance. If that player was already in
  // another instance, that instance is emptied (not the whole position).
  const setSlot = (slotKey: string, playerName: string) => {
    setAssignments((prev) => {
      const next = { ...prev };
      for (const [k, name] of Object.entries(next)) {
        if (name === playerName && k !== slotKey) delete next[k];
      }
      if (playerName) next[slotKey] = playerName;
      else delete next[slotKey];
      return next;
    });
    setSaved(false);
  };

  // Move a player to the bench (clears whichever instance holds them).
  const benchPlayer = (playerName: string) => {
    setAssignments((prev) => {
      const next = { ...prev };
      for (const [k, name] of Object.entries(next)) {
        if (name === playerName) delete next[k];
      }
      return next;
    });
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      // Convert slot-instance map → playerName → slot map for the API.
      const payload: Record<string, string> = {};
      for (const [key, name] of Object.entries(assignments)) {
        if (name) payload[name] = key.split('#')[0];
      }
      const res = await fetch(`/api/dd/leagues/${leagueId}/lineup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save lineup');
      setSaved(true);
      onSaved();
    } catch (e: any) {
      setError(e.message || 'Failed to save lineup');
    } finally {
      setSaving(false);
    }
  };

  const filledCount = Object.values(assignments).filter(Boolean).length;
  const totalStarters = slotOptions.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-brand-muted">
          Starters set: <strong className="text-brand-text">{filledCount}</strong> / {totalStarters}
        </div>
        <button onClick={save} disabled={saving} className="btn-primary inline-flex items-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? 'Saved' : 'Save Lineup'}
        </button>
      </div>

      {error && (
        <div className="text-sm text-brand-danger bg-brand-danger/10 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* Starting slots — one row per slot instance */}
      <div className="space-y-2">
        {slotOptions.map((s, i) => {
          const key = slotKeys[i];
          const playerName = assignments[key];
          const player = playerName ? roster.find((p) => p.playerName === playerName) : null;
          const eligibleBench = bench.filter((p) => eligibleFor(s, p.position));
          return (
            <div key={key} className="flex items-center gap-2 rounded-lg bg-brand-elevated/50 border border-brand-border px-3 py-2">
              <span className="w-14 text-[10px] font-bold uppercase tracking-wide text-brand-muted flex-shrink-0">
                {s.slot}
              </span>
              {player ? (
                <>
                  <PosBadge sport={sport} position={player.position ?? ''} />
                  <span className="flex-1 text-sm text-brand-text truncate">{player.playerName}</span>
                  <span className="text-xs font-semibold text-brand-primaryText">{player.projectedPoints}</span>
                  <button
                    onClick={() => benchPlayer(player.playerName)}
                    className="text-xs text-brand-muted hover:text-brand-danger transition-colors"
                  >
                    Remove
                  </button>
                </>
              ) : (
                <select
                  value=""
                  onChange={(e) => setSlot(key, e.target.value)}
                  className="flex-1 bg-brand-surface border border-brand-border rounded px-2 py-1 text-sm text-brand-text"
                >
                  <option value="">— Empty —</option>
                  {eligibleBench.map((p) => (
                    <option key={p.playerName} value={p.playerName}>
                      {p.playerName} ({p.position}) — {p.projectedPoints}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>

      {/* Bench */}
      {bench.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-brand-muted mb-2">
            Bench ({bench.length}) — click a player to slot them in
          </div>
          <div className="flex flex-wrap gap-1.5">
            {bench.map((p) => {
              const openKey = slotKeys.find((k) => !assignments[k] && eligibleFor(slotOptions[slotKeys.indexOf(k)], p.position));
              return (
                <button
                  key={p.playerName}
                  type="button"
                  disabled={!openKey}
                  onClick={() => openKey && setSlot(openKey, p.playerName)}
                  className={`inline-flex items-center gap-1.5 rounded-lg bg-brand-elevated/50 border border-brand-border px-2 py-1 text-xs text-brand-muted transition-colors ${
                    openKey ? 'hover:border-brand-primary hover:text-brand-text cursor-pointer' : 'opacity-60 cursor-not-allowed'
                  }`}
                >
                  <PosBadge sport={sport} position={p.position ?? ''} />
                  {p.playerName}
                  <span className="text-brand-primaryText font-semibold">{p.projectedPoints}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
