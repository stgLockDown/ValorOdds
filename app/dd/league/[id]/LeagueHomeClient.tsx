'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Trophy, Crown, Users, Copy, Check, Play, Pause, Loader2,
  Target, Shield, Settings, ArrowLeft, Plus, Clock, UserPlus,
} from 'lucide-react';

interface League {
  id: string; name: string; sport: string; commissioner_id: string;
  format: string; scoring_preset: string; roster_preset: string;
  num_teams: number; status: string; season_year: number;
  is_public: boolean; invite_code: string; settings: any;
  keeper_type: string; draft_type: string;
}

interface Member {
  id: string; userId: string; teamName: string; isCommissioner: boolean;
  draftPosition: number | null; displayName: string;
}

interface Draft {
  id: string; status: string; draftType: string;
  currentRound: number; currentPick: number; roundCount: number;
  picksMade: number;
}

export default function LeagueHomeClient({
  league,
  members,
  membership,
  draft,
  currentUserId,
  isCommissioner,
}: {
  league: League;
  members: Member[];
  membership: { id: string; isCommissioner: boolean; teamName: string; draftPosition: number | null; isCommissionerByLeague: boolean } | null;
  draft: Draft | null;
  currentUserId: string;
  isCommissioner: boolean;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [startingDraft, setStartingDraft] = useState(false);
  const [error, setError] = useState('');
  const [leaving, setLeaving] = useState(false);

  const totalPicks = draft ? league.num_teams * draft.roundCount : 0;
  const memberCount = members.length;
  const isFull = memberCount >= league.num_teams;
  const canStartDraft = isCommissioner && (league.status === 'recruiting' || league.status === 'pre_draft' || league.status === 'setup' || league.status === 'predraft') && memberCount >= 2;

  const sportIcon = league.sport === 'NFL'
    ? <Shield className="w-6 h-6" />
    : <Target className="w-6 h-6" />;

  const statusBadge = () => {
    const map: Record<string, { label: string; cls: string }> = {
      recruiting: { label: 'Recruiting', cls: 'text-brand-accent bg-brand-accent/10' },
      pre_draft: { label: 'Pre-Draft', cls: 'text-brand-accent bg-brand-accent/10' },
      predraft: { label: 'Pre-Draft', cls: 'text-brand-accent bg-brand-accent/10' },
      setup: { label: 'Setup', cls: 'text-brand-accent bg-brand-accent/10' },
      drafting: { label: 'Drafting', cls: 'text-brand-primary bg-brand-primary/10 animate-pulse' },
      in_season: { label: 'In Season', cls: 'text-brand-success bg-brand-success/10' },
      playoffs: { label: 'Playoffs', cls: 'text-brand-success bg-brand-success/10' },
      completed: { label: 'Completed', cls: 'text-brand-muted bg-brand-muted/10' },
    };
    const s = map[league.status] ?? map.setup;
    return <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${s.cls}`}>{s.label}</span>;
  };

  const copyInvite = () => {
    navigator.clipboard.writeText(league.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startDraft = async () => {
    setStartingDraft(true);
    setError('');
    try {
      const res = await fetch('/api/dd/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leagueId: league.id, pickTimerSeconds: 90 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to start draft');
        setStartingDraft(false);
        return;
      }
      router.push(`/dd/league/${league.id}/draft`);
    } catch {
      setError('Network error');
      setStartingDraft(false);
    }
  };

  const leaveLeague = async () => {
    setLeaving(true);
    try {
      const res = await fetch(`/api/dd/leagues/${league.id}/leave`, { method: 'POST' });
      if (res.ok) {
        router.push('/dd');
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to leave league');
        setLeaving(false);
      }
    } catch {
      setError('Network error');
      setLeaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      {/* Back link */}
      <Link href="/dd" className="inline-flex items-center gap-1 text-sm text-brand-muted hover:text-brand-text mb-4">
        <ArrowLeft className="w-4 h-4" /> All Leagues
      </Link>

      {/* League Header */}
      <div className="card mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-brand-elevated flex items-center justify-center flex-shrink-0">
              {sportIcon}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-brand-text">{league.name}</h1>
                {statusBadge()}
              </div>
              <p className="text-sm text-brand-muted mt-0.5">
                {league.sport} {league.season_year} · {league.format.replace(/_/g, ' ')} · {league.keeper_type}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Draft button */}
            {draft && draft.status !== 'completed' && (
              <Link
                href={`/dd/league/${league.id}/draft`}
                className="btn-primary"
              >
                {draft.status === 'in_progress' ? (
                  <><Play className="w-4 h-4" /> Resume Draft</>
                ) : draft.status === 'paused' ? (
                  <><Play className="w-4 h-4" /> Resume Draft</>
                ) : (
                  <><Play className="w-4 h-4" /> Enter Draft</>
                )}
              </Link>
            )}
            {canStartDraft && (
              <button onClick={startDraft} disabled={startingDraft} className="btn-primary">
                {startingDraft ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Starting...</>
                ) : (
                  <><Play className="w-4 h-4" /> Start Draft</>
                )}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-3 text-sm text-brand-danger bg-brand-danger/10 rounded-lg p-3">
            {error}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Members List (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-brand-text flex items-center gap-2">
                <Users className="w-5 h-5 text-brand-primaryText" />
                Teams
                <span className="text-sm text-brand-muted font-normal">
                  ({memberCount}/{league.num_teams})
                </span>
              </h2>
            </div>

            {members.length === 0 ? (
              <p className="text-brand-muted text-center py-8">No members yet.</p>
            ) : (
              <div className="space-y-2">
                {members.map((m, i) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-brand-elevated/50"
                  >
                    <div className="w-8 h-8 rounded-full bg-brand-primary/20 flex items-center justify-center text-sm font-semibold text-brand-primaryText flex-shrink-0">
                      {m.draftPosition ?? i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-brand-text truncate">{m.teamName}</span>
                        {m.isCommissioner && (
                          <Crown className="w-4 h-4 text-brand-accent flex-shrink-0" />
                        )}
                      </div>
                      <div className="text-xs text-brand-muted">{m.displayName}</div>
                    </div>
                    {m.userId === currentUserId && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-brand-primary/20 text-brand-primaryText font-medium">
                        You
                      </span>
                    )}
                  </div>
                ))}

                {/* Empty slots */}
                {Array.from({ length: league.num_teams - memberCount }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="flex items-center gap-3 py-2.5 px-3 rounded-lg border border-dashed border-brand-border"
                  >
                    <div className="w-8 h-8 rounded-full bg-brand-elevated flex items-center justify-center text-sm text-brand-muted flex-shrink-0">
                      {memberCount + i + 1}
                    </div>
                    <div className="flex-1">
                      <span className="text-sm text-brand-muted">Waiting for player...</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Draft progress (if drafting) */}
          {draft && (
            <div className="card">
              <h3 className="font-semibold text-brand-text mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-brand-primaryText" />
                Draft Progress
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-brand-muted">Picks made</span>
                  <span className="font-medium text-brand-text">{draft.picksMade} / {totalPicks}</span>
                </div>
                <div className="h-2.5 bg-brand-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-primary rounded-full transition-all"
                    style={{ width: `${totalPicks > 0 ? (draft.picksMade / totalPicks) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-brand-muted">Current round</span>
                  <span className="font-medium text-brand-text">
                    {draft.currentRound} of {draft.roundCount}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-brand-muted">Draft type</span>
                  <span className="font-medium text-brand-text capitalize">{draft.draftType.replace(/_/g, ' ')}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: Invite + Settings */}
        <div className="space-y-4">
          {/* Invite Code */}
          {!league.is_public && (
            <div className="card">
              <h3 className="font-semibold text-brand-text mb-3">Invite Code</h3>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-center text-2xl font-bold text-brand-accent tracking-widest bg-brand-elevated rounded-lg py-2">
                  {league.invite_code}
                </code>
                <button onClick={copyInvite} className="btn-ghost p-2.5">
                  {copied ? <Check className="w-4 h-4 text-brand-success" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-brand-muted mt-2">
                Share this code with friends so they can join.
              </p>
            </div>
          )}

          {/* League Settings Summary */}
          <div className="card">
            <h3 className="font-semibold text-brand-text mb-3 flex items-center gap-2">
              <Settings className="w-5 h-5 text-brand-primaryText" />
              League Settings
            </h3>
            <div className="space-y-2 text-sm">
              <SettingRow label="Sport" value={league.sport} />
              <SettingRow label="Format" value={league.format.replace(/_/g, ' ')} />
              <SettingRow label="Scoring" value={league.scoring_preset.replace(/_/g, ' ')} />
              <SettingRow label="Roster" value={league.roster_preset} />
              <SettingRow label="Draft" value={league.draft_type.replace(/_/g, ' ')} />
              <SettingRow label="Keeper" value={league.keeper_type} />
              <SettingRow label="Teams" value={String(league.num_teams)} />
              <SettingRow label="Season" value={String(league.season_year)} />
            </div>
          </div>

          {/* Actions */}
          <div className="card space-y-3">
            {membership && !membership.isCommissioner && league.status !== 'drafting' && league.status !== 'in_season' && (
              <button
                onClick={leaveLeague}
                disabled={leaving}
                className="btn-secondary w-full text-brand-danger hover:bg-brand-danger/10"
              >
                {leaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Leave League'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-brand-muted capitalize">{label}</span>
      <span className="font-medium text-brand-text capitalize">{value}</span>
    </div>
  );
}
