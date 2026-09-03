import { auth } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import LeagueHomeClient from './LeagueHomeClient';

export const metadata = {
  title: 'League — DiamondDraft',
};

export default async function LeagueHomePage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <>
        <Navbar />
        <div className="mx-auto max-w-2xl px-4 py-20 text-center">
          <h1 className="text-2xl font-bold text-brand-text mb-4">Sign in required</h1>
          <a href="/auth/signin" className="btn-primary">Sign in</a>
        </div>
        <Footer />
      </>
    );
  }

  const leagueId = BigInt(params.id);

  const league = await queryOne<{
    id: string; name: string; sport: string; commissioner_id: string;
    format: string; scoring_preset: string; roster_preset: string;
    num_teams: number; status: string; season_year: number;
    is_public: boolean; invite_code: string; settings: any;
    keeper_type: string; draft_type: string;
  }>(
    `SELECT id::text, name, sport, commissioner_id::text, format, scoring_preset,
            roster_config->>'name' AS roster_preset,
            num_teams, status, season_year, is_public, invite_code,
            settings, keeper_type, settings->>'draftType' AS draft_type
     FROM dd_leagues WHERE id = $1`,
    [leagueId]
  );

  if (!league) {
    return (
      <>
        <Navbar />
        <div className="mx-auto max-w-2xl px-4 py-20 text-center">
          <h1 className="text-2xl font-bold text-brand-text mb-4">League not found</h1>
          <a href="/dd" className="btn-secondary">Back to DiamondDraft</a>
        </div>
        <Footer />
      </>
    );
  }

  // Check membership
  const membership = await queryOne<{
    id: string; is_commissioner: boolean; team_name: string;
    draft_position: number | null; faab_budget: number;
  }>(
    `SELECT id::text, is_commissioner, team_name, draft_position, faab_budget
     FROM dd_league_members WHERE league_id = $1 AND user_id = $2`,
    [leagueId, BigInt(session.user.id)]
  );

  // If private and not a member, block access
  if (!league.is_public && !membership) {
    return (
      <>
        <Navbar />
        <div className="mx-auto max-w-2xl px-4 py-20 text-center">
          <h1 className="text-2xl font-bold text-brand-text mb-4">Private League</h1>
          <p className="text-brand-muted mb-6">
            You need an invite code to join this league.
          </p>
          <a href="/dd" className="btn-secondary">Back to DiamondDraft</a>
        </div>
        <Footer />
      </>
    );
  }

  // Get members
  const membersRes = await query<{
    id: string; user_id: string; team_name: string; is_commissioner: boolean;
    draft_position: number | null; joined_at: string;
    display_name: string | null; email: string;
  }>(
    `SELECT m.id::text, m.user_id::text, m.team_name, m.is_commissioner,
            m.draft_position, m.joined_at,
            u.display_name, u.email
     FROM dd_league_members m
     JOIN web_users u ON u.id = m.user_id
     WHERE m.league_id = $1
     ORDER BY m.is_commissioner DESC, m.draft_position NULLS LAST, m.joined_at`,
    [leagueId]
  );

  // Get draft info if exists
  const draft = await queryOne<{
    id: string; status: string; draft_type: string;
    current_round: number; current_pick: number; round_count: number;
  }>(
    `SELECT id::text, status, draft_type, current_round, current_pick, round_count
     FROM dd_drafts WHERE league_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [leagueId]
  );

  // Count picks if draft is in progress
  let picksMade = 0;
  if (draft && draft.status === 'in_progress') {
    const pickCount = await queryOne<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM dd_draft_picks WHERE draft_id = $1`,
      [BigInt(draft.id)]
    );
    picksMade = parseInt(pickCount?.cnt ?? '0', 10);
  }

  const serializedLeague = {
    ...league,
    settings: typeof league.settings === 'string' ? JSON.parse(league.settings) : league.settings,
  };

  return (
    <>
      <Navbar />
      <LeagueHomeClient
        league={serializedLeague}
        members={membersRes.rows.map((m) => ({
          id: m.id,
          userId: m.user_id,
          teamName: m.team_name,
          isCommissioner: m.is_commissioner,
          draftPosition: m.draft_position,
          displayName: m.display_name ?? m.email.split('@')[0],
        }))}
        membership={membership ? {
          id: membership.id,
          isCommissioner: membership.is_commissioner,
          teamName: membership.team_name,
          draftPosition: membership.draft_position,
          isCommissionerByLeague: league.commissioner_id === String(session.user.id),
          faabBudget: membership.faab_budget,
        } : null}
        draft={draft ? {
          id: draft.id,
          status: draft.status,
          draftType: draft.draft_type,
          currentRound: draft.current_round,
          currentPick: draft.current_pick,
          roundCount: draft.round_count,
          picksMade,
        } : null}
        currentUserId={session.user.id}
        isCommissioner={
          league.commissioner_id === String(session.user.id) || membership?.is_commissioner === true
        }
      />
      <Footer />
    </>
  );
}
