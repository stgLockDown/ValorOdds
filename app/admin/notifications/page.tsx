import { auth } from '@/lib/auth';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import AdminNotificationsClient from './AdminNotificationsClient';

export const dynamic = 'force-dynamic';

export default async function AdminNotificationsPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return <div className="p-8">Not authorized</div>;
  }

  return (
    <>
      <Navbar />
      <AdminNotificationsClient />
      <Footer />
    </>
  );
}
