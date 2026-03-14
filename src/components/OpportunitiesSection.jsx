import React, { useState, useEffect, useCallback } from 'react';
import './OpportunitiesSection.css';

/* ───────────────────────────────────────────────────────────────
   Helpers
   ─────────────────────────────────────────────────────────────── */
const API = process.env.REACT_APP_API_URL || '';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/* ───────────────────────────────────────────────────────────────
   Sub-components
   ─────────────────────────────────────────────────────────────── */

/* Arbitrage Card */
function ArbCard({ opp }) {
  return (
    <div className="opp-card">
      <div className="opp-card-header">
        <span className={`opp-sport-badge ${opp.sportBadge}`}>
          {opp.sportEmoji} {opp.sport}
        </span>
        <span className={`opp-profit-badge ${opp.profitTier}`}>
          {opp.profitPct}% Profit
        </span>
      </div>

      <div className="opp-matchup">
        <h4>{opp.homeTeam} vs {opp.awayTeam}</h4>
        <div className="opp-odds-row">
          <div className="opp-odds-item">
            <span className="opp-odds-team">{opp.side1.selection || opp.homeTeam}</span>
            <span className="opp-odds-value">{opp.side1.odds}</span>
            <span className="opp-odds-book">{opp.side1.bookmaker}</span>
          </div>
          <div className="opp-odds-item">
            <span className="opp-odds-team">{opp.side2.selection || opp.awayTeam}</span>
            <span className="opp-odds-value">{opp.side2.odds}</span>
            <span className="opp-odds-book">{opp.side2.bookmaker}</span>
          </div>
        </div>
      </div>

      <div className="opp-card-footer">
        <span>
          {opp.side1.stake && opp.side2.stake
            ? `💰 Stakes: $${opp.side1.stake} / $${opp.side2.stake}`
            : `💰 Guaranteed: $${opp.guaranteedProfit}`}
        </span>
        <span className="opp-time-ago">🕐 {timeAgo(opp.detectedAt)}</span>
      </div>
    </div>
  );
}

/* Player Prop Card */
function PropCard({ prop }) {
  const statChips = prop.keyStats ? prop.keyStats.split(' | ') : [];

  return (
    <div className="opp-card">
      <div className="opp-card-header">
        <span className={`opp-sport-badge ${prop.sportBadge}`}>
          {prop.sportEmoji} {prop.sport}
        </span>
        {prop.fantasyScore && (
          <span className="opp-fantasy-badge">⭐ {prop.fantasyScore} FP</span>
        )}
      </div>

      <div className="opp-player-info">
        <div className="opp-player-avatar">🏅</div>
        <div className="opp-player-details">
          <h4>{prop.playerName}</h4>
          <div className="opp-player-meta">
            {prop.team}{prop.position ? ` · ${prop.position}` : ''}
          </div>
        </div>
      </div>

      {statChips.length > 0 && (
        <div className="opp-stats-row">
          {statChips.map((s, i) => (
            <span key={i} className="opp-stat-chip">{s}</span>
          ))}
        </div>
      )}

      {prop.notableReason && (
        <div className="opp-notable-reason">{prop.notableReason}</div>
      )}

      <div className="opp-card-footer">
        {prop.game && <span>🎮 {prop.game}</span>}
        <span className="opp-time-ago">🕐 {timeAgo(prop.recordedAt)}</span>
      </div>
    </div>
  );
}

/* AI Analysis Card */
function AICard({ analysis }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="opp-card">
      <div className="opp-card-header">
        <span className="opp-ai-badge">🤖 AI {analysis.type.replace(/_/g, ' ')}</span>
        {analysis.confidence && (
          <div className="opp-confidence">
            <span>{analysis.confidence}%</span>
            <div className="opp-confidence-bar">
              <div
                className="opp-confidence-fill"
                style={{ width: `${analysis.confidence}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className={`opp-ai-content${expanded ? ' expanded' : ''}`}>
        {analysis.content.split('\n').map((line, i) => (
          <p key={i} style={{ margin: '0.3rem 0' }}>{line}</p>
        ))}
      </div>

      {analysis.content.length > 200 && (
        <button className="opp-ai-toggle" onClick={() => setExpanded(!expanded)}>
          {expanded ? '▲ Show less' : '▼ Read more'}
        </button>
      )}

      <div className="opp-card-footer">
        {analysis.model && <span>🧠 {analysis.model}</span>}
        <span className="opp-time-ago">🕐 {timeAgo(analysis.generatedAt)}</span>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
   Main Section Component
   ─────────────────────────────────────────────────────────────── */
const TABS = [
  { key: 'arbitrage', label: '🎯 Arbitrage' },
  { key: 'props',     label: '🏆 Player Props' },
  { key: 'ai',        label: '🤖 AI Picks' },
];

export default function OpportunitiesSection() {
  const [activeTab, setActiveTab] = useState('arbitrage');
  const [arbData, setArbData] = useState(null);
  const [propsData, setPropsData] = useState(null);
  const [aiData, setAIData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /* Fetch data for the active tab */
  const fetchData = useCallback(async (tab) => {
    setLoading(true);
    setError(null);
    try {
      let url;
      switch (tab) {
        case 'arbitrage':
          url = `${API}/api/opportunities/arbitrage?limit=12`;
          break;
        case 'props':
          url = `${API}/api/opportunities/player-props?limit=12`;
          break;
        case 'ai':
          url = `${API}/api/opportunities/ai-analysis?limit=9`;
          break;
        default:
          return;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      switch (tab) {
        case 'arbitrage': setArbData(data.opportunities || []); break;
        case 'props':     setPropsData(data.props || []);       break;
        case 'ai':        setAIData(data.analyses || []);       break;
        default: break;
      }
    } catch (err) {
      console.error('Opportunities fetch error:', err);
      setError('Unable to load live data right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  /* Initial load + tab switch */
  useEffect(() => {
    // Only fetch if we don't already have data for this tab
    const cached =
      (activeTab === 'arbitrage' && arbData !== null) ||
      (activeTab === 'props' && propsData !== null) ||
      (activeTab === 'ai' && aiData !== null);

    if (!cached) fetchData(activeTab);
  }, [activeTab, fetchData, arbData, propsData, aiData]);

  /* Auto-refresh every 3 minutes */
  useEffect(() => {
    const interval = setInterval(() => fetchData(activeTab), 180000);
    return () => clearInterval(interval);
  }, [activeTab, fetchData]);

  /* Determine what to render */
  const renderContent = () => {
    if (loading) {
      return (
        <div className="opps-loading">
          <div className="opps-spinner" />
          <p>Scanning sportsbooks for live opportunities…</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="opps-empty">
          <div className="opps-empty-icon">📡</div>
          <h3>Connection Issue</h3>
          <p>{error}</p>
        </div>
      );
    }

    switch (activeTab) {
      case 'arbitrage': {
        const items = arbData || [];
        if (items.length === 0) {
          return (
            <div className="opps-empty">
              <div className="opps-empty-icon">🔍</div>
              <h3>No Arbitrage Opportunities Right Now</h3>
              <p>Our bot scans 25+ sportsbooks every 20 minutes. New opportunities will appear here as soon as they are detected.</p>
            </div>
          );
        }
        return (
          <div className="opps-grid">
            {items.map((opp) => <ArbCard key={opp.id} opp={opp} />)}
          </div>
        );
      }

      case 'props': {
        const items = propsData || [];
        if (items.length === 0) {
          return (
            <div className="opps-empty">
              <div className="opps-empty-icon">🏅</div>
              <h3>No Notable Player Performances Yet</h3>
              <p>Player prop data appears here once games start. Check back during live games for top performers and AI-backed prop analysis.</p>
            </div>
          );
        }
        return (
          <div className="opps-grid">
            {items.map((prop) => <PropCard key={prop.id} prop={prop} />)}
          </div>
        );
      }

      case 'ai': {
        const items = aiData || [];
        if (items.length === 0) {
          return (
            <div className="opps-empty">
              <div className="opps-empty-icon">🤖</div>
              <h3>No AI Analysis Available</h3>
              <p>Our DeepSeek AI generates fresh picks and insights throughout the day. New analysis will appear here shortly.</p>
            </div>
          );
        }
        return (
          <div className="opps-grid">
            {items.map((a) => <AICard key={a.id} analysis={a} />)}
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <section id="opportunities" className="opps-section">
      <div className="opps-container">
        <div className="opps-header">
          <div className="opps-live-badge">
            <span className="opps-live-dot" />
            Live Data
          </div>
          <h2>Today's Top Opportunities</h2>
          <p className="opps-subtitle">
            Real-time data from our bot — updated every 20 minutes
          </p>
        </div>

        <div className="opps-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`opps-tab${activeTab === tab.key ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {renderContent()}
      </div>
    </section>
  );
}