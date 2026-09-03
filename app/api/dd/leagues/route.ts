/**
 * DiamondDraft — Leagues API
 *
 * POST   /api/dd/leagues          — Create a new league (becomes commissioner)
 * GET    /api/dd/leagues          — List user's leagues
 * GET    /api/dd/leagues/:id      — Get league details (members, draft status)
 * POST   /api/dd/leagues/:id/join — Join a league via invite code
 * POST   /api/dd/leagues/:id/leave — Leave a league
 * PATCH  /api/dd/leagues/:id      — Update league settings (commissioner only)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { query, queryOne, tx } from '@/lib/db';
import { awardXp } from '@/lib/dd/gamification';
import { ensurePlayerPool } from '@/lib/dd/player-pool';
import {
  type Sport,
  type LeagueFormat,
  type DraftType,
  type KeeperType,
  getRosterPreset,
  getScoringPreset,
  generateDraftOrder,
  SEASON_STRUCTURES,
} from '@/lib/dd/presets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ──────────────────────────────────────────────
// Helper: generate invite code
// ──────────────────────────────────────────────

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function generateUniqueInviteCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateInviteCode();
    const existing = await queryOne(`SELECT id FROM dd_leagues WHERE invite_code = $1`, [code]);
    if (!existing) return code;
  }
  // Fallback with timestamp
  return generateInviteCode() + Date.now().toString(36).slice(-2).toUpperCase();
}

// ──────────────────────────────────────────────
// POST — Create a league
// ──────────────────────────────────────────────

const CreateLeagueSchema = z.object({
  name: z.string().min(3).max(60),
  sport: z.enum(['NFL', 'MLB']),
  format: z.enum(['roto', 'h2h_points', 'h2h_categories', 'points', 'best_ball']),
  scoringPreset: z.string().max(50),
  rosterPreset: z.string().max(50),
  numTeams: z.number().int().min(6).max(24),
  draftType: z.enum(['snake', 'auction', 'linear', '3rr_snake', 'custom']),
  keeperType: z.enum(['redraft', 'keeper', 'dynasty']),
  keeperRounds: z.number().int().min(0).max(20).optional(),
  lineupSetting: z.enum(['daily', 'weekly']).default('daily'),
  isPublic: z.boolean().default(false),
  pickTimerSeconds: z.number().int().min(30).max(300).optional(),
  faabBudget: z.number().int().min(0).max(500).optional(),
  playoffWeeks: z.number().int().min(2).max(8).optional(),
  teamName: z.string().min(2).max(40).optional(),
  // Position limit enforcement (default true)
  enforcePositionLimits: z.boolean().optional(),
  // Dynasty-specific settings
  dynastySettings: z.object({
    /** Carry over entire roster from season to season */
    carryFullRoster: z.boolean().optional(),
    /** Number of rookie draft rounds (for rookie drafts) */
    rookieDraftRounds: z.number().int().min(1).max(10).optional(),
    /** Taxi squad size */
    taxiSquadSize: z.number().int().min(0).max(10).optional(),
    /** IR slots for dynasty */
    irSlots: z.number().int().min(0).max(10).optional(),
  }).optional(),
  // IDP-specific settings
  idpSettings: z.object({
    /** IDP scoring tier: 'light', 'standard', 'heavy' */
    idpScoringTier: z.enum(['light', 'standard', 'heavy']).optional(),
    /** Whether to use individual defensive players instead of team DEF */
    useIndividualDefenders: z.boolean().optional(),
  }).optional(),
  // Defense-only settings (no offensive players, 2 kickers, IDP-heavy)
  defenseOnlySettings: z.object({
    /** No offensive players (QB, RB, WR, TE) are drafted */
    noOffensivePlayers: z.boolean().optional(),
    /** Number of kicker slots (default 2 for defense-only) */
    kickerCount: z.number().int().min(1).max(4).optional(),
  }).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const userId = Number(session.user.id);

  let input: z.infer<typeof CreateLeagueSchema>;
  try {
    input = CreateLeagueSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid input', details: err instanceof z.ZodError ? err.flatten() : undefined },
      { status: 400 }
    );
  }

  // Validate roster and scoring presets exist for the sport
  const rosterConfig = getRosterPreset(input.sport, input.rosterPreset);
  const scoringConfig = getScoringPreset(input.sport, input.scoringPreset);

  // Determine season year
  const now = new Date();
  const seasonYear = input.sport === 'NFL'
    ? (now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1) // NFL season starts in Aug/Sep
    : now.getFullYear();

  // Compute draft rounds based on roster size
  const draftRounds = rosterConfig.totalRosterSize;

  try {
    const inviteCode = await generateUniqueInviteCode();

    const result = await tx(async (client) => {
      // Create the league
      const leagueRes = await client.query<{ id: string }>(
        `INSERT INTO dd_leagues
           (name, sport, commissioner_id, format, scoring_preset, num_teams,
            roster_config, scoring_config, lineup_setting, keeper_type, keeper_rounds,
            is_public, invite_code, status, season_year, settings)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'setup', $14, $15)
         RETURNING id::text`,
        [
          input.name,
          input.sport,
          userId,
          input.format,
          input.scoringPreset,
          input.numTeams,
          JSON.stringify(rosterConfig),
          JSON.stringify(scoringConfig),
          input.lineupSetting,
          input.keeperType,
          input.keeperRounds ?? null,
          input.isPublic,
          inviteCode,
          seasonYear,
          JSON.stringify({
            draftType: input.draftType,
            draftRounds,
            pickTimerSeconds: input.pickTimerSeconds ?? 90,
            faabBudget: input.faabBudget ?? 100,
            playoffWeeks: input.playoffWeeks,
            enforcePositionLimits: input.enforcePositionLimits ?? true,
            dynastySettings: input.dynastySettings ?? null,
            idpSettings: input.idpSettings ?? null,
            defenseOnlySettings: input.defenseOnlySettings ?? null,
          }),
        ]
      );
      const leagueId = leagueRes.rows[0].id;

      // Add commissioner as first member
      const teamName = input.teamName || `${session.user.email?.split('@')[0] ?? 'My'} FC`;
      await client.query(
        `INSERT INTO dd_league_members (league_id, user_id, team_name, is_commissioner, draft_position, faab_budget)
         VALUES ($1, $2, $3, TRUE, 1, $4)`,
        [leagueId, userId, teamName, input.faabBudget ?? 100]
      );

      return { leagueId, inviteCode };
    });

    // Award XP for creating a league
    const xpResult = await awardXp(userId, 'create_league', { leagueId: result.leagueId });

    // Generate the player pool for this sport/season (async, don't block)
    try {
      await ensurePlayerPool(input.sport, seasonYear, input.scoringPreset);
    } catch {
      // Non-fatal — pool can be generated later
    }

    // Fetch the full league
    const league = await queryOne<{
      id: string;
      name: string;
      sport: string;
      format: string;
      scoring_preset: string;
      num_teams: number;
      invite_code: string;
      status: string;
      season_year: number;
    }>(
      `SELECT id::text, name, sport, format, scoring_preset, num_teams, invite_code, status, season_year
       FROM dd_leagues WHERE id = $1::bigint`,
      [result.leagueId]
    );

    return NextResponse.json({
      ok: true,
      league,
      inviteCode: result.inviteCode,
      xpAwarded: xpResult.awarded,
      leveledUp: xpResult.leveledUp,
      newBadges: xpResult.newBadges,
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to create league: ${message}` }, { status: 500 });
  }
}

// ──────────────────────────────────────────────
// GET — List user's leagues or get league by id
// ──────────────────────────────────────────────

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const userId = Number(session.user.id);

  const { searchParams } = new URL(req.url);
  const leagueId = searchParams.get('id');
  const includePublic = searchParams.get('public') === 'true';
  const inviteCode = searchParams.get('inviteCode');

  // Lookup by invite code (works for both public and private leagues)
  if (inviteCode) {
    const league = await queryOne<{
      id: string; name: string; sport: string; format: string;
      num_teams: number; status: string; season_year: number;
      is_public: boolean; invite_code: string;
      member_count: string;
    }>(
      `SELECT l.id::text, l.name, l.sport, l.format, l.num_teams, l.status,
              l.season_year, l.is_public, l.invite_code,
              (SELECT COUNT(*)::text FROM dd_league_members lm WHERE lm.league_id = l.id) AS member_count
       FROM dd_leagues l
       WHERE l.invite_code = $1
         AND l.status IN ('setup','recruiting','pre_draft','predraft')`,
      [inviteCode.toUpperCase()]
    );
    if (!league) {
      return NextResponse.json({ error: 'Invalid invite code or league is no longer accepting members' }, { status: 404 });
    }
    return NextResponse.json({
      league: {
        id: league.id,
        name: league.name,
        sport: league.sport,
        format: league.format,
        num_teams: league.num_teams,
        status: league.status,
        season_year: league.season_year,
        is_public: league.is_public,
        invite_code: league.invite_code,
        member_count: parseInt(league.member_count, 10),
      },
    });
  }

  if (leagueId) {
    // Get specific league with members
    const league = await queryOne<{
      id: string;
      name: string;
      sport: string;
      commissioner_id: string;
      format: string;
      scoring_preset: string;
      num_teams: number;
      roster_config: any;
      scoring_config: any;
      lineup_setting: string;
      keeper_type: string;
      keeper_rounds: number | null;
      is_public: boolean;
      invite_code: string;
      status: string;
      season_year: number;
      draft_id: string | null;
      settings: any;
      created_at: string;
    }>(
      `SELECT id::text, name, sport, commissioner_id::text, format, scoring_preset,
              num_teams, roster_config, scoring_config, lineup_setting, keeper_type,
              keeper_rounds, is_public, invite_code, status, season_year,
              draft_id::text, settings, created_at
       FROM dd_leagues WHERE id = $1::bigint`,
      [leagueId]
    );

    if (!league) {
      return NextResponse.json({ error: 'League not found' }, { status: 404 });
    }

    // Check if user is a member
    const membership = await queryOne<{ id: string; team_name: string; is_commissioner: boolean; draft_position: number | null; faab_budget: number }>(
      `SELECT id::text, team_name, is_commissioner, draft_position, faab_budget
       FROM dd_league_members WHERE league_id = $1::bigint AND user_id = $2`,
      [leagueId, userId]
    );

    // Get all members
    const membersRes = await query<{
      id: string;
      user_id: string;
      team_name: string;
      is_commissioner: boolean;
      draft_position: number | null;
      joined_at: string;
      display_name: string | null;
      email: string;
    }>(
      `SELECT m.id::text, m.user_id::text, m.team_name, m.is_commissioner,
              m.draft_position, m.joined_at,
              u.display_name, u.email
       FROM dd_league_members m
       JOIN web_users u ON u.id = m.user_id
       WHERE m.league_id = $1::bigint
       ORDER BY m.draft_position NULLS LAST, m.joined_at`,
      [leagueId]
    );

    // If private and user is not a member, restrict info
    if (!league.is_public && !membership) {
      return NextResponse.json({ error: 'League not found' }, { status: 404 });
    }

    return NextResponse.json({
      league: {
        ...league,
        commissioner_id: league.commissioner_id,
        settings: league.settings,
      },
      members: membersRes.rows.map((m) => ({
        ...m,
        displayName: m.display_name ?? m.email.split('@')[0],
      })),
      membership: membership
        ? {
            id: membership.id,
            teamName: membership.team_name,
            isCommissioner: membership.is_commissioner,
            draftPosition: membership.draft_position,
            faabBudget: membership.faab_budget,
          }
        : null,
      isCommissioner: league.commissioner_id === String(userId) || membership?.is_commissioner,
    });
  }

  // List user's leagues
  const myLeagues = await query<{
    id: string;
    name: string;
    sport: string;
    format: string;
    num_teams: number;
    status: string;
    season_year: number;
    team_name: string;
    is_commissioner: boolean;
    draft_position: number | null;
    member_count: string;
    invite_code: string;
  }>(
    `SELECT l.id::text, l.name, l.sport, l.format, l.num_teams, l.status,
            l.season_year, m.team_name, m.is_commissioner, m.draft_position,
            (SELECT COUNT(*)::text FROM dd_league_members lm WHERE lm.league_id = l.id) AS member_count,
            l.invite_code
     FROM dd_leagues l
     JOIN dd_league_members m ON m.league_id = l.id
     WHERE m.user_id = $1
     ORDER BY l.updated_at DESC`,
    [userId]
  );

  // Optionally include public leagues for discovery
  let publicLeagues: typeof myLeagues.rows = [];
  if (includePublic) {
    const pubRes = await query(
      `SELECT l.id::text, l.name, l.sport, l.format, l.num_teams, l.status,
              l.season_year, NULL AS team_name, FALSE AS is_commissioner, NULL AS draft_position,
              (SELECT COUNT(*)::text FROM dd_league_members lm WHERE lm.league_id = l.id) AS member_count,
              l.invite_code
       FROM dd_leagues l
       WHERE l.is_public = TRUE AND l.status = 'setup'
         AND l.id NOT IN (SELECT league_id FROM dd_league_members WHERE user_id = $1)
       ORDER BY l.created_at DESC LIMIT 20`,
      [userId]
    );
    publicLeagues = pubRes.rows as typeof myLeagues.rows;
  }

  return NextResponse.json({
    myLeagues: myLeagues.rows,
    publicLeagues,
  });
}
