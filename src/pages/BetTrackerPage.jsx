import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function BetTrackerPage() {
  const { user } = useAuth();
  const [bets, setBets] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    sport: '', teams: '', bookmaker: '', odds: '', stake: '', type: 'moneyline', result: 'pending'
  });

  const handleAdd = () => {
    if (!form.teams || !form.stake) return;
    const newBet = {
      ...form,
      id: Date.now(),
      date: new Date().toISOString(),
      payout: form.result === 'won' ? (parseFloat(form.stake) * 2).toFixed(2) : '0.00',
    };
    setBets(prev => [newBet, ...prev]);
    setForm({ sport: '', teams: '', bookmaker: '', odds: '', stake: '', type: 'moneyline', result: 'pending' });
    setShowForm(false);
  };

  const totalStaked = bets.reduce((s, b) => s + parseFloat(b.stake || 0), 0);
  const totalWon = bets.filter(b => b.result === 'won').reduce((s, b) => s + parseFloat(b.payout || 0), 0);
  const winRate = bets.length > 0 ? ((bets.filter(b => b.result === 'won').length / bets.length) * 100).toFixed(0) : 0;

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">💰 Bet Tracker</h1>
          <p className="dash-subtitle">Track and manage all your betting activity</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-action btn-primary-action">
          {showForm ? '✕ Cancel' : '+ New Bet'}
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <div className="stat-card glass-card">
          <div className="stat-icon" style={{ background: '#5865F220' }}><span>📊</span></div>
          <div className="stat-value" style={{ color: '#5865F2' }}>{bets.length}</div>
          <div className="stat-label">Total Bets</div>
        </div>
        <div className="stat-card glass-card">
          <div className="stat-icon" style={{ background: '#E8820C20' }}><span>💵</span></div>
          <div className="stat-value" style={{ color: '#E8820C' }}>${totalStaked.toFixed(2)}</div>
          <div className="stat-label">Total Staked</div>
        </div>
        <div className="stat-card glass-card">
          <div className="stat-icon" style={{ background: '#57F28720' }}><span>🏆</span></div>
          <div className="stat-value" style={{ color: '#57F287' }}>${totalWon.toFixed(2)}</div>
          <div className="stat-label">Total Won</div>
        </div>
        <div className="stat-card glass-card">
          <div className="stat-icon" style={{ background: '#9B59B620' }}><span>🎯</span></div>
          <div className="stat-value" style={{ color: '#9B59B6' }}>{winRate}%</div>
          <div className="stat-label">Win Rate</div>
        </div>
      </div>

      {/* Add Bet Form */}
      {showForm && (
        <div className="glass-card section-card" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 16 }}>Log New Bet</h3>
          <div className="form-grid">
            <div className="form-field">
              <label>Sport</label>
              <select value={form.sport} onChange={e => setForm({ ...form, sport: e.target.value })} className="filter-select">
                <option value="">Select Sport</option>
                <option value="NFL">🏈 NFL</option>
                <option value="NBA">🏀 NBA</option>
                <option value="MLB">⚾ MLB</option>
                <option value="NHL">🏒 NHL</option>
                <option value="Soccer">⚽ Soccer</option>
                <option value="Other">🎯 Other</option>
              </select>
            </div>
            <div className="form-field">
              <label>Teams / Event</label>
              <input type="text" value={form.teams} onChange={e => setForm({ ...form, teams: e.target.value })}
                className="filter-input" placeholder="e.g., Chiefs vs Bills" />
            </div>
            <div className="form-field">
              <label>Bookmaker</label>
              <input type="text" value={form.bookmaker} onChange={e => setForm({ ...form, bookmaker: e.target.value })}
                className="filter-input" placeholder="e.g., DraftKings" />
            </div>
            <div className="form-field">
              <label>Odds</label>
              <input type="text" value={form.odds} onChange={e => setForm({ ...form, odds: e.target.value })}
                className="filter-input" placeholder="e.g., -110" />
            </div>
            <div className="form-field">
              <label>Stake ($)</label>
              <input type="number" value={form.stake} onChange={e => setForm({ ...form, stake: e.target.value })}
                className="filter-input" placeholder="0.00" min="0" step="1" />
            </div>
            <div className="form-field">
              <label>Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="filter-select">
                <option value="moneyline">Moneyline</option>
                <option value="spread">Spread</option>
                <option value="over_under">Over/Under</option>
                <option value="parlay">Parlay</option>
                <option value="prop">Player Prop</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button onClick={handleAdd} className="btn-action btn-primary-action" disabled={!form.teams || !form.stake}>
              Save Bet
            </button>
            <button onClick={() => setShowForm(false)} className="btn-action btn-secondary-action">Cancel</button>
          </div>
        </div>
      )}

      {/* Bet List */}
      {bets.length === 0 ? (
        <div className="glass-card" style={{ marginTop: 16 }}>
          <div className="empty-state">
            <span className="empty-icon">💰</span>
            <p>No bets tracked yet.</p>
            <p className="empty-sub">Click "New Bet" to start logging your betting activity.</p>
          </div>
        </div>
      ) : (
        <div className="glass-card section-card" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 16 }}>Recent Bets</h3>
          <div className="activity-list">
            {bets.map(bet => (
              <div className="activity-item" key={bet.id}>
                <div className="activity-left">
                  <span className="activity-emoji">{bet.sport === 'NFL' ? '🏈' : bet.sport === 'NBA' ? '🏀' : bet.sport === 'MLB' ? '⚾' : '🎯'}</span>
                  <div>
                    <div className="activity-title">{bet.teams}</div>
                    <div className="activity-meta">{bet.bookmaker} • {bet.type} • {bet.odds}</div>
                  </div>
                </div>
                <div className="activity-right">
                  <span style={{ fontWeight: 700, color: '#E8820C' }}>${bet.stake}</span>
                  <span className={`status-tag ${bet.result === 'won' ? 'status-won' : bet.result === 'lost' ? 'status-lost' : 'status-pending'}`}>
                    {bet.result.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}