import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { listEpisodes, PODCAST_NAME } from '@/lib/podcast';
import { listArticles } from '@/lib/news-platform';
import StudioWatchClient from './StudioWatchClient';

export const dynamic = 'force-dynamic';

/**
 * "Beyond the Odds" STUDIO — an ESPN-style broadcast watch area.
 *
 * Still hidden from the public pre-launch (same gates as /podcast):
 * non-admins get the standard 404, metadata is noindex, and robots.txt
 * disallows /podcast (covers /podcast/studio).
 *
 * The episode video sits inside a stylized broadcast set — a "screen wall"
 * framed by studio lighting — and broadcast graphics overlap the video
 * itself: network bug, lower-third, and ticker-style metadata.
 */

interface PageProps {
  searchParams: { ep?: string };
}

export const metadata: Metadata = {
  title: `Studio — ${PODCAST_NAME}`,
  description: `Watch ${PODCAST_NAME} in the broadcast studio.`,
  robots: { index: false, follow: false, nocache: true },
};

export default async function StudioPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    // Hidden until launch: outsiders see the standard 404, not a login wall.
    notFound();
  }

  const [episodes, tickerArticles] = await Promise.all([
    listEpisodes({ status: 'published', limit: 100 }),
    listArticles({ status: ['published'], limit: 12 }),
  ]);

  // Headlines for the news ticker strip (same newscast feel as /news reels).
  const ticker = tickerArticles
    .map((a) => ({
      id: a.id,
      text: a.title,
      sport: a.sport,
      href: `/news/${a.slug}`,
    }))
    .filter((t) => t.text);

  return (
    <>
      <Navbar />
      <main className="container-px mx-auto max-w-7xl py-8">
        {/* Studio header / "control room" bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="badge-warning">ON AIR</span>
              <span className="text-xs uppercase tracking-widest text-brand-muted">
                Pre-launch · admins only
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-extrabold">
              The Studio
              <span className="ml-3 font-light text-brand-muted">— {PODCAST_NAME}</span>
            </h1>
            <p className="mt-1 text-sm text-brand-muted">
              Broadcast view with live graphics over the video. Pick an episode from the rundown.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/podcast" className="btn-secondary">
              Classic view
            </Link>
            <Link href="/admin/podcast" className="btn-ghost">
              Manage episodes
            </Link>
          </div>
        </div>

        <StudioWatchClient
          episodes={episodes.map((ep) => ({
            id: ep.id,
            slug: ep.slug,
            title: ep.title,
            description: ep.description,
            showNotesMd: ep.showNotesMd,
            youtubeId: ep.youtubeId,
            audioUrl: ep.audioUrl,
            durationSeconds: ep.durationSeconds,
            season: ep.season,
            episodeNumber: ep.episodeNumber,
            sport: ep.sport,
            tags: ep.tags,
            publishedAt: ep.publishedAt,
          }))}
          initialSlug={searchParams.ep ?? null}
          ticker={ticker}
        />
      </main>
      <Footer />
    </>
  );
}
