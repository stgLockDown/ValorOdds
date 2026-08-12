/**
 * DiamondDraft — Gamification Engine
 *
 * XP awarding, level calculation, badge checking, and streak tracking.
 * All XP events are logged to dd_xp_events and user totals are maintained
 * in dd_user_xp.
 */

import { query, queryOne, tx } from '@/lib/db';

// ──────────────────────────────────────────────
// Level definitions (sport-neutral)
// ──────────────────────────────────────────────

export interface LevelInfo {
  level: number;
  title: string;
  minXp: number;
  maxXp: number | null;
}

// XP curve: each level requires progressively more XP.
// Level N requires: baseXP * (N-1) + cumulative bonus
// Roughly: Level 1 = 0, Level 10 = 3,000, Level 25 = 15,000, Level 50 = 100,000
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  // Quadratic-ish growth
  return Math.round(100 * Math.pow(level - 1, 1.5));
}

export const MAX_LEVEL = 50;

export const LEVEL_TITLES: string[] = [
  // Level 1-10
  'Rookie', 'Rookie', 'Rookie', 'Prospect', 'Prospect',
  'Prospect', 'Starter', 'Starter', 'Starter', 'Double-A',
  // Level 11-20
  'Double-A', 'Double-A', 'Double-A', 'Triple-A', 'Triple-A',
  'Triple-A', 'Triple-A', 'All-Star', 'All-Star', 'All-Star',
  // Level 21-30
  'Major Leaguer', 'Major Leaguer', 'Major Leaguer', 'Major Leaguer', 'Pro Bowler',
  'Pro Bowler', 'Pro Bowler', 'Silver Slugger', 'Silver Slugger', 'Silver Slugger',
  // Level 31-40
  'MVP Candidate', 'MVP Candidate', 'MVP Candidate', 'MVP Candidate', 'MVP Candidate',
  'MVP Candidate', 'MVP', 'MVP', 'MVP', 'MVP',
  // Level 41-50
  'MVP', 'Hall of Fame', 'Hall of Fame', 'Hall of Fame', 'Hall of Fame',
  'Hall of Fame', 'Hall of Fame', 'Hall of Fame', 'Hall of Fame', 'Hall of Fame',
];

export function getLevelInfo(level: number): LevelInfo {
  const clamped = Math.max(1, Math.min(MAX_LEVEL, level));
  return {
    level: clamped,
    title: LEVEL_TITLES[clamped - 1] ?? 'Rookie',
    minXp: xpForLevel(clamped),
    maxXp: clamped < MAX_LEVEL ? xpForLevel(clamped + 1) : null,
  };
}

export function levelFromXp(totalXp: number): LevelInfo {
  let level = 1;
  for (let l = 1; l <= MAX_LEVEL; l++) {
    if (totalXp >= xpForLevel(l)) {
      level = l;
    } else {
      break;
    }
  }
  return getLevelInfo(level);
}

export function xpToNextLevel(totalXp: number): { current: number; needed: number; pct: number } {
  const info = levelFromXp(totalXp);
  if (info.level >= MAX_LEVEL) {
    return { current: totalXp - info.minXp, needed: 0, pct: 100 };
  }
  const nextMin = xpForLevel(info.level + 1);
  const current = totalXp - info.minXp;
  const needed = nextMin - info.minXp;
  const pct = Math.min(100, Math.round((current / needed) * 100));
  return { current, needed, pct };
}

// ──────────────────────────────────────────────
// XP event types and awards
// ──────────────────────────────────────────────

export const XP_AWARDS: Record<string, number> = {
  // League actions
  create_league:        100,
  join_league:          50,
  complete_draft:       200,
  make_draft_pick:      10,
  // Roster actions
  set_lineup:           5,
  add_player:           5,
  drop_player:          3,
  make_waiver_claim:    8,
  // Trades
  propose_trade:        15,
  complete_trade:       25,
  // Social
  send_chat_message:    2,
  post_trash_talk:      5,
  // Matchups
  win_matchup:          50,
  tie_matchup:          15,
  // Mock drafts
  complete_mock_draft:  30,
  // Season
  finish_season:        100,
  win_championship:     500,
  make_playoffs:        150,
  // Streaks (bonus XP)
  streak_bonus:         20, // per consecutive win beyond 3
};

export type XpEventType = keyof typeof XP_AWARDS;

// ──────────────────────────────────────────────
// Badge checking
// ──────────────────────────────────────────────

export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  tier: number;
}

export async function getBadgeCatalog(): Promise<BadgeDef[]> {
  const r = await query<BadgeDef>(
    `SELECT id, name, description, icon, category, tier FROM dd_badges ORDER BY tier, name`
  );
  return r.rows;
}

interface UserXpRow {
  user_id: string;
  total_xp: string;
  level: number;
  level_title: string;
  current_streak: number;
  best_streak: number;
  badges: any[];
  last_action_at: string | null;
}

export interface GamificationProfile {
  userId: string;
  totalXp: number;
  level: number;
  levelTitle: string;
  currentStreak: number;
  bestStreak: number;
  badges: string[];
  xpToNext: { current: number; needed: number; pct: number };
  lastActionAt: string | null;
}

export async function getGamificationProfile(userId: string | number): Promise<GamificationProfile> {
  const row = await queryOne<UserXpRow>(
    `SELECT user_id::text, total_xp::text, level, level_title,
            current_streak, best_streak, badges, last_action_at
     FROM dd_user_xp WHERE user_id = $1`,
    [userId]
  );

  if (!row) {
    // Return a fresh profile
    return {
      userId: String(userId),
      totalXp: 0,
      level: 1,
      levelTitle: 'Rookie',
      currentStreak: 0,
      bestStreak: 0,
      badges: [],
      xpToNext: { current: 0, needed: 100, pct: 0 },
      lastActionAt: null,
    };
  }

  const totalXp = parseInt(row.total_xp, 10);
  return {
    userId: row.user_id,
    totalXp,
    level: row.level,
    levelTitle: row.level_title,
    currentStreak: row.current_streak,
    bestStreak: row.best_streak,
    badges: Array.isArray(row.badges) ? row.badges : [],
    xpToNext: xpToNextLevel(totalXp),
    lastActionAt: row.last_action_at,
  };
}

// ──────────────────────────────────────────────
// Award XP — core function
// ──────────────────────────────────────────────

export interface XpAwardResult {
  awarded: number;
  newTotalXp: number;
  newLevel: number;
  newLevelTitle: string;
  leveledUp: boolean;
  newBadges: string[];
  streakUpdated: boolean;
}

/**
 * Award XP to a user for an action. Handles:
 * - Creating/updating dd_user_xp row
 * - Logging the event in dd_xp_events
 * - Recalculating level and level title
 * - Checking for newly-earned badges
 * - Updating streaks (for win_matchup events)
 *
 * Returns the result including whether the user leveled up and any new badges.
 */
export async function awardXp(
  userId: string | number,
  eventType: XpEventType,
  options: {
    leagueId?: string | number;
    metadata?: Record<string, unknown>;
    /** Override the default XP amount */
    amount?: number;
  } = {}
): Promise<XpAwardResult> {
  const xpAmount = options.amount ?? XP_AWARDS[eventType] ?? 0;
  if (xpAmount === 0) {
    return {
      awarded: 0,
      newTotalXp: 0,
      newLevel: 1,
      newLevelTitle: 'Rookie',
      leveledUp: false,
      newBadges: [],
      streakUpdated: false,
    };
  }

  return await tx(async (client) => {
    // Ensure the user has an XP row
    await client.query(
      `INSERT INTO dd_user_xp (user_id, total_xp, level, level_title)
       VALUES ($1, 0, 1, 'Rookie')
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );

    // Log the XP event
    await client.query(
      `INSERT INTO dd_xp_events (user_id, event_type, xp_amount, league_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, eventType, xpAmount, options.leagueId ?? null, JSON.stringify(options.metadata ?? {})]
    );

    // Get current state
    const currentRes = await client.query<{ total_xp: string; level: number; level_title: string; current_streak: number; best_streak: number; badges: any[] }>(
      `SELECT total_xp::text, level, level_title, current_streak, best_streak, badges
       FROM dd_user_xp WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    const current = currentRes.rows[0];
    const oldLevel = current.level;
    const oldTotalXp = parseInt(current.total_xp, 10);
    const newTotalXp = oldTotalXp + xpAmount;

    // Calculate new level
    const newLevelInfo = levelFromXp(newTotalXp);
    const leveledUp = newLevelInfo.level > oldLevel;

    // Handle streak updates for win_matchup
    let newStreak = current.current_streak;
    let newBestStreak = current.best_streak;
    let streakUpdated = false;

    if (eventType === 'win_matchup') {
      newStreak = current.current_streak + 1;
      newBestStreak = Math.max(current.best_streak, newStreak);
      streakUpdated = true;
    } else if (eventType === 'tie_matchup' || eventType === 'lose_matchup') {
      if (current.current_streak > 0) {
        newStreak = 0;
        streakUpdated = true;
      }
    }

    // Check for new badges
    const newBadges: string[] = [];
    const existingBadges: string[] = Array.isArray(current.badges) ? current.badges : [];

    // Level-based badges
    const levelBadges: Record<number, string> = {
      10: 'climber',
      21: 'major_leaguer',
      31: 'all_star',
      41: 'mvp',
      50: 'hall_of_fame',
    };
    if (levelBadges[newLevelInfo.level] && !existingBadges.includes(levelBadges[newLevelInfo.level])) {
      newBadges.push(levelBadges[newLevelInfo.level]);
    }

    // Streak badges
    if (eventType === 'win_matchup') {
      if (newStreak >= 3 && !existingBadges.includes('streak_hot')) newBadges.push('streak_hot');
      if (newStreak >= 5 && !existingBadges.includes('streak_fire')) newBadges.push('streak_fire');
      if (newStreak >= 10 && !existingBadges.includes('streak_unstoppable')) newBadges.push('streak_unstoppable');
    }

    // Event-based badges (checked via count queries)
    if (eventType === 'create_league' && !existingBadges.includes('commissioner')) {
      newBadges.push('commissioner');
    }
    if (eventType === 'complete_draft' && !existingBadges.includes('first_draft')) {
      newBadges.push('first_draft');
    }
    if (eventType === 'complete_trade' && !existingBadges.includes('first_trade')) {
      // Check total trades
      const tradeCountRes = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM dd_xp_events WHERE user_id = $1 AND event_type = 'complete_trade'`,
        [userId]
      );
      if (tradeCountRes.rows[0].cnt >= 1) newBadges.push('first_trade');
      if (tradeCountRes.rows[0].cnt >= 10 && !existingBadges.includes('trade_master')) newBadges.push('trade_master');
    }
    if (eventType === 'complete_mock_draft') {
      const mockCountRes = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM dd_xp_events WHERE user_id = $1 AND event_type = 'complete_mock_draft'`,
        [userId]
      );
      if (mockCountRes.rows[0].cnt >= 10 && !existingBadges.includes('draft_scholar')) newBadges.push('draft_scholar');
    }

    // Deduplicate
    const uniqueNewBadges = [...new Set(newBadges)].filter((b) => !existingBadges.includes(b));
    const allBadges = [...existingBadges, ...uniqueNewBadges];

    // Update the user XP row
    await client.query(
      `UPDATE dd_user_xp SET
         total_xp = $2,
         level = $3,
         level_title = $4,
         current_streak = $5,
         best_streak = $6,
         badges = $7,
         last_action_at = NOW(),
         updated_at = NOW()
       WHERE user_id = $1`,
      [userId, newTotalXp, newLevelInfo.level, newLevelInfo.title, newStreak, newBestStreak, JSON.stringify(allBadges)]
    );

    return {
      awarded: xpAmount,
      newTotalXp,
      newLevel: newLevelInfo.level,
      newLevelTitle: newLevelInfo.title,
      leveledUp,
      newBadges: uniqueNewBadges,
      streakUpdated,
    };
  });
}

/**
 * Check and award milestone badges that require aggregate queries
 * (e.g., "Post 100 league chat messages" → trash_talker badge).
 * Called periodically or after relevant actions.
 */
export async function checkMilestoneBadges(userId: string | number): Promise<string[]> {
  const profile = await getGamificationProfile(userId);
  const existing = new Set(profile.badges);
  const earned: string[] = [];

  // Trash talker: 100 chat messages
  if (!existing.has('trash_talker')) {
    const r = await queryOne<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM dd_xp_events WHERE user_id = $1 AND event_type = 'send_chat_message'`,
      [userId]
    );
    if (r && parseInt(r.cnt, 10) >= 100) earned.push('trash_talker');
  }

  // Veteran: 3+ seasons
  if (!existing.has('veteran')) {
    const r = await queryOne<{ cnt: string }>(
      `SELECT COUNT(DISTINCT season_year)::text AS cnt
       FROM dd_season_results sr
       JOIN dd_league_members lm ON lm.id = sr.member_id
       WHERE lm.user_id = $1`,
      [userId]
    );
    if (r && parseInt(r.cnt, 10) >= 3) earned.push('veteran');
  }

  if (earned.length > 0) {
    const allBadges = [...profile.badges, ...earned];
    await query(
      `UPDATE dd_user_xp SET badges = $2, updated_at = NOW() WHERE user_id = $1`,
      [userId, JSON.stringify(allBadges)]
    );
  }

  return earned;
}

/**
 * Get the global XP leaderboard.
 */
export async function getLeaderboard(limit = 50): Promise<(GamificationProfile & { displayName: string; badgeCount: number })[]> {
  const r = await query<{
    user_id: string;
    display_name: string;
    avatar_url: string | null;
    total_xp: string;
    level: number;
    level_title: string;
    current_streak: number;
    best_streak: number;
    badge_count: string;
  }>(
    `SELECT user_id::text, display_name, avatar_url,
            total_xp::text, level, level_title,
            current_streak, best_streak,
            jsonb_array_length(badges)::text AS badge_count
     FROM dd_leaderboard
     LIMIT $1`,
    [limit]
  );

  return r.rows.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    totalXp: parseInt(row.total_xp, 10),
    level: row.level,
    levelTitle: row.level_title,
    currentStreak: row.current_streak,
    bestStreak: row.best_streak,
    badgeCount: parseInt(row.badge_count, 10),
    badges: [],
    xpToNext: xpToNextLevel(parseInt(row.total_xp, 10)),
    lastActionAt: null,
  }));
}
