import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await query(
    `SELECT teams, players, sportsbooks, sports, default_tab,
            notify_arb, notify_steam, notify_injuries, notify_best_bets, odds_format
     FROM web_user_preferences WHERE user_id = $1`,
    [session.user.id]
  );

  if (result.rows.length === 0) {
    // Return defaults
    return NextResponse.json({
      data: {
        teams: [], players: [], sportsbooks: [], sports: [],
        default_tab: 'overview',
        notify_arb: true, notify_steam: true, notify_injuries: true, notify_best_bets: true,
        odds_format: 'american',
      }
    });
  }

  return NextResponse.json({ data: result.rows[0] });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const {
    teams, players, sportsbooks, sports, default_tab,
    notify_arb, notify_steam, notify_injuries, notify_best_bets, odds_format
  } = body;

  await query(
    `INSERT INTO web_user_preferences
       (user_id, teams, players, sportsbooks, sports, default_tab,
        notify_arb, notify_steam, notify_injuries, notify_best_bets, odds_format)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (user_id) DO UPDATE SET
       teams        = EXCLUDED.teams,
       players      = EXCLUDED.players,
       sportsbooks  = EXCLUDED.sportsbooks,
       sports       = EXCLUDED.sports,
       default_tab  = EXCLUDED.default_tab,
       notify_arb   = EXCLUDED.notify_arb,
       notify_steam = EXCLUDED.notify_steam,
       notify_injuries  = EXCLUDED.notify_injuries,
       notify_best_bets = EXCLUDED.notify_best_bets,
       odds_format  = EXCLUDED.odds_format,
       updated_at   = NOW()`,
    [
      session.user.id,
      teams || [],
      players || [],
      sportsbooks || [],
      sports || [],
      default_tab || 'overview',
      notify_arb ?? true,
      notify_steam ?? true,
      notify_injuries ?? true,
      notify_best_bets ?? true,
      odds_format || 'american',
    ]
  );

  return NextResponse.json({ ok: true });
}