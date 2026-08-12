import { auth } from '@/lib/auth';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import AdminApiPlaygroundClient from './AdminApiPlaygroundClient';

export const dynamic = 'force-dynamic';

export default async function AdminApiPlaygroundPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return <div className="p-8">Not authorized</div>;
  }

  return (
    <>
      <Navbar />
      <AdminApiPlaygroundClient />
      <Footer />
    </>
  );
}
