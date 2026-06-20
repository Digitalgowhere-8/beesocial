import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);
const TOKEN_KEY = 'opportunityos_token';
const USER_KEY = 'opportunityos_user';

function readStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return readStoredUser();
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  const [runProgress, setRunProgress] = useState(() => {
    try {
      const saved = localStorage.getItem('ascentium_run_progress');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && ['running', 'queued'].includes(parsed.status)) return parsed;
      }
    } catch (_e) { /* ignore */ }
    return null;
  });

  useEffect(() => {
    try {
      if (runProgress && ['running', 'queued'].includes(runProgress.status)) {
        localStorage.setItem('ascentium_run_progress', JSON.stringify(runProgress));
      } else {
        localStorage.removeItem('ascentium_run_progress');
      }
    } catch (_e) { /* ignore */ }
  }, [runProgress]);

  useEffect(() => {
    const logId = runProgress?.runId || runProgress?.logId;
    if (!logId || !['running', 'queued'].includes(runProgress?.status)) return undefined;

    const poll = async () => {
      try {
        const { data } = await api.get(`/n8n/runs/${logId}/progress`);
        setRunProgress(data);
        if (data.status !== 'running' && data.status !== 'queued') {
          localStorage.removeItem('ascentium_run_progress');
        }
      } catch (e) {
        setRunProgress((prev) => ({
          ...(prev || {}),
          status: 'failed',
          step: 'progress',
          messages: [
            ...((prev?.messages || []).slice(-20)),
            { at: new Date().toISOString(), step: 'progress', message: `Progress check failed: ${e.message}` }
          ]
        }));
        localStorage.removeItem('ascentium_run_progress');
      }
    };

    const id = window.setInterval(poll, 1500);
    poll();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') poll();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [runProgress?.runId, runProgress?.logId, runProgress?.status]);

  // On mount, verify token is still valid
  useEffect(() => {
    const token = readToken();
    if (!token) { setLoading(false); return; }
    api.get('/auth/me')
      .then((r) => {
        setUser(r.data.user);
        localStorage.setItem(USER_KEY, JSON.stringify(r.data.user));
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    const heartbeat = () => {
      api.get('/auth/me')
        .then((r) => {
          setUser(r.data.user);
          localStorage.setItem(USER_KEY, JSON.stringify(r.data.user));
        })
        .catch(() => {});
    };

    const id = window.setInterval(heartbeat, 45 * 1000);
    return () => window.clearInterval(id);
  }, [user]);

  const persist = (token, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
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
    const token = readToken();
    api.post('/auth/logout', null, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined).catch(() => {});
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (patch) => {
    const { data } = await api.patch('/auth/me', patch);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
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
        login, register, logout, updateProfile,
        runProgress, setRunProgress
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
