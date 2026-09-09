import { auth } from '@/lib/auth';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import MarketingStudioClient from './MarketingStudioClient';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Marketing Studio — Admin' };

export default async function AdminMarketingPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return <div className="p-8">Not authorized</div>;
  }

  return (
    <>
      <Navbar />
      <MarketingStudioClient />
      <Footer />
    </>
  );
}
