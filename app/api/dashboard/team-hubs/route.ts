import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboard/team-hubs
 *
 * Returns the user's followed teams and a hub feed for each:
 *  - upcoming games
 *  - recent finals
 *  - latest injuries
 *
 * If the user follows nothing yet, returns an empty `hubs` array plus a
 * `suggestions` array of popular teams so the picker can offer them.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 1. Read the user's followed teams
  const prefsRes = await query(
    `SELECT teams FROM web_user_preferences WHERE user_id = $1`,
    [session.user.id]
  );
  const teams: string[] = prefsRes.rows[0]?.teams || [];

  if (teams.length === 0) {
    // Serve a handful of popular teams as picker suggestions
    const suggestions = await query(
      `SELECT sport, team, COUNT(*)::int AS mentions
         FROM (
           SELECT sport, home_team AS team FROM games WHERE game_date > NOW() - INTERVAL '30 days'
           UNION ALL
           SELECT sport, away_team AS team FROM games WHERE game_date > NOW() - INTERVAL '30 days'
         ) t
        WHERE team IS NOT NULL AND team <> ''
        GROUP BY sport, team
        ORDER BY mentions DESC
        LIMIT 24`
    ).catch(() => ({ rows: [] as any[] }));

    return NextResponse.json({
      hubs: [],
      suggestions: suggestions.rows,
    });
  }

  // 2. For each followed team, pull a small feed.
  const hubs = await Promise.all(teams.map(async (teamName) => {
    const [upcoming, finals, injuries] = await Promise.all([
      query(
        `SELECT game_id, sport, home_team, away_team, game_date, status, venue
           FROM games
          WHERE (home_team ILIKE $1 OR away_team ILIKE $1)
            AND is_final = FALSE
            AND game_date > NOW() - INTERVAL '2 hours'
          ORDER BY game_date ASC
          LIMIT 5`,
        [teamName]
      ).catch(() => ({ rows: [] as any[] })),

      query(
        `SELECT game_id, sport, home_team, away_team, home_score, away_score,
                game_date, updated_at
           FROM games
          WHERE (home_team ILIKE $1 OR away_team ILIKE $1)
            AND is_final = TRUE
          ORDER BY game_date DESC
          LIMIT 5`,
        [teamName]
      ).catch(() => ({ rows: [] as any[] })),

      query(
        `SELECT player_name, team, sport, status, injury_type, description, updated_at
           FROM injuries
          WHERE team ILIKE $1
          ORDER BY updated_at DESC
          LIMIT 10`,
        [teamName]
      ).catch(() => ({ rows: [] as any[] })),
    ]);

    return {
      team: teamName,
      upcoming: upcoming.rows,
      recent_finals: finals.rows,
      injuries: injuries.rows,
    };
  }));

  return NextResponse.json({ hubs, suggestions: [] });
}

/**
 * POST /api/dashboard/team-hubs
 * body: { teams: string[] } — replaces the user's followed team list
 * body: { add: string }     — append a single team
 * body: { remove: string }  — remove a single team
 */
const PostBody = z.object({
  teams:  z.array(z.string().trim().min(1).max(100)).max(40).optional(),
  add:    z.string().trim().min(1).max(100).optional(),
  remove: z.string().trim().min(1).max(100).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = PostBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }
  const { teams, add, remove } = parsed.data;

  // Make sure a preferences row exists
  await query(
    `INSERT INTO web_user_preferences (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [session.user.id]
  );

  let final: string[] = [];

  if (teams) {
    final = [...new Set(teams)];
    await query(
      `UPDATE web_user_preferences SET teams = $2, updated_at = NOW() WHERE user_id = $1`,
      [session.user.id, final]
    );
  } else if (add) {
    const cur = await query(
      `SELECT teams FROM web_user_preferences WHERE user_id = $1`,
      [session.user.id]
    );
    const existing: string[] = cur.rows[0]?.teams || [];
    if (!existing.some(t => t.toLowerCase() === add.toLowerCase())) {
      existing.push(add);
    }
    final = existing;
    await query(
      `UPDATE web_user_preferences SET teams = $2, updated_at = NOW() WHERE user_id = $1`,
      [session.user.id, final]
    );
  } else if (remove) {
    const cur = await query(
      `SELECT teams FROM web_user_preferences WHERE user_id = $1`,
      [session.user.id]
    );
    const existing: string[] = cur.rows[0]?.teams || [];
    final = existing.filter(t => t.toLowerCase() !== remove.toLowerCase());
    await query(
      `UPDATE web_user_preferences SET teams = $2, updated_at = NOW() WHERE user_id = $1`,
      [session.user.id, final]
    );
  } else {
    return NextResponse.json({ error: 'Must provide teams, add, or remove' }, { status: 400 });
  }

  return NextResponse.json({ ok: true, teams: final });
}