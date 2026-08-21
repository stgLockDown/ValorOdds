import { auth } from '@/lib/auth';
import SupportClient from './SupportClient';

export default async function SupportPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return <div className="card p-8">Please sign in to access support.</div>;
  }

  return <SupportClient user={{
    id: session.user.id,
    name: session.user.name || session.user.email,
    email: session.user.email!,
    isAdmin: session.user.isAdmin,
  }} />;
}
