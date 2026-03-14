import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

export default function WeatherPage() {
  const { api, plan } = useAuth();
  const [weather, setWeather] = useState([]);
  const [loading, setLoading] = useState(true);
  const isPremium = plan === 'premium' || plan === 'vip' || plan === 'admin';

  const fetchWeather = useCallback(async () => {
    if (!isPremium) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await api().get('/api/games/weather?limit=20');
      setWeather(Array.isArray(data) ? data : []);
    } catch { setWeather([]); }
    setLoading(false);
  }, [api, isPremium]);

  useEffect(() => { fetchWeather(); }, [fetchWeather]);

  if (!isPremium) {
    return (
      <div className="dash-page">
        <div className="dash-header"><h1 className="dash-title">🌤️ Weather Impact</h1></div>
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <span style={{ fontSize: 64, display: 'block', marginBottom: 16 }}>🔒</span>
          <h2 style={{ fontSize: 24, marginBottom: 8 }}>Premium Feature</h2>
          <p className="dash-subtitle" style={{ marginBottom: 24 }}>
            Weather impact analysis is available on Premium and VIP plans.
          </p>
          <Link to="/upgrade" className="btn-action btn-primary-action">Upgrade Now</Link>
        </div>
      </div>
    );
  }

  const weatherIcon = (condition) => {
    const c = (condition || '').toLowerCase();
    if (c.includes('rain') || c.includes('storm')) return '🌧️';
    if (c.includes('snow')) return '🌨️';
    if (c.includes('wind')) return '💨';
    if (c.includes('cloud')) return '☁️';
    if (c.includes('sun') || c.includes('clear')) return '☀️';
    if (c.includes('fog')) return '🌫️';
    return '🌤️';
  };

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">🌤️ Weather Impact</h1>
          <p className="dash-subtitle">How weather conditions affect today's games</p>
        </div>
        <button onClick={fetchWeather} className="btn-action btn-primary-action" disabled={loading}>
          {loading ? '⏳' : '🔄'} Refresh
        </button>
      </div>

      {loading ? (
        <div className="dash-loading"><div className="dash-spinner" /><span>Loading weather data…</span></div>
      ) : weather.length === 0 ? (
        <div className="glass-card">
          <div className="empty-state">
            <span className="empty-icon">🌤️</span>
            <p>No weather alerts right now.</p>
            <p className="empty-sub">Weather impacts are tracked for outdoor games.</p>
          </div>
        </div>
      ) : (
        <div className="weather-grid">
          {weather.map((w, i) => (
            <div className="glass-card weather-card" key={i}>
              <div className="weather-icon-lg">{weatherIcon(w.condition || w.weather_type)}</div>
              <div className="weather-info">
                <h3>{w.venue || w.location || 'Unknown Venue'}</h3>
                <p className="weather-condition">{w.condition || w.weather_type || w.alert_type || 'Normal'}</p>
                {w.temperature && <p className="weather-temp">🌡️ {w.temperature}°F</p>}
                {w.wind_speed && <p className="weather-wind">💨 {w.wind_speed} mph</p>}
                {w.impact_level && (
                  <span className={`impact-tag impact-${(w.impact_level || '').toLowerCase()}`}>
                    Impact: {w.impact_level}
                  </span>
                )}
              </div>
              {w.game && <div className="weather-game">{w.game}</div>}
              {w.recommendation && <p className="weather-rec">💡 {w.recommendation}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}