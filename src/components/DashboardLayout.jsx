import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './DashboardLayout.css';

/* ───────────────────────────────────────────────────────────────
   Navigation structure — mirrors the Base44 sidebar
   ─────────────────────────────────────────────────────────────── */
const NAV = [
  { type: 'single', label: 'Dashboard', icon: '📊', path: '/dashboard' },
  {
    type: 'group', label: 'Intelligence', icon: '🧠',
    items: [
      { label: 'AI Analysis',    icon: '🤖', path: '/ai-analysis' },
      { label: 'AI Summary',     icon: '✨', path: '/ai-summary' },
      { label: 'Live Scores',    icon: '📡', path: '/scores' },
      { label: 'Game Day Hub',   icon: '⚡', path: '/gameday' },
      { label: 'Weather',        icon: '🌤', path: '/weather', tier: 'premium' },
    ],
  },
  {
    type: 'group', label: 'Opportunities', icon: '🎯',
    items: [
      { label: 'Arbitrage',        icon: '📈', path: '/arbitrage' },
      { label: 'Odds Comparison',  icon: '📊', path: '/odds' },
      { label: 'Player Props',     icon: '🏆', path: '/props', tier: 'premium' },
    ],
  },
  {
    type: 'group', label: 'Analytics', icon: '📉',
    items: [
      { label: 'My Profile',     icon: '👤', path: '/profile' },
      { label: 'Bet Tracker',    icon: '💰', path: '/bets' },
      { label: 'Alerts',         icon: '🔔', path: '/alerts', tier: 'premium' },
    ],
  },
  {
    type: 'group', label: 'Community', icon: '⭐',
    items: [
      { label: 'Leaderboard',    icon: '🏅', path: '/leaderboard' },
      { label: 'Achievements',   icon: '🏆', path: '/achievements' },
    ],
  },
  {
    type: 'group', label: 'System', icon: '⚙️',
    items: [
      { label: 'Settings',       icon: '⚙️', path: '/settings' },
      { label: 'Upgrade',        icon: '⚡', path: '/upgrade' },
      ...[{ label: 'Marketing Agent', icon: '📣', path: '/admin/marketing-agent', tier: 'admin' }],
    ],
  },
];

export default function DashboardLayout({ children }) {
  const { user, logout, plan, isAdmin } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState(() => {
    // Auto-open the group containing the current path
    const open = {};
    NAV.forEach((item) => {
      if (item.type === 'group') {
        const hasActive = item.items.some((i) => location.pathname === i.path);
        if (hasActive) open[item.label] = true;
      }
    });
    return open;
  });

  const toggleGroup = (label) => {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const isActive = (path) => location.pathname === path;

  const userTier = isAdmin ? 'admin' : (plan || 'free');

  const canAccess = (tier) => {
    if (!tier || tier === 'free') return true;
    if (tier === 'admin') return isAdmin;
    if (tier === 'premium') return ['premium', 'vip'].includes(plan) || isAdmin;
    if (tier === 'vip') return plan === 'vip' || isAdmin;
    return true;
  };

  return (
    <div className="dash-layout">
      {/* Mobile toggle */}
      <button
        className="dash-mobile-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? '✕' : '☰'}
      </button>

      {/* Overlay */}
      <div
        className={`dash-overlay${sidebarOpen ? ' visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`dash-sidebar${sidebarOpen ? '' : ' closed'}`}>
        {/* Logo */}
        <div className="dash-logo">
          <h1>Valor Odds</h1>
          <p>Smart Arbitrage Intelligence</p>
        </div>

        {/* Navigation */}
        <nav className="dash-nav">
          {NAV.map((item) => {
            if (item.type === 'single') {
              return (
                <Link
                  key={item.label}
                  to={item.path}
                  className={`dash-nav-single${isActive(item.path) ? ' active' : ''}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <span className="group-icon">{item.icon}</span>
                  {item.label}
                </Link>
              );
            }

            // Filter out items user can't see (admin-only items for non-admins)
            const visibleItems = item.items.filter((i) => {
              if (i.tier === 'admin' && !isAdmin) return false;
              return true;
            });

            if (visibleItems.length === 0) return null;

            const groupOpen = openGroups[item.label];
            const hasActive = visibleItems.some((i) => isActive(i.path));

            return (
              <div key={item.label} className="dash-nav-group">
                <div
                  className={`dash-nav-group-title${hasActive ? ' active' : ''}${groupOpen ? ' open' : ''}`}
                  onClick={() => toggleGroup(item.label)}
                >
                  <span className="group-icon">{item.icon}</span>
                  {item.label}
                  <span className="chevron">▶</span>
                </div>
                <div className={`dash-nav-items${groupOpen ? ' open' : ''}`}>
                  {visibleItems.map((sub) => (
                    <Link
                      key={sub.path}
                      to={sub.path}
                      className={`dash-nav-link${isActive(sub.path) ? ' active' : ''}`}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <span className="link-icon">{sub.icon}</span>
                      {sub.label}
                      {sub.tier && sub.tier !== 'free' && sub.tier !== 'admin' && !canAccess(sub.tier) && (
                        <span className={`tier-lock ${sub.tier}`}>{sub.tier}</span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* User section */}
        {user && (
          <div className="dash-user">
            <div className="dash-user-info">
              <div className="dash-user-avatar">👤</div>
              <div>
                <div className="dash-user-name">{user.name || user.email}</div>
                <div className={`dash-user-tier ${userTier}`}>{userTier}</div>
              </div>
            </div>
            <button className="dash-logout-btn" onClick={logout}>
              🚪 Logout
            </button>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="dash-main">
        {children}
      </main>
    </div>
  );
}