const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

// ─── Helper ────────────────────────────────────────────────────
const requireDB = (_req, res) => {
  if (!pool) {
    res.status(503).json({ error: 'Database not connected' });
    return false;
  }
  return true;
};

// Helper: convert American odds to display string
const fmtOdds = (v) => {
  if (v == null) return '—';
  const n = Number(v);
  return n > 0 ? `+${n}` : `${n}`;
};

// Helper: sport key → emoji + label
const sportMeta = (raw) => {
  const s = (raw || '').toLowerCase();
  if (s.includes('nfl') || s.includes('football'))          return { emoji: '🏈', label: 'NFL',     badge: 'football' };
  if (s.includes('nba') || s.includes('basketball'))        return { emoji: '🏀', label: 'NBA',     badge: 'basketball' };
  if (s.includes('mlb') || s.includes('baseball'))          return { emoji: '⚾', label: 'MLB',     badge: 'baseball' };
  if (s.includes('nhl') || s.includes('hockey'))            return { emoji: '🏒', label: 'NHL',     badge: 'hockey' };
  if (s.includes('soccer') || s.includes('mls') || s.includes('epl') || s.includes('football_'))
    return { emoji: '⚽', label: 'Soccer', badge: 'soccer' };
  if (s.includes('ufc') || s.includes('mma'))               return { emoji: '🥊', label: 'MMA',     badge: 'mma' };
  if (s.includes('tennis'))                                  return { emoji: '🎾', label: 'Tennis',  badge: 'tennis' };
  if (s.includes('ncaa') || s.includes('college'))           return { emoji: '🏫', label: 'NCAAF',   badge: 'football' };
  return { emoji: '🎯', label: raw || 'Sports', badge: 'other' };
};

// Helper: profit % → tier
const profitTier = (pct) => {
  if (pct >= 2.5) return 'high';
  if (pct >= 1.5) return 'medium';
  return 'low';
};

// ================================================================
// GET /api/opportunities/arbitrage
// Recent arbitrage opportunities from the bot's table
// ================================================================
router.get('/arbitrage', async (req, res) => {
  if (!requireDB(req, res)) return;

  const limit = Math.min(parseInt(req.query.limit) || 12, 50);
  const sport = req.query.sport || null;

  try {
    let query, params;

    if (sport) {
      query = `
        SELECT * FROM arbitrage_opportunities
        WHERE detected_at > NOW() - INTERVAL '48 hours'
          AND sport ILIKE $1
        ORDER BY detected_at DESC
        LIMIT $2
      `;
      params = [`%${sport}%`, limit];
    } else {
      query = `
        SELECT * FROM arbitrage_opportunities
        WHERE detected_at > NOW() - INTERVAL '48 hours'
        ORDER BY profit_percentage DESC, detected_at DESC
        LIMIT $1
      `;
      params = [limit];
    }

    const { rows } = await pool.query(query, params);

    const opportunities = rows.map((r) => {
      const meta = sportMeta(r.sport);
      return {
        id: r.id,
        sport: meta.label,
        sportEmoji: meta.emoji,
        sportBadge: meta.badge,
        homeTeam: r.home_team,
        awayTeam: r.away_team,
        commenceTime: r.commence_time,
        marketType: r.market_type || 'h2h',
        side1: {
          bookmaker: r.side1_bookmaker,
          selection: r.side1_selection,
          odds: fmtOdds(r.side1_odds),
          stake: r.side1_stake ? Number(r.side1_stake).toFixed(2) : null,
        },
        side2: {
          bookmaker: r.side2_bookmaker,
          selection: r.side2_selection,
          odds: fmtOdds(r.side2_odds),
          stake: r.side2_stake ? Number(r.side2_stake).toFixed(2) : null,
        },
        profitPct: r.profit_percentage ? Number(r.profit_percentage).toFixed(2) : '0.00',
        profitTier: profitTier(Number(r.profit_percentage || 0)),
        guaranteedProfit: r.guaranteed_profit ? Number(r.guaranteed_profit).toFixed(2) : '0.00',
        isUsOnly: r.is_us_only,
        detectedAt: r.detected_at,
      };
    });

    res.json({ count: opportunities.length, opportunities });
  } catch (err) {
    console.error('Error fetching arbitrage opportunities:', err.message);
    res.status(500).json({ error: 'Failed to fetch arbitrage opportunities' });
  }
});

// ================================================================
// GET /api/opportunities/player-props
// Notable player stats from the bot's player_stats table
// ================================================================
router.get('/player-props', async (req, res) => {
  if (!requireDB(req, res)) return;

  const limit = Math.min(parseInt(req.query.limit) || 12, 50);
  const sport = req.query.sport || null;

  try {
    let query, params;

    if (sport) {
      query = `
        SELECT ps.*, g.home_team as game_home, g.away_team as game_away,
               g.status as game_status, g.game_date
        FROM player_stats ps
        LEFT JOIN games g ON ps.game_id = g.game_id
        WHERE ps.recorded_at > NOW() - INTERVAL '48 hours'
          AND ps.sport ILIKE $1
          AND ps.is_notable = TRUE
        ORDER BY ps.fantasy_score DESC, ps.recorded_at DESC
        LIMIT $2
      `;
      params = [`%${sport}%`, limit];
    } else {
      query = `
        SELECT ps.*, g.home_team as game_home, g.away_team as game_away,
               g.status as game_status, g.game_date
        FROM player_stats ps
        LEFT JOIN games g ON ps.game_id = g.game_id
        WHERE ps.recorded_at > NOW() - INTERVAL '48 hours'
          AND ps.is_notable = TRUE
        ORDER BY ps.fantasy_score DESC, ps.recorded_at DESC
        LIMIT $1
      `;
      params = [limit];
    }

    const { rows } = await pool.query(query, params);

    const props = rows.map((r) => {
      const meta = sportMeta(r.sport);
      
      // Build key stats string based on sport
      const keyStats = [];
      if (r.points > 0)              keyStats.push(`${r.points} PTS`);
      if (r.rebounds > 0)            keyStats.push(`${r.rebounds} REB`);
      if (r.assists > 0)             keyStats.push(`${r.assists} AST`);
      if (r.three_pointers_made > 0) keyStats.push(`${r.three_pointers_made} 3PM`);
      if (r.yards > 0)               keyStats.push(`${r.yards} YDS`);
      if (r.touchdowns > 0)          keyStats.push(`${r.touchdowns} TD`);
      if (r.goals > 0)               keyStats.push(`${r.goals} G`);
      if (r.home_runs > 0)           keyStats.push(`${r.home_runs} HR`);
      if (r.rbis > 0)                keyStats.push(`${r.rbis} RBI`);
      if (r.hits > 0)                keyStats.push(`${r.hits} H`);
      if (r.strikeouts > 0)          keyStats.push(`${r.strikeouts} K`);
      if (r.saves > 0)               keyStats.push(`${r.saves} SV`);

      return {
        id: r.id,
        sport: meta.label,
        sportEmoji: meta.emoji,
        sportBadge: meta.badge,
        playerName: r.player_name,
        team: r.team,
        teamAbbrev: r.team_abbrev,
        position: r.position,
        keyStats: keyStats.join(' | ') || 'Notable performance',
        fantasyScore: r.fantasy_score ? Number(r.fantasy_score).toFixed(1) : null,
        notableReason: r.notable_reason || '',
        game: r.game_home && r.game_away ? `${r.game_away} @ ${r.game_home}` : '',
        gameDate: r.game_date,
        recordedAt: r.recorded_at,
      };
    });

    res.json({ count: props.length, props });
  } catch (err) {
    console.error('Error fetching player props:', err.message);
    res.status(500).json({ error: 'Failed to fetch player props' });
  }
});

// ================================================================
// GET /api/opportunities/ai-analysis
// AI-generated analysis from the bot
// ================================================================
router.get('/ai-analysis', async (req, res) => {
  if (!requireDB(req, res)) return;

  const limit = Math.min(parseInt(req.query.limit) || 6, 20);
  const type = req.query.type || null;

  try {
    let query, params;

    if (type) {
      query = `
        SELECT * FROM ai_analysis
        WHERE generated_at > NOW() - INTERVAL '48 hours'
          AND analysis_type = $1
        ORDER BY generated_at DESC
        LIMIT $2
      `;
      params = [type, limit];
    } else {
      query = `
        SELECT * FROM ai_analysis
        WHERE generated_at > NOW() - INTERVAL '48 hours'
        ORDER BY generated_at DESC
        LIMIT $1
      `;
      params = [limit];
    }

    const { rows } = await pool.query(query, params);

    const analyses = rows.map((r) => ({
      id: r.id,
      type: r.analysis_type,
      model: r.model,
      content: r.content,
      confidence: r.confidence ? Number(r.confidence).toFixed(0) : null,
      generatedAt: r.generated_at,
    }));

    res.json({ count: analyses.length, analyses });
  } catch (err) {
    console.error('Error fetching AI analysis:', err.message);
    res.status(500).json({ error: 'Failed to fetch AI analysis' });
  }
});

// ================================================================
// GET /api/opportunities/games
// Today's games from the bot's games table
// ================================================================
router.get('/games', async (req, res) => {
  if (!requireDB(req, res)) return;

  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const live = req.query.live === 'true';

  try {
    let query, params;

    if (live) {
      query = `
        SELECT * FROM games
        WHERE is_live = TRUE
        ORDER BY game_date
        LIMIT $1
      `;
      params = [limit];
    } else {
      query = `
        SELECT * FROM games
        WHERE game_date >= CURRENT_DATE
          AND game_date < CURRENT_DATE + INTERVAL '2 days'
        ORDER BY is_live DESC, game_date ASC
        LIMIT $1
      `;
      params = [limit];
    }

    const { rows } = await pool.query(query, params);

    const games = rows.map((r) => {
      const meta = sportMeta(r.sport);
      return {
        id: r.id,
        gameId: r.game_id,
        sport: meta.label,
        sportEmoji: meta.emoji,
        sportBadge: meta.badge,
        homeTeam: r.home_team,
        homeAbbrev: r.home_team_abbrev,
        awayTeam: r.away_team,
        awayAbbrev: r.away_team_abbrev,
        venue: r.venue,
        gameDate: r.game_date,
        status: r.status,
        statusDetail: r.status_detail,
        homeScore: r.home_score,
        awayScore: r.away_score,
        period: r.period,
        clock: r.clock,
        isLive: r.is_live,
        isFinal: r.is_final,
      };
    });

    res.json({ count: games.length, games });
  } catch (err) {
    console.error('Error fetching games:', err.message);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
});

// ================================================================
// GET /api/opportunities/summary
// Quick summary stats for the hero section
// ================================================================
router.get('/summary', async (req, res) => {
  if (!requireDB(req, res)) return;

  try {
    const [arbRes, gamesRes, propsRes] = await Promise.all([
      pool.query(`
        SELECT COUNT(*) as count,
               COALESCE(MAX(profit_percentage), 0) as best_profit,
               COALESCE(AVG(profit_percentage), 0) as avg_profit
        FROM arbitrage_opportunities
        WHERE detected_at > NOW() - INTERVAL '24 hours'
      `),
      pool.query(`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN is_live = TRUE THEN 1 ELSE 0 END) as live
        FROM games
        WHERE game_date >= CURRENT_DATE
          AND game_date < CURRENT_DATE + INTERVAL '2 days'
      `),
      pool.query(`
        SELECT COUNT(*) as count
        FROM player_stats
        WHERE recorded_at > NOW() - INTERVAL '24 hours'
          AND is_notable = TRUE
      `),
    ]);

    res.json({
      arbitrage: {
        count: parseInt(arbRes.rows[0].count),
        bestProfit: Number(arbRes.rows[0].best_profit).toFixed(2),
        avgProfit: Number(arbRes.rows[0].avg_profit).toFixed(2),
      },
      games: {
        total: parseInt(gamesRes.rows[0].total),
        live: parseInt(gamesRes.rows[0].live),
      },
      playerProps: {
        notable: parseInt(propsRes.rows[0].count),
      },
    });
  } catch (err) {
    console.error('Error fetching summary:', err.message);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

module.exports = router;