import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    const res = await login(email, password);
    if (res.success) nav('/dashboard');
    else setError(res.error);
    setBusy(false);
  };

  return (
    <div style={styles.page}>
      {/* Ambient glow */}
      <div style={styles.glow} />

      <div className="fade-in" style={styles.wrapper}>
        {/* Logo */}
        <div style={styles.logo}>
          <span style={styles.logoIcon}>⚡</span>
          <span style={styles.logoText}>Valor Odds</span>
        </div>
        <p style={styles.subtitle}>Sign in to your account</p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={submit}>
          <label style={styles.label}>Email</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            style={{ marginBottom: 16 }}
          />

          <label style={styles.label}>Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            style={{ marginBottom: 24 }}
          />

          <button className="btn btn-primary btn-block" disabled={busy} type="submit">
            {busy ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p style={styles.footer}>
          Don't have an account?{' '}
          <Link to="/signup" style={styles.link}>Create one</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#0a0e1a', position: 'relative', overflow: 'hidden', padding: '2rem',
  },
  glow: {
    position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%,-50%)',
    width: 600, height: 600, borderRadius: '50%', pointerEvents: 'none',
    background: 'radial-gradient(circle, rgba(88,101,242,0.12) 0%, transparent 70%)',
  },
  wrapper: {
    position: 'relative', zIndex: 1, width: '100%', maxWidth: 400,
    background: '#1a1f35', border: '1px solid #2d3350', borderRadius: 16, padding: '2.5rem',
  },
  logo: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 },
  logoIcon: { fontSize: 32 },
  logoText: { fontSize: 28, fontWeight: 800, color: '#fff' },
  subtitle: { textAlign: 'center', color: '#b9bbbe', marginBottom: 28, fontSize: 14 },
  label: { display: 'block', marginBottom: 6, color: '#b9bbbe', fontSize: 13, fontWeight: 600 },
  error: {
    padding: '12px 16px', marginBottom: 20, borderRadius: 8,
    background: 'rgba(237,66,69,0.1)', border: '1px solid #ED4245',
    color: '#ED4245', fontSize: 14,
  },
  footer: { textAlign: 'center', marginTop: 24, color: '#b9bbbe', fontSize: 14 },
  link: { color: '#5865F2', textDecoration: 'none', fontWeight: 600 },
};