const express = require('express');
const router = express.Router();
const {
  sb, an, sportKey, espnLeague,
  extractTodayGames, extractScoreboardGames, normalizeGame,
} = require('../lib/apis');

// ── Helpers ──────────────────────────────────────────────────────
const fmtOdds = (v) => {
  if (v == null) return '—';
  const n = Number(v);
  return n > 0 ? `+${n}` : `${n}`;
};

const sportMeta = (raw) => {
  const s = (raw || '').toLowerCase();
  if (s.includes('nfl') || s.includes('football'))   return { emoji: '🏈', label: 'NFL',    badge: 'football' };
  if (s.includes('nba') || s.includes('basketball')) return { emoji: '🏀', label: 'NBA',    badge: 'basketball' };
  if (s.includes('mlb') || s.includes('baseball'))   return { emoji: '⚾', label: 'MLB',    badge: 'baseball' };
  if (s.includes('nhl') || s.includes('hockey'))     return { emoji: '🏒', label: 'NHL',    badge: 'hockey' };
  if (s.includes('soccer') || s.includes('mls'))     return { emoji: '⚽', label: 'Soccer', badge: 'soccer' };
  if (s.includes('ufc') || s.includes('mma'))        return { emoji: '🥊', label: 'MMA',    badge: 'mma' };
  if (s.includes('tennis'))                          return { emoji: '🎾', label: 'Tennis', badge: 'tennis' };
  return { emoji: '🎯', label: raw || 'Sports', badge: 'other' };
};

const profitTier = (pct) => {
  if (pct >= 2.5) return 'high';
  if (pct >= 1.5) return 'medium';
  return 'low';
};

// ================================================================
// GET /api/opportunities/arbitrage
// Find arbitrage-like opportunities via sportsbook compare endpoint
// Response: { sport, market, total_events, multi_book_events,
//             comparisons: [{ home_team, away_team, sport, league, start_time, is_live,
//                             best_prices: { TeamName: { price, sportsbook }, Home: {...}, Away: {...} },
//                             all_odds: {...} }] }
// ================================================================
router.get('/arbitrage', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 12, 50);
  const sport = req.query.sport || null;

  try {
    // Sportsbook uses SIMPLE keys: nba, mlb, nfl, nhl
    const leagueKeys = sport
      ? [sportKey(sport)]
      : ['nba', 'mlb', 'nfl', 'nhl'];

    const opportunities = [];

    for (const key of leagueKeys) {
      const data = await sb.compare(key);
      if (!data || !Array.isArray(data.comparisons)) continue;

      data.comparisons.forEach(comp => {
        const meta = sportMeta(comp.league || comp.sport || key);
        const bestPrices = comp.best_prices || {};

        // Get best home/away prices
        // best_prices has team names as keys AND also "Home"/"Away"
        let bestHomeName = comp.home_team || 'Home';
        let bestAwayName = comp.away_team || 'Away';

        // Try team-name keys first, fall back to Home/Away
        const homePrice = bestPrices[bestHomeName] || bestPrices['Home'] || {};
        const awayPrice = bestPrices[bestAwayName] || bestPrices['Away'] || {};

        const bestHomeOdds = homePrice.price || null;
        const bestAwayOdds = awayPrice.price || null;
        const homeBook = homePrice.sportsbook || '';
        const awayBook = awayPrice.sportsbook || '';

        // Calculate implied probability gap (approximation of arb potential)
        let profitPct = 0;
        if (bestHomeOdds != null && bestAwayOdds != null) {
          const impliedHome = bestHomeOdds > 0
            ? 100 / (bestHomeOdds + 100)
            : Math.abs(bestHomeOdds) / (Math.abs(bestHomeOdds) + 100);
          const impliedAway = bestAwayOdds > 0
            ? 100 / (bestAwayOdds + 100)
            : Math.abs(bestAwayOdds) / (Math.abs(bestAwayOdds) + 100);
          const totalImpl = impliedHome + impliedAway;
          if (totalImpl < 1) {
            profitPct = (1 - totalImpl) * 100;
          }
        }

        opportunities.push({
          id: `${key}-${comp.home_team}-${comp.away_team}`.replace(/\s+/g, '-').toLowerCase(),
          sport: meta.label,
          sportEmoji: meta.emoji,
          sportBadge: meta.badge,
          homeTeam: comp.home_team || '',
          awayTeam: comp.away_team || '',
          commenceTime: comp.start_time || '',
          isLive: comp.is_live || false,
          marketType: data.market || 'moneyline',
          numSportsbooks: comp.num_sportsbooks || comp.sportsbooks_with_odds?.length || 0,
          sportsbooks: comp.sportsbooks_with_odds || [],
          side1: {
            bookmaker: homeBook,
            selection: comp.home_team || 'Home',
            odds: fmtOdds(bestHomeOdds),
            rawOdds: bestHomeOdds,
            stake: null,
          },
          side2: {
            bookmaker: awayBook,
            selection: comp.away_team || 'Away',
            odds: fmtOdds(bestAwayOdds),
            rawOdds: bestAwayOdds,
            stake: null,
          },
          profitPct: profitPct.toFixed(2),
          profitTier: profitTier(profitPct),
          guaranteedProfit: '0.00',
          isUsOnly: true,
          detectedAt: new Date().toISOString(),
        });
      });
    }

    // Sort by profit potential descending
    opportunities.sort((a, b) => parseFloat(b.profitPct) - parseFloat(a.profitPct));
    const result = opportunities.slice(0, limit);
    res.json({ count: result.length, opportunities: result });
  } catch (err) {
    console.error('Error fetching arbitrage opportunities:', err.message);
    res.status(500).json({ error: 'Failed to fetch arbitrage opportunities' });
  }
});

// ================================================================
// GET /api/opportunities/player-props
// Get player stats from ESPN scoreboards
// Scoreboard response: { league, date, total_games, games: [{ id, name, ... }] }
// Note: The pre-processed format may not have leaders. Return what we can.
// ================================================================
router.get('/player-props', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 12, 50);
  const sport = req.query.sport || null;

  try {
    const leagues = sport
      ? [espnLeague(sport)]
      : ['nba', 'mlb', 'nfl', 'nhl'];

    const props = [];

    for (const league of leagues) {
      const data = await an.scoreboard(league);
      const games = extractScoreboardGames(data);
      const meta = sportMeta(league);

      games.forEach(g => {
        const home = g.home || {};
        const away = g.away || {};

        // The analytics API returns pre-processed games — no raw leaders data.
        // We can still show game-level info as "matchup props"
        if (g.completed && home.score && away.score) {
          // Show top scoring side as a "prop" insight
          const homeScore = parseInt(home.score) || 0;
          const awayScore = parseInt(away.score) || 0;
          const winner = homeScore > awayScore ? home : away;
          const loser = homeScore > awayScore ? away : home;

          props.push({
            id: `${g.id}-result`,
            sport: meta.label,
            sportEmoji: meta.emoji,
            sportBadge: meta.badge,
            playerName: winner.team || '',
            team: winner.abbreviation || '',
            teamAbbrev: winner.abbreviation || '',
            position: '',
            keyStats: `${winner.score} - ${loser.score}`,
            fantasyScore: null,
            notableReason: 'Game Winner',
            game: g.short_name || `${away.abbreviation || ''} @ ${home.abbreviation || ''}`,
            gameDate: g.date || '',
            recordedAt: g.date || new Date().toISOString(),
          });
        }
      });
    }

    res.json({ count: Math.min(props.length, limit), props: props.slice(0, limit) });
  } catch (err) {
    console.error('Error fetching player props:', err.message);
    res.status(500).json({ error: 'Failed to fetch player props' });
  }
});

// ================================================================
// GET /api/opportunities/ai-analysis
// Get AI analysis from analytics API
// ================================================================
router.get('/ai-analysis', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 6, 20);
  const sport = req.query.sport || req.query.type || null;

  try {
    const league = sport ? espnLeague(sport) : 'nba';
    const sbSport = sport ? sportKey(sport) : 'nba';

    // Fetch data and get AI analysis in parallel
    const [scoreData, oddsData] = await Promise.all([
      an.scoreboard(league),
      sb.odds(sbSport),
    ]);

    const analyses = [];

    // Use the analytics AI endpoint to analyze the data
    if (scoreData || oddsData) {
      const analysisPrompt = sport
        ? `Analyze today's ${sport} games, odds, and betting opportunities. Provide insights on line movements, value plays, and key matchups.`
        : `Analyze today's sports landscape across NBA, MLB, NFL, and NHL. Highlight the best betting opportunities and key matchups.`;

      const aiResult = await an.analyze({
        data: { scores: scoreData, odds: oddsData },
        question: analysisPrompt,
      });

      if (aiResult) {
        const content = aiResult.analysis || aiResult.answer || aiResult.result || aiResult.content || JSON.stringify(aiResult);
        analyses.push({
          id: `ai-${Date.now()}`,
          type: sport || 'multi-sport',
          model: 'sports-analytics-ai',
          content: content,
          confidence: '85',
          generatedAt: new Date().toISOString(),
        });
      }
    }

    // Also get best bets AI for each league
    const aiLeagues = sport ? [sportKey(sport)] : ['nba', 'mlb'];
    for (const lk of aiLeagues) {
      const betsAI = await an.bestBetsAI(lk);
      if (betsAI) {
        const content = betsAI.analysis || betsAI.answer || betsAI.result || betsAI.content || JSON.stringify(betsAI);
        const meta = sportMeta(lk);
        analyses.push({
          id: `bets-${lk}-${Date.now()}`,
          type: `${meta.label} Best Bets`,
          model: 'best-bets-ai',
          content: content,
          confidence: '80',
          generatedAt: new Date().toISOString(),
        });
      }
    }

    res.json({ count: Math.min(analyses.length, limit), analyses: analyses.slice(0, limit) });
  } catch (err) {
    console.error('Error fetching AI analysis:', err.message);
    res.status(500).json({ error: 'Failed to fetch AI analysis' });
  }
});

// ================================================================
// GET /api/opportunities/games
// Today's games from ESPN
// ================================================================
router.get('/games', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const live = req.query.live === 'true';

  try {
    const data = await an.today();
    const allGames = extractTodayGames(data).map(g => {
      const n = normalizeGame(g);
      const meta = sportMeta(g.league || '');
      return {
        ...n,
        sport: meta.label,
        sportEmoji: meta.emoji,
        sportBadge: meta.badge,
        homeTeam: n.home_team,
        awayTeam: n.away_team,
        homeScore: n.home_score,
        awayScore: n.away_score,
        isLive: n.is_live,
        isFinal: n.is_final,
        gameDate: n.commence_time,
      };
    });

    const filtered = live ? allGames.filter(g => g.isLive) : allGames;
    res.json({ count: Math.min(filtered.length, limit), games: filtered.slice(0, limit) });
  } catch (err) {
    console.error('Error fetching games:', err.message);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
});

// ================================================================
// GET /api/opportunities/summary
// Quick summary stats
// ================================================================
router.get('/summary', async (req, res) => {
  try {
    const [todayData, nbaCompare, mlbCompare] = await Promise.all([
      an.today(),
      sb.compare('nba'),
      sb.compare('mlb'),
    ]);

    // Count games from { leagues: { NBA: { games: [...] }, ... } }
    const allGames = extractTodayGames(todayData);
    const totalGames = allGames.length;
    const liveGames = allGames.filter(g => g.status === 'In Progress' || g.status === 'Halftime').length;

    // Count compare events (proxy for arb opportunities)
    let arbCount = 0;
    [nbaCompare, mlbCompare].forEach(data => {
      if (!data || !Array.isArray(data.comparisons)) return;
      arbCount += data.comparisons.length;
    });

    res.json({
      arbitrage: {
        count: arbCount,
        bestProfit: '0.00',
        avgProfit: '0.00',
      },
      games: {
        total: totalGames,
        live: liveGames,
      },
      playerProps: {
        notable: 0,
      },
    });
  } catch (err) {
    console.error('Error fetching summary:', err.message);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

module.exports = router;