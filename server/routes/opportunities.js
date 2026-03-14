const express = require('express');
const router = express.Router();
const { sb, an, sportKey, espnLeague } = require('../lib/apis');

// ── Helpers ──────────────────────────────────────────────────
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
// ================================================================
router.get('/arbitrage', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 12, 50);
  const sport = req.query.sport || null;

  try {
    const leagueKeys = sport
      ? [sportKey(sport)]
      : ['basketball_nba', 'baseball_mlb', 'americanfootball_nfl', 'icehockey_nhl'];

    const opportunities = [];

    for (const key of leagueKeys) {
      const data = await sb.compare(key);
      if (!data) continue;

      // Handle various response shapes
      const events = data.events || data.comparisons || (Array.isArray(data) ? data : []);

      events.forEach(ev => {
        const meta = sportMeta(ev.sport_key || ev.sport || key);

        // Look for price discrepancies across bookmakers
        // The compare endpoint should provide best_lines or similar
        const bestHome = ev.best_home_odds || ev.best_lines?.home || null;
        const bestAway = ev.best_away_odds || ev.best_lines?.away || null;
        const homeBook = ev.best_home_book || ev.best_lines?.home_book || '';
        const awayBook = ev.best_away_book || ev.best_lines?.away_book || '';

        // Calculate implied probability gap (approximation of arb potential)
        let profitPct = 0;
        if (bestHome && bestAway) {
          const impliedHome = bestHome > 0 ? 100 / (bestHome + 100) : Math.abs(bestHome) / (Math.abs(bestHome) + 100);
          const impliedAway = bestAway > 0 ? 100 / (bestAway + 100) : Math.abs(bestAway) / (Math.abs(bestAway) + 100);
          const totalImpl = impliedHome + impliedAway;
          if (totalImpl < 1) {
            profitPct = ((1 - totalImpl) * 100);
          }
        }

        // Also include events that just have good line comparisons
        if (ev.home_team || ev.away_team) {
          opportunities.push({
            id: ev.id || ev.event_id || Math.random().toString(36).slice(2),
            sport: meta.label,
            sportEmoji: meta.emoji,
            sportBadge: meta.badge,
            homeTeam: ev.home_team || '',
            awayTeam: ev.away_team || '',
            commenceTime: ev.commence_time || ev.start_time || '',
            marketType: ev.market || 'h2h',
            side1: {
              bookmaker: homeBook || ev.bookmakers?.[0]?.key || 'Best Line',
              selection: ev.home_team || 'Home',
              odds: fmtOdds(bestHome || ev.home_odds),
              stake: null,
            },
            side2: {
              bookmaker: awayBook || ev.bookmakers?.[1]?.key || 'Best Line',
              selection: ev.away_team || 'Away',
              odds: fmtOdds(bestAway || ev.away_odds),
              stake: null,
            },
            profitPct: profitPct.toFixed(2),
            profitTier: profitTier(profitPct),
            guaranteedProfit: '0.00',
            isUsOnly: true,
            detectedAt: ev.last_update || new Date().toISOString(),
          });
        }
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
      if (!data) continue;

      const events = data.events || (Array.isArray(data) ? data : []);
      events.forEach(ev => {
        const comp = ev.competitions?.[0];
        if (!comp) return;

        // Look for leaders / top performers
        const leaders = comp.leaders || ev.leaders || [];
        leaders.forEach(cat => {
          const catLeaders = cat.leaders || [];
          catLeaders.slice(0, 2).forEach(leader => {
            const athlete = leader.athlete || {};
            const meta = sportMeta(league);
            props.push({
              id: `${ev.id}-${athlete.id || Math.random().toString(36).slice(2)}`,
              sport: meta.label,
              sportEmoji: meta.emoji,
              sportBadge: meta.badge,
              playerName: athlete.displayName || athlete.fullName || '',
              team: athlete.team?.abbreviation || '',
              teamAbbrev: athlete.team?.abbreviation || '',
              position: athlete.position?.abbreviation || '',
              keyStats: `${leader.displayValue || leader.value || ''} ${cat.displayName || cat.name || ''}`,
              fantasyScore: null,
              notableReason: cat.displayName || cat.name || 'Top performer',
              game: `${comp.competitors?.[1]?.team?.abbreviation || ''} @ ${comp.competitors?.[0]?.team?.abbreviation || ''}`,
              gameDate: ev.date || '',
              recordedAt: ev.date || new Date().toISOString(),
            });
          });
        });
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
    const sbSport = sport ? sportKey(sport) : 'basketball_nba';

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
    const aiLeagues = sport ? [sportKey(sport)] : ['basketball_nba', 'baseball_mlb'];
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
    const allGames = [];

    if (data) {
      if (Array.isArray(data)) {
        data.forEach(g => allGames.push(normalizeGameOpp(g)));
      } else if (data.games) {
        (Array.isArray(data.games) ? data.games : []).forEach(g => allGames.push(normalizeGameOpp(g)));
      } else {
        Object.entries(data).forEach(([league, games]) => {
          if (Array.isArray(games)) {
            games.forEach(g => allGames.push(normalizeGameOpp({ ...g, sport: league })));
          }
        });
      }
    }

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
      sb.compare('basketball_nba'),
      sb.compare('baseball_mlb'),
    ]);

    // Count games
    let totalGames = 0;
    let liveGames = 0;
    if (todayData) {
      if (Array.isArray(todayData)) {
        totalGames = todayData.length;
      } else if (todayData.games) {
        totalGames = Array.isArray(todayData.games) ? todayData.games.length : 0;
      } else {
        Object.values(todayData).forEach(v => {
          if (Array.isArray(v)) totalGames += v.length;
        });
      }
    }

    // Count compare events (proxy for arb opportunities)
    let arbCount = 0;
    let bestProfit = 0;
    [nbaCompare, mlbCompare].forEach(data => {
      if (!data) return;
      const events = data.events || data.comparisons || (Array.isArray(data) ? data : []);
      arbCount += events.length;
    });

    res.json({
      arbitrage: {
        count: arbCount,
        bestProfit: bestProfit.toFixed(2),
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

// Helper: normalise game data for opportunities/games endpoint
function normalizeGameOpp(g) {
  if (g.competitions) {
    const comp = g.competitions[0];
    const home = comp?.competitors?.find(c => c.homeAway === 'home');
    const away = comp?.competitors?.find(c => c.homeAway === 'away');
    const meta = sportMeta(g.sport || g.league || '');
    return {
      id: g.id,
      gameId: g.id,
      sport: meta.label,
      sportEmoji: meta.emoji,
      sportBadge: meta.badge,
      homeTeam: home?.team?.displayName || '',
      awayTeam: away?.team?.displayName || '',
      homeScore: home?.score || null,
      awayScore: away?.score || null,
      status: g.status?.type?.description || 'scheduled',
      statusDetail: g.status?.type?.detail || '',
      isLive: g.status?.type?.state === 'in',
      isFinal: g.status?.type?.completed || false,
      gameDate: g.date || '',
      venue: comp?.venue?.fullName || '',
    };
  }
  const meta = sportMeta(g.sport || g.league || g.sport_key || '');
  return {
    id: g.id || g.game_id || Math.random().toString(36).slice(2),
    gameId: g.id || g.game_id || '',
    sport: meta.label,
    sportEmoji: meta.emoji,
    sportBadge: meta.badge,
    homeTeam: g.home_team || g.homeTeam || g.home || '',
    awayTeam: g.away_team || g.awayTeam || g.away || '',
    homeScore: g.home_score || g.homeScore || null,
    awayScore: g.away_score || g.awayScore || null,
    status: g.status || g.state || 'scheduled',
    statusDetail: g.status_detail || '',
    isLive: g.is_live || g.isLive || false,
    isFinal: g.is_final || g.isFinal || false,
    gameDate: g.commence_time || g.date || g.start_time || '',
    venue: g.venue || '',
  };
}

module.exports = router;