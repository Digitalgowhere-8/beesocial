import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000',
  timeout: 120000
});

// Attach token from localStorage on each request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('opportunityos_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Surface a nicer error.message
api.interceptors.response.use(
  (resp) => resp,
  (err) => {
    if (err.response?.status === 429) {
      const retryAfterHeader = err.response.headers?.['retry-after'];
      const rateLimitResetHeader = err.response.headers?.['ratelimit-reset'];
      const waitSeconds = Number(retryAfterHeader || rateLimitResetHeader || 0);
      const waitHint = Number.isFinite(waitSeconds) && waitSeconds > 0
        ? ` Please wait about ${waitSeconds} second${waitSeconds === 1 ? '' : 's'} and try again.`
        : ' Please wait a moment and try again.';

      err.message = `${err.response?.data?.message || 'Too many requests.'}${waitHint}`;
    } else if (err.response?.data?.message) {
      err.message = err.response.data.message;
    }
    if (err.response?.status === 503 && err.response?.data?.code === 'MAINTENANCE_MODE') {
      if (window.location.pathname !== '/maintenance') {
        window.location.href = '/maintenance';
      }
    }
    if (err.response?.status === 402 && err.response?.data?.code === 'LIMIT_REACHED') {
      try {
        sessionStorage.setItem('limit_reached_notice', JSON.stringify(err.response.data));
      } catch {
        // Ignore storage failures; navigation still gives the user an upgrade path.
      }
      if (window.location.pathname !== '/premium') {
        window.location.href = err.response.data.upgradePath || '/premium';
      }
    }
    // Auto-logout on 401 (token expired) - except for /auth/* endpoints
    if (err.response?.status === 401 && !/\/auth\//.test(err.config?.url || '')) {
      localStorage.removeItem('opportunityos_token');
      localStorage.removeItem('opportunityos_user');
      localStorage.removeItem('opportunityos_session');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
