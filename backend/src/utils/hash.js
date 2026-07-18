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
function normalizeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    u.hash = '';
    u.host = u.host.toLowerCase();

    const dropParams = [];
    for (const [k] of u.searchParams.entries()) {
      const key = k.toLowerCase();
      if (key.startsWith('utm_') || ['fbclid', 'gclid', 'ref', 'ref_src'].includes(key)) {
        dropParams.push(k);
      }
    }
    dropParams.forEach((k) => u.searchParams.delete(k));

    let s = u.toString();
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

module.exports = { normalizeUrl, sha256, hashUrl };
