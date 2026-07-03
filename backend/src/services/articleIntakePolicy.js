const { URL } = require('url');

const GOVERNMENT_MIN_PUBLISHED_AT = new Date(process.env.GOVT_MIN_PUBLISHED_AT || '2026-06-01T00:00:00.000Z');
const GOVERNMENT_DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

const BLOCKED_GOVERNMENT_DOMAINS = new Set([
  'cpbrd.congress.gov.ph'
]);

const GENERIC_GOVERNMENT_PORTALS = new Set([
  'gov.ph',
  'india.gov.in',
  'gov.uk',
  'gov.sg',
  'gov.au'
]);

const LOW_PRIORITY_GOVERNMENT_HOST_HINTS = [
  'pia.',
  'pco.',
  'pcoo.',
  'news.',
  'media.',
  'press.',
  'information.'
];

const STATIC_GOVERNMENT_PATTERNS = [
  /\bfaq\b/i,
  /\bfrequently asked questions\b/i,
  /\bguide\b/i,
  /\bguidance\b/i,
  /\bhow to\b/i,
  /\bexplainer\b/i,
  /\bnudge\b/i,
  /\bschedule\s*fa\b/i,
  /\bluxury car tax\b/i,
  /\bthresholds?\b/i,
  /\btrade licen[cs]e\b/i,
  /\bmunicipal\b/i,
  /\bdistrict\b/i,
  /\bconsumer\b/i,
  /\bpress releases and speeches\b/i,
  /\bannouncements\s*\(latest\)\b/i,
  /\blatest announcements\b/i,
  /\bjob opportunities\b/i,
  /\bcareers?\b/i,
  /\brecruitment\b/i,
  /\bvacanc(y|ies)\b/i,
  /\bjob postings?\b/i
];

const STATIC_GOVERNMENT_URL_PATTERNS = [
  /schedule-fa/i,
  /trade-licen[cs]e/i,
  /luxury-car-tax/i,
  /threshold/i,
  /faq/i,
  /guide/i,
  /dta\d*/i,
  /recruitment/i,
  /careers?/i,
  /vacanc/i,
  /job/i
];

function safeUrl(value) {
  try {
    return new URL(String(value || '').trim());
  } catch {
    return null;
  }
}

function hostFromUrl(value) {
  return safeUrl(value)?.hostname?.toLowerCase() || '';
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function truncateWords(value, count = 24) {
  return normalizeText(value).split(' ').filter(Boolean).slice(0, count).join(' ');
}

function articleTimestamp(item = {}) {
  const publishedAt = item.publishedAt ? new Date(item.publishedAt) : null;
  if (publishedAt && !Number.isNaN(publishedAt.getTime())) return publishedAt;
  const fetchedAt = item.fetched_at ? new Date(item.fetched_at) : new Date();
  return Number.isNaN(fetchedAt.getTime()) ? new Date() : fetchedAt;
}

function looksStaticGovernmentPage(item = {}) {
  const haystack = [
    item.title,
    item.summary,
    item.aiSummary,
    item.url,
    item.sourceQuery,
    item.rawData?.sourceQuery
  ].map(cleanText).join(' ');

  if (STATIC_GOVERNMENT_PATTERNS.some((pattern) => pattern.test(haystack))) return true;
  return STATIC_GOVERNMENT_URL_PATTERNS.some((pattern) => pattern.test(String(item.url || '')));
}

function isBlockedGovernmentDomain(item = {}) {
  const host = hostFromUrl(item.url);
  return BLOCKED_GOVERNMENT_DOMAINS.has(host);
}

function isStaleGovernmentUpdate(item = {}) {
  const publishedAt = item.publishedAt ? new Date(item.publishedAt) : null;
  if (!publishedAt || Number.isNaN(publishedAt.getTime())) return true;
  return publishedAt.getTime() < GOVERNMENT_MIN_PUBLISHED_AT.getTime();
}

function governmentSourceScore(item = {}) {
  const host = hostFromUrl(item.url);
  if (!host) return 0;

  let score = 0;
  if (host.includes('.gov.') || host.endsWith('.gov')) score += 80;
  if (host.includes('.gob.') || host.includes('.gub.')) score += 75;
  if (host.split('.').length >= 3) score += 10;
  if (GENERIC_GOVERNMENT_PORTALS.has(host)) score -= 35;
  if (LOW_PRIORITY_GOVERNMENT_HOST_HINTS.some((hint) => host.includes(hint))) score -= 20;
  if (/(finance|treasury|revenue|tax|customs|ministry|department|commission|authority|regulator)/i.test(host)) score += 15;
  return score;
}

function cleanTitleForFingerprint(title) {
  return String(title || '')
    .replace(/\s*[-|:|•]\s*([^-|:|•]+)$/, (match, group) => {
      const suffix = group.trim().toLowerCase();
      if (suffix.length < 25 || /\b(pia|pco|dof|dti|boi|scmp|afr|reuters|ap|bloomberg|news|portal|department|ministry|agency|office|board)\b/.test(suffix)) {
        return '';
      }
      return match;
    })
    .trim();
}

function buildContentFingerprint(item = {}) {
  const country = normalizeText(item.country || '');
  const type = normalizeText(item.type || '');
  const title = truncateWords(cleanTitleForFingerprint(item.title), 20);
  const summary = truncateWords(item.summary || item.aiSummary || item.rawData?.blogContext || '', 24);
  return [country, type, title, summary].filter(Boolean).join('|');
}

function articleWindowStart(item = {}) {
  return new Date(articleTimestamp(item).getTime() - GOVERNMENT_DUPLICATE_WINDOW_MS);
}

function articleWindowEnd(item = {}) {
  return new Date(articleTimestamp(item).getTime() + GOVERNMENT_DUPLICATE_WINDOW_MS);
}

function choosePreferredGovernmentItem(current, candidate) {
  const currentScore = governmentSourceScore(current);
  const candidateScore = governmentSourceScore(candidate);
  if (candidateScore !== currentScore) return candidateScore > currentScore ? candidate : current;

  const currentTime = articleTimestamp(current).getTime();
  const candidateTime = articleTimestamp(candidate).getTime();
  if (candidateTime !== currentTime) return candidateTime > currentTime ? candidate : current;

  const currentRelevance = Number(current.relevanceScore || current.relevance_score || 0);
  const candidateRelevance = Number(candidate.relevanceScore || candidate.relevance_score || 0);
  if (candidateRelevance !== currentRelevance) return candidateRelevance > currentRelevance ? candidate : current;

  return candidate;
}

function looksLikeErrorOrRestrictedPage(item = {}) {
  const title = String(item.title || '').toLowerCase();
  const rawContent = String(item.rawContent || item.rawData?.rawContent || '').toLowerCase();
  const summary = String(item.summary || item.aiSummary || '').toLowerCase();

  const errorPatterns = [
    /cloudflare/i,
    /403 forbidden/i,
    /access denied/i,
    /attention required/i,
    /checking your browser/i,
    /security check/i,
    /404 not found/i,
    /page not found/i,
    /internal server error/i,
    /502 bad gateway/i,
    /503 service unavailable/i,
    /504 gateway timeout/i,
    /site maintenance/i,
    /under maintenance/i
  ];

  return errorPatterns.some(pattern => pattern.test(title) || pattern.test(summary) || pattern.test(rawContent));
}

function applyGovernmentIntakeRules(item = {}) {
  if (isBlockedGovernmentDomain(item)) {
    return { keep: false, reason: 'blocked-domain' };
  }
  if (looksLikeErrorOrRestrictedPage(item)) {
    return { keep: false, reason: 'blocked-domain' };
  }

  if (String(item.type || '').toLowerCase() !== 'govt') {
    return { keep: true, reason: '' };
  }

  if (looksStaticGovernmentPage(item)) {
    return { keep: false, reason: 'static-government-page' };
  }
  if (isStaleGovernmentUpdate(item)) {
    return { keep: false, reason: 'stale-government-update' };
  }

  return { keep: true, reason: '' };
}

module.exports = {
  GOVERNMENT_DUPLICATE_WINDOW_MS,
  applyGovernmentIntakeRules,
  articleWindowEnd,
  articleWindowStart,
  buildContentFingerprint,
  choosePreferredGovernmentItem
};
