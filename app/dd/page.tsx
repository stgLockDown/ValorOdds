import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { getGamificationProfile, getLeaderboard } from '@/lib/dd/gamification';
import { LEVEL_TITLES, xpForLevel } from '@/lib/dd/gamification';
import { buildMetadata, diamondDraftJsonLd, breadcrumbJsonLd, SITE } from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import DDHomeClient from './DDHomeClient';

export const metadata: Metadata = buildMetadata({
  title: 'DiamondDraft — Free Fantasy Sports Leagues',
  description:
    'Create or join free multi-sport fantasy leagues with live snake drafts, roto scoring, XP and badges, and gamification. Fantasy baseball, football, and basketball with commissioner tools and real-time draft rooms.',
  path: '/dd',
  keywords: [
    'fantasy sports',
    'fantasy sports draft',
    'fantasy baseball',
    'fantasy football',
    'fantasy basketball',
    'fantasy league',
    'roto fantasy',
    'live fantasy draft',
    'snake draft',
    'diamonddraft',
    'diamond draft',
    'fantasy commissioner',
  ],
  image: `${SITE.url}/api/og?title=${encodeURIComponent('DiamondDraft')}&subtitle=${encodeURIComponent('Free Fantasy Sports Leagues')}`,
  imageAlt: 'DiamondDraft — free fantasy sports leagues with live drafts',
});

export default async function DDHomePage() {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <>
        <JsonLd data={diamondDraftJsonLd()} />
        <JsonLd data={breadcrumbJsonLd([
          { name: 'Home', url: SITE.url },
          { name: 'DiamondDraft', url: `${SITE.url}/dd` },
        ])} />
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

  // Fetch user's leagues across both sports.
  // Wrapped in try/catch so a transient DB error (pool exhaustion, cold
  // start, connection timeout) degrades gracefully to an empty league list
  // instead of crashing the whole page with a 500.
  let leaguesRes: { rows: Array<{
    id: string; name: string; sport: string; format: string; num_teams: number;
    status: string; season_year: number; team_name: string; is_commissioner: boolean;
    draft_position: number | null; member_count: string; invite_code: string;
  }> } = { rows: [] };
  try {
    leaguesRes = await query<{
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
         AND NOT (
           -- Hide completed mock drafts: mock leagues whose draft is done
           (l.settings->>'isMock' = 'true')
           AND l.draft_id IS NOT NULL
           AND l.status IN ('in_season', 'completed', 'archived')
         )
       ORDER BY l.created_at DESC`,
      [BigInt(session.user.id)]
    );
  } catch (err) {
    console.error('[dd/page] Failed to fetch user leagues:', err);
  }

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

  // Fetch public leagues the user has NOT joined yet (for discovery)
  let publicLeagues: {
    id: string; name: string; sport: string; format: string;
    num_teams: number; status: string; season_year: number;
    member_count: number; invite_code: string;
  }[] = [];
  try {
    const pubRes = await query<{
      id: string; name: string; sport: string; format: string;
      num_teams: number; status: string; season_year: number;
      member_count: string; invite_code: string;
    }>(
      `SELECT l.id::text, l.name, l.sport, l.format, l.num_teams, l.status,
              l.season_year, l.invite_code,
              (SELECT COUNT(*)::text FROM dd_league_members lm WHERE lm.league_id = l.id) AS member_count
       FROM dd_leagues l
       WHERE l.is_public = TRUE
         AND l.status IN ('setup','recruiting','pre_draft','predraft')
         AND l.id NOT IN (SELECT league_id FROM dd_league_members WHERE user_id = $1)
       ORDER BY l.created_at DESC LIMIT 20`,
      [BigInt(session.user.id)]
    );
    publicLeagues = pubRes.rows.map((l) => ({
      id: l.id,
      name: l.name,
      sport: l.sport,
      format: l.format,
      num_teams: l.num_teams,
      status: l.status,
      season_year: l.season_year,
      invite_code: l.invite_code,
      member_count: parseInt(l.member_count, 10),
    }));
  } catch {
    publicLeagues = [];
  }

  const serializedLeagues = leaguesRes.rows.map((l) => ({
    ...l,
    memberCount: parseInt(l.member_count, 10),
  }));

  return (
    <>
      <JsonLd data={diamondDraftJsonLd()} />
      <JsonLd data={breadcrumbJsonLd([
        { name: 'Home', url: SITE.url },
        { name: 'DiamondDraft', url: `${SITE.url}/dd` },
      ])} />
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
        publicLeagues={publicLeagues}
      />
      <Footer />
    </>
  );
}
