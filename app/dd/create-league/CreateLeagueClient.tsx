'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Target, Shield, Trophy, ChevronRight, ChevronLeft, Check,
  Users, Settings, Zap, Loader2, Copy, CheckCircle,
} from 'lucide-react';

interface RosterPresetInfo {
  key: string; name: string; totalRosterSize: number; totalStarters: number;
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
              <ReviewRow label="Roster" value={presets?.sports[sport]?.rosterPresets.find(r => r.key === rosterPreset)?.name ?? rosterPreset} />
              <ReviewRow label="Teams" value={String(numTeams)} />
              <ReviewRow label="Draft" value={presets?.draftTypes.find(d => d.value === draftType)?.label ?? draftType} />
              <ReviewRow label="Keeper" value={presets?.keeperTypes.find(k => k.value === keeperType)?.label ?? keeperType} />
              <ReviewRow label="Lineup" value={lineupSetting === 'daily' ? 'Daily' : 'Weekly'} />
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
        <button
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          className="btn-secondary"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
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
