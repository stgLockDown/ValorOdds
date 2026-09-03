'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Target, Shield, Trophy, Crown, ChevronRight, ChevronLeft, Check,
  Users, Settings, Zap, Loader2, Copy, CheckCircle,
  X, Save, Trash2,
} from 'lucide-react';

interface RosterPresetInfo {
  key: string; name: string; totalRosterSize: number; totalStarters: number;
  qbCount: number; hasSuperflex: boolean; slotSummary: string;
  isIdp: boolean; isDynasty: boolean; isDefenseOnly: boolean; kickerCount: number;
}
interface ScoringPresetInfo {
  key: string; name: string; mode: string;
}
interface DraftTypeInfo { value: string; label: string; description: string; }
interface KeeperTypeInfo { value: string; label: string; description: string; }
interface LeagueFormatInfo { value: string; label: string; description: string; }

interface PresetsData {
  sports: Record<string, {
    rosterPresets: RosterPresetInfo[];
    scoringPresets: ScoringPresetInfo[];
  }>;
  draftTypes: DraftTypeInfo[];
  keeperTypes: KeeperTypeInfo[];
  leagueFormats: LeagueFormatInfo[];
}

type Sport = 'NFL' | 'MLB';

export default function CreateLeagueClient() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [presets, setPresets] = useState<PresetsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdLeague, setCreatedLeague] = useState<{ id: string; inviteCode: string; name: string } | null>(null);

  // Form state
  const [sport, setSport] = useState<Sport>('NFL');
  const [name, setName] = useState('');
  const [format, setFormat] = useState('h2h_points');
  const [scoringPreset, setScoringPreset] = useState('standard_ppr');
  const [rosterPreset, setRosterPreset] = useState('standard');
  const [numTeams, setNumTeams] = useState(12);
  const [draftType, setDraftType] = useState('snake');
  const [keeperType, setKeeperType] = useState('redraft');
  const [isPublic, setIsPublic] = useState(true);
  const [teamName, setTeamName] = useState('');
  const [lineupSetting, setLineupSetting] = useState<'daily' | 'weekly'>('daily');
  const [pickTimerSeconds, setPickTimerSeconds] = useState(90);
  const [faabBudget, setFaabBudget] = useState(100);
  const [playoffWeeks, setPlayoffWeeks] = useState(3);
  const [showExitModal, setShowExitModal] = useState(false);
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);

  // Position limit enforcement (default ON)
  const [enforcePositionLimits, setEnforcePositionLimits] = useState(true);

  // Dynasty-specific settings
  const [rookieDraftRounds, setRookieDraftRounds] = useState(3);
  const [taxiSquadSize, setTaxiSquadSize] = useState(4);
  const [dynastyIRSLOTS, setDynastyIRSlots] = useState(4);

  // IDP-specific settings
  const [idpScoringTier, setIdpScoringTier] = useState<'light' | 'standard' | 'heavy'>('standard');
  const [useIndividualDefenders, setUseIndividualDefenders] = useState(true);

  const DRAFT_STORAGE_KEY = 'dd_create_league_draft';

  // Save wizard state to localStorage whenever form fields change
  useEffect(() => {
    if (!hasRestoredDraft) return; // don't save until we've restored any existing draft
    const draftData = {
      step,
      sport,
      name,
      format,
      scoringPreset,
      rosterPreset,
      numTeams,
      draftType,
      keeperType,
      isPublic,
      teamName,
      lineupSetting,
      pickTimerSeconds,
      faabBudget,
      playoffWeeks,
      enforcePositionLimits,
      rookieDraftRounds,
      taxiSquadSize,
      dynastyIRSLOTS,
      idpScoringTier,
      useIndividualDefenders,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftData));
    } catch {
      // localStorage might be full or unavailable -- non-fatal
    }
  }, [hasRestoredDraft, step, sport, name, format, scoringPreset, rosterPreset, numTeams, draftType, keeperType, isPublic, teamName, lineupSetting, pickTimerSeconds, faabBudget, playoffWeeks, enforcePositionLimits, rookieDraftRounds, taxiSquadSize, dynastyIRSLOTS, idpScoringTier, useIndividualDefenders]);

  // Restore wizard state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.step !== undefined) setStep(data.step);
        if (data.sport) setSport(data.sport);
        if (data.name) setName(data.name);
        if (data.format) setFormat(data.format);
        if (data.scoringPreset) setScoringPreset(data.scoringPreset);
        if (data.rosterPreset) setRosterPreset(data.rosterPreset);
        if (data.numTeams) setNumTeams(data.numTeams);
        if (data.draftType) setDraftType(data.draftType);
        if (data.keeperType) setKeeperType(data.keeperType);
        if (typeof data.isPublic === 'boolean') setIsPublic(data.isPublic);
        if (data.teamName) setTeamName(data.teamName);
        if (data.lineupSetting) setLineupSetting(data.lineupSetting);
        if (data.pickTimerSeconds) setPickTimerSeconds(data.pickTimerSeconds);
        if (data.faabBudget) setFaabBudget(data.faabBudget);
        if (data.playoffWeeks) setPlayoffWeeks(data.playoffWeeks);
        if (typeof data.enforcePositionLimits === 'boolean') setEnforcePositionLimits(data.enforcePositionLimits);
        if (data.rookieDraftRounds) setRookieDraftRounds(data.rookieDraftRounds);
        if (data.taxiSquadSize) setTaxiSquadSize(data.taxiSquadSize);
        if (data.dynastyIRSLOTS) setDynastyIRSlots(data.dynastyIRSLOTS);
        if (data.idpScoringTier) setIdpScoringTier(data.idpScoringTier);
        if (typeof data.useIndividualDefenders === 'boolean') setUseIndividualDefenders(data.useIndividualDefenders);
      }
    } catch {
      // Corrupt or unavailable -- non-fatal
    }
    setHasRestoredDraft(true);
  }, []);

  useEffect(() => {
    fetch('/api/dd/presets')
      .then((r) => r.json())
      .then((data) => {
        setPresets(data);
        // Set defaults based on sport
        if (data.sports.NFL) {
          setScoringPreset(data.sports.NFL.scoringPresets[0]?.key ?? 'standard_ppr');
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Update defaults when sport changes
  useEffect(() => {
    if (!presets) return;
    const sportData = presets.sports[sport];
    if (sportData) {
      setScoringPreset(sportData.scoringPresets[0]?.key ?? '');
      setRosterPreset(sportData.rosterPresets[0]?.key ?? '');
    }
  }, [sport, presets]);

  const steps = ['Sport', 'Format', 'Settings', 'Review'];

  // Detect IDP / Dynasty / Defense-Only roster presets from the selected roster preset
  const selectedRosterPreset = presets?.sports[sport]?.rosterPresets.find((r) => r.key === rosterPreset);
  const isIdpRoster = !!selectedRosterPreset?.isIdp;
  const isDynastyRoster = !!selectedRosterPreset?.isDynasty;
  const isDefenseOnlyRoster = !!selectedRosterPreset?.isDefenseOnly;

  const canProceed = () => {
    if (step === 0) return !!sport;
    if (step === 1) return !!format && !!scoringPreset && !!rosterPreset;
    if (step === 2) return !!name.trim() && numTeams >= 6 && numTeams <= 24;
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/dd/leagues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          sport,
          format,
          scoringPreset,
          rosterPreset,
          numTeams,
          draftType,
          keeperType,
          isPublic,
          lineupSetting,
          teamName: teamName.trim() || undefined,
          pickTimerSeconds,
          faabBudget,
          playoffWeeks: sport === 'NFL' ? playoffWeeks : undefined,
          enforcePositionLimits,
          // Dynasty-specific settings (only sent if keeperType is dynasty)
          ...(keeperType === 'dynasty' ? {
            dynastySettings: {
              carryFullRoster: true,
              rookieDraftRounds,
              taxiSquadSize,
              irSlots: dynastyIRSLOTS,
            },
          } : {}),
          // IDP-specific settings (only sent if roster preset is IDP)
          ...(isIdpRoster ? {
            idpSettings: {
              idpScoringTier,
              useIndividualDefenders,
            },
          } : {}),
          // Defense-only settings (no offensive players, 2 kickers)
          ...(isDefenseOnlyRoster ? {
            defenseOnlySettings: {
              noOffensivePlayers: true,
              kickerCount: 2,
            },
          } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create league');
        setSubmitting(false);
        return;
      }
      setCreatedLeague({
        id: data.leagueId,
        inviteCode: data.inviteCode,
        name: data.leagueName,
      });
      // Clear saved draft since the league was successfully created
      try {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch {
        // non-fatal
      }
      setSubmitting(false);
    } catch {
      setError('Network error');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <Loader2 className="w-8 h-8 text-brand-primary animate-spin mx-auto" />
        <p className="text-brand-muted mt-3">Loading presets...</p>
      </div>
    );
  }

  // Success screen
  if (createdLeague) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="card text-center py-12">
          <div className="w-16 h-16 rounded-full bg-brand-success/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-brand-success" />
          </div>
          <h2 className="text-2xl font-bold text-brand-text mb-2">League Created!</h2>
          <p className="text-brand-muted mb-6">
            {createdLeague.name} is ready for players to join.
          </p>

          {!isPublic && (
            <div className="bg-brand-elevated rounded-lg p-4 mb-6 inline-block">
              <div className="text-xs text-brand-muted uppercase tracking-wide mb-1">
                Invite Code
              </div>
              <div className="flex items-center gap-3">
                <code className="text-2xl font-bold text-brand-accent tracking-widest">
                  {createdLeague.inviteCode}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(createdLeague.inviteCode)}
                  className="btn-ghost p-2"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-center">
            <button
              onClick={() => router.push(`/dd/league/${createdLeague.id}`)}
              className="btn-primary"
            >
              Go to League
            </button>
            <button
              onClick={() => router.push('/dd')}
              className="btn-secondary"
            >
              Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <div className="flex items-center gap-3 mb-6">
        <Trophy className="w-7 h-7 text-brand-accent" />
        <h1 className="text-2xl sm:text-3xl font-bold text-brand-text">Create a League</h1>
      </div>

      {/* Restored draft banner */}
      {hasRestoredDraft && (() => {
        let savedAt: string | null = null;
        try {
          const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
          if (saved) savedAt = JSON.parse(saved)?.savedAt ?? null;
        } catch { /* ignore */ }
        if (!savedAt) return null;
        const date = new Date(savedAt);
        const timeStr = date.toLocaleDateString() + ' at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return (
          <div className="flex items-center justify-between gap-3 mb-4 p-3 rounded-lg bg-brand-primary/10 border border-brand-primary/30">
            <div className="flex items-center gap-2 text-sm text-brand-text">
              <Save className="w-4 h-4 text-brand-primary flex-shrink-0" />
              <span>Continuing from a saved draft (last saved {timeStr})</span>
            </div>
            <button
              onClick={() => {
                try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch { /* ignore */ }
                window.location.reload();
              }}
              className="text-xs text-brand-muted hover:text-brand-danger flex items-center gap-1 flex-shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" /> Start fresh
            </button>
          </div>
        );
      })()}

      {/* Stepper */}
      <div className="flex items-center gap-1 sm:gap-2 mb-8">
        {steps.map((label, i) => (
          <div key={label} className="flex items-center flex-1">
            <div className={`flex items-center gap-2 ${i <= step ? 'text-brand-primaryText' : 'text-brand-muted'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${
                i < step ? 'bg-brand-success text-white' :
                i === step ? 'bg-brand-primary text-white' :
                'bg-brand-elevated text-brand-muted'
              }`}>
                {i < step ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span className="text-sm font-medium hidden sm:block">{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 sm:mx-2 ${i < step ? 'bg-brand-success' : 'bg-brand-border'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="card min-h-[300px]">
        {/* Step 0: Sport Selection */}
        {step === 0 && (
          <div>
            <h2 className="text-lg font-semibold text-brand-text mb-1">Choose Your Sport</h2>
            <p className="text-sm text-brand-muted mb-6">Select which sport this league will play.</p>
            <div className="grid grid-cols-2 gap-4">
              {(['NFL', 'MLB'] as Sport[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSport(s)}
                  className={`p-6 rounded-xl border-2 transition-all text-center ${
                    sport === s
                      ? 'border-brand-primary bg-brand-primary/10'
                      : 'border-brand-border bg-brand-elevated hover:border-brand-primary/50'
                  }`}
                >
                  <div className="flex justify-center mb-3">
                    {s === 'NFL' ? (
                      <Shield className={`w-12 h-12 ${sport === s ? 'text-brand-primary' : 'text-brand-muted'}`} />
                    ) : (
                      <Target className={`w-12 h-12 ${sport === s ? 'text-brand-primary' : 'text-brand-muted'}`} />
                    )}
                  </div>
                  <div className="text-xl font-bold text-brand-text">{s}</div>
                  <div className="text-sm text-brand-muted mt-1">
                    {s === 'NFL' ? 'Football · Weekly' : 'Baseball · Daily'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Format & Scoring */}
        {step === 1 && presets && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-brand-text mb-1">League Format</h2>
              <p className="text-sm text-brand-muted mb-4">How will matchups be determined?</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {presets.leagueFormats.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setFormat(f.value)}
                    className={`p-4 rounded-lg border text-left transition-all ${
                      format === f.value
                        ? 'border-brand-primary bg-brand-primary/10'
                        : 'border-brand-border bg-brand-elevated hover:border-brand-primary/50'
                    }`}
                  >
                    <div className="font-semibold text-brand-text">{f.label}</div>
                    <div className="text-xs text-brand-muted mt-1">{f.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-base font-semibold text-brand-text mb-1">Scoring System</h3>
              <p className="text-sm text-brand-muted mb-3">How are fantasy points calculated?</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {presets.sports[sport]?.scoringPresets.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setScoringPreset(s.key)}
                    className={`p-4 rounded-lg border text-left transition-all ${
                      scoringPreset === s.key
                        ? 'border-brand-primary bg-brand-primary/10'
                        : 'border-brand-border bg-brand-elevated hover:border-brand-primary/50'
                    }`}
                  >
                    <div className="font-semibold text-brand-text">{s.name}</div>
                    <div className="text-xs text-brand-muted mt-1 capitalize">{s.mode} scoring</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-base font-semibold text-brand-text mb-1">Roster Size</h3>
              <p className="text-sm text-brand-muted mb-3">How many players per team?</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {presets.sports[sport]?.rosterPresets.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setRosterPreset(r.key)}
                    className={`p-4 rounded-lg border text-center transition-all ${
                      rosterPreset === r.key
                        ? 'border-brand-primary bg-brand-primary/10'
                        : 'border-brand-border bg-brand-elevated hover:border-brand-primary/50'
                    }`}
                  >
                    <div className="font-semibold text-brand-text">{r.name}</div>
                    <div className="text-xs text-brand-muted mt-1">
                      {r.totalRosterSize} players · {r.totalStarters} starters
                    </div>
                    {sport === 'NFL' && (
                      <div className="text-xs mt-1.5 flex items-center justify-center gap-1.5 flex-wrap">
                        {r.isDefenseOnly ? (
                          <>
                            <span className="px-1.5 py-0.5 rounded bg-brand-danger/20 text-brand-danger font-semibold">DEF ONLY</span>
                            <span className="px-1.5 py-0.5 rounded bg-brand-primary/20 text-brand-primaryText">
                              {r.kickerCount} K
                            </span>
                          </>
                        ) : (
                          <span className={`px-1.5 py-0.5 rounded ${r.qbCount === 1 && !r.hasSuperflex ? 'bg-brand-primary/20 text-brand-primaryText' : 'bg-brand-elevated text-brand-muted'}`}>
                            {r.qbCount} QB{r.hasSuperflex ? ' + SFlex' : ''}
                          </span>
                        )}
                        {r.isIdp && !r.isDefenseOnly && (
                          <span className="px-1.5 py-0.5 rounded bg-brand-danger/20 text-brand-danger font-semibold">IDP</span>
                        )}
                        {r.isDynasty && (
                          <span className="px-1.5 py-0.5 rounded bg-brand-accent/20 text-brand-accent font-semibold">Dynasty</span>
                        )}
                      </div>
                    )}
                    {sport === 'MLB' && r.isDynasty && (
                      <div className="text-xs mt-1.5 flex items-center justify-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-brand-accent/20 text-brand-accent font-semibold">Dynasty</span>
                      </div>
                    )}
                    {r.slotSummary && (
                      <div className="text-xs text-brand-muted mt-1.5 font-mono break-words">
                        {r.slotSummary}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-base font-semibold text-brand-text mb-1">Draft Type</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {presets.draftTypes.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setDraftType(d.value)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      draftType === d.value
                        ? 'border-brand-primary bg-brand-primary/10'
                        : 'border-brand-border bg-brand-elevated hover:border-brand-primary/50'
                    }`}
                  >
                    <div className="font-medium text-brand-text text-sm">{d.label}</div>
                    <div className="text-xs text-brand-muted">{d.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-base font-semibold text-brand-text mb-1">Keeper Type</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {presets.keeperTypes.map((k) => (
                  <button
                    key={k.value}
                    onClick={() => setKeeperType(k.value)}
                    className={`p-3 rounded-lg border text-center transition-all ${
                      keeperType === k.value
                        ? 'border-brand-primary bg-brand-primary/10'
                        : 'border-brand-border bg-brand-elevated hover:border-brand-primary/50'
                    }`}
                  >
                    <div className="font-medium text-brand-text text-sm">{k.label}</div>
                    <div className="text-xs text-brand-muted">{k.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Defense-only league settings */}
            {isDefenseOnlyRoster && (
              <div className="p-4 rounded-lg border border-brand-danger/40 bg-brand-danger/10">
                <h3 className="text-base font-semibold text-brand-text mb-1 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-brand-danger" />
                  Defense-Only League Settings
                </h3>
                <p className="text-sm text-brand-muted mb-3">
                  No offensive players (QB, RB, WR, TE) are drafted. Your lineup features <strong className="text-brand-text">2 kickers</strong>, team defense, and individual defensive players (DL, LB, DB + flex). Scoring is heavily weighted toward defense and kicking.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-md bg-brand-elevated/60 border border-brand-border">
                    <div className="text-xs font-medium text-brand-muted mb-1">Starting Lineup</div>
                    <div className="text-sm text-brand-text font-mono">
                      2 K · 1 DEF · 2 DL · 2 LB · 2 DB · 2 D-Flex
                    </div>
                    <div className="text-xs text-brand-muted mt-1">11 starters · 9 bench · 3 IR</div>
                  </div>
                  <div className="p-3 rounded-md bg-brand-elevated/60 border border-brand-border">
                    <div className="text-xs font-medium text-brand-muted mb-1">Recommended Scoring</div>
                    <div className="text-sm text-brand-text">
                      Defense Only (Kicker + IDP Heavy)
                    </div>
                    <div className="text-xs text-brand-muted mt-1">
                      Boosted: tackles 1.5, sacks 4, INTs 6, FGs 4+
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setScoringPreset('defense_only')}
                  className={`mt-3 text-xs px-3 py-1.5 rounded-md transition-colors w-full ${
                    scoringPreset === 'defense_only'
                      ? 'bg-brand-success/20 text-brand-success border border-brand-success/30'
                      : 'bg-brand-primary text-white hover:bg-brand-primary/90'
                  }`}
                >
                  {scoringPreset === 'defense_only'
                    ? '✓ Defense-Only Scoring Selected'
                    : 'Use Defense-Only Scoring Preset'}
                </button>
              </div>
            )}

            {/* IDP-specific settings */}
            {isIdpRoster && !isDefenseOnlyRoster && (
              <div className="p-4 rounded-lg border border-brand-danger/30 bg-brand-danger/5">
                <h3 className="text-base font-semibold text-brand-text mb-1 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-brand-danger" />
                  IDP League Settings
                </h3>
                <p className="text-sm text-brand-muted mb-3">
                  Individual Defensive Players — your league drafts DL, LB, and DB players in addition to offense.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-brand-muted mb-1.5 block">IDP Scoring Tier</label>
                    <div className="flex gap-2">
                      {(['light', 'standard', 'heavy'] as const).map((tier) => (
                        <button
                          key={tier}
                          onClick={() => setIdpScoringTier(tier)}
                          className={`text-xs px-3 py-1.5 rounded-md capitalize transition-colors ${
                            idpScoringTier === tier
                              ? 'bg-brand-danger text-white'
                              : 'bg-brand-elevated text-brand-muted hover:text-brand-text'
                          }`}
                        >
                          {tier}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-brand-muted mt-1">
                      {idpScoringTier === 'light' && 'Tackles worth 0.5, sacks 1.5, INTs 3'}
                      {idpScoringTier === 'standard' && 'Tackles worth 1, sacks 2, INTs 5'}
                      {idpScoringTier === 'heavy' && 'Tackles worth 1.5, sacks 4, INTs 6'}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-brand-muted mb-1.5 block">Defensive Positions</label>
                    <button
                      onClick={() => setUseIndividualDefenders(!useIndividualDefenders)}
                      className={`w-full text-left p-2.5 rounded-md border transition-colors ${
                        useIndividualDefenders
                          ? 'border-brand-danger bg-brand-danger/10'
                          : 'border-brand-border bg-brand-elevated'
                      }`}
                    >
                      <div className="text-sm font-medium text-brand-text flex items-center justify-between">
                        Individual Defenders
                        <span className={`text-xs ${useIndividualDefenders ? 'text-brand-danger' : 'text-brand-muted'}`}>
                          {useIndividualDefenders ? 'ON' : 'OFF'}
                        </span>
                      </div>
                      <div className="text-xs text-brand-muted mt-0.5">
                        Draft DL, LB, DB players (vs. team defense only)
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Dynasty-specific settings */}
            {keeperType === 'dynasty' && (
              <div className="p-4 rounded-lg border border-brand-accent/30 bg-brand-accent/5">
                <h3 className="text-base font-semibold text-brand-text mb-1 flex items-center gap-2">
                  <Crown className="w-4 h-4 text-brand-accent" />
                  Dynasty League Settings
                </h3>
                <p className="text-sm text-brand-muted mb-3">
                  Keep your entire roster year-to-year. Build a franchise through veteran and rookie drafts.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-medium text-brand-muted mb-1.5 block">Rookie Draft Rounds</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={rookieDraftRounds}
                      onChange={(e) => setRookieDraftRounds(Math.max(1, Math.min(10, Number(e.target.value))))}
                      className="input"
                    />
                    <p className="text-xs text-brand-muted mt-1">Rounds in the annual rookie draft</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-brand-muted mb-1.5 block">Taxi Squad Size</label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={taxiSquadSize}
                      onChange={(e) => setTaxiSquadSize(Math.max(0, Math.min(10, Number(e.target.value))))}
                      className="input"
                    />
                    <p className="text-xs text-brand-muted mt-1">Developmental stash spots for rookies</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-brand-muted mb-1.5 block">IR Slots</label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={dynastyIRSLOTS}
                      onChange={(e) => setDynastyIRSlots(Math.max(0, Math.min(10, Number(e.target.value))))}
                      className="input"
                    />
                    <p className="text-xs text-brand-muted mt-1">Injured reserve slots</p>
                  </div>
                </div>
              </div>
            )}

            {/* Position limit enforcement toggle */}
            <div className="p-4 rounded-lg border border-brand-border bg-brand-elevated/50">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-brand-text mb-1 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-brand-primaryText" />
                    Position Limit Enforcement
                  </h3>
                  <p className="text-sm text-brand-muted">
                    Prevent managers from drafting too many players at one position (e.g., a team of all QBs). Forces filling roster needs.
                  </p>
                </div>
                <button
                  onClick={() => setEnforcePositionLimits(!enforcePositionLimits)}
                  className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
                    enforcePositionLimits ? 'bg-brand-success' : 'bg-brand-border'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      enforcePositionLimits ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div>
              <h3 className="text-base font-semibold text-brand-text mb-1">Lineup Setting</h3>
              <p className="text-xs text-brand-muted mb-3">
                Daily lets managers set lineups each day; Weekly locks lineups once per week.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => setLineupSetting('daily')}
                  className={`p-3 rounded-lg border text-center transition-all ${
                    lineupSetting === 'daily'
                      ? 'border-brand-primary bg-brand-primary/10'
                      : 'border-brand-border bg-brand-elevated hover:border-brand-primary/50'
                  }`}
                >
                  <div className="font-medium text-brand-text text-sm">Daily</div>
                  <div className="text-xs text-brand-muted">Set your lineup every day</div>
                </button>
                <button
                  onClick={() => setLineupSetting('weekly')}
                  className={`p-3 rounded-lg border text-center transition-all ${
                    lineupSetting === 'weekly'
                      ? 'border-brand-primary bg-brand-primary/10'
                      : 'border-brand-border bg-brand-elevated hover:border-brand-primary/50'
                  }`}
                >
                  <div className="font-medium text-brand-text text-sm">Weekly</div>
                  <div className="text-xs text-brand-muted">Lock your lineup once per week</div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Settings */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-brand-text mb-1">League Settings</h2>

            <div>
              <label className="block text-sm font-medium text-brand-text mb-1.5">
                League Name
              </label>
              <input
                type="text"
                className="input"
                placeholder="e.g., Sunday Showdown"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-text mb-1.5">
                Your Team Name
              </label>
              <input
                type="text"
                className="input"
                placeholder="e.g., The Bombers"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                maxLength={40}
              />
              <p className="text-xs text-brand-muted mt-1">
                Optional — defaults to your display name.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-text mb-1.5">
                Number of Teams: <span className="text-brand-primaryText">{numTeams}</span>
              </label>
              <input
                type="range"
                min={6}
                max={24}
                value={numTeams}
                onChange={(e) => setNumTeams(parseInt(e.target.value, 10))}
                className="w-full accent-brand-primary"
              />
              <div className="flex justify-between text-xs text-brand-muted mt-1">
                <span>6</span><span>12</span><span>18</span><span>24</span>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <button
                  type="button"
                  onClick={() => setIsPublic(!isPublic)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    isPublic ? 'bg-brand-primary' : 'bg-brand-elevated'
                  }`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                    isPublic ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
                <div>
                  <div className="text-sm font-medium text-brand-text">
                    {isPublic ? 'Public League' : 'Private League'}
                  </div>
                  <div className="text-xs text-brand-muted">
                    {isPublic
                      ? 'Anyone can find and join this league.'
                      : 'Players need an invite code to join.'}
                  </div>
                </div>
              </label>
            </div>

            {/* Pick Timer */}
            <div>
              <label className="block text-sm font-medium text-brand-text mb-1.5">
                Draft Pick Timer: <span className="text-brand-primaryText">{pickTimerSeconds}s</span> per pick
              </label>
              <input
                type="range"
                min={30}
                max={300}
                step={15}
                value={pickTimerSeconds}
                onChange={(e) => setPickTimerSeconds(parseInt(e.target.value, 10))}
                className="w-full accent-brand-primary"
              />
              <div className="flex justify-between text-xs text-brand-muted mt-1">
                <span>30s (fast)</span>
                <span>90s</span>
                <span>300s (5 min)</span>
              </div>
              <p className="text-xs text-brand-muted mt-1">
                How long each manager has to make a pick before auto-draft kicks in.
              </p>
            </div>

            {/* FAAB Budget */}
            <div>
              <label className="block text-sm font-medium text-brand-text mb-1.5">
                FAAB Budget (Free Agent Acquisition Budget): <span className="text-brand-primaryText">${faabBudget}</span>
              </label>
              <input
                type="range"
                min={0}
                max={500}
                step={25}
                value={faabBudget}
                onChange={(e) => setFaabBudget(parseInt(e.target.value, 10))}
                className="w-full accent-brand-primary"
              />
              <div className="flex justify-between text-xs text-brand-muted mt-1">
                <span>$0</span>
                <span>$100</span>
                <span>$500</span>
              </div>
              <p className="text-xs text-brand-muted mt-1">
                Blind bidding budget for waiver wire pickups. Set to $0 for first-come-first-served.
              </p>
            </div>

            {/* Playoff Weeks (NFL only) */}
            {sport === 'NFL' && (
              <div>
                <label className="block text-sm font-medium text-brand-text mb-1.5">
                  Playoff Weeks: <span className="text-brand-primaryText">{playoffWeeks}</span> teams
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[2, 4, 6, 8].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPlayoffWeeks(n)}
                      className={`p-2.5 rounded-lg border text-sm font-medium transition-all ${
                        playoffWeeks === n
                          ? 'border-brand-primary bg-brand-primary/10 text-brand-text'
                          : 'border-brand-border bg-brand-elevated text-brand-muted hover:border-brand-primary/50'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-brand-muted mt-1">
                  Number of teams that qualify for the playoff bracket at the end of the season.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-brand-text mb-1">Review & Create</h2>
            <p className="text-sm text-brand-muted mb-4">
              Confirm your league settings below.
            </p>
            <div className="space-y-2">
              <ReviewRow label="Sport" value={sport} icon={sport === 'NFL' ? <Shield className="w-4 h-4" /> : <Target className="w-4 h-4" />} />
              <ReviewRow label="League Name" value={name || 'Untitled'} />
              <ReviewRow label="Your Team" value={teamName || 'Default'} />
              <ReviewRow label="Format" value={presets?.leagueFormats.find(f => f.value === format)?.label ?? format} />
              <ReviewRow label="Scoring" value={presets?.sports[sport]?.scoringPresets.find(s => s.key === scoringPreset)?.name ?? scoringPreset} />
              <ReviewRow label="Roster" value={`${presets?.sports[sport]?.rosterPresets.find(r => r.key === rosterPreset)?.name ?? rosterPreset}${sport === 'NFL' ? (presets?.sports[sport]?.rosterPresets.find(r => r.key === rosterPreset)?.hasSuperflex ? ' (Superflex)' : ' (1-QB)') : ''}`} />
              <ReviewRow label="Teams" value={String(numTeams)} />
              <ReviewRow label="Draft" value={presets?.draftTypes.find(d => d.value === draftType)?.label ?? draftType} />
              <ReviewRow label="Keeper" value={presets?.keeperTypes.find(k => k.value === keeperType)?.label ?? keeperType} />
              {isIdpRoster && !isDefenseOnlyRoster && (
                <ReviewRow label="IDP Scoring" value={`${idpScoringTier} tier · ${useIndividualDefenders ? 'Individual defenders' : 'Team DEF only'}`} />
              )}
              {isDefenseOnlyRoster && (
                <ReviewRow label="Defense-Only" value="2 Kickers · No Offense · IDP Heavy" />
              )}
              {keeperType === 'dynasty' && (
                <ReviewRow label="Dynasty" value={`${rookieDraftRounds} rookie rounds · ${taxiSquadSize} taxi · ${dynastyIRSLOTS} IR`} />
              )}
              <ReviewRow label="Pos. Limits" value={enforcePositionLimits ? 'Enforced' : 'Off (advisory)'} />
              <ReviewRow label="Lineup" value={lineupSetting === 'daily' ? 'Daily' : 'Weekly'} />
              <ReviewRow label="Pick Timer" value={`${pickTimerSeconds}s per pick`} />
              <ReviewRow label="FAAB Budget" value={`$${faabBudget}`} />
              {sport === 'NFL' && <ReviewRow label="Playoff Teams" value={String(playoffWeeks)} />}
              <ReviewRow label="Visibility" value={isPublic ? 'Public' : 'Private (invite code)'} />
            </div>
            {error && (
              <div className="text-sm text-brand-danger bg-brand-danger/10 rounded-lg p-3">
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between mt-6">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowExitModal(true)}
            className="btn-secondary text-brand-muted hover:text-brand-danger"
            title="Exit without creating"
          >
            <X className="w-4 h-4" /> Exit
          </button>
          <button
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            className="btn-secondary"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
        </div>
        {step < steps.length - 1 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
            className="btn-primary"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="btn-primary"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
            ) : (
              <><Trophy className="w-4 h-4" /> Create League</>
            )}
          </button>
        )}
      </div>

      {/* Exit Confirmation Modal */}
      {showExitModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowExitModal(false)}
        >
          <div
            className="bg-brand-surface border border-brand-border rounded-2xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-brand-text mb-2 flex items-center gap-2">
              <X className="w-5 h-5 text-brand-muted" /> Exit Create League?
            </h3>
            <p className="text-sm text-brand-muted mb-4">
              Your league setup will be saved as a draft so you can continue later.
              You can discard it if you'd prefer to start fresh next time.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  // Save draft and exit — the autosave useEffect already persists to localStorage
                  setShowExitModal(false);
                  router.push('/dd');
                }}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" /> Save Draft & Exit
              </button>
              <button
                onClick={() => {
                  // Discard draft and exit
                  try {
                    localStorage.removeItem(DRAFT_STORAGE_KEY);
                  } catch {
                    // non-fatal
                  }
                  setShowExitModal(false);
                  router.push('/dd');
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-brand-danger/50 text-brand-danger hover:bg-brand-danger/10 transition-all text-sm font-medium"
              >
                <Trash2 className="w-4 h-4" /> Discard & Exit
              </button>
              <button
                onClick={() => setShowExitModal(false)}
                className="btn-secondary w-full"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-4 bg-brand-elevated rounded-lg">
      <span className="text-sm text-brand-muted">{label}</span>
      <span className="text-sm font-medium text-brand-text flex items-center gap-2">
        {icon}
        {value}
      </span>
    </div>
  );
}
