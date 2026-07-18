const crypto = require('crypto');

/**
 * Normalize a URL so the same article reachable via slightly different
 * URL forms hashes to the same value.
 *
 *  - lowercase host
 *  - drop tracking query params (utm_*, fbclid, gclid, ref, ...)
 *  - drop hash fragments
 *  - strip trailing slash
 */
function unwrapRedirectUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return value;

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const redirectHosts = [
      'google.com',
      'news.google.com',
      'feedproxy.google.com',
      'feeds.feedburner.com',
      'l.facebook.com',
      'lm.facebook.com',
      't.co'
    ];
    const redirectParams = ['url', 'u', 'q', 'target', 'dest', 'destination', 'redirect', 'redirect_url'];
    const isRedirectHost = redirectHosts.some((domain) => host === domain || host.endsWith(`.${domain}`));

    for (const param of redirectParams) {
      const candidate = parsed.searchParams.get(param);
      if (!candidate || !/^https?:\/\//i.test(candidate)) continue;
      if (isRedirectHost || param !== 'q') return candidate;
    }
  } catch (_e) {
    return value;
  }

  return value;
}

function normalizeUrl(rawUrl) {
  try {
    const u = new URL(unwrapRedirectUrl(rawUrl));
    u.hash = '';
    u.host = u.host.toLowerCase();
    u.hostname = u.hostname.replace(/^www\./i, '');
    u.hostname = u.hostname.replace(/^beta\.acra\.gov\.sg$/i, 'acra.gov.sg');

    const dropParams = [];
    for (const [k] of u.searchParams.entries()) {
      const key = k.toLowerCase();
      if (
        key.startsWith('utm_')
        || [
          'fbclid',
          'gclid',
          'msclkid',
          'igshid',
          'mc_cid',
          'mc_eid',
          'ref',
          'ref_src',
          'source',
          'output',
          'feature',
          'cmpid',
          'cid',
          'spm',
          'ocid'
        ].includes(key)
      ) {
        dropParams.push(k);
      }
    }
    dropParams.forEach((k) => u.searchParams.delete(k));

    let s = u.toString();
    s = s.replace(/\/amp\/?$/i, '');
    s = s.replace(/\/amp(?=[?#])/i, '');
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s;
  } catch (_e) {
    return (rawUrl || '').trim();
  }
}

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function hashUrl(rawUrl) {
  return sha256(normalizeUrl(rawUrl));
}

module.exports = { normalizeUrl, sha256, hashUrl, unwrapRedirectUrl };
