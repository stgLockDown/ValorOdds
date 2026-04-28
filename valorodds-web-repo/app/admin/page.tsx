import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { query } from '@/lib/db';
import { auth } from '@/lib/auth';
import Link from 'next/link';

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return <div className="p-8">Not authorized</div>;
  }

  const [users, subs, events, last24] = await Promise.all([
    query<{ total: string; with_discord: string; verified: string }>(
      `SELECT COUNT(*)::text AS total,
              SUM(CASE WHEN discord_id IS NOT NULL THEN 1 ELSE 0 END)::text AS with_discord,
              SUM(CASE WHEN email_verified_at IS NOT NULL THEN 1 ELSE 0 END)::text AS verified
       FROM web_users`
    ),
    query<{ tier: string; status: string; c: string }>(
      `SELECT tier, status, COUNT(*)::text AS c
       FROM web_subscriptions
       WHERE status IN ('active','trialing','past_due')
       GROUP BY tier, status`
    ),
    query<{ event_type: string; c: string }>(
      `SELECT event_type, COUNT(*)::text AS c
       FROM web_usage_events
       WHERE created_at > NOW() - INTERVAL '7 days'
       GROUP BY event_type ORDER BY c DESC`
    ),
    query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM web_usage_events WHERE created_at > NOW() - INTERVAL '24 hours'`
    ),
  ]);

  const u = users.rows[0];
  const totalEvents24 = last24.rows[0]?.c ?? '0';

  return (
    <>
      <Navbar />
      <main className="container-px mx-auto max-w-7xl py-12 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold">Admin analytics</h1>
            <p className="text-brand-muted mt-1">Platform-wide metrics for the Valor Odds web app.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/dashboard" className="btn-secondary">Back to dashboard</Link>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total users" value={u?.total ?? '0'} />
          <Stat label="Discord-linked" value={u?.with_discord ?? '0'} />
          <Stat label="Email verified" value={u?.verified ?? '0'} />
          <Stat label="Events (24h)" value={totalEvents24} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card overflow-hidden p-0">
            <div className="px-5 py-3 border-b border-brand-border font-semibold">Active subscriptions</div>
            <table className="w-full text-sm">
              <thead className="text-xs text-brand-muted uppercase">
                <tr>
                  <th className="text-left px-5 py-2">Tier</th>
                  <th className="text-left px-5 py-2">Status</th>
                  <th className="text-right px-5 py-2">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {subs.rows.length === 0 ? (
                  <tr><td colSpan={3} className="px-5 py-4 text-brand-muted">No active subscriptions yet.</td></tr>
                ) : (
                  subs.rows.map((s, i) => (
                    <tr key={i}>
                      <td className="px-5 py-2 font-semibold">{s.tier}</td>
                      <td className="px-5 py-2 text-brand-muted">{s.status}</td>
                      <td className="px-5 py-2 text-right">{s.c}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="card overflow-hidden p-0">
            <div className="px-5 py-3 border-b border-brand-border font-semibold">Events (last 7 days)</div>
            <table className="w-full text-sm">
              <thead className="text-xs text-brand-muted uppercase">
                <tr>
                  <th className="text-left px-5 py-2">Event</th>
                  <th className="text-right px-5 py-2">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {events.rows.map((e, i) => (
                  <tr key={i}>
                    <td className="px-5 py-2">{e.event_type.replace(/_/g, ' ')}</td>
                    <td className="px-5 py-2 text-right">{e.c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wider text-brand-muted">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
    </div>
  );
}