import { auth } from '@/lib/auth';
import Link from 'next/link';
import ChatClient from './ChatClient';

export default async function DashboardChatPage() {
  const session = await auth();
  const user = session!.user;

  if (user.tier === 'free') {
    return (
      <div className="card">
        <h1 className="text-2xl font-bold">AI Chat</h1>
        <p className="mt-2 text-brand-muted">
          AI Chat is available to Premium and VIP members. Upgrade to get unlimited AI-powered betting analysis.
        </p>
        <Link href="/pricing" className="btn-primary mt-4 w-fit">
          Upgrade
        </Link>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-200px)] min-h-[520px] flex flex-col card p-0 overflow-hidden">
      <ChatClient user={{ id: user.id, email: user.email!, tier: user.tier, discordId: user.discordId ?? null }} />
    </div>
  );
}