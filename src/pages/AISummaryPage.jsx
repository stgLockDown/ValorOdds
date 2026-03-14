import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AISummaryPage() {
  const { api } = useAuth();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api().get('/api/opportunities/summary');
      setSummary(data);
    } catch { setSummary(null); }
    setLoading(false);
  }, [api]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">✨ AI Market Summary</h1>
          <p className="dash-subtitle">Today's AI-generated market overview across all sports</p>
        </div>
        <button onClick={fetchSummary} className="btn-action btn-primary-action" disabled={loading}>
          {loading ? '⏳' : '🔄'} Refresh
        </button>
      </div>

      {loading ? (
        <div className="dash-loading"><div className="dash-spinner" /><span>Generating AI summary…</span></div>
      ) : !summary ? (
        <div className="glass-card">
          <div className="empty-state">
            <span className="empty-icon">✨</span>
            <p>No market summary available right now.</p>
            <p className="empty-sub">The AI generates summaries when there's active market data.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Overview Stats */}
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div className="stat-card glass-card">
              <div className="stat-icon" style={{ background: '#5865F220' }}><span>📈</span></div>
              <div className="stat-value" style={{ color: '#5865F2' }}>{summary.totalArbs || 0}</div>
              <div className="stat-label">Arbitrage Opps</div>
            </div>
            <div className="stat-card glass-card">
              <div className="stat-icon" style={{ background: '#57F28720' }}><span>💰</span></div>
              <div className="stat-value" style={{ color: '#57F287' }}>{summary.avgProfit || '0'}%</div>
              <div className="stat-label">Avg Profit</div>
            </div>
            <div className="stat-card glass-card">
              <div className="stat-icon" style={{ background: '#E8820C20' }}><span>🎮</span></div>
              <div className="stat-value" style={{ color: '#E8820C' }}>{summary.totalGames || 0}</div>
              <div className="stat-label">Active Games</div>
            </div>
            <div className="stat-card glass-card">
              <div className="stat-icon" style={{ background: '#9B59B620' }}><span>🤖</span></div>
              <div className="stat-value" style={{ color: '#9B59B6' }}>{summary.totalAnalyses || 0}</div>
              <div className="stat-label">AI Analyses</div>
            </div>
          </div>

          {/* Sport Breakdown */}
          {summary.sportBreakdown && summary.sportBreakdown.length > 0 && (
            <div className="glass-card section-card">
              <div className="section-header">
                <h2><span className="section-icon">🏟️</span> By Sport</h2>
              </div>
              <div className="sport-breakdown">
                {summary.sportBreakdown.map((s, i) => (
                  <div className="sport-row" key={i}>
                    <span className="sport-name">{s.sport || s.sport_key || 'Unknown'}</span>
                    <span className="sport-count">{s.count || 0} opportunities</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Best Opportunities */}
          {summary.bestOpps && summary.bestOpps.length > 0 && (
            <div className="glass-card section-card">
              <div className="section-header">
                <h2><span className="section-icon">⭐</span> Best Opportunities Today</h2>
              </div>
              <div className="activity-list">
                {summary.bestOpps.map((opp, i) => (
                  <div className="activity-item" key={i}>
                    <div className="activity-left">
                      <span className="activity-emoji">🎯</span>
                      <div>
                        <div className="activity-title">{opp.home_team} vs {opp.away_team}</div>
                        <div className="activity-meta">{opp.bookmaker_home} / {opp.bookmaker_away}</div>
                      </div>
                    </div>
                    <div className="activity-right">
                      <span className="profit-badge" style={{ color: '#57F287' }}>
                        +{parseFloat(opp.profit_percentage || 0).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}