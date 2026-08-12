import { auth } from '@/lib/auth';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import CreateLeagueClient from './CreateLeagueClient';

export const metadata = {
  title: 'Create a League — DiamondDraft',
};

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
