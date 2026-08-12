'use client';

import Link from 'next/link';
import { useState } from 'react';
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

export default function DDHomeClient({
  userId,
  leagues,
  profile,
  leaderboard,
}: {
  userId: string;
  leagues: League[];
  profile: Profile | null;
  leaderboard: LeaderboardEntry[];
}) {
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);

  const sportIcon = (sport: string) =>
    sport === 'NFL' ? <Shield className="w-5 h-5" /> : <Target className="w-5 h-5" />;

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
        <div className="flex gap-3">
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
    </div>
  );
}
