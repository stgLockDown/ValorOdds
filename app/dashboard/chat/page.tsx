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
          AI Chat is available to paid members. Upgrade to get AI-powered
          betting analysis with conversation history.
        </p>
        <Link href="/pricing" className="btn-primary mt-4 w-fit">
          Upgrade
        </Link>
      </div>
    );
  }

  // Use dynamic viewport units (dvh) so the chat fits the actual visible area
  // on mobile, accounting for the browser's URL bar collapsing. We also clamp
  // a minimum height so it doesn't become unusably short on tiny screens.
  return (
    <div className="card p-0 overflow-hidden h-[calc(100dvh-10rem)] min-h-[420px] lg:h-[calc(100dvh-9rem)]">
      <ChatClient
        user={{
          id: user.id,
          email: user.email!,
          tier: user.tier,
          discordId: user.discordId ?? null,
        }}
      />
    </div>
  );
}