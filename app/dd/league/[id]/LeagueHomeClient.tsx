'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Trophy, Crown, Users, Copy, Check, Play, Pause, Loader2,
  Target, Shield, Settings, ArrowLeft, Plus, Clock, UserPlus,
  X, DollarSign, Timer, Save,
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
  membership: { id: string; isCommissioner: boolean; teamName: string; draftPosition: number | null; isCommissionerByLeague: boolean; faabBudget?: number } | null;
  draft: Draft | null;
  currentUserId: string;
  isCommissioner: boolean;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [startingDraft, setStartingDraft] = useState(false);
  const [error, setError] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Extract settings from league.settings JSONB
  const settings = league.settings ?? {};
  const faabBudget = settings.faabBudget ?? membership?.faabBudget ?? 100;
  const pickTimerSeconds = settings.pickTimerSeconds ?? 90;
  const playoffWeeks = settings.playoffWeeks ?? 3;
  const enforcePositionLimits = settings.enforcePositionLimits ?? true;

  const isSettingsLocked = league.status !== 'recruiting' && league.status !== 'pre_draft' && league.status !== 'setup' && league.status !== 'predraft';

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
          <div className="card">
            <h3 className="font-semibold text-brand-text mb-3">
              {league.is_public ? 'League Code' : 'Invite Code'}
            </h3>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-center text-2xl font-bold text-brand-accent tracking-widest bg-brand-elevated rounded-lg py-2">
                {league.invite_code}
              </code>
              <button onClick={copyInvite} className="btn-ghost p-2.5">
                {copied ? <Check className="w-4 h-4 text-brand-success" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-brand-muted mt-2">
              {league.is_public
                ? 'Share this code so friends can join directly, or they can find this league in the public list.'
                : 'Share this code with friends so they can join your private league.'}
            </p>
          </div>

          {/* League Settings Summary */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-brand-text flex items-center gap-2">
                <Settings className="w-5 h-5 text-brand-primaryText" />
                League Settings
              </h3>
              {isCommissioner && !isSettingsLocked && (
                <button
                  onClick={() => setShowSettingsModal(true)}
                  className="text-xs font-medium text-brand-primary hover:text-brand-primaryText flex items-center gap-1 transition-colors"
                >
                  <Settings className="w-3.5 h-3.5" /> Edit
                </button>
              )}
            </div>
            <div className="space-y-2 text-sm">
              <SettingRow label="Sport" value={league.sport} />
              <SettingRow label="Format" value={league.format.replace(/_/g, ' ')} />
              <SettingRow label="Scoring" value={league.scoring_preset.replace(/_/g, ' ')} />
              <SettingRow label="Roster" value={league.roster_preset} />
              <SettingRow label="Draft" value={league.draft_type.replace(/_/g, ' ')} />
              <SettingRow label="Keeper" value={league.keeper_type} />
              <SettingRow label="Teams" value={String(league.num_teams)} />
              <SettingRow label="Season" value={String(league.season_year)} />
              <div className="border-t border-brand-border my-2" />
              <SettingRow label="FAAB Budget" value={`$${faabBudget}`} />
              <SettingRow label="Pick Timer" value={`${pickTimerSeconds}s`} />
              <SettingRow label="Playoff Teams" value={String(playoffWeeks)} />
              <SettingRow label="Pos Enforcement" value={enforcePositionLimits ? 'On' : 'Off'} />
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

      {/* Settings Editor Modal */}
      {showSettingsModal && (
        <SettingsEditorModal
          league={league}
          currentFaab={faabBudget}
          currentPickTimer={pickTimerSeconds}
          currentPlayoffWeeks={playoffWeeks}
          currentEnforcePos={enforcePositionLimits}
          memberCount={members.length}
          onClose={() => setShowSettingsModal(false)}
          onSaved={() => {
            setShowSettingsModal(false);
            router.refresh();
          }}
        />
      )}
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

// ─────────────────────────────────────────────────────────────────────────────
// SettingsEditorModal — Commissioner edits league settings (FAAB, timer, etc.)
// ─────────────────────────────────────────────────────────────────────────────
function SettingsEditorModal({
  league,
  currentFaab,
  currentPickTimer,
  currentPlayoffWeeks,
  currentEnforcePos,
  memberCount,
  onClose,
  onSaved,
}: {
  league: League;
  currentFaab: number;
  currentPickTimer: number;
  currentPlayoffWeeks: number;
  currentEnforcePos: boolean;
  memberCount: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [leagueName, setLeagueName] = useState(league.name);
  const [numTeams, setNumTeams] = useState(league.num_teams);
  const [isPublic, setIsPublic] = useState(league.is_public);
  const [faab, setFaab] = useState(currentFaab);
  const [pickTimer, setPickTimer] = useState(currentPickTimer);
  const [playoffTeams, setPlayoffTeams] = useState(currentPlayoffWeeks);
  const [enforcePos, setEnforcePos] = useState(currentEnforcePos);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);
    try {
      // Build the updated settings object — merge with existing settings
      const existingSettings = league.settings ?? {};
      const updatedSettings = {
        ...existingSettings,
        faabBudget: faab,
        pickTimerSeconds: pickTimer,
        playoffWeeks: playoffTeams,
        enforcePositionLimits: enforcePos,
      };

      const res = await fetch(`/api/dd/leagues/${league.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: leagueName,
          num_teams: numTeams,
          is_public: isPublic,
          settings: updatedSettings,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || 'Failed to save settings');
        setSaving(false);
        return;
      }

      setSaveSuccess(true);
      setTimeout(() => {
        onSaved();
      }, 800);
    } catch {
      setSaveError('Network error');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-brand-surface border border-brand-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-brand-border sticky top-0 bg-brand-surface z-10">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-brand-primaryText" />
            <h2 className="text-lg font-bold text-brand-text">League Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="text-brand-muted hover:text-brand-text transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* League Name */}
          <div>
            <label className="block text-sm font-medium text-brand-text mb-1.5">
              League Name
            </label>
            <input
              type="text"
              value={leagueName}
              onChange={(e) => setLeagueName(e.target.value)}
              maxLength={50}
              className="w-full bg-brand-elevated border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text focus:border-brand-primary focus:outline-none"
            />
          </div>

          {/* Number of Teams */}
          <div>
            <label className="block text-sm font-medium text-brand-text mb-1.5">
              Number of Teams: <span className="text-brand-primaryText">{numTeams}</span>
            </label>
            <div className="grid grid-cols-5 gap-2">
              {[4, 6, 8, 10, 12, 14, 16, 18, 20].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNumTeams(n)}
                  disabled={n < memberCount}
                  className={`p-2 rounded-lg border text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                    numTeams === n
                      ? 'border-brand-primary bg-brand-primary/10 text-brand-primaryText'
                      : 'border-brand-border bg-brand-elevated text-brand-muted hover:border-brand-primary/50'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-brand-muted mt-1">
              {memberCount} team{memberCount !== 1 ? 's' : ''} currently joined. Cannot go below current count.
            </p>
          </div>

          {/* Visibility */}
          <div>
            <label className="block text-sm font-medium text-brand-text mb-1.5">
              League Visibility
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsPublic(true)}
                className={`flex-1 p-2.5 rounded-lg border text-sm font-medium transition-all ${
                  isPublic
                    ? 'border-brand-primary bg-brand-primary/10 text-brand-primaryText'
                    : 'border-brand-border bg-brand-elevated text-brand-muted hover:border-brand-primary/50'
                }`}
              >
                Public
              </button>
              <button
                type="button"
                onClick={() => setIsPublic(false)}
                className={`flex-1 p-2.5 rounded-lg border text-sm font-medium transition-all ${
                  !isPublic
                    ? 'border-brand-primary bg-brand-primary/10 text-brand-primaryText'
                    : 'border-brand-border bg-brand-elevated text-brand-muted hover:border-brand-primary/50'
                }`}
              >
                Private
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-brand-border" />

          {/* FAAB Budget */}
          <div>
            <label className="block text-sm font-medium text-brand-text mb-1.5 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-brand-accent" />
              FAAB Budget: <span className="text-brand-primaryText">${faab}</span>
            </label>
            <input
              type="range"
              min={0}
              max={500}
              step={25}
              value={faab}
              onChange={(e) => setFaab(parseInt(e.target.value, 10))}
              className="w-full accent-brand-primary"
            />
            <div className="flex justify-between text-xs text-brand-muted mt-1">
              <span>$0 (FCFS)</span>
              <span>$100</span>
              <span>$500</span>
            </div>
            <p className="text-xs text-brand-muted mt-1">
              Blind bidding budget for waiver wire pickups. Set to $0 for first-come-first-served.
              This applies to all teams in the league.
            </p>
          </div>

          {/* Pick Timer */}
          <div>
            <label className="block text-sm font-medium text-brand-text mb-1.5 flex items-center gap-1.5">
              <Timer className="w-4 h-4 text-brand-primaryText" />
              Pick Timer: <span className="text-brand-primaryText">{pickTimer}s</span> per pick
            </label>
            <input
              type="range"
              min={30}
              max={300}
              step={15}
              value={pickTimer}
              onChange={(e) => setPickTimer(parseInt(e.target.value, 10))}
              className="w-full accent-brand-primary"
            />
            <div className="flex justify-between text-xs text-brand-muted mt-1">
              <span>30s</span>
              <span>90s</span>
              <span>5 min</span>
            </div>
          </div>

          {/* Playoff Teams */}
          <div>
            <label className="block text-sm font-medium text-brand-text mb-1.5">
              Playoff Teams: <span className="text-brand-primaryText">{playoffTeams}</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[2, 4, 6, 8].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPlayoffTeams(n)}
                  className={`p-2.5 rounded-lg border text-sm font-medium transition-all ${
                    playoffTeams === n
                      ? 'border-brand-primary bg-brand-primary/10 text-brand-primaryText'
                      : 'border-brand-border bg-brand-elevated text-brand-muted hover:border-brand-primary/50'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Position Enforcement */}
          <div>
            <label className="block text-sm font-medium text-brand-text mb-1.5">
              Position Limit Enforcement
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEnforcePos(true)}
                className={`flex-1 p-2.5 rounded-lg border text-sm font-medium transition-all ${
                  enforcePos
                    ? 'border-brand-success bg-brand-success/10 text-brand-success'
                    : 'border-brand-border bg-brand-elevated text-brand-muted hover:border-brand-primary/50'
                }`}
              >
                Enforce
              </button>
              <button
                type="button"
                onClick={() => setEnforcePos(false)}
                className={`flex-1 p-2.5 rounded-lg border text-sm font-medium transition-all ${
                  !enforcePos
                    ? 'border-brand-accent bg-brand-accent/10 text-brand-accent'
                    : 'border-brand-border bg-brand-elevated text-brand-muted hover:border-brand-primary/50'
                }`}
              >
                Open
              </button>
            </div>
            <p className="text-xs text-brand-muted mt-1">
              When enforced, managers cannot draft more players at a position than the roster allows.
            </p>
          </div>

          {/* Error / Success messages */}
          {saveError && (
            <div className="text-sm text-brand-danger bg-brand-danger/10 rounded-lg p-3">
              {saveError}
            </div>
          )}
          {saveSuccess && (
            <div className="text-sm text-brand-success bg-brand-success/10 rounded-lg p-3 flex items-center gap-2">
              <Check className="w-4 h-4" /> Settings saved successfully!
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-brand-border sticky bottom-0 bg-brand-surface">
          <button
            onClick={onClose}
            className="btn-secondary"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || saveSuccess}
            className="btn-primary"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
            ) : saveSuccess ? (
              <><Check className="w-4 h-4" /> Saved</>
            ) : (
              <><Save className="w-4 h-4" /> Save Settings</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
