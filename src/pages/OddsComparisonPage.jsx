import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

export default function OddsComparisonPage() {
  const { api } = useAuth();
  const [games, setGames] = useState([]);
  const [bookmakers, setBookmakers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sport, setSport] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = sport ? `?sport=${sport}&limit=20` : '?limit=20';
      const [gamesRes, booksRes] = await Promise.all([
        api().get(`/api/games${params}`).catch(() => ({ data: [] })),
        api().get('/api/games/bookmakers').catch(() => ({ data: [] })),
      ]);
      setGames(Array.isArray(gamesRes.data) ? gamesRes.data : []);
      setBookmakers(Array.isArray(booksRes.data) ? booksRes.data : []);
    } catch { setGames([]); setBookmakers([]); }
    setLoading(false);
  }, [api, sport]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sportEmoji = (s) => {
    const k = (s || '').toLowerCase();
    if (k.includes('football') || k.includes('nfl')) return '🏈';
    if (k.includes('basketball') || k.includes('nba')) return '🏀';
    if (k.includes('baseball') || k.includes('mlb')) return '⚾';
    if (k.includes('hockey') || k.includes('nhl')) return '🏒';
    if (k.includes('soccer')) return '⚽';
    return '🎯';
  };

  const formatTime = (d) => {
    if (!d) return '';
    return new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">📊 Odds Comparison</h1>
          <p className="dash-subtitle">Compare odds across sportsbooks for the best value</p>
        </div>
        <button onClick={fetchData} className="btn-action btn-primary-action" disabled={loading}>
          {loading ? '⏳' : '🔄'} Refresh
        </button>
      </div>

      <div className="glass-card filter-bar">
        <div className="sport-tabs">
          {[
            { key: '', label: 'All', icon: '🎯' },
            { key: 'football', label: 'NFL', icon: '🏈' },
            { key: 'basketball', label: 'NBA', icon: '🏀' },
            { key: 'baseball', label: 'MLB', icon: '⚾' },
            { key: 'hockey', label: 'NHL', icon: '🏒' },
            { key: 'soccer', label: 'Soccer', icon: '⚽' },
          ].map(s => (
            <button key={s.key} className={`sport-tab ${sport === s.key ? 'active' : ''}`}
              onClick={() => setSport(s.key)}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
      </div>

      {bookmakers.length > 0 && (
        <div className="glass-card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 12, fontSize: 16, color: '#b9bbbe' }}>
            📚 Active Bookmakers ({bookmakers.length})
          </h3>
          <div className="bookmaker-tags">
            {bookmakers.map((b, i) => (
              <span className="bookmaker-tag" key={i}>{b.name || b.key}</span>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="dash-loading"><div className="dash-spinner" /><span>Loading odds data…</span></div>
      ) : games.length === 0 ? (
        <div className="glass-card">
          <div className="empty-state">
            <span className="empty-icon">📊</span>
            <p>No games with odds data available right now.</p>
            <p className="empty-sub">Odds are updated every 20 minutes during active seasons.</p>
          </div>
        </div>
      ) : (
        <div className="odds-list">
          {games.map((game, i) => (
            <div className="glass-card odds-card" key={i}>
              <div className="odds-header">
                <span className="sport-badge">{sportEmoji(game.sport_key)} {(game.sport_key || '').replace(/_/g, ' ')}</span>
                <span className="odds-time">{formatTime(game.commence_time)}</span>
              </div>
              <div className="odds-matchup">
                <div className="odds-team">
                  <span className="team-label">Home</span>
                  <span className="team-name">{game.home_team || '—'}</span>
                </div>
                <span className="odds-vs">VS</span>
                <div className="odds-team">
                  <span className="team-label">Away</span>
                  <span className="team-name">{game.away_team || '—'}</span>
                </div>
              </div>
              {(game.home_odds || game.away_odds) && (
                <div className="odds-values">
                  <div className="odds-val">
                    <span className="odds-label">Home</span>
                    <span className="odds-number">{game.home_odds || '—'}</span>
                  </div>
                  <div className="odds-val">
                    <span className="odds-label">Away</span>
                    <span className="odds-number">{game.away_odds || '—'}</span>
                  </div>
                  {game.draw_odds && (
                    <div className="odds-val">
                      <span className="odds-label">Draw</span>
                      <span className="odds-number">{game.draw_odds}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}