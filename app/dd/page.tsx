import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { getGamificationProfile, getLeaderboard } from '@/lib/dd/gamification';
import { LEVEL_TITLES, xpForLevel } from '@/lib/dd/gamification';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import DDHomeClient from './DDHomeClient';

export const metadata = {
  title: 'DiamondDraft — Fantasy Leagues',
  description: 'Multi-sport fantasy leagues with live drafts, roto scoring, and gamification.',
};

export default async function DDHomePage() {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <>
        <Navbar />
        <div className="mx-auto max-w-4xl px-4 py-20 text-center">
          <h1 className="text-4xl font-bold text-brand-text mb-4">DiamondDraft</h1>
          <p className="text-lg text-brand-muted mb-8">
            Multi-sport fantasy leagues with live drafts, roto scoring, XP, badges, and more.
          </p>
          <a href="/auth/signin" className="btn-primary text-base px-8 py-3">
            Sign in to get started
          </a>
        </div>
        <Footer />
      </>
    );
  }

  // Fetch user's leagues across both sports
  const leaguesRes = await query<{
    id: string; name: string; sport: string; format: string; num_teams: number;
    status: string; season_year: number; team_name: string; is_commissioner: boolean;
    draft_position: number | null; member_count: string; invite_code: string;
  }>(
    `SELECT l.id::text, l.name, l.sport, l.format, l.num_teams, l.status,
            l.season_year, m.team_name, m.is_commissioner, m.draft_position,
            (SELECT COUNT(*)::text FROM dd_league_members lm WHERE lm.league_id = l.id) AS member_count,
            l.invite_code
     FROM dd_leagues l
     JOIN dd_league_members m ON m.league_id = l.id
     WHERE m.user_id = $1
     ORDER BY l.created_at DESC`,
    [BigInt(session.user.id)]
  );

  // Fetch gamification profile
  let profile: Awaited<ReturnType<typeof getGamificationProfile>> | null = null;
  try {
    profile = await getGamificationProfile(session.user.id);
  } catch {
    profile = null;
  }

  // Fetch top-5 leaderboard
  let topPlayers: Awaited<ReturnType<typeof getLeaderboard>> = [];
  try {
    topPlayers = await getLeaderboard(5);
  } catch {
    topPlayers = [];
  }

  const serializedLeagues = leaguesRes.rows.map((l) => ({
    ...l,
    memberCount: parseInt(l.member_count, 10),
  }));

  return (
    <>
      <Navbar />
      <DDHomeClient
        userId={session.user.id}
        leagues={serializedLeagues}
        profile={profile ? {
          level: profile.level,
          totalXp: profile.totalXp,
          levelTitle: profile.levelTitle,
          badges: profile.badges,
          currentStreak: profile.currentStreak,
          bestStreak: profile.bestStreak,
          xpForCurrentLevel: xpForLevel(profile.level),
          xpForNextLevel: xpForLevel(profile.level + 1),
        } : null}
        leaderboard={topPlayers.map((p) => ({
          displayName: p.displayName,
          level: p.level,
          levelTitle: p.levelTitle,
          totalXp: p.totalXp,
        }))}
      />
      <Footer />
    </>
  );
}
