import { auth } from '@/lib/auth';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import NewsStudioClient from './NewsStudioClient';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'News Studio — Admin' };

export default async function AdminNewsPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return <div className="p-8">Not authorized</div>;
  }

  return (
    <>
      <Navbar />
      <NewsStudioClient />
      <Footer />
    </>
  );
}
