'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import {
  Trophy, Plus, Users, Target, Shield, Crown, Zap, Flame,
  ChevronRight, Sparkles, Award, TrendingUp,
} from 'lucide-react';

interface League {
  id: string; name: string; sport: string; format: string; num_teams: number;
  status: string; season_year: number; team_name: string; is_commissioner: boolean;
  draft_position: number | null; memberCount: number; invite_code: string;
}

interface Profile {
  level: number; totalXp: number; levelTitle: string;
  badges: string[]; currentStreak: number; bestStreak: number;
  xpForCurrentLevel: number; xpForNextLevel: number;
}

interface LeaderboardEntry {
  displayName: string; level: number; levelTitle: string; totalXp: number;
}

interface PublicLeague {
  id: string; name: string; sport: string; format: string;
  num_teams: number; status: string; season_year: number;
  member_count: number; invite_code: string;
}

export default function DDHomeClient({
  userId,
  leagues,
  profile,
  leaderboard,
  publicLeagues,
}: {
  userId: string;
  leagues: League[];
  profile: Profile | null;
  leaderboard: LeaderboardEntry[];
  publicLeagues: PublicLeague[];
}) {
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  const [joiningPublicId, setJoiningPublicId] = useState<string | null>(null);
  const [publicError, setPublicError] = useState('');
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [showMockModal, setShowMockModal] = useState(false);
  const [mockSport, setMockSport] = useState<'NFL' | 'MLB'>('NFL');
  const [mockNumBots, setMockNumBots] = useState(7);
  const [mockDraftPosition, setMockDraftPosition] = useState(1);
  const [mockStarting, setMockStarting] = useState(false);
  const [mockError, setMockError] = useState('');

  const sportIcon = (sport: string) =>
    sport === 'NFL' ? <Shield className="w-5 h-5" /> : <Target className="w-5 h-5" />;

  // Keep draft position within valid range when team count changes
  useEffect(() => {
    if (mockDraftPosition > mockNumBots + 1) {
      setMockDraftPosition(mockNumBots + 1);
    }
  }, [mockNumBots, mockDraftPosition]);

  const statusColor = (status: string) => {
    switch (status) {
      case 'recruiting':
      case 'pre_draft':
      case 'setup':
      case 'predraft':
        return 'text-brand-accent bg-brand-accent/10';
      case 'drafting':
        return 'text-brand-primary bg-brand-primary/10 animate-pulse';
      case 'in_season':
      case 'playoffs':
        return 'text-brand-success bg-brand-success/10';
      case 'completed':
        return 'text-brand-muted bg-brand-muted/10';
      default:
        return 'text-brand-muted bg-brand-muted/10';
    }
  };

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      recruiting: 'Recruiting',
      pre_draft: 'Pre-Draft',
      predraft: 'Pre-Draft',
      setup: 'Setup',
      drafting: 'Drafting',
      in_season: 'In Season',
      playoffs: 'Playoffs',
      completed: 'Completed',
    };
    return map[status] ?? status;
  };

  const handleJoinByCode = async () => {
    if (!inviteCode.trim()) return;
    setJoining(true);
    setJoinError('');
    try {
      // First find the league by invite code
      const res = await fetch('/api/dd/leagues?' + new URLSearchParams({ inviteCode: inviteCode.trim() }));
      const data = await res.json();
      if (!res.ok) {
        setJoinError(data.error || 'Invalid invite code');
        return;
      }
      // Then join it
      const joinRes = await fetch(`/api/dd/leagues/${data.league.id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: inviteCode.trim() }),
      });
      const joinData = await joinRes.json();
      if (!joinRes.ok) {
        setJoinError(joinData.error || 'Failed to join league');
        return;
      }
      // Reload to show the new league
      window.location.reload();
    } catch {
      setJoinError('Network error');
    } finally {
      setJoining(false);
    }
  };

  const handleJoinPublic = async (leagueId: string, inviteCode: string) => {
    setJoiningPublicId(leagueId);
    setPublicError('');
    try {
      const joinRes = await fetch(`/api/dd/leagues/${leagueId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode }),
      });
      const joinData = await joinRes.json();
      if (!joinRes.ok) {
        setPublicError(joinData.error || 'Failed to join league');
        return;
      }
      // Mark as joined so it disappears from the list immediately
      setJoinedIds((prev) => new Set(prev).add(leagueId));
      // Reload to show the new league under "My Leagues"
      setTimeout(() => window.location.reload(), 600);
    } catch {
      setPublicError('Network error');
    } finally {
      setJoiningPublicId(null);
    }
  };

  const handleMockDraft = async () => {
    setMockStarting(true);
    setMockError('');
    try {
      // Create a mock league with AI bots, then start a draft
      const createRes = await fetch('/api/dd/mock-league', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sport: mockSport,
          numBots: mockNumBots,
          draftPosition: mockDraftPosition,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) {
        setMockError(createData.error || 'Failed to create mock league');
        return;
      }
      // Redirect to the draft room — the mock-league endpoint auto-starts the draft
      window.location.href = `/dd/league/${createData.leagueId}/draft`;
    } catch {
      setMockError('Network error');
    } finally {
      setMockStarting(false);
    }
  };

  const xpProgress = profile
    ? Math.min(
        100,
        Math.round(
          ((profile.totalXp - profile.xpForCurrentLevel) /
            (profile.xpForNextLevel - profile.xpForCurrentLevel)) *
            100
        )
      )
    : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      {/* Hero / Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-brand-text flex items-center gap-3">
            <Trophy className="w-8 h-8 text-brand-accent" />
            DiamondDraft
          </h1>
          <p className="text-brand-muted mt-1">
            Multi-sport fantasy leagues · NFL & MLB
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => setShowMockModal(true)}
            className="btn-secondary"
          >
            <Sparkles className="w-4 h-4" /> Mock Draft
          </button>
          <button
            onClick={() => setShowInviteModal(true)}
            className="btn-secondary"
          >
            <Users className="w-4 h-4" /> Join by Code
          </button>
          <Link href="/dd/create-league" className="btn-primary">
            <Plus className="w-4 h-4" /> Create League
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Leagues list (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-semibold text-brand-text flex items-center gap-2">
            <Trophy className="w-5 h-5 text-brand-accent" />
            My Leagues
            <span className="text-sm text-brand-muted font-normal">({leagues.length})</span>
          </h2>

          {leagues.length === 0 ? (
            <div className="card text-center py-12">
              <Sparkles className="w-12 h-12 text-brand-primary/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-brand-text mb-2">
                No leagues yet
              </h3>
              <p className="text-brand-muted mb-6 max-w-md mx-auto">
                Create your first league or join an existing one with an invite code.
                DiamondDraft supports both NFL and MLB with live snake drafts.
              </p>
              <div className="flex gap-3 justify-center">
                <Link href="/dd/create-league" className="btn-primary">
                  <Plus className="w-4 h-4" /> Create a League
                </Link>
                <button onClick={() => setShowInviteModal(true)} className="btn-secondary">
                  <Users className="w-4 h-4" /> Join by Code
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {leagues.map((league) => (
                <Link
                  key={league.id}
                  href={`/dd/league/${league.id}`}
                  className="card card-interactive block group"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-brand-elevated flex items-center justify-center flex-shrink-0">
                        {sportIcon(league.sport)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-brand-text truncate group-hover:text-brand-primaryText transition-colors">
                            {league.name}
                          </h3>
                          {league.is_commissioner && (
                            <Crown className="w-4 h-4 text-brand-accent flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-sm text-brand-muted truncate">
                          {league.team_name} · {league.sport} {league.season_year} · {league.format.replace(/_/g, ' ')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right hidden sm:block">
                        <div className="text-sm text-brand-muted">{league.memberCount}/{league.num_teams} teams</div>
                      </div>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColor(league.status)}`}>
                        {statusLabel(league.status)}
                      </span>
                      <ChevronRight className="w-5 h-5 text-brand-muted group-hover:text-brand-primaryText transition-colors" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Browse Public Leagues */}
          {publicLeagues.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xl font-semibold text-brand-text flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-brand-accent" />
                Browse Public Leagues
                <span className="text-sm text-brand-muted font-normal">({publicLeagues.length})</span>
              </h2>
              {publicError && (
                <p className="text-sm text-brand-danger mb-3">{publicError}</p>
              )}
              <div className="space-y-3">
                {publicLeagues
                  .filter((pl) => !joinedIds.has(pl.id))
                  .map((pl) => (
                    <div
                      key={pl.id}
                      className="card flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-brand-elevated flex items-center justify-center flex-shrink-0">
                          {sportIcon(pl.sport)}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-brand-text truncate">{pl.name}</h3>
                          <p className="text-sm text-brand-muted truncate">
                            {pl.sport} {pl.season_year} · {pl.format.replace(/_/g, ' ')} · {pl.member_count}/{pl.num_teams} teams
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleJoinPublic(pl.id, pl.invite_code)}
                        disabled={joiningPublicId === pl.id}
                        className="btn-primary flex-shrink-0 text-sm"
                      >
                        {joiningPublicId === pl.id ? 'Joining...' : 'Join'}
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Gamification profile + Leaderboard */}
        <div className="space-y-6">
          {/* XP / Level Card */}
          {profile && (
            <div className="card">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-primary to-brand-accent flex items-center justify-center">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-brand-text">
                    Level {profile.level}
                  </div>
                  <div className="text-sm text-brand-primaryText font-medium">
                    {profile.levelTitle}
                  </div>
                </div>
              </div>

              {/* XP Progress Bar */}
              <div className="mb-4">
                <div className="flex justify-between text-xs text-brand-muted mb-1.5">
                  <span>{profile.totalXp.toLocaleString()} XP</span>
                  <span>{profile.xpForNextLevel.toLocaleString()} XP</span>
                </div>
                <div className="h-2.5 bg-brand-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-brand-primary to-brand-accent rounded-full transition-all duration-500"
                    style={{ width: `${xpProgress}%` }}
                  />
                </div>
                <div className="text-center text-xs text-brand-muted mt-1.5">
                  {profile.xpForNextLevel - profile.totalXp} XP to next level
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-brand-elevated rounded-lg p-3 text-center">
                  <Award className="w-5 h-5 text-brand-accent mx-auto mb-1" />
                  <div className="text-lg font-bold text-brand-text">{profile.badges.length}</div>
                  <div className="text-xs text-brand-muted">Badges</div>
                </div>
                <div className="bg-brand-elevated rounded-lg p-3 text-center">
                  <Flame className="w-5 h-5 text-brand-danger mx-auto mb-1" />
                  <div className="text-lg font-bold text-brand-text">{profile.currentStreak}</div>
                  <div className="text-xs text-brand-muted">Win Streak</div>
                </div>
              </div>

              {/* Badges */}
              {profile.badges.length > 0 && (
                <div>
                  <div className="text-xs text-brand-muted mb-2 font-medium uppercase tracking-wide">
                    Earned Badges
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.badges.slice(0, 8).map((badge) => (
                      <span
                        key={badge}
                        className="text-xs px-2 py-1 rounded-md bg-brand-accent/10 text-brand-accent border border-brand-accent/20"
                      >
                        {badge.replace(/_/g, ' ')}
                      </span>
                    ))}
                    {profile.badges.length > 8 && (
                      <span className="text-xs px-2 py-1 rounded-md bg-brand-elevated text-brand-muted">
                        +{profile.badges.length - 8}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Leaderboard */}
          <div className="card">
            <h3 className="font-semibold text-brand-text flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-brand-accent" />
              Top Players
            </h3>
            <div className="space-y-2">
              {leaderboard.length === 0 ? (
                <p className="text-sm text-brand-muted text-center py-4">
                  No leaderboard data yet. Be the first!
                </p>
              ) : (
                leaderboard.map((entry, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-brand-elevated/50 transition-colors"
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                      i === 0 ? 'bg-brand-accent text-brand-bg' :
                      i === 1 ? 'bg-brand-muted text-brand-bg' :
                      i === 2 ? 'bg-amber-700 text-white' :
                      'bg-brand-elevated text-brand-muted'
                    }`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-brand-text truncate">
                        {entry.displayName}
                      </div>
                      <div className="text-xs text-brand-muted">
                        Lv.{entry.level} · {entry.levelTitle}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-brand-primaryText flex-shrink-0">
                      {entry.totalXp.toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowInviteModal(false)}
        >
          <div
            className="bg-brand-surface border border-brand-border rounded-2xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-brand-text mb-2">Join a League</h3>
            <p className="text-sm text-brand-muted mb-4">
              Enter the invite code from your commissioner to join their league.
            </p>
            <input
              type="text"
              className="input text-center text-lg tracking-wider uppercase mb-3"
              placeholder="ABC123"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              maxLength={6}
              onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
            />
            {joinError && (
              <p className="text-sm text-brand-danger mb-3">{joinError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowInviteModal(false); setInviteCode(''); setJoinError(''); }}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleJoinByCode}
                disabled={joining || !inviteCode.trim()}
                className="btn-primary flex-1"
              >
                {joining ? 'Joining...' : 'Join League'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mock Draft Modal */}
      {showMockModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowMockModal(false)}
        >
          <div
            className="bg-brand-surface border border-brand-border rounded-2xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-brand-text mb-2 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-accent" /> Start a Mock Draft
            </h3>
            <p className="text-sm text-brand-muted mb-4">
              Create an instant practice league filled with AI bots so you can test
              the full draft experience end-to-end. You'll be dropped straight into
              the draft room with the bots auto-picking around you.
            </p>

            {/* Sport selector */}
            <label className="block text-sm font-medium text-brand-text mb-1.5">Sport</label>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {(['NFL', 'MLB'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setMockSport(s)}
                  className={`p-2.5 rounded-lg border text-sm font-medium transition-all ${
                    mockSport === s
                      ? 'border-brand-primary bg-brand-primary/10 text-brand-text'
                      : 'border-brand-border bg-brand-elevated text-brand-muted hover:border-brand-primary/50'
                  }`}
                >
                  {sportIcon(s)} {s}
                </button>
              ))}
            </div>

            {/* Bot count selector */}
            <label className="block text-sm font-medium text-brand-text mb-1.5">
              Number of AI Teams (you + bots): <span className="text-brand-accent">{mockNumBots + 1}</span> total
            </label>
            <input
              type="range"
              min={1}
              max={11}
              value={mockNumBots}
              onChange={(e) => setMockNumBots(Number(e.target.value))}
              className="w-full mb-1 accent-brand-primary"
            />
            <div className="flex justify-between text-xs text-brand-muted mb-4">
              <span>1 bot</span>
              <span>11 bots</span>
            </div>

            {/* Draft position picker */}
            <label className="block text-sm font-medium text-brand-text mb-1.5">
              Your Draft Position (pick #{mockDraftPosition} of {mockNumBots + 1})
            </label>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {Array.from({ length: mockNumBots + 1 }, (_, i) => i + 1).map((pos) => (
                <button
                  key={pos}
                  onClick={() => setMockDraftPosition(pos)}
                  className={`w-9 h-9 rounded-lg border text-sm font-semibold transition-all ${
                    mockDraftPosition === pos
                      ? 'border-brand-primary bg-brand-primary text-white'
                      : 'border-brand-border bg-brand-elevated text-brand-muted hover:border-brand-primary/50'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
            <p className="text-xs text-brand-muted mb-4 -mt-2">
              Snake draft — picks reverse each round. Pick #1 starts round 1; pick #{mockNumBots + 1} starts round 2.
            </p>

            {mockError && (
              <p className="text-sm text-brand-danger mb-3">{mockError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowMockModal(false); setMockError(''); }}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleMockDraft}
                disabled={mockStarting}
                className="btn-primary flex-1"
              >
                {mockStarting ? 'Setting up...' : 'Start Mock Draft'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
