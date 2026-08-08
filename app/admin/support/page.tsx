import { auth } from '@/lib/auth';
import AdminSupportClient from './AdminSupportClient';

export default async function AdminSupportPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return <div className="p-8">Not authorized</div>;
  }

  return <AdminSupportClient />;
}
