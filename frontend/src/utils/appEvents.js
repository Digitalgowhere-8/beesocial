export const APP_EVENT_AUTH_CHANGED = 'app:auth-changed';
export const APP_EVENT_CONTENT_CHANGED = 'app:content-changed';

export function emitAppEvent(name, detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}
