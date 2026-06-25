import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../api/axios';
import { APP_EVENT_AUTH_CHANGED, APP_EVENT_CONTENT_CHANGED, emitAppEvent } from '../utils/appEvents';

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
        if (data.status !== 'running' && data.status !== 'queued') {
          setRunProgress(null);
          localStorage.removeItem('ascentium_run_progress');
          return;
        }
        setRunProgress(data);
      } catch (e) {
        setRunProgress(null);
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

  useEffect(() => {
    if (user?.role !== 'super_admin') return undefined;

    const syncPlatformFetchStatus = async () => {
      try {
        const { data } = await api.get('/admin/super/fetch/status');
        if (!data?.running || !data?.logId) return;
        setRunProgress((current) => {
          const currentLogId = current?.runId || current?.logId;
          if (currentLogId === data.logId && ['running', 'queued'].includes(current?.status)) {
            return current;
          }
          return {
            runId: data.logId,
            logId: data.logId,
            status: 'running',
            step: 'queued',
            percent: 5,
            messages: [
              { at: new Date().toISOString(), step: 'queued', message: 'Platform fetch queued from scheduler.' }
            ]
          };
        });
      } catch {
        // Ignore transient sync failures; fetch page and progress polling handle retries.
      }
    };

    const id = window.setInterval(syncPlatformFetchStatus, 5000);
    syncPlatformFetchStatus();
    return () => window.clearInterval(id);
  }, [user?.role]);

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
    emitAppEvent(APP_EVENT_AUTH_CHANGED, { user, session: activeSession });
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
    emitAppEvent(APP_EVENT_AUTH_CHANGED, { user: null, session: null });
  }, []);

  const updateProfile = useCallback(async (patch) => {
    const { data } = await api.patch('/auth/me', patch);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setUser(data.user);
    emitAppEvent(APP_EVENT_AUTH_CHANGED, { user: data.user, session });
    return data.user;
  }, [session]);

  const refreshMe = useCallback(async () => {
    const { data } = await api.get('/auth/me');
    setUser(data.user);
    setSession(data.session || null);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    if (data.session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(data.session));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
    emitAppEvent(APP_EVENT_AUTH_CHANGED, { user: data.user, session: data.session || null });
    return data.user;
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    const heartbeat = () => {
      refreshMe().catch(() => {});
    };

    const handleFocus = () => {
      if (document.visibilityState === 'hidden') return;
      refreshMe().catch(() => {});
    };

    const handleStorage = (event) => {
      if (![TOKEN_KEY, USER_KEY, SESSION_KEY].includes(event.key)) return;
      refreshMe().catch(() => {});
    };

    const id = window.setInterval(heartbeat, 10 * 1000);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [user, refreshMe]);

  useEffect(() => {
    const token = readToken();
    if (!token || !user?._id) return undefined;

    const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
    const streamUrl = `${baseUrl}/realtime/stream?token=${encodeURIComponent(token)}`;
    const stream = new EventSource(streamUrl);

    const handleContent = (event) => {
      try {
        const detail = JSON.parse(event.data || '{}');
        emitAppEvent(APP_EVENT_CONTENT_CHANGED, detail);
      } catch {
        emitAppEvent(APP_EVENT_CONTENT_CHANGED);
      }
    };

    const handleAuth = () => {
      refreshMe().catch(() => {});
    };

    stream.addEventListener('content', handleContent);
    stream.addEventListener('auth', handleAuth);

    return () => {
      stream.removeEventListener('content', handleContent);
      stream.removeEventListener('auth', handleAuth);
      stream.close();
    };
  }, [refreshMe, user?._id]);

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
        login, register, logout, updateProfile, setAuthState, refreshMe,
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
