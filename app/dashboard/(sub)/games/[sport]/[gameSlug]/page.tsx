import { redirect } from 'next/navigation';

/**
 * Redirects bare /dashboard/games/[sport]/[gameSlug] URLs to the default
 * `details` tab so users never see a 404 when a link omits the tab segment.
 */
export default function GameSlugRedirect({
  params,
}: {
  params: { sport: string; gameSlug: string };
}) {
  redirect(`/dashboard/games/${params.sport}/${encodeURIComponent(params.gameSlug)}/details`);
}
