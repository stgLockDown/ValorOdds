import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function DashboardPage() {
  const { user, api, plan, isAdmin, subscriptionActive, createCheckout, refreshSubscription } = useAuth();
  const [searchParams] = useSearchParams();
  const [stats, setStats] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkoutMsg, setCheckoutMsg] = useState(null);
  const [playerSearch, setPlayerSearch] = useState('');

  const userTier = plan || 'free';

  const tierLimits = {
    free:    { arbitrage: 5,   props: 0,  label: 'Free Trial' },
    premium: { arbitrage: 50,  props: 10, label: 'Premium' },
    vip:     { arbitrage: 100, props: 50, label: 'VIP' },
    admin:   { arbitrage: 999, props: 999, label: 'Admin' },
  };
  const limits = tierLimits[userTier] || tierLimits.free;

  // Handle checkout return URL
  useEffect(() => {
    const checkout = searchParams.get('checkout');
    const planParam = searchParams.get('plan');
    if (checkout === 'success') {
      setCheckoutMsg({ type: 'success', text: `🎉 Welcome to ${planParam || 'your new plan'}! Your subscription is now active.` });
      refreshSubscription();
      window.history.replaceState({}, '', '/dashboard');
    } else if (checkout === 'cancelled') {
      setCheckoutMsg({ type: 'info', text: 'Checkout was cancelled. You can try again anytime.' });
      window.history.replaceState({}, '', '/dashboard');
    }
  }, [searchParams, refreshSubscription]);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, activityRes] = await Promise.all([
        api().get('/api/dashboard/stats').catch(() => ({ data: {} })),
        api().get('/api/dashboard/recent-activity?limit=8').catch(() => ({ data: [] })),
      ]);
      setStats(statsRes.data);
      setRecentActivity(activityRes.data);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    }
    setLoading(false);
  }, [api]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 3 minutes
  useEffect(() => {
    const iv = setInterval(fetchData, 180000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const statCards = [
    { icon: '📈', label: 'Active Opportunities', value: stats?.activeArbs ?? '—', color: '#5865F2' },
    { icon: '💰', label: 'Avg Profit %',         value: stats?.avgProfit ? `${stats.avgProfit}%` : '—', color: '#57F287' },
    { icon: '🛡️', label: 'Low Risk Arbs',        value: stats?.lowRiskArbs ?? '—', color: '#00D4AA' },
    { icon: '⚡', label: 'Top Profit %',          value: stats?.topProfit ? `${stats.topProfit}%` : '—', color: '#E8820C' },
    { icon: '🎮', label: 'Games Today',           value: stats?.gamesToday ?? '—', color: '#9B59B6' },
    { icon: '🤖', label: 'AI Analyses',           value: stats?.aiAnalyses ?? '—', color: '#E74C3C' },
  ];

  const quickActions = [
    { icon: '📈', title: 'Browse Arbitrage',  desc: 'Find profitable opportunities across all sportsbooks', path: '/arbitrage', color: '#5865F2' },
    { icon: '📡', title: 'Live Scores',       desc: 'Real-time scores and game updates', path: '/scores', color: '#57F287' },
    { icon: '🤖', title: 'AI Analysis',       desc: 'AI-powered insights and recommendations', path: '/ai-analysis', color: '#E8820C' },
    { icon: '🏆', title: 'Player Props',      desc: 'AI predictions for top players', path: '/props', color: '#9B59B6' },
    { icon: '📊', title: 'Odds Comparison',   desc: 'Compare odds across sportsbooks', path: '/odds', color: '#00D4AA' },
    { icon: '🌤️', title: 'Weather Impact',    desc: 'See how conditions affect games', path: '/weather', color: '#3498DB' },
  ];

  const sportEmoji = (sport) => {
    const s = (sport || '').toLowerCase();
    if (s.includes('nfl') || s.includes('football')) return '🏈';
    if (s.includes('nba') || s.includes('basketball')) return '🏀';
    if (s.includes('mlb') || s.includes('baseball')) return '⚾';
    if (s.includes('nhl') || s.includes('hockey')) return '🏒';
    if (s.includes('soccer') || s.includes('mls')) return '⚽';
    return '🎯';
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
      {/* Checkout message */}
      {checkoutMsg && (
        <div className={`dash-alert dash-alert-${checkoutMsg.type}`}>
          <span>{checkoutMsg.text}</span>
          <button onClick={() => setCheckoutMsg(null)} className="dash-alert-close">&times;</button>
        </div>
      )}

      {/* Header */}
      <div className="dash-header">
        <div>
          <h1 className="dash-title">
            Welcome back{user?.name ? `, ${user.name}` : ''}
          </h1>
          <p className="dash-subtitle">Your betting intelligence dashboard</p>
        </div>
      </div>

      {/* Stats Grid */}
      {loading ? (
        <div className="dash-loading">
          <div className="dash-spinner" />
          <span>Loading dashboard data…</span>
        </div>
      ) : (
        <>
          <div className="stats-grid">
            {statCards.map((s, i) => (
              <div className="stat-card glass-card" key={i}>
                <div className="stat-icon" style={{ background: `${s.color}20` }}>
                  <span>{s.icon}</span>
                </div>
                <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Tier Badge */}
          <div className="glass-card tier-card">
            <div className="tier-card-inner">
              <div>
                <div className="tier-label">Current Plan</div>
                <span className={`tier-badge tier-${userTier}`}>
                  {limits.label.toUpperCase()}
                </span>
              </div>
              <div className="tier-limits">
                <div className="tier-label">Daily Access</div>
                <div className="tier-limits-text">
                  {limits.arbitrage} Arbs • {limits.props} Props
                </div>
              </div>
            </div>
            {userTier === 'free' && (
              <div className="tier-upgrade-bar">
                <p>⚡ <strong>Upgrade to Premium</strong> for unlimited arbitrage opportunities, AI analytics, and advanced features!</p>
                <Link to="/upgrade" className="btn-action btn-primary-action">Upgrade Now</Link>
              </div>
            )}
          </div>

          {/* Arbitrage Intelligence */}
          <div className="glass-card section-card">
            <div className="section-header">
              <h2><span className="section-icon">📈</span> Arbitrage Intelligence</h2>
              <Link to="/arbitrage" className="btn-action btn-sm-action">View All →</Link>
            </div>
            <div className="tabs-bar">
              <button className="tab-btn active">Latest Opportunities</button>
            </div>
            <div className="activity-list">
              {recentActivity.filter(a => a.type === 'arbitrage').length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">📊</span>
                  <p>No recent arbitrage opportunities found.</p>
                  <p className="empty-sub">The bot scans every 20 minutes — check back soon!</p>
                </div>
              ) : (
                recentActivity.filter(a => a.type === 'arbitrage').slice(0, 5).map((item, i) => (
                  <div className="activity-item" key={i}>
                    <div className="activity-left">
                      <span className="activity-emoji">{sportEmoji(item.sport_key)}</span>
                      <div>
                        <div className="activity-title">{item.home_team} vs {item.away_team}</div>
                        <div className="activity-meta">
                          {item.bookmaker_home} / {item.bookmaker_away} • {timeAgo(item.created_at)}
                        </div>
                      </div>
                    </div>
                    <div className="activity-right">
                      <span className="profit-badge" style={{ color: item.profit_percentage >= 2.5 ? '#57F287' : '#5865F2' }}>
                        +{parseFloat(item.profit_percentage).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* AI Recommendations */}
          <div className="glass-card section-card">
            <div className="section-header">
              <h2><span className="section-icon">🤖</span> AI Recommendations</h2>
              <Link to="/ai-analysis" className="btn-action btn-sm-action">View All →</Link>
            </div>
            <div className="activity-list">
              {recentActivity.filter(a => a.type === 'ai_analysis').length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">🤖</span>
                  <p>No recent AI analyses available.</p>
                  <p className="empty-sub">AI analysis runs periodically for active games.</p>
                </div>
              ) : (
                recentActivity.filter(a => a.type === 'ai_analysis').slice(0, 4).map((item, i) => (
                  <div className="activity-item" key={i}>
                    <div className="activity-left">
                      <span className="activity-emoji">{sportEmoji(item.sport)}</span>
                      <div>
                        <div className="activity-title">{item.analysis_type || 'AI Analysis'}</div>
                        <div className="activity-meta">{(item.summary || '').slice(0, 100)}…</div>
                      </div>
                    </div>
                    <div className="activity-right">
                      {item.confidence_score && (
                        <span className="confidence-badge">
                          {item.confidence_score}/10
                        </span>
                      )}
                      <span className="time-badge">{timeAgo(item.created_at)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Player Stats Search — Premium+ */}
          {(userTier === 'premium' || userTier === 'vip' || userTier === 'admin') && (
            <div className="glass-card section-card">
              <div className="section-header">
                <h2><span className="section-icon">🏆</span> Player Stats Search</h2>
              </div>
              <div className="player-search-bar">
                <input
                  type="text"
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                  placeholder="Search player name (e.g., Patrick Mahomes)"
                  className="search-input"
                />
                <button className="btn-action btn-primary-action" disabled={!playerSearch}>Search</button>
              </div>
              <p className="empty-sub" style={{ marginTop: 8 }}>Search across NFL, NBA, NHL, MLB player databases</p>
            </div>
          )}

          {/* Quick Actions */}
          <h2 className="section-title">Quick Actions</h2>
          <div className="quick-actions-grid">
            {quickActions.map((action, i) => (
              <Link to={action.path} className="quick-action-card glass-card" key={i}>
                <div className="qa-icon" style={{ background: `${action.color}20` }}>
                  <span>{action.icon}</span>
                </div>
                <h3>{action.title}</h3>
                <p>{action.desc}</p>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}