import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function SettingsPage() {
  const { user, updateUser, plan, subscriptionActive, openPortal, api } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  const handleSaveName = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { data } = await api().put('/api/user/profile', { name: name.trim() });
      updateUser({ name: data.name });
      setMsg({ type: 'success', text: 'Profile updated successfully!' });
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to update profile' });
    }
    setSaving(false);
  };

  const handleChangePw = async () => {
    if (newPw !== confirmPw) return setMsg({ type: 'error', text: 'Passwords do not match' });
    if (newPw.length < 6) return setMsg({ type: 'error', text: 'Password must be at least 6 characters' });
    setSaving(true);
    try {
      await api().put('/api/user/password', { currentPassword: currentPw, newPassword: newPw });
      setMsg({ type: 'success', text: 'Password changed successfully!' });
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to change password' });
    }
    setSaving(false);
  };

  const handleManageSub = async () => {
    const result = await openPortal();
    if (result.success && result.url) window.location.href = result.url;
    else setMsg({ type: 'error', text: result.error || 'Failed to open portal' });
  };

  return (
    <div className="dash-page">
      <div className="dash-header">
        <h1 className="dash-title">⚙️ Settings</h1>
      </div>

      {msg && (
        <div className={`dash-alert dash-alert-${msg.type}`} style={{ marginBottom: 16 }}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="dash-alert-close">&times;</button>
        </div>
      )}

      {/* Profile */}
      <div className="glass-card section-card">
        <div className="section-header">
          <h2><span className="section-icon">👤</span> Profile</h2>
        </div>
        <div className="settings-form">
          <div className="form-field">
            <label>Email</label>
            <input type="email" value={user?.email || ''} disabled className="filter-input" style={{ opacity: 0.6 }} />
          </div>
          <div className="form-field">
            <label>Display Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="filter-input" placeholder="Your name" />
          </div>
          <div className="form-field">
            <label>Role</label>
            <input type="text" value={user?.role || 'user'} disabled className="filter-input" style={{ opacity: 0.6 }} />
          </div>
          <button onClick={handleSaveName} disabled={saving} className="btn-action btn-primary-action" style={{ marginTop: 8 }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Subscription */}
      <div className="glass-card section-card">
        <div className="section-header">
          <h2><span className="section-icon">💳</span> Subscription</h2>
        </div>
        <div className="settings-form">
          <div className="tier-display">
            <span className="tier-label">Current Plan</span>
            <span className={`tier-badge tier-${plan}`}>{(plan || 'free').toUpperCase()}</span>
          </div>
          <div className="tier-display">
            <span className="tier-label">Status</span>
            <span style={{ color: subscriptionActive ? '#57F287' : '#b9bbbe' }}>
              {subscriptionActive ? '✅ Active' : '⏸️ Inactive'}
            </span>
          </div>
          {subscriptionActive && plan !== 'free' && (
            <button onClick={handleManageSub} className="btn-action btn-secondary-action" style={{ marginTop: 12 }}>
              Manage Subscription
            </button>
          )}
        </div>
      </div>

      {/* Change Password */}
      <div className="glass-card section-card">
        <div className="section-header">
          <h2><span className="section-icon">🔒</span> Change Password</h2>
        </div>
        <div className="settings-form">
          <div className="form-field">
            <label>Current Password</label>
            <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} className="filter-input" />
          </div>
          <div className="form-field">
            <label>New Password</label>
            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} className="filter-input" placeholder="Min 6 characters" />
          </div>
          <div className="form-field">
            <label>Confirm New Password</label>
            <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className="filter-input" />
          </div>
          <button onClick={handleChangePw} disabled={saving || !currentPw || !newPw}
            className="btn-action btn-primary-action" style={{ marginTop: 8 }}>
            {saving ? 'Changing…' : 'Change Password'}
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="glass-card section-card" style={{ borderColor: '#ED424550' }}>
        <div className="section-header">
          <h2 style={{ color: '#ED4245' }}><span className="section-icon">⚠️</span> Danger Zone</h2>
        </div>
        <p className="dash-subtitle" style={{ marginBottom: 16 }}>
          These actions are permanent and cannot be undone.
        </p>
        <button className="btn-action" style={{ background: 'rgba(237,66,69,0.15)', color: '#ED4245', border: '1px solid #ED424550' }}>
          Delete Account
        </button>
      </div>
    </div>
  );
}