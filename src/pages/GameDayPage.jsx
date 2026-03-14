import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

export default function GameDayPage() {
  const { api } = useAuth();
  const [games, setGames] = useState([]);
  const [news, setNews] = useState([]);
  const [injuries, setInjuries] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [gamesRes, newsRes, injuriesRes] = await Promise.all([
        api().get('/api/games?limit=20').catch(() => ({ data: [] })),
        api().get('/api/games/news?limit=10').catch(() => ({ data: [] })),
        api().get('/api/games/injuries?limit=10').catch(() => ({ data: [] })),
      ]);
      setGames(Array.isArray(gamesRes.data) ? gamesRes.data : []);
      setNews(Array.isArray(newsRes.data) ? newsRes.data : []);
      setInjuries(Array.isArray(injuriesRes.data) ? injuriesRes.data : []);
    } catch {}
    setLoading(false);
  }, [api]);

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
    const date = new Date(d);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">⚡ Game Day Hub</h1>
          <p className="dash-subtitle">Everything you need for today's games in one place</p>
        </div>
        <button onClick={fetchData} className="btn-action btn-primary-action" disabled={loading}>
          {loading ? '⏳' : '🔄'} Refresh
        </button>
      </div>

      {loading ? (
        <div className="dash-loading"><div className="dash-spinner" /><span>Loading game day data…</span></div>
      ) : (
        <>
          {/* Today's Games */}
          <div className="glass-card section-card">
            <div className="section-header">
              <h2><span className="section-icon">🎮</span> Today's Games ({games.length})</h2>
            </div>
            {games.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">🎮</span>
                <p>No games scheduled for today.</p>
              </div>
            ) : (
              <div className="gameday-grid">
                {games.slice(0, 12).map((game, i) => (
                  <div className="gameday-card" key={i}>
                    <div className="gd-sport">{sportEmoji(game.sport_key)} {(game.sport_key || '').replace(/_/g, ' ')}</div>
                    <div className="gd-teams">
                      <span>{game.home_team}</span>
                      <span className="gd-vs">vs</span>
                      <span>{game.away_team}</span>
                    </div>
                    <div className="gd-time">{formatTime(game.commence_time)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Injury Report */}
          <div className="glass-card section-card">
            <div className="section-header">
              <h2><span className="section-icon">🏥</span> Injury Report</h2>
            </div>
            {injuries.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">🏥</span>
                <p>No injury reports available.</p>
              </div>
            ) : (
              <div className="activity-list">
                {injuries.map((inj, i) => (
                  <div className="activity-item" key={i}>
                    <div className="activity-left">
                      <span className="activity-emoji">🏥</span>
                      <div>
                        <div className="activity-title">{inj.player_name || 'Unknown Player'}</div>
                        <div className="activity-meta">{inj.team || ''} — {inj.injury_type || inj.status || 'Injury'}</div>
                      </div>
                    </div>
                    <div className="activity-right">
                      <span className={`status-tag ${(inj.status || '').toLowerCase() === 'out' ? 'status-out' : 'status-gtd'}`}>
                        {inj.status || '—'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Latest News */}
          <div className="glass-card section-card">
            <div className="section-header">
              <h2><span className="section-icon">📰</span> Latest News</h2>
            </div>
            {news.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">📰</span>
                <p>No news available right now.</p>
              </div>
            ) : (
              <div className="activity-list">
                {news.map((item, i) => (
                  <div className="activity-item" key={i}>
                    <div className="activity-left">
                      <span className="activity-emoji">📰</span>
                      <div>
                        <div className="activity-title">{item.title || item.headline || 'News'}</div>
                        <div className="activity-meta">{(item.summary || item.content || '').slice(0, 120)}…</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}