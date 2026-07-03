import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import api from '../api/axios';
import { APP_EVENT_AUTH_CHANGED, APP_EVENT_CONTENT_CHANGED, emitAppEvent } from '../utils/appEvents';

const AuthContext = createContext(null);
const TOKEN_KEY = 'opportunityos_token';
const USER_KEY = 'opportunityos_user';
const SESSION_KEY = 'opportunityos_session';
const AUTH_REDIRECT_NOTICE_KEY = 'auth_redirect_notice';
const GENERATION_PROGRESS_POLL_MS = 1500;

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

function authSignature(user, session, uiSettings) {
  return JSON.stringify({
    userId: user?._id || '',
    role: user?.role || '',
    isActive: Boolean(user?.isActive),
    sessionId: session?.sessionId || '',
    uiSettings: uiSettings || null
  });
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
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [uiSettings, setUiSettings] = useState(null);
  const lastAuthSignatureRef = useRef('');

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

  const [genProgress, setGenProgress] = useState(() => {
    try {
      const saved = localStorage.getItem('ascentium_gen_progress');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.status === 'running') return parsed;
      }
    } catch (_e) { /* ignore */ }
    return null;
  });

  // Persist runProgress to localStorage
  useEffect(() => {
    try {
      if (runProgress && ['running', 'queued'].includes(runProgress.status)) {
        localStorage.setItem('ascentium_run_progress', JSON.stringify(runProgress));
      } else {
        localStorage.removeItem('ascentium_run_progress');
      }
    } catch (_e) { /* ignore */ }
  }, [runProgress]);

  // Persist genProgress to localStorage
  useEffect(() => {
    try {
      if (genProgress && genProgress.status === 'running') {
        localStorage.setItem('ascentium_gen_progress', JSON.stringify(genProgress));
      } else {
        localStorage.removeItem('ascentium_gen_progress');
      }
    } catch (_e) { /* ignore */ }
  }, [genProgress]);

  // Poll for fetch run progress
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

    const id = window.setInterval(poll, 4000);
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

  // Poll for generation progress (blog / linkedin) — updates genProgress with backend status
  useEffect(() => {
    if (!genProgress || genProgress.status !== 'running') return undefined;

    const poll = async () => {
      try {
        const { data } = await api.get('/blogs/generation-status');
        if (!data || data.status === 'idle') {
          setGenProgress(null);
          localStorage.removeItem('ascentium_gen_progress');
        } else {
          setGenProgress(data);
        }
      } catch {
        // On auth / network error, leave the state as-is and retry next poll
      }
    };

    const id = window.setInterval(poll, GENERATION_PROGRESS_POLL_MS);
    poll();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') poll();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [genProgress?.status]);

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

    const id = window.setInterval(syncPlatformFetchStatus, 15000);
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
        setUiSettings(r.data.uiSettings || null);
        localStorage.setItem(USER_KEY, JSON.stringify(r.data.user));
        if (r.data.session) {
          localStorage.setItem(SESSION_KEY, JSON.stringify(r.data.session));
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      })
      .catch((err) => {
        try {
          if (err?.response?.data?.message) {
            sessionStorage.setItem(AUTH_REDIRECT_NOTICE_KEY, err.response.data.message);
          }
        } catch {
          // Ignore storage failures during auth bootstrap.
        }
        clearAuthStorage();
        setUser(null);
        setSession(null);
        setUiSettings(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const persist = useCallback((token, user, activeSession = null, nextUiSettings = null) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    if (activeSession) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(activeSession));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
    setUser(user);
    setSession(activeSession);
    setUiSettings(nextUiSettings);
    lastAuthSignatureRef.current = authSignature(user, activeSession, nextUiSettings);
    emitAppEvent(APP_EVENT_AUTH_CHANGED, { user, session: activeSession });
  }, [lastAuthSignatureRef]);

  const setAuthState = useCallback((payload = {}) => {
    if (!payload?.token || !payload?.user) return;
    persist(payload.token, payload.user, payload.session || null, payload.uiSettings || null);
  }, [persist]);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    persist(data.token, data.user, data.session || null, data.uiSettings || null);
    return data.user;
  }, [persist]);

  const register = useCallback(async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    if (data.token && data.user) {
      persist(data.token, data.user, data.session || null, data.uiSettings || null);
    }
    return data.user;
  }, [persist]);

  const logout = useCallback(() => {
    const token = readToken();
    api.post('/auth/logout', null, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined).catch(() => {});
    clearAuthStorage();
    setUser(null);
    setSession(null);
    setUiSettings(null);
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
    const nextUser = data.user;
    const nextSession = data.session || null;
    const nextUiSettings = data.uiSettings || null;
    const nextSignature = authSignature(nextUser, nextSession, nextUiSettings);
    const changed = nextSignature !== lastAuthSignatureRef.current;

    if (changed) {
      setUser(nextUser);
      setSession(nextSession);
      setUiSettings(nextUiSettings);
      localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
      if (nextSession) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
      } else {
        localStorage.removeItem(SESSION_KEY);
      }
      lastAuthSignatureRef.current = nextSignature;
      emitAppEvent(APP_EVENT_AUTH_CHANGED, { user: nextUser, session: nextSession });
    } else {
      setUiSettings(nextUiSettings);
    }
    return nextUser;
  }, [lastAuthSignatureRef]);

  useEffect(() => {
    if (!user) return undefined;

    const heartbeat = () => {
      refreshMe().catch(() => {});
    };

    const handleStorage = (event) => {
      if (![TOKEN_KEY, USER_KEY, SESSION_KEY].includes(event.key)) return;
      refreshMe().catch(() => {});
    };

    const heartbeatMs = realtimeConnected ? 2 * 60 * 1000 : 60 * 1000;
    const id = window.setInterval(heartbeat, heartbeatMs);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('storage', handleStorage);
    };
  }, [realtimeConnected, user, refreshMe]);

  useEffect(() => {
    if (!user?._id) return undefined;

    const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
    let stream = null;
    let closed = false;
    setRealtimeConnected(false);

    const connect = async () => {
      try {
        const { data } = await api.post('/auth/realtime-token');
        if (closed || !data?.token) return;

        const streamUrl = `${baseUrl}/realtime/stream?token=${encodeURIComponent(data.token)}`;
        stream = new EventSource(streamUrl);
        stream.addEventListener('ready', () => setRealtimeConnected(true));
        stream.onerror = () => setRealtimeConnected(false);

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
      } catch {
        setRealtimeConnected(false);
        // Ignore realtime bootstrap failures; polling/refresh paths still work.
      }
    };

    connect();

    return () => {
      closed = true;
      setRealtimeConnected(false);
      stream?.close();
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
    setUiSettings(null);
    return data;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        uiSettings,
        isAdmin: user?.role === 'admin' || user?.role === 'super_admin',
        isSuperAdmin: user?.role === 'super_admin',
        login, register, logout, updateProfile, setAuthState, refreshMe,
        listSessions, revokeSession, logoutAllSessions,
        runProgress, setRunProgress,
        genProgress, setGenProgress
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
