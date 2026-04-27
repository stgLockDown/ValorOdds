import { auth } from '@/lib/auth';
import { getActiveSubscriptionForUser } from '@/lib/subscriptions';
import Link from 'next/link';
import { ArrowRight, MessageSquare, BarChart3, CreditCard, Link as LinkIcon } from 'lucide-react';

export default async function DashboardPage() {
  const session = await auth();
  const user = session!.user;
  const sub = await getActiveSubscriptionForUser(user.id, user.discordId ?? null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Welcome back{user.name ? `, ${user.name}` : ''}</h1>
        <p className="text-brand-muted mt-1">Your Valor Odds dashboard</p>
      </div>

      {user.tier === 'free' ? (
        <div className="card-interactive border-brand-primary/50 ring-1 ring-brand-primary/20">
          <h2 className="text-xl font-semibold">Unlock full access</h2>
          <p className="mt-1 text-brand-muted">
            Upgrade to Premium or VIP for unlimited AI chat, player props predictions, and all 14 sport channels.
          </p>
          <Link href="/pricing" className="btn-primary mt-4">
            See plans <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="card">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-brand-muted">Current plan</div>
              <div className="text-xl font-bold">{user.tier.toUpperCase()}</div>
              {sub?.current_period_end && (
                <div className="text-xs text-brand-muted mt-1">
                  Renews {new Date(sub.current_period_end).toLocaleDateString()}
                  {sub.cancel_at_period_end && ' (set to cancel)'}
                </div>
              )}
            </div>
            <Link href="/account" className="btn-secondary">
              <CreditCard className="h-4 w-4" /> Manage subscription
            </Link>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/dashboard/chat" className="card-interactive group">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold group-hover:text-brand-primary transition-colors">AI chat</h3>
              <p className="text-sm text-brand-muted mt-1">
                Ask anything about betting, odds, or player analysis.
              </p>
            </div>
          </div>
        </Link>
        <Link href="/dashboard/stats" className="card-interactive group">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold group-hover:text-brand-primary transition-colors">Your stats</h3>
              <p className="text-sm text-brand-muted mt-1">
                Usage history, chat totals, and activity timeline.
              </p>
            </div>
          </div>
        </Link>
        {!user.discordId && (
          <Link href="/account/link-discord" className="card-interactive group md:col-span-2 border-amber-500/30">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-300 shrink-0">
                <LinkIcon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold">Link your Discord account</h3>
                <p className="text-sm text-brand-muted mt-1">
                  Connect Discord so your role and entitlements stay in sync across web and Discord.
                </p>
              </div>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}