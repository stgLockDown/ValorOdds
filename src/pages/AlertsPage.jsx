import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const DEFAULT_ALERTS = [
  { id: 1, type: 'arbitrage', label: 'Arbitrage > 2% Profit', enabled: true, sport: 'All' },
  { id: 2, type: 'arbitrage', label: 'Low Risk Opportunities', enabled: true, sport: 'All' },
  { id: 3, type: 'props', label: 'High Confidence Props', enabled: false, sport: 'NFL' },
  { id: 4, type: 'score', label: 'Game Start Notifications', enabled: false, sport: 'All' },
  { id: 5, type: 'injury', label: 'Key Player Injuries', enabled: true, sport: 'All' },
];

export default function AlertsPage() {
  const { plan } = useAuth();
  const [alerts, setAlerts] = useState(DEFAULT_ALERTS);
  const [history] = useState([]);

  const toggle = (id) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));
  };

  const activeCount = alerts.filter(a => a.enabled).length;

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">🔔 Alerts & Notifications</h1>
          <p className="dash-subtitle">Customize your real-time alert preferences</p>
        </div>
      </div>

      {/* Active Alerts Summary */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 0 }}>
        <div className="stat-card glass-card">
          <div className="stat-icon" style={{ background: '#57F28720' }}><span>🔔</span></div>
          <div className="stat-value" style={{ color: '#57F287' }}>{activeCount}</div>
          <div className="stat-label">Active Alerts</div>
        </div>
        <div className="stat-card glass-card">
          <div className="stat-icon" style={{ background: '#5865F220' }}><span>📨</span></div>
          <div className="stat-value" style={{ color: '#5865F2' }}>{history.length}</div>
          <div className="stat-label">Triggered Today</div>
        </div>
      </div>

      {/* Alert Settings */}
      <div className="glass-card section-card">
        <div className="section-header">
          <h2><span className="section-icon">⚙️</span> Alert Settings</h2>
        </div>
        <div className="alerts-list">
          {alerts.map(alert => (
            <div className="alert-setting" key={alert.id}>
              <div className="alert-info">
                <span className="alert-type-icon">
                  {alert.type === 'arbitrage' ? '📈' : alert.type === 'props' ? '🏆' : alert.type === 'score' ? '📡' : '🏥'}
                </span>
                <div>
                  <div className="alert-label">{alert.label}</div>
                  <div className="alert-meta">Sport: {alert.sport}</div>
                </div>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" checked={alert.enabled} onChange={() => toggle(alert.id)} />
                <span className="toggle-slider"></span>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Alert History */}
      <div className="glass-card section-card">
        <div className="section-header">
          <h2><span className="section-icon">📜</span> Alert History</h2>
        </div>
        <div className="empty-state">
          <span className="empty-icon">📜</span>
          <p>No alerts triggered yet today.</p>
          <p className="empty-sub">Your alert history will appear here.</p>
        </div>
      </div>
    </div>
  );
}