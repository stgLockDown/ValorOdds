import { auth } from '@/lib/auth';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import AdminApiAccessClient from './AdminApiAccessClient';

export const dynamic = 'force-dynamic';

export default async function AdminApiAccessPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return <div className="p-8">Not authorized</div>;
  }

  return (
    <>
      <Navbar />
      <AdminApiAccessClient />
      <Footer />
    </>
  );
}
