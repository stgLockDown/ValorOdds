import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

export default async function StatsPage() {
  const session = await auth();
  const userId = session!.user.id;

  const { rows: counts } = await query<{ event_type: string; c: string }>(
    `SELECT event_type, COUNT(*)::text AS c
     FROM web_usage_events
     WHERE user_id = $1::bigint
     GROUP BY event_type
     ORDER BY c DESC`,
    [userId]
  );

  const { rows: recent } = await query<{ event_type: string; created_at: Date; metadata: any }>(
    `SELECT event_type, created_at, metadata
     FROM web_usage_events
     WHERE user_id = $1::bigint
     ORDER BY created_at DESC
     LIMIT 20`,
    [userId]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Your stats</h1>
        <p className="text-brand-muted mt-1">Personal usage activity on Valor Odds.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {counts.length === 0 ? (
          <div className="card col-span-full text-sm text-brand-muted">No activity yet.</div>
        ) : (
          counts.map((c) => (
            <div key={c.event_type} className="card">
              <div className="text-xs uppercase tracking-wider text-brand-muted">
                {c.event_type.replace(/_/g, ' ')}
              </div>
              <div className="text-3xl font-bold mt-1">{c.c}</div>
            </div>
          ))
        )}
      </div>
      <div className="card overflow-hidden p-0">
        <div className="px-5 py-3 border-b border-brand-border font-semibold">Recent activity</div>
        <div className="divide-y divide-brand-border">
          {recent.length === 0 ? (
            <div className="px-5 py-4 text-sm text-brand-muted">No recent events.</div>
          ) : (
            recent.map((r, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between text-sm">
                <span className="font-medium">{r.event_type.replace(/_/g, ' ')}</span>
                <span className="text-brand-muted text-xs">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}