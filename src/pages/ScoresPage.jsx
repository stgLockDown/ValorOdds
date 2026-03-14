import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const SPORTS = [
  { key: '', label: 'All', icon: '🎯' },
  { key: 'football', label: 'NFL', icon: '🏈' },
  { key: 'basketball', label: 'NBA', icon: '🏀' },
  { key: 'baseball', label: 'MLB', icon: '⚾' },
  { key: 'hockey', label: 'NHL', icon: '🏒' },
  { key: 'soccer', label: 'Soccer', icon: '⚽' },
];

export default function ScoresPage() {
  const { api } = useAuth();
  const [scores, setScores] = useState([]);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sport, setSport] = useState('');

  const fetchScores = useCallback(async () => {
    setLoading(true);
    try {
      const params = sport ? `?sport=${sport}&limit=30` : '?limit=30';
      const [scoresRes, gamesRes] = await Promise.all([
        api().get(`/api/games/scores${params}`).catch(() => ({ data: [] })),
        api().get(`/api/games${params}`).catch(() => ({ data: [] })),
      ]);
      setScores(Array.isArray(scoresRes.data) ? scoresRes.data : []);
      setGames(Array.isArray(gamesRes.data) ? gamesRes.data : []);
    } catch { setScores([]); setGames([]); }
    setLoading(false);
  }, [api, sport]);

  useEffect(() => { fetchScores(); }, [fetchScores]);
  useEffect(() => {
    const iv = setInterval(fetchScores, 60000);
    return () => clearInterval(iv);
  }, [fetchScores]);

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
    const date = new Date(d);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // Merge scores and games, dedup by teams
  const allGames = [...scores, ...games].reduce((acc, g) => {
    const key = `${g.home_team}-${g.away_team}`.toLowerCase();
    if (!acc.find(x => `${x.home_team}-${x.away_team}`.toLowerCase() === key)) acc.push(g);
    return acc;
  }, []);

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">📡 Live Scores</h1>
          <p className="dash-subtitle">Real-time scores and game updates</p>
        </div>
        <button onClick={fetchScores} className="btn-action btn-primary-action" disabled={loading}>
          {loading ? '⏳ Refreshing…' : '🔄 Refresh'}
        </button>
      </div>

      <div className="glass-card filter-bar">
        <div className="sport-tabs">
          {SPORTS.map(s => (
            <button key={s.key} className={`sport-tab ${sport === s.key ? 'active' : ''}`}
              onClick={() => setSport(s.key)}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="dash-loading"><div className="dash-spinner" /><span>Loading scores…</span></div>
      ) : allGames.length === 0 ? (
        <div className="glass-card">
          <div className="empty-state">
            <span className="empty-icon">📡</span>
            <p>No live scores available right now.</p>
            <p className="empty-sub">Scores update automatically when games are in progress.</p>
          </div>
        </div>
      ) : (
        <div className="scores-grid">
          {allGames.map((game, i) => (
            <div className="glass-card score-card" key={i}>
              <div className="score-header">
                <span className="sport-badge">{sportEmoji(game.sport_key)} {(game.sport_key || '').replace(/_/g, ' ')}</span>
                <span className="score-time">{formatTime(game.commence_time || game.last_update)}</span>
              </div>
              <div className="score-matchup">
                <div className="score-team">
                  <span className="team-name">{game.home_team || '—'}</span>
                  <span className="team-score">{game.home_score ?? '—'}</span>
                </div>
                <div className="score-vs">VS</div>
                <div className="score-team">
                  <span className="team-name">{game.away_team || '—'}</span>
                  <span className="team-score">{game.away_score ?? '—'}</span>
                </div>
              </div>
              {game.status && (
                <div className="score-status">
                  <span className={`status-badge ${game.status === 'live' ? 'live' : ''}`}>
                    {game.status === 'live' ? '🔴 LIVE' : game.status}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}