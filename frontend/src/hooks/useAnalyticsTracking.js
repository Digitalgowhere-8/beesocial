import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const VISITOR_KEY = 'beesocial_visitor_id';
const SESSION_KEY = 'beesocial_session_id';
const SESSION_STARTED_KEY = 'beesocial_session_started_at';
const SESSION_TTL_MS = 30 * 60 * 1000;

function randomId(prefix) {
  const value = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${value}`;
}

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return ''; }
}

function storageSet(key, value, session = false) {
  try {
    (session ? sessionStorage : localStorage).setItem(key, value);
  } catch {
    // Ignore storage restrictions.
  }
}

function ensureIds() {
  let visitorId = storageGet(VISITOR_KEY);
  if (!visitorId) {
    visitorId = randomId('visitor');
    storageSet(VISITOR_KEY, visitorId);
  }

  let sessionId = '';
  let startedAt = 0;
  try {
    sessionId = sessionStorage.getItem(SESSION_KEY) || '';
    startedAt = Number(sessionStorage.getItem(SESSION_STARTED_KEY) || 0);
  } catch {
    sessionId = '';
  }
  if (!sessionId || Date.now() - startedAt > SESSION_TTL_MS) {
    sessionId = randomId('session');
    storageSet(SESSION_KEY, sessionId, true);
    storageSet(SESSION_STARTED_KEY, String(Date.now()), true);
  }

  return { visitorId, sessionId };
}

function cleanLabel(value, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function elementLabel(element) {
  if (!element) return '';
  return cleanLabel(
    element.dataset?.analyticsClick ||
    element.getAttribute?.('aria-label') ||
    element.getAttribute?.('title') ||
    element.textContent ||
    element.href ||
    element.tagName
  );
}

function sectionName(element) {
  const section = element?.closest?.('[data-analytics-section]');
  return cleanLabel(section?.dataset?.analyticsSection || section?.getAttribute?.('aria-label') || '');
}

function fieldName(element) {
  const explicit = element?.dataset?.analyticsFilter || element?.dataset?.analyticsSearch;
  if (explicit) return cleanLabel(explicit, 80);
  const aria = element?.getAttribute?.('aria-label') || element?.getAttribute?.('placeholder') || element?.name || element?.id;
  return cleanLabel(aria, 80) || 'Filter';
}

function isSearchLike(element) {
  const value = String(element?.value || '').trim();
  const type = String(element?.type || '').toLowerCase();
  const text = `${element?.dataset?.analyticsSearch || ''} ${element?.name || ''} ${element?.id || ''} ${element?.placeholder || ''} ${element?.getAttribute?.('aria-label') || ''}`.toLowerCase();
  return type === 'search' || text.includes('search') || text.includes('keyword') || value.split(/\s+/).length > 1;
}

export default function useAnalyticsTracking() {
  const location = useLocation();
  const { user } = useAuth();
  const idsRef = useRef(null);
  const pageStartedAtRef = useRef(Date.now());
  const visibleSectionsRef = useRef(new Map());

  if (!idsRef.current) idsRef.current = ensureIds();

  const send = (event) => {
    if (!user?._id) return;
    const payload = {
      ...idsRef.current,
      path: window.location.pathname,
      title: document.title,
      role: user?.role || '',
      occurredAt: new Date().toISOString(),
      ...event
    };
    api.post('/analytics/events', payload).catch(() => {});
  };

  useEffect(() => {
    pageStartedAtRef.current = Date.now();
    send({ type: 'page_view', path: location.pathname, title: document.title });
  }, [location.pathname]);

  useEffect(() => {
    const onClick = (event) => {
      const target = event.target?.closest?.('a,button,[role="button"],[data-analytics-click]');
      if (!target) return;
      send({
        type: 'click',
        label: elementLabel(target),
        section: sectionName(target),
        targetType: target.tagName?.toLowerCase?.() || 'element',
        metadata: {
          href: target.href || '',
          route: target.getAttribute?.('to') || ''
        }
      });
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [user?.role]);

  useEffect(() => {
    const timers = new Map();

    const onInput = (event) => {
      const target = event.target;
      const tag = target?.tagName?.toLowerCase?.();
      if (!['input', 'select', 'textarea'].includes(tag)) return;
      const type = String(target.type || '').toLowerCase();
      if (['password', 'email', 'tel', 'number', 'date', 'datetime-local', 'time'].includes(type)) return;

      const value = cleanLabel(target.value, 80);
      if (!value || value.length < 2) return;
      const kind = isSearchLike(target) ? 'keyword' : 'filter';
      const key = `${kind}:${target.name || target.id || fieldName(target)}`;
      window.clearTimeout(timers.get(key));
      timers.set(key, window.setTimeout(() => {
        send({
          type: 'search',
          label: value,
          section: sectionName(target),
          targetType: tag,
          metadata: {
            kind,
            field: fieldName(target)
          }
        });
      }, kind === 'keyword' ? 900 : 250));
    };

    document.addEventListener('input', onInput, true);
    document.addEventListener('change', onInput, true);
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('change', onInput, true);
    };
  }, [user?.role]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const name = cleanLabel(entry.target.dataset.analyticsSection);
        if (!name) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
          visibleSectionsRef.current.set(entry.target, { name, startedAt: Date.now() });
          return;
        }
        const active = visibleSectionsRef.current.get(entry.target);
        if (active) {
          const durationMs = Date.now() - active.startedAt;
          visibleSectionsRef.current.delete(entry.target);
          if (durationMs >= 1200) {
            send({ type: 'section_view', section: active.name, durationMs });
          }
        }
      });
    }, { threshold: [0, 0.35, 0.75] });

    const observe = () => {
      document.querySelectorAll('[data-analytics-section]').forEach((element) => observer.observe(element));
    };
    observe();
    const timer = window.setTimeout(observe, 800);

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      visibleSectionsRef.current.forEach((active) => {
        const durationMs = Date.now() - active.startedAt;
        if (durationMs >= 1200) send({ type: 'section_view', section: active.name, durationMs });
      });
      visibleSectionsRef.current.clear();
    };
  }, [location.pathname, user?.role]);

  useEffect(() => {
    const flushEngagement = () => {
      const durationMs = Date.now() - pageStartedAtRef.current;
      if (durationMs >= 3000) {
        send({ type: 'engagement', section: 'Page engagement', durationMs });
      }
    };
    window.addEventListener('pagehide', flushEngagement);
    return () => {
      flushEngagement();
      window.removeEventListener('pagehide', flushEngagement);
    };
  }, [location.pathname, user?.role]);
}
