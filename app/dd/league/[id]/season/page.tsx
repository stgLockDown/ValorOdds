import { auth } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import SeasonClient from './SeasonClient';

export const metadata = {
  title: 'Head-to-Head \u2014 DiamondDraft',
};

export default async function SeasonPage({
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
    id: string; name: string; is_public: boolean;
  }>(
    `SELECT id::text, name, is_public FROM dd_leagues WHERE id = $1`,
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

  const membership = await queryOne<{ id: string }>(
    `SELECT id::text FROM dd_league_members WHERE league_id = $1 AND user_id = $2`,
    [leagueId, BigInt(session.user.id)]
  );

  if (!league.is_public && !membership) {
    return (
      <>
        <Navbar />
        <div className="mx-auto max-w-2xl px-4 py-20 text-center">
          <h1 className="text-2xl font-bold text-brand-text mb-4">Private League</h1>
          <p className="text-brand-muted mb-6">You need an invite code to view this league.</p>
          <a href="/dd" className="btn-secondary">Back to DiamondDraft</a>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-primaryText">
            {league.name}
          </p>
          <h1 className="text-2xl font-bold text-brand-text mt-1">Head-to-Head</h1>
          <p className="text-sm text-brand-muted mt-1">
            Weekly matchups, your starting lineup, and the league standings.
          </p>
        </div>
        <SeasonClient leagueId={league.id} leagueName={league.name} />
      </main>
      <Footer />
    </>
  );
}
