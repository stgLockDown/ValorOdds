import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne, tx } from '@/lib/db';
import { generateDraftOrder, getRosterPreset, getScoringPreset, type Sport, type RosterConfig } from '@/lib/dd/presets';
import { ensurePlayerPool } from '@/lib/dd/player-pool';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/dd/mock-league — Create an instant mock draft league with AI bots
// Body: { sport: 'NFL'|'MLB', numBots: number (1-11) }
// Creates a private league, fills it with bot users, auto-starts a snake draft,
// and auto-picks for all bot slots up to (but not including) the user's first
// pick, so the user lands in the draft room ready to draft.
// ─────────────────────────────────────────────────────────────────────────────

const BOT_NAMES = [
  'TouchdownBot', 'HomerunBot', 'GridironBot', 'DiamondBot',
  'EndzoneBot', 'CurveballBot', 'BlitzBot', 'SluggerBot',
  'PigskinBot', 'FastballBot', 'ClutchBot',
];

const BOT_TEAM_NAMES = [
  'Bot Squad', 'AI All-Stars', 'Robo Roster', 'Silicon Sluggers',
  'Circuit City', 'Data Dodgers', 'Pixel Packers', 'Mega Bots',
  'Turbo Team', 'Neon Nets', 'Cyber Crew',
];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const userId = Number(session.user.id);
  const body = await req.json().catch(() => ({}));

  const sport = (body.sport === 'MLB' ? 'MLB' : 'NFL') as Sport;
  const numBots = Math.max(1, Math.min(11, Number(body.numBots) || 7));
  const totalTeams = numBots + 1; // user + bots

  // Validate team count
  if (totalTeams < 6) {
    // If fewer than 6 total, pad with extra bots to meet the 6-minimum DB constraint
    const extraNeeded = 6 - totalTeams;
    const adjustedBots = numBots + extraNeeded;
    return createMockLeague(session, sport, adjustedBots, totalTeams + extraNeeded);
  }

  return createMockLeague(session, sport, numBots, totalTeams);
}

async function createMockLeague(
  session: { user: { id: string; email?: string | null } },
  sport: Sport,
  numBots: number,
  totalTeams: number
) {
  const userId = Number(session.user.id);
  const numTeams = Math.max(6, Math.min(12, totalTeams));
  const actualBots = numTeams - 1; // user + (numTeams-1) bots

  // Determine season year
  const now = new Date();
  const seasonYear = sport === 'NFL'
    ? (now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1)
    : now.getFullYear();

  // Roster & scoring configs
  const rosterKey = sport === 'NFL' ? 'deep_ppr' : 'standard';
  const scoringKey = sport === 'NFL' ? 'standard_ppr' : 'standard_points';
  const rosterConfig = getRosterPreset(sport, rosterKey);
  const scoringConfig = getScoringPreset(sport, scoringKey);
  const draftRounds = rosterConfig.totalRosterSize;

  try {
    // Ensure the player pool exists for this sport/season
    try {
      await ensurePlayerPool(sport, seasonYear, scoringKey);
    } catch {
      // Non-fatal — we'll handle empty pool below
    }

    // Check we have enough players in the pool
    const poolCount = await queryOne<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM dd_player_pool WHERE sport = $1 AND season_year = $2`,
      [sport, seasonYear]
    );
    const playerCount = parseInt(poolCount?.cnt ?? '0', 10);
    if (playerCount < numTeams * 3) {
      return NextResponse.json(
        { error: `Not enough players in the ${sport} pool (${playerCount} available). Try NFL, which has a full player pool.` },
        { status: 400 }
      );
    }

    const result = await tx(async (client) => {
      // ── 1. Create bot users ──────────────────────────────────────────────
      const botUserIds: number[] = [];
      for (let i = 0; i < actualBots; i++) {
        const botEmail = `dd_bot_${sport}_${Date.now()}_${i}@mock.diamonddraft.local`;
        const botName = BOT_NAMES[i % BOT_NAMES.length];
        const botRes = await client.query<{ id: string }>(
          `INSERT INTO web_users (email, display_name, password_hash)
           VALUES ($1, $2, 'bot_no_login')
           RETURNING id::text`,
          [botEmail, botName]
        );
        botUserIds.push(Number(botRes.rows[0].id));
      }

      // ── 2. Create the mock league ────────────────────────────────────────
      const leagueName = `Mock Draft — ${sport} ${seasonYear}`;
      const inviteCode = generateMockInviteCode();
      const leagueRes = await client.query<{ id: string }>(
        `INSERT INTO dd_leagues
           (name, sport, commissioner_id, format, scoring_preset, num_teams,
            roster_config, scoring_config, lineup_setting, keeper_type,
            is_public, invite_code, status, season_year, settings)
         VALUES ($1, $2, $3, 'h2h_points', $4, $5, $6, $7, 'daily', 'redraft',
                 false, $8, 'drafting', $9, $10)
         RETURNING id::text`,
        [
          leagueName,
          sport,
          userId,
          scoringKey,
          numTeams,
          JSON.stringify(rosterConfig),
          JSON.stringify(scoringConfig),
          inviteCode,
          seasonYear,
          JSON.stringify({ draftType: 'snake', draftRounds, pickTimerSeconds: 90, isMock: true }),
        ]
      );
      const leagueId = Number(leagueRes.rows[0].id);

      // ── 3. Add members: real user at position 1, bots at 2..N ───────────
      const userTeamName = `${session.user.email?.split('@')[0] ?? 'My'} Team`;
      await client.query(
        `INSERT INTO dd_league_members (league_id, user_id, team_name, is_commissioner, draft_position, faab_budget)
         VALUES ($1, $2, $3, TRUE, 1, 100)`,
        [leagueId, userId, userTeamName]
      );

      const memberIds: { slot: number; memberId: string; isBot: boolean; userId: number }[] = [
        { slot: 0, memberId: '', isBot: false, userId },
      ];

      for (let i = 0; i < actualBots; i++) {
        const botTeamName = BOT_TEAM_NAMES[i % BOT_TEAM_NAMES.length];
        const memberRes = await client.query<{ id: string }>(
          `INSERT INTO dd_league_members (league_id, user_id, team_name, is_commissioner, draft_position, faab_budget)
           VALUES ($1, $2, $3, FALSE, $4, 100)
           RETURNING id::text`,
          [leagueId, botUserIds[i], botTeamName, i + 2]
        );
        memberIds.push({
          slot: i + 1,
          memberId: memberRes.rows[0].id,
          isBot: true,
          userId: botUserIds[i],
        });
      }

      // ── 4. Create the draft record (is_mock = true) ─────────────────────
      const draftRes = await client.query<{ id: string }>(
        `INSERT INTO dd_drafts (league_id, draft_type, status, round_count, current_round, current_pick,
                                 pick_timer_seconds, is_mock, ai_difficulty, started_at)
         VALUES ($1, 'snake', 'in_progress', $2, 1, 1, 90, TRUE, 'average', NOW())
         RETURNING id::text`,
        [leagueId, draftRounds]
      );
      const draftId = Number(draftRes.rows[0].id);

      // Link draft to league
      await client.query(
        `UPDATE dd_leagues SET draft_id = $1 WHERE id = $2`,
        [draftId, leagueId]
      );

      return { leagueId, draftId, memberIds };
    });

    // ── 5. Auto-pick for all bot slots up to the user's first pick ────────
    // In a snake draft with the user at slot 0 (pick 1), the user picks first.
    // So we don't auto-pick anything before the user — the user picks #1.
    // But if the user wants bots to have picked first, we'd pick for slots > 0.
    // For the best testing experience, the user picks first (slot 0, overall pick 1),
    // then bots auto-pick after each user pick.
    //
    // However, to make it feel like a real draft where you're "in the middle",
    // let's auto-pick the bot picks that come BEFORE the user's slot in round 1
    // only if the user is NOT slot 0. Since user is always slot 0 (position 1),
    // there are no pre-user picks. The DraftRoomClient polling will handle
    // auto-picking bots after each user pick.

    // Record the mock draft in dd_mock_drafts for tracking
    try {
      await query(
        `INSERT INTO dd_mock_drafts (user_id, sport, league_config, ai_difficulty, ai_tendencies, user_pick_slot, status)
         VALUES ($1, $2, $3, 'average', '{}', 0, 'in_progress')`,
        [
          userId,
          sport,
          JSON.stringify({
            leagueId: result.leagueId,
            draftId: result.draftId,
            numTeams,
            draftRounds,
            sport,
          }),
        ]
      );
    } catch {
      // Non-fatal — tracking only
    }

    return NextResponse.json({
      leagueId: String(result.leagueId),
      draftId: String(result.draftId),
      sport,
      numTeams,
      draftRounds,
      message: 'Mock draft created! You pick first — bots will auto-draft after you.',
    });
  } catch (err: any) {
    console.error('Mock league creation failed:', err);
    return NextResponse.json(
      { error: 'Failed to create mock draft', details: err?.message },
      { status: 500 }
    );
  }
}

function generateMockInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
