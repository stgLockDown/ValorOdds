import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { listEpisodes, PODCAST_NAME, durationLabel, type PodcastEpisode } from '@/lib/podcast';

export const dynamic = 'force-dynamic';

/**
 * "Beyond the Odds" — the ValorOdds podcast.
 *
 * HIDDEN FROM THE PUBLIC for now: non-admins get a 404 (notFound()) so the
 * area's existence never leaks; admins can browse and test the experience.
 * The page also sets noindex metadata and robots.ts disallows /podcast.
 * When the show is ready to launch, drop the notFound() gate and the
 * robots entry — everything else is launch-ready.
 */

export const metadata: Metadata = {
  title: `${PODCAST_NAME} — Valor Odds Podcast`,
  description: 'The ValorOdds podcast: sports analytics, market moves, and the stories behind the odds.',
  robots: { index: false, follow: false, nocache: true },
};

function EpisodeCard({ ep }: { ep: PodcastEpisode }) {
  const dur = durationLabel(ep.durationSeconds);
  return (
    <Link
      href={`/podcast/${ep.slug}`}
      className="card-interactive group flex gap-4 p-4 sm:p-5"
    >
      {/* Thumbnail from YouTube, else gradient placeholder */}
      {ep.youtubeId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://i.ytimg.com/vi/${ep.youtubeId}/mqdefault.jpg`}
          alt=""
          className="w-28 h-16 sm:w-36 sm:h-[81px] rounded-md object-cover shrink-0 bg-brand-bg-secondary"
          loading="lazy"
        />
      ) : (
        <div className="w-28 h-16 sm:w-36 sm:h-[81px] rounded-md shrink-0 bg-gradient-to-br from-brand-primary/30 to-brand-primary/5 flex items-center justify-center">
          <span className="text-brand-primary text-xs font-semibold">BtO</span>
        </div>
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {ep.season != null && ep.episodeNumber != null && (
            <span className="text-[11px] font-semibold text-brand-primary">
              S{ep.season}E{ep.episodeNumber}
            </span>
          )}
          {dur && <span className="text-[11px] text-brand-muted">{dur}</span>}
          {ep.sport && (
            <span className="text-[11px] uppercase tracking-wide text-brand-muted">{ep.sport}</span>
          )}
        </div>
        <h3 className="mt-1 font-semibold text-brand-heading group-hover:text-brand-primary transition-colors line-clamp-2">
          {ep.title}
        </h3>
        {ep.description && (
          <p className="mt-1 text-sm text-brand-muted line-clamp-2">{ep.description}</p>
        )}
      </div>
    </Link>
  );
}

export default async function PodcastPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    // Hidden until launch: outsiders see the standard 404, not a login wall.
    notFound();
  }

  const episodes = await listEpisodes({ status: 'published', limit: 100 });

  return (
    <>
      <Navbar />
      <main className="container-px mx-auto max-w-7xl py-12">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3">
            <span className="badge-primary">Podcast</span>
            <span className="text-xs text-brand-muted">Pre-launch · admins only</span>
          </div>
          <h1 className="mt-4 text-3xl sm:text-5xl font-bold">{PODCAST_NAME}</h1>
          <p className="mt-4 text-brand-muted text-lg">
            Sports analytics, market moves, and the stories behind the odds — from the ValorOdds team.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/podcast/studio" className="btn-primary">
              Watch in the Studio →
            </Link>
          </div>
        </div>

        <div className="mt-10 space-y-4">
          {episodes.length === 0 ? (
            <div className="card p-8 text-center text-brand-muted">
              <p className="font-semibold text-brand-heading">No episodes published yet</p>
              <p className="mt-2 text-sm">
                Add episodes in the{' '}
                <Link href="/admin/podcast" className="text-brand-primary hover:underline">
                  Podcast Studio
                </Link>
                .
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {episodes.map((ep) => (
                <EpisodeCard key={ep.id} ep={ep} />
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
