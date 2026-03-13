import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || '';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('vo_token'));
  const [loading, setLoading] = useState(true);

  const api = useCallback(() => {
    const t = localStorage.getItem('vo_token');
    return axios.create({
      baseURL: API,
      headers: t ? { Authorization: `Bearer ${t}` } : {},
    });
  }, []);

  const checkAuth = useCallback(async () => {
    const saved = localStorage.getItem('vo_token');
    if (!saved) { setLoading(false); return; }
    try {
      const { data } = await api().get('/api/auth/me');
      setUser(data.user);
      setToken(saved);
    } catch {
      localStorage.removeItem('vo_token');
      setToken(null);
      setUser(null);
    }
    setLoading(false);
  }, [api]);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const login = async (email, password) => {
    try {
      const { data } = await api().post('/api/auth/login', { email, password });
      localStorage.setItem('vo_token', data.token);
      setToken(data.token);
      setUser(data.user);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Login failed' };
    }
  };

  const register = async (email, password, name) => {
    try {
      const { data } = await api().post('/api/auth/register', { email, password, name });
      localStorage.setItem('vo_token', data.token);
      setToken(data.token);
      setUser(data.user);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Registration failed' };
    }
  };

  const logout = () => {
    localStorage.removeItem('vo_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user, token, loading, login, register, logout,
      isAdmin: user?.role === 'admin',
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};