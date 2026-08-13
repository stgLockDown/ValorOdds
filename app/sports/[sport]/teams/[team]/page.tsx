import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Navbar from '@/components/MarketingNavbar';
import Footer from '@/components/Footer';
import Breadcrumbs from '@/components/Breadcrumbs';
import {
  buildMetadata,
  sportsEventJsonLd,
  canonical,
  SPORTS,
} from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';
import {
  getTeamsBySport,
  getGamesByTeam,
  teamSlug,
} from '@/lib/public-data';
import { formatTeamName } from '@/lib/espn-scores';

/**
 * Per-team hub page: /sports/[sport]/teams/[team]
 *
 * Long-tail SEO target: "Team Name odds", "Team Name schedule", "Team Name
 * betting". Lists the team's upcoming slate, each linking to the per-game
 * page, and emits SportsEvent JSON-LD for the upcoming games.
 */

export const revalidate = 600;
export const dynamicParams = true;

function findSport(slug: string) {
  return SPORTS.find((s) => s.slug === slug);
}

type Params = { params: { sport: string; team: string } };

/** Resolve the canonical team display name from its slug for this sport. */
async function resolveTeam(sportCode: string, slug: string): Promise<string | null> {
  const teams = await getTeamsBySport(sportCode);
  return teams.find((t) => teamSlug(t) === slug) || null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const sport = findSport(params.sport);
  if (!sport) return { title: 'Not Found' };
  const team = await resolveTeam(sport.code, params.team);
  if (!team) {
    return buildMetadata({
      title: `${sport.name} Team Odds`,
      description: `Live ${sport.fullName} team odds and schedules from Valor Odds.`,
      path: `/sports/${sport.slug}/teams/${params.team}`,
      noindex: true,
    });
  }
  const title = `${team} Odds, Schedule & Betting`;
  const desc = `Upcoming ${team} games with the best moneyline odds across every major sportsbook, plus arbitrage and AI player-prop analysis from Valor Odds.`;
  return buildMetadata({
    title,
    description: desc,
    path: `/sports/${sport.slug}/teams/${params.team}`,
    keywords: [
      `${team.toLowerCase()} odds`,
      `${team.toLowerCase()} schedule`,
      `${team.toLowerCase()} betting`,
      `${team.toLowerCase()} moneyline`,
      `${sport.name.toLowerCase()} odds`,
    ],
    image: `/api/og?title=${encodeURIComponent(team)}&subtitle=${encodeURIComponent('Schedule · odds · arbitrage')}&kicker=${encodeURIComponent(sport.name)}`,
  });
}

function formatGameTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return iso;
  }
}

export default async function TeamHubPage({ params }: Params) {
  const sport = findSport(params.sport);
  if (!sport) notFound();
  const team = await resolveTeam(sport.code, params.team);
  if (!team) notFound();

  const games = await getGamesByTeam(sport.code, team, 24);
  const url = canonical(`/sports/${sport.slug}/teams/${params.team}`);

  const eventLd = games
    .slice(0, 10)
    .map((g) =>
      sportsEventJsonLd({
        name: `${formatTeamName(g.awayTeam)} at ${formatTeamName(g.homeTeam)}`,
        url: canonical(`/games/${sport.slug}/${encodeURIComponent(g.gameId)}`),
        startDate: g.commenceTime,
        homeTeam: formatTeamName(g.homeTeam),
        awayTeam: formatTeamName(g.awayTeam),
        sport: sport.fullName,
      }),
    );

  return (
    <>
      <JsonLd data={eventLd} />
      <Navbar />

      <main className="container-px mx-auto max-w-5xl py-12">
        <Breadcrumbs
          items={[
            { name: 'Home', url: canonical('/') },
            { name: 'Sports', url: canonical('/sports') },
            { name: sport.name, url: canonical(`/sports/${sport.slug}`) },
            { name: team, url },
          ]}
        />

        <header className="max-w-3xl">
          <div className="text-xs uppercase tracking-widest text-brand-accent">
            {sport.fullName}
          </div>
          <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold leading-tight">
            {team} odds &amp; schedule
          </h1>
          <p className="mt-4 text-brand-muted text-lg">
            Every upcoming {team} game with the best moneyline price across all tracked
            sportsbooks. Click any matchup for a full odds breakdown and implied probabilities.
          </p>
        </header>

        <section className="mt-10">
          <h2 className="text-2xl font-bold">Upcoming {team} games</h2>
          {games.length === 0 ? (
            <p className="mt-4 text-brand-muted">
              No upcoming {team} games are in the feed right now. Schedules and odds refresh
              continuously — check back soon.
            </p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {games.map((g) => (
                <li
                  key={g.gameId}
                  className="rounded-xl border border-brand-border bg-brand-surface p-4"
                >
                  <div className="text-xs text-brand-muted">{formatGameTime(g.commenceTime)}</div>
                  <div className="mt-1 font-semibold">
                    {formatTeamName(g.awayTeam)} <span className="text-brand-muted">@</span> {formatTeamName(g.homeTeam)}
                  </div>
                  <Link
                    href={`/games/${sport.slug}/${encodeURIComponent(g.gameId)}`}
                    className="mt-2 inline-block text-xs text-brand-accent hover:underline"
                  >
                    See full odds →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-bold">More {sport.name} markets</h2>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link href={`/sports/${sport.slug}`} className="badge-secondary">
              All {sport.name} odds
            </Link>
            <Link href={`/sports/${sport.slug}/odds/moneyline`} className="badge-secondary">
              {sport.name} moneyline
            </Link>
            <Link href={`/sports/${sport.slug}/odds/player-props`} className="badge-secondary">
              {sport.name} player props
            </Link>
            <Link href={`/arbitrage/${sport.slug}`} className="badge-secondary">
              {sport.name} arbitrage
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
