import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('ascentium_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  // On mount, verify token is still valid
  useEffect(() => {
    const token = localStorage.getItem('ascentium_token');
    if (!token) { setLoading(false); return; }
    api.get('/auth/me')
      .then((r) => {
        setUser(r.data.user);
        localStorage.setItem('ascentium_user', JSON.stringify(r.data.user));
      })
      .catch(() => {
        localStorage.removeItem('ascentium_token');
        localStorage.removeItem('ascentium_user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const persist = (token, user) => {
    localStorage.setItem('ascentium_token', token);
    localStorage.setItem('ascentium_user', JSON.stringify(user));
    setUser(user);
  };

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    persist(data.token, data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    if (data.token && data.user) {
      persist(data.token, data.user);
    }
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('ascentium_token');
    localStorage.removeItem('ascentium_user');
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (patch) => {
    const { data } = await api.patch('/auth/me', patch);
    localStorage.setItem('ascentium_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin: user?.role === 'admin' || user?.role === 'super_admin',
        isSuperAdmin: user?.role === 'super_admin',
        login, register, logout, updateProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
