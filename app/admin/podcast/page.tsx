import { auth } from '@/lib/auth';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import PodcastStudioClient from './PodcastStudioClient';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Podcast Studio — Admin' };

export default async function AdminPodcastPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return <div className="p-8">Not authorized</div>;
  }

  return (
    <>
      <Navbar />
      <PodcastStudioClient />
      <Footer />
    </>
  );
}
