import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import HomePage from './components/HomePage';
import Login from './components/Login';
import Signup from './components/Signup';
import DashboardLayout from './components/DashboardLayout';
import ValorMarketingAgent from './components/ValorMarketingAgent';
import './pages/pages.css';

// Pages
import DashboardPage from './pages/DashboardPage';
import ArbitragePage from './pages/ArbitragePage';
import ScoresPage from './pages/ScoresPage';
import PropsPage from './pages/PropsPage';
import AIAnalysisPage from './pages/AIAnalysisPage';
import AISummaryPage from './pages/AISummaryPage';
import OddsComparisonPage from './pages/OddsComparisonPage';
import GameDayPage from './pages/GameDayPage';
import WeatherPage from './pages/WeatherPage';
import BetTrackerPage from './pages/BetTrackerPage';
import AlertsPage from './pages/AlertsPage';
import LeaderboardPage from './pages/LeaderboardPage';
import SettingsPage from './pages/SettingsPage';
import UpgradePage from './pages/UpgradePage';

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <SplashLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <SplashLoader />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

function HomeRoute() {
  const { user, loading } = useAuth();
  if (loading) return <SplashLoader />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <HomePage />;
}

function SplashLoader() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0a0e1a', flexDirection: 'column', gap: 16
    }}>
      <div style={{
        width: 48, height: 48, border: '3px solid #2d3350',
        borderTopColor: '#5865F2', borderRadius: '50%',
        animation: 'spin .8s linear infinite'
      }} />
      <span style={{ color: '#b9bbbe', fontSize: 14 }}>Loading Valor Odds…</span>
    </div>
  );
}

/* Wrapper: DashboardLayout wraps all authenticated pages */
function DashProtected({ children, adminOnly = false }) {
  return (
    <ProtectedRoute adminOnly={adminOnly}>
      <DashboardLayout>
        {children}
      </DashboardLayout>
    </ProtectedRoute>
  );
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<HomeRoute />} />
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />

      {/* Dashboard (authenticated with sidebar) */}
      <Route path="/dashboard" element={<DashProtected><DashboardPage /></DashProtected>} />

      {/* Intelligence */}
      <Route path="/ai-analysis" element={<DashProtected><AIAnalysisPage /></DashProtected>} />
      <Route path="/ai-summary" element={<DashProtected><AISummaryPage /></DashProtected>} />
      <Route path="/scores" element={<DashProtected><ScoresPage /></DashProtected>} />
      <Route path="/gameday" element={<DashProtected><GameDayPage /></DashProtected>} />
      <Route path="/weather" element={<DashProtected><WeatherPage /></DashProtected>} />

      {/* Opportunities */}
      <Route path="/arbitrage" element={<DashProtected><ArbitragePage /></DashProtected>} />
      <Route path="/odds" element={<DashProtected><OddsComparisonPage /></DashProtected>} />
      <Route path="/props" element={<DashProtected><PropsPage /></DashProtected>} />

      {/* Analytics */}
      <Route path="/bets" element={<DashProtected><BetTrackerPage /></DashProtected>} />
      <Route path="/alerts" element={<DashProtected><AlertsPage /></DashProtected>} />

      {/* Community */}
      <Route path="/leaderboard" element={<DashProtected><LeaderboardPage /></DashProtected>} />

      {/* System */}
      <Route path="/settings" element={<DashProtected><SettingsPage /></DashProtected>} />
      <Route path="/upgrade" element={<DashProtected><UpgradePage /></DashProtected>} />

      {/* Admin */}
      <Route path="/admin/marketing-agent" element={<DashProtected adminOnly><ValorMarketingAgent /></DashProtected>} />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}