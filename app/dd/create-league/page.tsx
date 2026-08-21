import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { buildMetadata, SITE } from '@/lib/seo';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import CreateLeagueClient from './CreateLeagueClient';

export const metadata: Metadata = buildMetadata({
  title: 'Create a Fantasy League — DiamondDraft',
  description:
    'Create your own free fantasy sports league on DiamondDraft. Choose your sport, roster size, scoring format, and draft type, then invite friends with a share code. Commissioner controls included.',
  path: '/dd/create-league',
  keywords: [
    'create fantasy league',
    'fantasy league commissioner',
    'fantasy sports draft',
    'snake draft',
    'roto fantasy',
    'fantasy baseball league',
    'fantasy football league',
    'fantasy basketball league',
    'diamonddraft',
  ],
  image: `${SITE.url}/api/og?title=${encodeURIComponent('Create a Fantasy League')}&subtitle=${encodeURIComponent('DiamondDraft')}`,
  imageAlt: 'Create a fantasy league on DiamondDraft',
});

export default async function CreateLeaguePage() {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <>
        <Navbar />
        <div className="mx-auto max-w-2xl px-4 py-20 text-center">
          <h1 className="text-3xl font-bold text-brand-text mb-4">
            Sign in to create a league
          </h1>
          <a href="/auth/signin" className="btn-primary">Sign in</a>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <CreateLeagueClient />
      <Footer />
    </>
  );
}
