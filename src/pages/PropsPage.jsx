import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

export default function PropsPage() {
  const { api, plan } = useAuth();
  const [props, setProps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sport, setSport] = useState('');

  const isPremium = plan === 'premium' || plan === 'vip' || plan === 'admin';

  const fetchProps = useCallback(async () => {
    if (!isPremium) { setLoading(false); return; }
    setLoading(true);
    try {
      const params = sport ? `?sport=${sport}&limit=30` : '?limit=30';
      const { data } = await api().get(`/api/opportunities/player-props${params}`);
      setProps(Array.isArray(data) ? data : []);
    } catch { setProps([]); }
    setLoading(false);
  }, [api, sport, isPremium]);

  useEffect(() => { fetchProps(); }, [fetchProps]);

  const sportEmoji = (s) => {
    const k = (s || '').toLowerCase();
    if (k.includes('football') || k.includes('nfl')) return '🏈';
    if (k.includes('basketball') || k.includes('nba')) return '🏀';
    if (k.includes('baseball') || k.includes('mlb')) return '⚾';
    if (k.includes('hockey') || k.includes('nhl')) return '🏒';
    return '🎯';
  };

  if (!isPremium) {
    return (
      <div className="dash-page">
        <div className="dash-header">
          <h1 className="dash-title">🏆 Player Props</h1>
        </div>
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <span style={{ fontSize: 64, display: 'block', marginBottom: 16 }}>🔒</span>
          <h2 style={{ fontSize: 24, marginBottom: 8 }}>Premium Feature</h2>
          <p className="dash-subtitle" style={{ marginBottom: 24 }}>
            Player Props with AI predictions are available on Premium and VIP plans.
          </p>
          <Link to="/upgrade" className="btn-action btn-primary-action">Upgrade Now</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">🏆 Player Props</h1>
          <p className="dash-subtitle">AI-powered player prop predictions across major sports</p>
        </div>
        <button onClick={fetchProps} className="btn-action btn-primary-action" disabled={loading}>
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
          ].map(s => (
            <button key={s.key} className={`sport-tab ${sport === s.key ? 'active' : ''}`}
              onClick={() => setSport(s.key)}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="dash-loading"><div className="dash-spinner" /><span>Loading player props…</span></div>
      ) : props.length === 0 ? (
        <div className="glass-card">
          <div className="empty-state">
            <span className="empty-icon">🏆</span>
            <p>No player props available right now.</p>
            <p className="empty-sub">Props are generated when games are approaching or in-season.</p>
          </div>
        </div>
      ) : (
        <div className="props-grid">
          {props.map((prop, i) => (
            <div className="glass-card prop-card" key={i}>
              <div className="prop-header">
                <span className="sport-badge">{sportEmoji(prop.sport || prop.sport_key)}</span>
                <span className="prop-game">{prop.game || prop.team || '—'}</span>
              </div>
              <div className="prop-player">
                <span className="player-name">{prop.player_name || prop.player || '—'}</span>
                <span className="player-team">{prop.team || ''}</span>
              </div>
              <div className="prop-stats">
                {prop.stat_type && (
                  <div className="prop-stat">
                    <span className="stat-key">{prop.stat_type}</span>
                    <span className="stat-val">{prop.stat_value || prop.line || '—'}</span>
                  </div>
                )}
                {prop.prediction && (
                  <div className="prop-stat">
                    <span className="stat-key">AI Prediction</span>
                    <span className="stat-val highlight">{prop.prediction}</span>
                  </div>
                )}
                {prop.confidence && (
                  <div className="prop-stat">
                    <span className="stat-key">Confidence</span>
                    <span className="stat-val">{prop.confidence}/10</span>
                  </div>
                )}
              </div>
              {prop.analysis && (
                <p className="prop-analysis">{prop.analysis}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}