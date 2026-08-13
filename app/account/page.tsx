import AuthedSidebarLayout from '@/components/AuthedSidebarLayout';
import { auth } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { getActiveSubscriptionForUser } from '@/lib/subscriptions';
import { isStripeConfigured } from '@/lib/stripe';
import ManageBillingButton from './ManageBillingButton';
import Link from 'next/link';
import { KeyRound } from 'lucide-react';

export default async function AccountPage({ searchParams }: { searchParams: { checkout?: string } }) {
  const session = await auth();
  const user = session!.user;

  const profile = await queryOne<{
    email: string;
    display_name: string | null;
    avatar_url: string | null;
    discord_id: string | null;
    email_verified_at: Date | null;
    created_at: Date;
  }>(
    `SELECT email, display_name, avatar_url, discord_id, email_verified_at, created_at
     FROM web_users WHERE id = $1::bigint`,
    [user.id]
  );

  const sub = await getActiveSubscriptionForUser(user.id, user.discordId ?? null);
  const billingAvailable = isStripeConfigured();

  return (
    <AuthedSidebarLayout user={user}>
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Account</h1>
          <p className="text-brand-muted mt-1">Your profile, subscription, and linked Discord.</p>
        </div>

        {searchParams.checkout === 'success' && (
          <div className="card border-brand-success/50 bg-brand-success/10">
            <div className="font-semibold text-emerald-300">🎉 Your subscription is active!</div>
            <p className="text-sm text-brand-muted mt-1">
              Welcome aboard. Your Discord role will be updated within a few seconds.
            </p>
          </div>
        )}

        <div className="card">
          <h2 className="text-lg font-semibold">Profile</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-brand-muted text-xs uppercase tracking-wider">Email</dt>
              <dd className="mt-1">{profile?.email}</dd>
            </div>
            <div>
              <dt className="text-brand-muted text-xs uppercase tracking-wider">Display name</dt>
              <dd className="mt-1">{profile?.display_name || '—'}</dd>
            </div>
            <div>
              <dt className="text-brand-muted text-xs uppercase tracking-wider">Email verified</dt>
              <dd className="mt-1">{profile?.email_verified_at ? '✅ Verified' : '⚠️ Not verified'}</dd>
            </div>
            <div>
              <dt className="text-brand-muted text-xs uppercase tracking-wider">Member since</dt>
              <dd className="mt-1">
                {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-brand-muted text-xs uppercase tracking-wider">Discord</dt>
              <dd className="mt-1">
                {profile?.discord_id ? (
                  <>✅ Linked (Discord ID: <code className="text-xs">{profile.discord_id}</code>)</>
                ) : (
                  <Link href="/account/link-discord" className="text-brand-primary hover:underline">
                    Link your Discord account →
                  </Link>
                )}
              </dd>
            </div>
          </dl>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold">Subscription</h2>
          {sub ? (
            <>
              <div className="mt-4 flex items-center gap-2">
                <span className="badge-primary">{sub.tier.toUpperCase()}</span>
                <span className="badge">{sub.status}</span>
                {sub.cancel_at_period_end && <span className="badge-warning">Cancels at period end</span>}
              </div>
              {sub.current_period_end && (
                <p className="text-sm text-brand-muted mt-2">
                  {sub.cancel_at_period_end ? 'Ends' : 'Renews'} {new Date(sub.current_period_end).toLocaleDateString()}
                </p>
              )}
              <div className="mt-4 flex gap-3 flex-wrap">
                {billingAvailable ? (
                  <ManageBillingButton />
                ) : (
                  <span className="text-xs text-brand-muted">
                    We couldn&apos;t load your billing details right now. Please try again in a
                    few minutes, or{' '}
                    <Link href="/dashboard/support" className="text-brand-primary hover:underline">
                      contact support
                    </Link>{' '}
                    if the problem continues.
                  </span>
                )}
                <Link href="/pricing" className="btn-secondary">Change plan</Link>
              </div>
            </>
          ) : (
            <div className="mt-4">
              <p className="text-sm text-brand-muted">You&apos;re currently on the Free tier.</p>
              {billingAvailable ? (
                <Link href="/pricing" className="btn-primary mt-3">Upgrade</Link>
              ) : (
                <p className="text-xs text-brand-muted mt-3">
                  Upgrades are temporarily unavailable while we finalize billing. Check back shortly.
                </p>
              )}
            </div>
          )}
        </div>

        <Link href="/api-access/manage" className="card p-5 flex items-center justify-between hover:border-brand-primary/50 transition-colors group">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-brand-primary/10 p-2.5">
              <KeyRound className="h-5 w-5 text-brand-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">API Dashboard</h2>
              <p className="text-sm text-brand-muted">Manage your API keys, monitor usage, and control overage billing.</p>
            </div>
          </div>
          <span className="text-brand-primary group-hover:translate-x-1 transition-transform">→</span>
        </Link>
      </div>
    </AuthedSidebarLayout>
  );
}