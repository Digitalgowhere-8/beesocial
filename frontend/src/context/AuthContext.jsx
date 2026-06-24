import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);
const TOKEN_KEY = 'opportunityos_token';
const USER_KEY = 'opportunityos_user';
const SESSION_KEY = 'opportunityos_session';

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

function readStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearAuthStorage() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(SESSION_KEY);
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
  const [session, setSession] = useState(() => {
    try {
      return readStoredSession();
    } catch {
      return null;
    }
  });

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
        setSession(r.data.session || null);
        localStorage.setItem(USER_KEY, JSON.stringify(r.data.user));
        if (r.data.session) {
          localStorage.setItem(SESSION_KEY, JSON.stringify(r.data.session));
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      })
      .catch(() => {
        clearAuthStorage();
        setUser(null);
        setSession(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    const heartbeat = () => {
      api.get('/auth/me')
        .then((r) => {
          setUser(r.data.user);
          setSession(r.data.session || null);
          localStorage.setItem(USER_KEY, JSON.stringify(r.data.user));
          if (r.data.session) {
            localStorage.setItem(SESSION_KEY, JSON.stringify(r.data.session));
          } else {
            localStorage.removeItem(SESSION_KEY);
          }
        })
        .catch(() => {});
    };

    const id = window.setInterval(heartbeat, 45 * 1000);
    return () => window.clearInterval(id);
  }, [user]);

  const persist = useCallback((token, user, activeSession = null) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    if (activeSession) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(activeSession));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
    setUser(user);
    setSession(activeSession);
  }, []);

  const setAuthState = useCallback((payload = {}) => {
    if (!payload?.token || !payload?.user) return;
    persist(payload.token, payload.user, payload.session || null);
  }, [persist]);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    persist(data.token, data.user, data.session || null);
    return data.user;
  }, [persist]);

  const register = useCallback(async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    if (data.token && data.user) {
      persist(data.token, data.user, data.session || null);
    }
    return data.user;
  }, [persist]);

  const logout = useCallback(() => {
    const token = readToken();
    api.post('/auth/logout', null, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined).catch(() => {});
    clearAuthStorage();
    setUser(null);
    setSession(null);
  }, []);

  const updateProfile = useCallback(async (patch) => {
    const { data } = await api.patch('/auth/me', patch);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const listSessions = useCallback(async () => {
    const { data } = await api.get('/auth/sessions');
    return data.items || [];
  }, []);

  const revokeSession = useCallback(async (sessionId, reason = 'revoked_by_user') => {
    const { data } = await api.post(`/auth/sessions/${sessionId}/revoke`, { reason });
    return data;
  }, []);

  const logoutAllSessions = useCallback(async () => {
    const { data } = await api.post('/auth/logout-all');
    clearAuthStorage();
    setUser(null);
    setSession(null);
    return data;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isAdmin: user?.role === 'admin' || user?.role === 'super_admin',
        isSuperAdmin: user?.role === 'super_admin',
        login, register, logout, updateProfile, setAuthState,
        listSessions, revokeSession, logoutAllSessions,
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
