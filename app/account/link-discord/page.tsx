import AuthedSidebarLayout from '@/components/AuthedSidebarLayout';
import { auth } from '@/lib/auth';
import LinkDiscordClient from './LinkDiscordClient';

export default async function LinkDiscordPage() {
  const session = await auth();
  const user = session!.user;

  return (
    <AuthedSidebarLayout user={user}>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Link your Discord account</h1>
          <p className="text-brand-muted mt-1">
            Connect your Discord so your subscription role and entitlements stay in sync across web and Discord.
          </p>
        </div>

        {user.discordId ? (
          <div className="card border-brand-success/50 bg-brand-success/10">
            <div className="font-semibold text-emerald-300">✅ Discord is already linked</div>
            <p className="text-sm text-brand-muted mt-1">
              Discord ID: <code className="text-xs">{user.discordId}</code>
            </p>
            <p className="text-sm text-brand-muted mt-2">
              To unlink, contact support. To sign in with Discord in the future, use the Sign in page.
            </p>
          </div>
        ) : (
          <LinkDiscordClient />
        )}
      </div>
    </AuthedSidebarLayout>
  );
}
