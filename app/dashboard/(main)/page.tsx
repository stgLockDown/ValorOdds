import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/signin?callbackUrl=/dashboard');
  return <DashboardClient user={session.user} />;
}