import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const SPORTS = [
  { key: '', label: 'All Sports', icon: '🎯' },
  { key: 'football', label: 'NFL', icon: '🏈' },
  { key: 'basketball', label: 'NBA', icon: '🏀' },
  { key: 'baseball', label: 'MLB', icon: '⚾' },
  { key: 'hockey', label: 'NHL', icon: '🏒' },
  { key: 'soccer', label: 'Soccer', icon: '⚽' },
  { key: 'mma', label: 'MMA', icon: '🥊' },
  { key: 'tennis', label: 'Tennis', icon: '🎾' },
];

const RISK_COLORS = { low: '#57F287', ideal: '#00D4AA', medium: '#E8820C', high: '#ED4245' };

export default function ArbitragePage() {
  const { api, plan } = useAuth();
  const [opps, setOpps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sport, setSport] = useState('');
  const [sortBy, setSortBy] = useState('profit');
  const [minProfit, setMinProfit] = useState(0);

  const fetchArbs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (sport) params.set('sport', sport);
      const { data } = await api().get(`/api/opportunities/arbitrage?${params}`);
      setOpps(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Arb fetch error:', err);
      setOpps([]);
    }
    setLoading(false);
  }, [api, sport]);

  useEffect(() => { fetchArbs(); }, [fetchArbs]);

  // Auto-refresh
  useEffect(() => {
    const iv = setInterval(fetchArbs, 180000);
    return () => clearInterval(iv);
  }, [fetchArbs]);

  const filtered = opps
    .filter(o => (o.profit || o.profit_percentage || 0) >= minProfit)
    .sort((a, b) => {
      if (sortBy === 'profit') return (b.profit || b.profit_percentage || 0) - (a.profit || a.profit_percentage || 0);
      if (sortBy === 'time') return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      return 0;
    });

  const getRisk = (pct) => {
    const p = parseFloat(pct) || 0;
    if (p >= 5) return 'high';
    if (p >= 2.5) return 'ideal';
    if (p >= 1) return 'medium';
    return 'low';
  };

  const timeAgo = (d) => {
    if (!d) return '';
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  };

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">📈 Arbitrage Opportunities</h1>
          <p className="dash-subtitle">Real-time arbitrage detection across 25+ sportsbooks</p>
        </div>
        <button onClick={fetchArbs} className="btn-action btn-primary-action" disabled={loading}>
          {loading ? '⏳ Refreshing…' : '🔄 Refresh'}
        </button>
      </div>

      {/* Filters */}
      <div className="glass-card filter-bar">
        <div className="filter-group">
          <label>Sport</label>
          <div className="sport-tabs">
            {SPORTS.map(s => (
              <button key={s.key} className={`sport-tab ${sport === s.key ? 'active' : ''}`}
                onClick={() => setSport(s.key)}>
                {s.icon} {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-row">
          <div className="filter-group">
            <label>Sort By</label>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="filter-select">
              <option value="profit">Highest Profit</option>
              <option value="time">Most Recent</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Min Profit %</label>
            <input type="number" value={minProfit} onChange={e => setMinProfit(parseFloat(e.target.value) || 0)}
              className="filter-input" min="0" step="0.5" />
          </div>
          <div className="filter-group">
            <label>&nbsp;</label>
            <span className="result-count">{filtered.length} opportunities found</span>
          </div>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="dash-loading"><div className="dash-spinner" /><span>Scanning sportsbooks…</span></div>
      ) : filtered.length === 0 ? (
        <div className="glass-card">
          <div className="empty-state">
            <span className="empty-icon">📊</span>
            <p>No arbitrage opportunities found matching your filters.</p>
            <p className="empty-sub">Try adjusting your filters or check back in a few minutes.</p>
          </div>
        </div>
      ) : (
        <div className="arb-grid">
          {filtered.map((opp, i) => {
            const profit = parseFloat(opp.profit || opp.profit_percentage || 0).toFixed(2);
            const risk = getRisk(profit);
            return (
              <div className="glass-card arb-card" key={opp.id || i}>
                <div className="arb-card-header">
                  <span className="sport-badge">{opp.sportEmoji || '🎯'} {opp.sportLabel || opp.sport_key || 'Sports'}</span>
                  <span className="profit-badge-lg" style={{ color: RISK_COLORS[risk] }}>+{profit}%</span>
                </div>
                <h3 className="arb-matchup">
                  {opp.home_team || opp.team1 || '—'} vs {opp.away_team || opp.team2 || '—'}
                </h3>
                <div className="arb-books">
                  <div className="arb-book-row">
                    <span className="book-team">🏠 {opp.home_team || opp.team1 || 'Home'}</span>
                    <span className="book-odds">{opp.odds_home || opp.odds1 || '—'}</span>
                    <span className="book-name">{opp.bookmaker_home || opp.book1 || '—'}</span>
                  </div>
                  <div className="arb-book-row">
                    <span className="book-team">✈️ {opp.away_team || opp.team2 || 'Away'}</span>
                    <span className="book-odds">{opp.odds_away || opp.odds2 || '—'}</span>
                    <span className="book-name">{opp.bookmaker_away || opp.book2 || '—'}</span>
                  </div>
                </div>
                <div className="arb-footer">
                  <span className="risk-tag" style={{ background: `${RISK_COLORS[risk]}20`, color: RISK_COLORS[risk] }}>
                    {risk.toUpperCase()} RISK
                  </span>
                  <span className="arb-time">{timeAgo(opp.created_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}