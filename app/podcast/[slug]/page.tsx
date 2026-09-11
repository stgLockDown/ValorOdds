import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ArticleBody from '@/components/ArticleBody';
import {
  getEpisodeBySlug,
  PODCAST_NAME,
  durationLabel,
} from '@/lib/podcast';

export const dynamic = 'force-dynamic';

/**
 * Single episode page for the "Beyond the Odds" podcast.
 *
 * Hidden from the public pre-launch (same gate as /podcast): non-admins get
 * a 404, metadata is noindex, and robots.txt disallows /podcast.
 * YouTube-first player with an optional direct-audio fallback.
 */

interface PageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const episode = await getEpisodeBySlug(params.slug);
  if (!episode) return { robots: { index: false, follow: false } };
  return {
    title: `${episode.title} — ${PODCAST_NAME}`,
    description: episode.description ?? `An episode of ${PODCAST_NAME}, the ValorOdds podcast.`,
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function EpisodePage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.isAdmin) notFound();

  const episode = await getEpisodeBySlug(params.slug);
  if (!episode || episode.status !== 'published') notFound();

  const dur = durationLabel(episode.durationSeconds);

  return (
    <>
      <Navbar />
      <main className="container-px mx-auto max-w-3xl py-12">
        <Link href="/podcast" className="text-sm text-brand-muted hover:text-brand-text">
          ← {PODCAST_NAME}
        </Link>

        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <span className="badge-primary">Podcast</span>
          <span className="text-xs text-brand-muted">Pre-launch · admins only</span>
          {episode.season != null && episode.episodeNumber != null && (
            <span className="text-xs font-semibold text-brand-primary">
              S{episode.season}E{episode.episodeNumber}
            </span>
          )}
          {dur && <span className="text-xs text-brand-muted">{dur}</span>}
          {episode.sport && (
            <span className="text-xs uppercase tracking-wide text-brand-muted">{episode.sport}</span>
          )}
        </div>

        <h1 className="mt-3 text-3xl sm:text-4xl font-bold">{episode.title}</h1>
        {episode.description && (
          <p className="mt-3 text-lg text-brand-muted">{episode.description}</p>
        )}
        {episode.publishedAt && (
          <p className="mt-2 text-sm text-brand-muted">
            {new Date(episode.publishedAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        )}

        {/* Player: YouTube embed first, plain audio fallback second */}
        <div className="mt-8">
          {episode.youtubeId ? (
            <div className="rounded-xl overflow-hidden border border-brand-border aspect-video">
              <iframe
                className="w-full h-full"
                src={`https://www.youtube-nocookie.com/embed/${episode.youtubeId}`}
                title={episode.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : episode.audioUrl ? (
            <audio controls className="w-full" preload="none" src={episode.audioUrl}>
              Your browser does not support audio playback.
            </audio>
          ) : (
            <div className="card p-6 text-sm text-brand-muted">
              No player configured for this episode yet.
            </div>
          )}
        </div>

        {/* Show notes */}
        {episode.showNotesMd && (
          <div className="mt-10">
            <h2 className="text-xl font-bold">Show notes</h2>
            <div className="mt-4">
              <ArticleBody markdown={episode.showNotesMd} />
            </div>
          </div>
        )}

        {episode.tags.length > 0 && (
          <div className="mt-8 flex gap-2 flex-wrap">
            {episode.tags.map((t) => (
              <span key={t} className="text-xs rounded-full border border-brand-border px-3 py-1 text-brand-muted">
                #{t}
              </span>
            ))}
          </div>
        )}

        <div className="mt-10 card p-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="font-semibold">{PODCAST_NAME}</p>
            <p className="text-sm text-brand-muted">The ValorOdds podcast</p>
          </div>
          <Link href="/podcast" className="btn-secondary">
            All episodes
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
