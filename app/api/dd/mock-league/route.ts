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
  // draftPosition: 1-indexed slot the user wants to draft from (1..totalTeams)
  const requestedPos = Math.max(1, Math.min(totalTeams, Number(body.draftPosition) || 1));

  // Validate team count
  if (totalTeams < 6) {
    // If fewer than 6 total, pad with extra bots to meet the 6-minimum DB constraint
    const extraNeeded = 6 - totalTeams;
    const adjustedBots = numBots + extraNeeded;
    // Clamp draft position to the new total
    const adjustedPos = Math.min(requestedPos, totalTeams + extraNeeded);
    return createMockLeague(session, sport, adjustedBots, totalTeams + extraNeeded, adjustedPos);
  }

  return createMockLeague(session, sport, numBots, totalTeams, requestedPos);
}

async function createMockLeague(
  session: { user: { id: string; email?: string | null } },
  sport: Sport,
  numBots: number,
  totalTeams: number,
  userDraftPosition: number
) {
  const userId = Number(session.user.id);
  const numTeams = Math.max(6, Math.min(12, totalTeams));
  const actualBots = numTeams - 1; // user + (numTeams-1) bots
  // Ensure userDraftPosition is within valid range for the actual numTeams
  const userPos = Math.max(1, Math.min(numTeams, userDraftPosition));

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
      // Non-fatal -- we'll handle empty pool below
    }

    // Clean up old completed mock leagues for this user to keep the DB tidy.
    // Deletes mock leagues (settings->>'isMock' = 'true') that are no longer drafting
    // (status in 'in_season', 'completed', 'archived') and were created by this user.
    try {
      await cleanupOldMockLeagues(userId);
    } catch (err) {
      console.error('[mock-league] cleanup of old mock leagues failed:', err);
      // Non-fatal -- don't block new mock draft creation
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
         VALUES ($1, $2, $3, TRUE, $4, 100)`,
        [leagueId, userId, userTeamName, userPos]
      );

      // memberIds array: index = slot (0-based), maps to the member at that draft position
      const memberIds: { slot: number; memberId: string; isBot: boolean; userId: number }[] =
        new Array(numTeams).fill(null);

      // Place the user at slot (userPos - 1)
      memberIds[userPos - 1] = { slot: userPos - 1, memberId: '', isBot: false, userId };

      // Fill remaining slots with bots
      let botIndex = 0;
      for (let slot = 0; slot < numTeams; slot++) {
        if (slot === userPos - 1) continue; // skip user's slot
        const botTeamName = BOT_TEAM_NAMES[botIndex % BOT_TEAM_NAMES.length];
        const memberRes = await client.query<{ id: string }>(
          `INSERT INTO dd_league_members (league_id, user_id, team_name, is_commissioner, draft_position, faab_budget)
           VALUES ($1, $2, $3, FALSE, $4, 100)
           RETURNING id::text`,
          [leagueId, botUserIds[botIndex], botTeamName, slot + 1]
        );
        memberIds[slot] = {
          slot,
          memberId: memberRes.rows[0].id,
          isBot: true,
          userId: botUserIds[botIndex],
        };
        botIndex++;
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

    // -- 5. Auto-pick for all bot slots that come BEFORE the user's first pick --
    // In a snake draft, round 1 goes slots 0->(N-1). The user is at slot (userPos-1).
    // All slots before the user in round 1 (slots 0..userPos-2) are bots and need
    // to be auto-picked so the draft advances to the user's turn.
    // If userPos == 1 (slot 0), there are no pre-user picks -- user picks first.
    const preUserPicks = userPos - 1;
    for (let i = 0; i < preUserPicks; i++) {
      try {
        await autoPickBestAvailable(result.draftId, sport, seasonYear);
      } catch (err) {
        console.error(`Pre-user auto-pick ${i + 1}/${preUserPicks} failed:`, err);
        break; // stop if something goes wrong; user can still draft
      }
    }

    // Record the mock draft in dd_mock_drafts for tracking
    try {
      await query(
        `INSERT INTO dd_mock_drafts (user_id, sport, league_config, ai_difficulty, ai_tendencies, user_pick_slot, status)
         VALUES ($1, $2, $3, 'average', '{}', $4, 'in_progress')`,
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
          userPos - 1, // 0-indexed slot
        ]
      );
    } catch {
      // Non-fatal -- tracking only
    }

    return NextResponse.json({
      leagueId: String(result.leagueId),
      draftId: String(result.draftId),
      sport,
      numTeams,
      draftRounds,
      userDraftPosition: userPos,
      message: userPos === 1
        ? 'Mock draft created! You pick first -- bots will auto-draft after you.'
        : `Mock draft created! You draft from position #${userPos} -- ${preUserPicks} bot pick${preUserPicks > 1 ? 's' : ''} made before your turn.`,
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

// ── Helper: clean up old completed mock leagues for a user ──
// Removes mock leagues that are no longer drafting along with their bot users,
// draft picks, and members. Keeps the dd_mock_drafts tracking record intact.
async function cleanupOldMockLeagues(userId: number): Promise<void> {
  // Find completed mock leagues where this user is the commissioner
  const oldLeagues = await query<{ id: string }>(
    `SELECT l.id::text
     FROM dd_leagues l
     WHERE l.commissioner_id = $1
       AND l.settings->>'isMock' = 'true'
       AND l.status IN ('in_season', 'completed', 'archived')`,
    [userId]
  );

  if (oldLeagues.rows.length === 0) return;

  for (const row of oldLeagues.rows) {
    const leagueId = BigInt(row.id);
    try {
      await tx(async (client) => {
        // Get the draft id (if any) and bot user ids before deleting
        const draftRow = await client.query<{ id: string }>(
          `SELECT d.id::text FROM dd_drafts d WHERE d.league_id = $1`,
          [leagueId]
        );
        const draftId = draftRow.rows[0]?.id ? BigInt(draftRow.rows[0].id) : null;

        // Get bot user ids (users with bot_no_login password that are members)
        const botUsers = await client.query<{ user_id: string }>(
          `SELECT m.user_id::text FROM dd_league_members m
           JOIN web_users u ON u.id = m.user_id
           WHERE m.league_id = $1 AND u.password_hash = 'bot_no_login'`,
          [leagueId]
        );
        const botUserIds = botUsers.rows.map((r) => BigInt(r.user_id));

        // Delete draft picks
        if (draftId) {
          await client.query(`DELETE FROM dd_draft_picks WHERE draft_id = $1`, [draftId]);
        }
        // Delete draft record
        if (draftId) {
          await client.query(`DELETE FROM dd_drafts WHERE id = $1`, [draftId]);
        }
        // Delete league members
        await client.query(`DELETE FROM dd_league_members WHERE league_id = $1`, [leagueId]);
        // Delete the league
        await client.query(`DELETE FROM dd_leagues WHERE id = $1`, [leagueId]);
        // Delete bot users
        for (const botId of botUserIds) {
          await client.query(`DELETE FROM web_users WHERE id = $1`, [botId]);
        }
      });
    } catch (err) {
      console.error(`[mock-league] Failed to clean up league ${row.id}:`, err);
      // Continue to next league
    }
  }
}

// ── Helper: auto-pick the best available player for the current on-clock bot ──
// Used to pre-fill bot picks before the user's first turn in mock drafts.
async function autoPickBestAvailable(
  draftId: number,
  sport: Sport,
  seasonYear: number,
): Promise<void> {
  // Fetch draft state
  const draft = await queryOne<{
    draft_type: string; status: string; round_count: number;
    current_round: number; current_pick: number;
    league_id: string; num_teams: number;
  }>(
    `SELECT d.draft_type, d.status, d.round_count, d.current_round, d.current_pick,
            d.league_id::text, l.num_teams
     FROM dd_drafts d
     JOIN dd_leagues l ON l.id = d.league_id
     WHERE d.id = $1`,
    [draftId]
  );
  if (!draft) throw new Error('Draft not found');
  if (draft.status !== 'in_progress') throw new Error(`Draft is ${draft.status}`);

  const numTeams = draft.num_teams;
  const rounds = draft.round_count;
  const fullOrder = generateDraftOrder(draft.draft_type as any, numTeams, rounds);

  const picksMade = await queryOne<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM dd_draft_picks WHERE draft_id = $1`,
    [draftId]
  );
  const currentOverallPick = Number(picksMade?.cnt ?? '0') + 1;
  const currentOrderEntry = fullOrder.find((p) => p.overallPick === currentOverallPick);
  if (!currentOrderEntry) throw new Error('Draft is complete');

  const expectedSlot = currentOrderEntry.slot;
  const expectedDraftPosition = expectedSlot + 1;

  // Find the on-clock member
  const onClockMember = await queryOne<{
    id: string; is_bot: boolean;
  }>(
    `SELECT m.id::text,
            (u.password_hash = 'bot_no_login') AS is_bot
     FROM dd_league_members m
     JOIN web_users u ON u.id = m.user_id
     WHERE m.league_id = $1 AND m.draft_position = $2`,
    [draft.league_id, expectedDraftPosition]
  );
  if (!onClockMember) throw new Error('On-clock member not found');
  if (!onClockMember.is_bot) throw new Error('On-clock member is not a bot');

  // Find best available player by rank
  const bestPlayer = await queryOne<{
    id: string; player_name: string; team: string | null; position: string | null;
  }>(
    `SELECT pp.id::text, pp.player_name, pp.team, pp.position
     FROM dd_player_pool pp
     WHERE pp.sport = $1
       AND pp.season_year = $2
       AND pp.id::text NOT IN (
         SELECT player_id FROM dd_draft_picks
         WHERE draft_id = $3 AND player_id IS NOT NULL
       )
       AND pp.player_name NOT IN (
         SELECT player_name FROM dd_draft_picks WHERE draft_id = $3
       )
     ORDER BY pp.rank NULLS LAST, pp.projected_points DESC NULLS LAST
     LIMIT 1`,
    [sport, seasonYear, draftId]
  );
  if (!bestPlayer) throw new Error('No available players to draft');

  const memberIdForPick = BigInt(onClockMember.id);
  const nextOverall = currentOverallPick + 1;
  const nextOrderEntry = fullOrder.find((p) => p.overallPick === nextOverall);
  const isLastPick = currentOverallPick >= numTeams * rounds;
  const nextRound = nextOrderEntry?.round ?? draft.round_count;
  const nextPickInRound = nextOrderEntry?.pickInRound ?? 1;

  await tx(async (client) => {
    await client.query(
      `INSERT INTO dd_draft_picks
        (draft_id, round_num, pick_in_round, overall_pick, member_id,
         player_name, player_id, team, position, sport, is_auto_picked, picked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, NOW())`,
      [
        draftId,
        currentOrderEntry.round,
        currentOrderEntry.pickInRound,
        currentOverallPick,
        memberIdForPick,
        bestPlayer.player_name,
        bestPlayer.id,
        bestPlayer.team,
        bestPlayer.position,
        sport,
      ]
    );

    if (isLastPick) {
      await client.query(
        `UPDATE dd_drafts SET status = 'completed', current_round = $1, current_pick = $2, completed_at = NOW() WHERE id = $3`,
        [draft.round_count, numTeams, draftId]
      );
      await client.query(
        `UPDATE dd_leagues SET status = 'in_season', updated_at = NOW() WHERE id = $1`,
        [draft.league_id]
      );
    } else {
      await client.query(
        `UPDATE dd_drafts SET current_round = $1, current_pick = $2 WHERE id = $3`,
        [nextRound, nextPickInRound, draftId]
      );
    }
  });
}
