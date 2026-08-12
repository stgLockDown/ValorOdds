import { auth } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import DraftRoomClient from './DraftRoomClient';

export const metadata = {
  title: 'Draft Room — DiamondDraft',
};

export default async function DraftRoomPage({
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

  // Verify league exists and user is a member
  const league = await queryOne<{
    id: string; name: string; sport: string; commissioner_id: string;
    status: string; num_teams: number; roster_preset: string; season_year: number;
  }>(
    `SELECT id::text, name, sport, commissioner_id::text, status, num_teams,
            roster_config->>'name' AS roster_preset, season_year
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

  const membership = await queryOne<{
    id: string; is_commissioner: boolean; team_name: string; draft_position: number | null;
  }>(
    `SELECT id::text, is_commissioner, team_name, draft_position
     FROM dd_league_members WHERE league_id = $1 AND user_id = $2`,
    [leagueId, BigInt(session.user.id)]
  );

  if (!membership) {
    return (
      <>
        <Navbar />
        <div className="mx-auto max-w-2xl px-4 py-20 text-center">
          <h1 className="text-2xl font-bold text-brand-text mb-4">Not a member</h1>
          <p className="text-brand-muted mb-6">You need to join this league to access the draft room.</p>
          <a href={`/dd/league/${params.id}`} className="btn-secondary">League Home</a>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <DraftRoomClient
        leagueId={params.id}
        leagueName={league.name}
        sport={league.sport}
        seasonYear={league.season_year}
        currentMemberId={membership.id}
        currentTeamName={membership.team_name}
        currentDraftPosition={membership.draft_position}
        isCommissioner={league.commissioner_id === String(session.user.id) || membership.is_commissioner}
      />
      <Footer />
    </>
  );
}
