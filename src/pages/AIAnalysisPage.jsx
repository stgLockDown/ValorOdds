import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AIAnalysisPage() {
  const { api } = useAuth();
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sport, setSport] = useState('');

  const fetchAnalyses = useCallback(async () => {
    setLoading(true);
    try {
      const params = sport ? `?sport=${sport}&limit=30` : '?limit=30';
      const { data } = await api().get(`/api/opportunities/ai-analysis${params}`);
      setAnalyses(Array.isArray(data) ? data : []);
    } catch { setAnalyses([]); }
    setLoading(false);
  }, [api, sport]);

  useEffect(() => { fetchAnalyses(); }, [fetchAnalyses]);

  const sportEmoji = (s) => {
    const k = (s || '').toLowerCase();
    if (k.includes('football') || k.includes('nfl')) return '🏈';
    if (k.includes('basketball') || k.includes('nba')) return '🏀';
    if (k.includes('baseball') || k.includes('mlb')) return '⚾';
    if (k.includes('hockey') || k.includes('nhl')) return '🏒';
    if (k.includes('soccer')) return '⚽';
    return '🤖';
  };

  const confidenceColor = (c) => {
    const n = parseFloat(c) || 0;
    if (n >= 8) return '#57F287';
    if (n >= 6) return '#5865F2';
    if (n >= 4) return '#E8820C';
    return '#ED4245';
  };

  const timeAgo = (d) => {
    if (!d) return '';
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">🤖 AI Analysis</h1>
          <p className="dash-subtitle">DeepSeek AI-powered insights and recommendations</p>
        </div>
        <button onClick={fetchAnalyses} className="btn-action btn-primary-action" disabled={loading}>
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

      {loading ? (
        <div className="dash-loading"><div className="dash-spinner" /><span>Loading AI analyses…</span></div>
      ) : analyses.length === 0 ? (
        <div className="glass-card">
          <div className="empty-state">
            <span className="empty-icon">🤖</span>
            <p>No AI analyses available right now.</p>
            <p className="empty-sub">AI analysis runs periodically for active games and opportunities.</p>
          </div>
        </div>
      ) : (
        <div className="analysis-list">
          {analyses.map((item, i) => (
            <div className="glass-card analysis-card" key={item.id || i}>
              <div className="analysis-header">
                <div className="analysis-meta">
                  <span className="sport-badge">{sportEmoji(item.sport)} {item.sport || 'Sports'}</span>
                  {item.analysis_type && <span className="type-badge">{item.analysis_type}</span>}
                </div>
                <div className="analysis-scores">
                  {item.confidence_score && (
                    <span className="confidence-pill" style={{ color: confidenceColor(item.confidence_score) }}>
                      Confidence: {item.confidence_score}/10
                    </span>
                  )}
                  <span className="time-badge">{timeAgo(item.created_at)}</span>
                </div>
              </div>
              {item.summary && (
                <div className="analysis-summary">
                  <h3>Summary</h3>
                  <p>{item.summary}</p>
                </div>
              )}
              {item.detailed_analysis && (
                <div className="analysis-detail">
                  <h3>Detailed Analysis</h3>
                  <p>{typeof item.detailed_analysis === 'string' ? item.detailed_analysis : JSON.stringify(item.detailed_analysis)}</p>
                </div>
              )}
              {item.recommendation && (
                <div className="analysis-rec">
                  <h3>🎯 Recommendation</h3>
                  <p>{item.recommendation}</p>
                </div>
              )}
              {(item.risk_assessment || item.risk_level) && (
                <div className="analysis-risk">
                  <span className="risk-label">Risk:</span>
                  <span className="risk-value">{item.risk_assessment || item.risk_level}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}