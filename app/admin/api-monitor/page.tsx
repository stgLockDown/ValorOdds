import { auth } from '@/lib/auth';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ApiMonitorClient from './ApiMonitorClient';

export const dynamic = 'force-dynamic';

export default async function ApiMonitorPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return <div className="p-8">Not authorized</div>;
  }

  return (
    <>
      <Navbar />
      <ApiMonitorClient />
      <Footer />
    </>
  );
}
