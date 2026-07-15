import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { APP_EVENT_AUTH_CHANGED } from '../utils/appEvents';

const GUEST_STORAGE_KEY = 'beesocial_theme_mode_guest';
const USER_STORAGE_PREFIX = 'beesocial_theme_mode_user_';
const USER_MANUAL_STORAGE_PREFIX = 'beesocial_theme_mode_manual_user_';
const SESSION_STORAGE_PREFIX = 'beesocial_theme_session_user_';
const ThemeContext = createContext(null);

function normalizeTheme(value) {
  return value === 'dark' || value === 'light' ? value : '';
}

function getSystemTheme() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStoredUserIdentity() {
  try {
    const raw = localStorage.getItem('beesocial_user');
    const user = raw ? JSON.parse(raw) : null;
    return user?._id || user?.email || '';
  } catch {
    return '';
  }
}

function storageKeyForIdentity(identity) {
  return identity ? `${USER_STORAGE_PREFIX}${identity}` : GUEST_STORAGE_KEY;
}

function hasManualTheme(identity, storageKey) {
  if (!identity || typeof sessionStorage === 'undefined') return false;
  return Boolean(normalizeTheme(sessionStorage.getItem(`${SESSION_STORAGE_PREFIX}${identity}`)));
}

function readThemeForState(identity, storageKey) {
  if (identity && typeof sessionStorage !== 'undefined') {
    const sessionTheme = normalizeTheme(sessionStorage.getItem(`${SESSION_STORAGE_PREFIX}${identity}`));
    if (sessionTheme) return sessionTheme;
  }
  return getSystemTheme();
}

function writeSessionTheme(identity, theme) {
  if (!identity || typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}${identity}`, theme);
}

function clearSessionThemes() {
  if (typeof sessionStorage === 'undefined') return;
  Object.keys(sessionStorage)
    .filter((key) => key.startsWith(SESSION_STORAGE_PREFIX))
    .forEach((key) => sessionStorage.removeItem(key));
}

function getInitialThemeState() {
  const identity = readStoredUserIdentity();
  const storageKey = storageKeyForIdentity(identity);
  return {
    identity,
    storageKey,
    theme: readThemeForState(identity, storageKey)
  };
}

function applyTheme(mode) {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  const body = document.body;
  const isDark = mode === 'dark';
  html.dataset.theme = mode;
  html.classList.toggle('theme-dark', isDark);
  body.classList.toggle('theme-dark', isDark);
}

export function ThemeProvider({ children }) {
  const [themeState, setThemeState] = useState(getInitialThemeState);
  const theme = themeState.theme;

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const syncThemeOwner = (user) => {
      const identity = user?._id || user?.email || readStoredUserIdentity();
      const storageKey = storageKeyForIdentity(identity);
      setThemeState((current) => {
        const nextTheme = readThemeForState(identity, storageKey);
        if (current.identity === identity && current.storageKey === storageKey && current.theme === nextTheme) {
          return current;
        }
        return { identity, storageKey, theme: nextTheme };
      });
    };

    const handleAuthChanged = (event) => {
      const user = event.detail?.user || null;
      if (!user) clearSessionThemes();
      syncThemeOwner(user);
    };
    const handleStorage = (event) => {
      if (!event.key || event.key === 'beesocial_user' || event.key.startsWith(USER_STORAGE_PREFIX) || event.key.startsWith(USER_MANUAL_STORAGE_PREFIX)) {
        syncThemeOwner();
      }
    };

    window.addEventListener(APP_EVENT_AUTH_CHANGED, handleAuthChanged);
    window.addEventListener('storage', handleStorage);
    syncThemeOwner();

    return () => {
      window.removeEventListener(APP_EVENT_AUTH_CHANGED, handleAuthChanged);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
      setThemeState((current) => {
        if (current.identity) return current;
        if (hasManualTheme(current.identity, current.storageKey)) return current;
        return { ...current, theme: getSystemTheme() };
      });
    };

    systemThemeQuery.addEventListener?.('change', handleSystemThemeChange);
    return () => systemThemeQuery.removeEventListener?.('change', handleSystemThemeChange);
  }, []);

  const value = useMemo(() => ({
    theme,
    isDark: theme === 'dark',
    setTheme: (nextTheme) => {
      setThemeState((current) => {
        const resolved = typeof nextTheme === 'function' ? nextTheme(current.theme) : nextTheme;
        const theme = normalizeTheme(resolved) || getSystemTheme();
        writeSessionTheme(current.identity, theme);
        return { ...current, theme };
      });
    },
    toggleTheme: () => {
      setThemeState((current) => {
        const theme = current.theme === 'dark' ? 'light' : 'dark';
        writeSessionTheme(current.identity, theme);
        return { ...current, theme };
      });
    }
  }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
