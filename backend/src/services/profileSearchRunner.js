const tavilyService = require('./tavilyService');
const aiService = require('./aiService');
const { getSystemSettings } = require('./systemSettings');
const { hashUrl, normalizeUrl } = require('../utils/hash');
const { CATEGORIES } = require('../config/categories');
const { canonicalCountry, defaultSourceDomainsForCountry } = require('../config/fetchSources');
const { evaluateTopicArticle } = require('./articleTopicRules');

const ALLOWED_TOPICS = (process.env.FETCH_TOPICS || 'news,govt,competitor,evergreen')
  .split(',')
  .map((topic) => topic.trim().toLowerCase())
  .filter(Boolean);
const OPPORTUNITY_TYPE = {
  govt: 'policy',
  news: 'market_news',
  competitor: 'competitor',
  evergreen: 'evergreen'
};
const MAX_TOPIC_QUERY_LIMIT = Math.max(1, Math.min(10, Number(process.env.MAX_SEARCH_VARIANTS_PER_TOPIC || 9) || 9));
const DEFAULT_TARGET_PER_CATEGORY = 10;
const DEFAULT_TARGET_PER_TOPIC = 100;
const MAX_TARGET_PER_TOPIC = 100;
const DEFAULT_TAVILY_MAX_RESULTS = 10;
const MAX_TAVILY_MAX_RESULTS = 10;
const MAX_AI_CANDIDATES_PER_TOPIC = Math.max(1, Math.min(30, Number(process.env.MAX_AI_CANDIDATES_PER_TOPIC || 8) || 8));
const DEFAULT_MIN_STORE_SCORE = Math.max(0, Math.min(100, Number(process.env.AI_RELEVANCE_MIN_SCORE || 60) || 60));
const MIN_FETCH_CONTENT_CHARS = Math.max(200, Math.min(2000, Number(process.env.MIN_FETCH_CONTENT_CHARS || 450) || 450));
const MIN_RAW_CONTENT_CHARS = Math.max(300, Math.min(3000, Number(process.env.MIN_RAW_CONTENT_CHARS || 700) || 700));
const MIN_SUMMARY_CHARS = Math.max(180, Math.min(1200, Number(process.env.MIN_SUMMARY_CHARS || 350) || 350));

function text(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function list(value) {
  if (Array.isArray(value)) return value.map((v) => text(v)).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((v) => text(v)).filter(Boolean);
  return [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function defaultCountry() {
  return text(process.env.DEFAULT_FETCH_COUNTRY);
}

function defaultCategory() {
  return text(process.env.DEFAULT_FETCH_CATEGORY) || Object.keys(CATEGORIES || {})[0] || 'General';
}

function defaultLanguage() {
  return text(process.env.DEFAULT_FETCH_LANGUAGE, 'en');
}

function defaultTimezone() {
  return text(process.env.DEFAULT_FETCH_TIMEZONE, 'Asia/Kolkata');
}

function isAllPlaceholder(value) {
  const lower = text(value).toLowerCase();
  return [
    'all',
    'all category',
    'all categories',
    'all subcategory',
    'all sub-category',
    'all subcategories',
    'all sub-categories',
    'all sub categories'
  ].includes(lower);
}

function cleanSubcategory(value) {
  const current = text(value);
  return isAllPlaceholder(current) ? '' : current;
}

function validSubcategoriesForCategory(category) {
  return Object.keys(CATEGORIES[text(category)]?.subcategories || {});
}

function normalizeCategory(value, fallback = '') {
  const current = text(value);
  if (CATEGORIES[current]) return current;
  const fallbackCategory = text(fallback);
  if (CATEGORIES[fallbackCategory]) return fallbackCategory;
  return Object.keys(CATEGORIES)[0] || 'General';
}

function normalizeSubcategory(category, value, fallback = '') {
  const allowed = validSubcategoriesForCategory(category);
  if (!allowed.length) return '';

  const candidates = [value, fallback]
    .map((candidate) => cleanSubcategory(candidate))
    .filter(Boolean);

  for (const candidate of candidates) {
    const exact = allowed.find((item) => item.toLowerCase() === candidate.toLowerCase());
    if (exact) return exact;
  }

  for (const candidate of candidates) {
    const normalized = candidate.toLowerCase();
    const partial = allowed.find((item) => {
      const allowedValue = item.toLowerCase();
      return normalized.includes(allowedValue) || allowedValue.includes(normalized);
    });
    if (partial) return partial;
  }

  return '';
}

function daysToTimeRange(value) {
  const days = Math.max(1, Math.min(365, Number(value || 30) || 30));
  if (days <= 1) return 'day';
  if (days <= 7) return 'week';
  if (days <= 31) return 'month';
  return 'year';
}

function hostFromUrl(url) {
  const value = text(url);
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch (_e) {
    const match = value.match(/^https?:\/\/(?:www\.)?([^/]+)/i);
    return match ? match[1].toLowerCase() : 'dynamic-search';
  }
}

function cleanDomain(value) {
  return text(value)
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .toLowerCase();
}

function compactRawData(value = {}, fallback = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    sourceQuery: text(source.sourceQuery || source.source_query || fallback.sourceQuery),
    queryCategory: text(source.queryCategory || fallback.queryCategory),
    allowedDomains: Array.isArray(source.allowedDomains)
      ? source.allowedDomains
      : Array.isArray(source.includeDomains)
        ? source.includeDomains
        : Array.isArray(fallback.allowedDomains)
          ? fallback.allowedDomains
          : [],
    tavilyScore: source.tavilyScore || source.tavily_score || fallback.tavilyScore || null,
    snippet: text(source.snippet || fallback.snippet).slice(0, 4000)
  };
}

function isValidParsedDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

function parseDateCandidate(value) {
  const cleaned = text(value).replace(/\b\d{1,2}:\d{2}\s*(?:am|pm)?\s*,?\s*/i, '').trim();
  const parsed = new Date(cleaned || value);
  return isValidParsedDate(parsed) ? parsed : null;
}

function extractTextDates(value = '') {
  const source = text(value).replace(/\s+/g, ' ').trim();
  if (!source) return [];

  const patterns = [
    /\b(?:last\s+updated?|last\s+update|updated?|published|published\s+on|written\s+by|posted|effective(?:\s+date)?|as\s+of)\b[^A-Za-z0-9]{0,25}(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/gi,
    /\b(?:last\s+updated?|last\s+update|updated?|published|published\s+on|written\s+by|posted|effective(?:\s+date)?|as\s+of)\b[^A-Za-z0-9]{0,25}([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})/gi,
    /\b(?:last\s+updated?|last\s+update|updated?|published|published\s+on|written\s+by|posted|effective(?:\s+date)?|as\s+of)\b[^A-Za-z0-9]{0,45}(?:\d{1,2}:\d{2}\s*(?:am|pm)?\s*,?\s*)?(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/gi,
    /\b(?:last\s+updated?|last\s+update|updated?|published|effective(?:\s+date)?|as\s+of)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2})/gi,
    /\b(?:last\s+updated?|last\s+update|updated?|published|effective(?:\s+date)?|as\s+of)\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/gi,
    /\b(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\b/g
  ];

  const dates = [];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const parsed = parseDateCandidate(match[1]);
      if (parsed) dates.push(parsed);
    }
  }

  return dates;
}

function extractLabelledTextDates(value = '') {
  const source = text(value).replace(/\s+/g, ' ').trim();
  if (!source) return [];

  const label = String.raw`(?:article|date|last\s+updated?|last\s+update|updated?|published|published\s+on|written\s+by|posted|effective(?:\s+date)?|as\s+of)`;
  const patterns = [
    new RegExp(String.raw`\b${label}\b[^A-Za-z0-9]{0,45}(?:\d{1,2}:\d{2}\s*(?:am|pm)?\s*,?\s*)?(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})`, 'gi'),
    new RegExp(String.raw`\b${label}\b[^A-Za-z0-9]{0,45}(?:\d{1,2}:\d{2}\s*(?:am|pm)?\s*,?\s*)?([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})`, 'gi'),
    new RegExp(String.raw`\b${label}\b\s*[:\-]?\s*(\d{4}-\d{2}-\d{2})`, 'gi'),
    new RegExp(String.raw`\b${label}\b\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{4})`, 'gi')
  ];

  const dates = [];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const parsed = parseDateCandidate(match[1]);
      if (parsed) dates.push(parsed);
    }
  }

  return dates;
}

function inferResultDate(row = {}) {
  const labelledDates = [
    ...extractLabelledTextDates(row?.title),
    ...extractLabelledTextDates(row?.snippet),
    ...extractLabelledTextDates(row?.rawContent),
    ...extractLabelledTextDates(row?.summary),
    ...extractLabelledTextDates(row?.content)
  ].filter(isValidParsedDate);

  if (labelledDates.length) {
    return labelledDates.sort((a, b) => b.getTime() - a.getTime())[0];
  }

  const explicitDate = parseDateCandidate(row?.publishedAt || row?.published_date || row?.publishedDate || row?.date);
  if (explicitDate) return explicitDate;

  const candidates = [
    ...extractTextDates(row?.title),
    ...extractTextDates(row?.snippet),
    ...extractTextDates(row?.rawContent),
    ...extractTextDates(row?.summary),
    ...extractTextDates(row?.content)
  ].filter(isValidParsedDate);

  if (!candidates.length) return null;
  return candidates.sort((a, b) => b.getTime() - a.getTime())[0];
}

function resultArticleDate(row = {}, options = {}) {
  const inferredDate = inferResultDate(row);
  if (inferredDate) return inferredDate;
  if (!options.fallbackToNow) return null;
  return new Date();
}

function isDateInsideWindow(date, maxAgeDays = 30) {
  if (!isValidParsedDate(date)) return true;
  const ageMs = Date.now() - date.getTime();
  if (ageMs < 0) return true;
  return ageMs <= Math.max(1, maxAgeDays) * 24 * 60 * 60 * 1000;
}

function hasOnlyOldYearSignal(row = {}, maxAgeDays = 30) {
  const currentYear = new Date().getFullYear();
  const source = [
    row.title,
    row.url,
    row.snippet,
    row.rawContent,
    row.summary,
    row.content
  ].map((value) => text(value)).filter(Boolean).join(' ');
  const years = [...source.matchAll(/\b(20\d{2})\b/g)]
    .map((match) => Number(match[1]))
    .filter((year) => year >= 2000 && year <= currentYear);
  if (!years.length) return false;
  if (years.some((year) => year === currentYear)) return false;
  const newestMentioned = Math.max(...years);
  if (maxAgeDays > 370 && newestMentioned >= currentYear - 1) return false;
  return newestMentioned < currentYear;
}

function isGovernmentHost(host) {
  const normalized = cleanDomain(host);
  if (!normalized) return false;
  return (
    normalized.includes('.gov.') ||
    normalized.endsWith('.gov') ||
    normalized.includes('.gob.') ||
    normalized.endsWith('.gob') ||
    normalized.includes('.gub.') ||
    normalized.endsWith('.gub') ||
    normalized.includes('govt.') ||
    normalized.includes('government.') ||
    normalized.includes('legislation.') ||
    normalized.includes('parliament.') ||
    normalized.includes('registry.') ||
    normalized.includes('tax.') ||
    normalized.includes('revenue.') ||
    normalized.includes('immigration.') ||
    normalized.includes('labour.') ||
    normalized.includes('labor.') ||
    normalized.includes('ministry.') ||
    normalized.includes('mof.') ||
    normalized.includes('mca.') ||
    normalized.includes('iras.') ||
    normalized.includes('acra.') ||
    normalized.includes('mas.') ||
    normalized.includes('ato.') ||
    normalized.includes('asic.') ||
    normalized.includes('sebi.') ||
    normalized.includes('sec.') ||
    normalized.includes('bir.') ||
    normalized.includes('sfc.') ||
    normalized.includes('hkma.') ||
    normalized.includes('cima.') ||
    normalized.includes('fsrc.')
  );
}

function isAllowedGovtResult(url, includeDomains = []) {
  const host = hostFromUrl(url);
  const allowedDomains = list(includeDomains).map(cleanDomain).filter(Boolean);
  return allowedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function isAllowedSourceResult(url, includeDomains = []) {
  const host = hostFromUrl(url);
  const allowedDomains = list(includeDomains).map(cleanDomain).filter(Boolean);
  if (!allowedDomains.length) return false;
  return allowedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function sourceTypeForTopic(topic) {
  if (topic === 'govt') return 'govt';
  if (topic === 'competitor') return 'competitor';
  return 'news';
}

function sourceTypesForTopic(topic) {
  if (topic === 'evergreen') return ['news', 'govt', 'competitor'];
  return [sourceTypeForTopic(topic)];
}

function domainsForSourceType(profile, type) {
  const selectedCountry = canonicalCountry(profile.country || defaultCountry());
  const topicsForType = ALLOWED_TOPICS.filter((topic) => sourceTypeForTopic(topic) === type);
  const configured = unique(
    topicsForType.flatMap((topic) => list(profile.sourceDomainsByTopic?.[topic]))
  );
  const defaults = unique(
    topicsForType.flatMap((topic) => list(profile.defaultDomainsByTopic?.[topic]))
  );
  const fallback = unique(defaultSourceDomainsForCountry(selectedCountry, type).map(cleanDomain).filter(Boolean));
  return unique([...configured, ...defaults, ...fallback].map(cleanDomain).filter(Boolean));
}

function domainsForTopic(profile, topic) {
  return unique(sourceTypesForTopic(topic).flatMap((type) => domainsForSourceType(profile, type)));
}

function excludeDomainsForTopic(profile, topic) {
  if (topic === 'evergreen') return [];
  const sourceType = sourceTypeForTopic(topic);
  const excludedTypes = ['news', 'govt', 'competitor'].filter((type) => type !== sourceType);
  const domains = unique(excludedTypes.flatMap((type) => domainsForSourceType(profile, type)));
  if (topic === 'govt') {
    return domains.filter((domain) => !isGovernmentHost(domain));
  }
  return domains;
}

function resultMatchesTopicSourceType(url, topic, profile = {}) {
  const host = hostFromUrl(url);
  if (!host) return false;
  if (topic === 'govt') {
    return isGovernmentHost(host) || isAllowedSourceResult(url, domainsForSourceType(profile, 'govt'));
  }
  if (topic === 'evergreen') {
    return isAllowedSourceResult(url, domainsForTopic(profile, 'evergreen'));
  }
  if (topic === 'news') {
    return isAllowedSourceResult(url, domainsForTopic(profile, 'news'));
  }
  if (topic === 'competitor') {
    return isAllowedSourceResult(url, domainsForTopic(profile, 'competitor'));
  }
  return true;
}

function shouldEnforcePostSourceFilter(topic) {
  return topic === 'news' || topic === 'govt' || topic === 'competitor';
}

function isEvergreenResult({ title, url, summary }) {
  const haystack = [title, url, summary].map((value) => text(value).toLowerCase()).join(' ');
  if (!haystack.trim()) return false;

  const positive = [
    'guide',
    'how to',
    'step by step',
    'checklist',
    'requirements',
    'requirement',
    'filing',
    'registration',
    'incorporation',
    'compliance',
    'handbook',
    'manual',
    'faq',
    'frequently asked questions',
    'explainer',
    'overview',
    'process',
    'procedure',
    'forms',
    'eligibility',
    'application',
    'setup',
    'set up',
    'what is',
    'learn',
    'resource'
  ];

  const negative = [
    '/blog/',
    '/blogs',
    '/news/',
    '/press/',
    '/press-release',
    '/media-release',
    '/article/',
    '/articles/',
    '/insights/',
    '/opinion/',
    '/events/',
    '/webinar/',
    'press release',
    'media release',
    'latest news',
    'breaking news',
    'opinion:',
    'webinar',
    'event registration',
    'announces',
    'announced today'
  ];

  return positive.some((term) => haystack.includes(term)) && !negative.some((term) => haystack.includes(term));
}

function normalizedUrl(value) {
  return normalizeUrl(text(value)).toLowerCase().replace(/^https?:\/\/www\./, 'https://');
}

function normalizedTitle(value) {
  return text(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function articleIdentityHash({ url, title }) {
  return hashUrl([
    normalizedUrl(url),
    normalizedTitle(title)
  ].join('|'));
}

function articleUrlHash(url) {
  return hashUrl(normalizedUrl(url));
}

function isStaticResultPage({ title = '', url = '' } = {}) {
  const normalized = normalizedTitle(title);
  if (normalized === 'home' || normalized.startsWith('home ')) return true;
  if (normalized.includes('newsletter') || normalized.includes('acraconnect')) return true;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+/g, '/').replace(/\/$/, '').toLowerCase();
    const staticPathTerms = [
      '/account',
      '/accounts',
      '/auth',
      '/login',
      '/register',
      '/registration',
      '/sign-in',
      '/signin',
      '/sign-up',
      '/signup',
      '/subscribe',
      '/newsletter',
      '/newsletters',
      '/events',
      '/event',
      '/webinar',
      '/search',
      '/sitemap'
    ];
    return (
      !path ||
      path === '/home' ||
      path === '/en' ||
      path === '/en/home' ||
      path === '/web/home' ||
      staticPathTerms.some((term) => path === term || path.startsWith(`${term}/`))
    );
  } catch (_err) {
    return false;
  }
}

function requiresFreshPublishedDate(topic) {
  return ['news', 'govt', 'competitor', 'evergreen'].includes(text(topic).toLowerCase());
}

function sourceIdFromHost(host) {
  return text(host).split('.')[0].toLowerCase() || 'dynamic-search';
}

function sourceNameFromHost(host) {
  return sourceIdFromHost(host)
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ') || 'Dynamic Search';
}

function articleSimilarityKey(article = {}) {
  const host = hostFromUrl(article.url);
  const publishedDay = text(article.publishedAt).slice(0, 10);
  return hashUrl([
    host,
    normalizedTitle(article.title),
    publishedDay
  ].join('|'));
}

function filterStats() {
  const stats = {
    missing: 0,
    date: 0,
    content: 0,
    source: 0,
    type: 0,
    score: 0,
    pdf: 0,
    sponsored: 0,
    topic: 0
  };
  Object.defineProperty(stats, 'samples', {
    enumerable: false,
    value: {
      rejected: [],
      aiIgnored: [],
      matched: []
    }
  });
  return stats;
}

function minStoreScoreForProfile(profile = {}) {
  return Math.max(
    0,
    Math.min(100, Number(profile.minStoreScore ?? DEFAULT_MIN_STORE_SCORE) || DEFAULT_MIN_STORE_SCORE)
  );
}

function sampleCandidate(row = {}, reason = '') {
  return {
    reason,
    title: text(row.title).slice(0, 180),
    url: text(row.url).slice(0, 500),
    source: hostFromUrl(row.url || row.sourceType || row.source || ''),
    date: text(row.publishedAt || row.published_date || row.date).slice(0, 80),
    query: text(row.sourceQuery || row.source_query).slice(0, 260)
  };
}

function pushSample(samples = [], sample = {}, limit = 10) {
  if (!sample || samples.length >= limit) return;
  samples.push(sample);
}

function rejectCandidate(stats, reason, sample = null) {
  if (stats && Object.prototype.hasOwnProperty.call(stats, reason)) {
    stats[reason] += 1;
  }
  if (stats?.samples?.rejected && sample) {
    pushSample(stats.samples.rejected, sample);
  }
  return null;
}

function hasEnoughGenerationContext({ title = '', summary = '', rawContent = '' } = {}) {
  const cleanTitle = text(title).replace(/\s+/g, ' ');
  const cleanSummary = text(summary).replace(/\s+/g, ' ');
  const cleanRaw = text(rawContent).replace(/\s+/g, ' ');
  const combined = [cleanTitle, cleanSummary, cleanRaw].filter(Boolean).join(' ').trim();

  return (
    cleanRaw.length >= MIN_RAW_CONTENT_CHARS ||
    cleanSummary.length >= MIN_SUMMARY_CHARS ||
    combined.length >= MIN_FETCH_CONTENT_CHARS
  );
}

function normalizeProfileInput(incoming = {}) {
  const now = new Date().toISOString();
  const topics = unique(list(incoming.topics))
    .map((topic) => topic.toLowerCase())
    .filter((topic) => ALLOWED_TOPICS.includes(topic));
  const selectedTopics = topics.length ? topics : ALLOWED_TOPICS;

  const sourceDomainsByTopic = incoming.sourceDomainsByTopic && typeof incoming.sourceDomainsByTopic === 'object'
    ? Object.fromEntries(
      Object.entries(incoming.sourceDomainsByTopic).map(([topic, domains]) => [
        String(topic || '').toLowerCase(),
        unique(list(domains).map(cleanDomain).filter(Boolean))
      ])
    )
    : {};
  const defaultDomainsByTopic = incoming.defaultDomainsByTopic && typeof incoming.defaultDomainsByTopic === 'object'
    ? Object.fromEntries(
      Object.entries(incoming.defaultDomainsByTopic).map(([topic, domains]) => [
        String(topic || '').toLowerCase(),
        unique(list(domains).map(cleanDomain).filter(Boolean))
      ])
    )
    : {};

  const profile = {
    userId: text(incoming.userId),
    savedSearchId: text(incoming.savedSearchId),
    logId: text(incoming.logId),
    trigger: text(incoming.trigger, 'manual'),
    companyName: text(incoming.companyName || incoming.comanyName || incoming.company || incoming.businessName || incoming.organization),
    country: text(incoming.country || defaultCountry()),
    region: text(incoming.region),
    location: text(incoming.location) || [incoming.country, incoming.region].map((v) => text(v)).filter(Boolean).join(' '),
    category: text(incoming.category || defaultCategory()),
    categories: unique(list(incoming.categories || incoming.selectedCategories || incoming.category)).slice(0, 10),
    subcategory: text(incoming.subcategory || incoming.sub_category),
    subcategoryOptions: unique(list(incoming.subcategoryOptions || incoming.categoryOptions)),
    topics: selectedTopics,
    topicEnabled: Object.fromEntries(ALLOWED_TOPICS.map((topic) => [topic, selectedTopics.includes(topic)])),
    queries: incoming.queries && typeof incoming.queries === 'object' ? incoming.queries : {},
    queryVariants: incoming.queryVariants && typeof incoming.queryVariants === 'object' ? incoming.queryVariants : {},
    queryCategories: incoming.queryCategories && typeof incoming.queryCategories === 'object' ? incoming.queryCategories : {},
    preferredDomains: unique(list(incoming.preferredDomains || incoming.includeDomains || incoming.sources).map(cleanDomain).filter(Boolean)),
    userDomains: unique(list(incoming.userDomains || incoming.user_domains).map(cleanDomain).filter(Boolean)),
    sourceDomainsByTopic,
    defaultDomainsByTopic,
    strictSources: Boolean(incoming.strictSources || incoming.strict_sources),
    competitors: unique(list(incoming.competitors)),
    days: Math.max(1, Math.min(365, Number(incoming.days || 30) || 30)),
    targetPerTopic: Math.max(1, Math.min(MAX_TARGET_PER_TOPIC, Number(incoming.targetPerTopic || incoming.maxPerTopic || DEFAULT_TARGET_PER_TOPIC) || DEFAULT_TARGET_PER_TOPIC)),
    minTavilyScore: incoming.minTavilyScore,
    minStoreScore: incoming.minStoreScore,
    language: text(incoming.language || defaultLanguage()),
    timezone: text(incoming.timezone || defaultTimezone()),
    startedAt: incoming.startedAt || now
  };

  if (!profile.userId) throw new Error('userId is required');
  if (!profile.categories.length) profile.categories = [profile.category || defaultCategory()].filter(Boolean);
  return profile;
}

function domainsForTopic(profile, topic) {
  const topicDomains = unique(list(profile.sourceDomainsByTopic?.[topic]));
  const configuredDefaults = unique(list(profile.defaultDomainsByTopic?.[topic]));
  const selectedCountry = canonicalCountry(profile.country || defaultCountry());
  const fallbackDefaults = unique(
    sourceTypesForTopic(topic)
      .flatMap((type) => defaultSourceDomainsForCountry(selectedCountry, type))
      .map(cleanDomain)
      .filter(Boolean)
  );
  const defaultDomains = configuredDefaults.length ? configuredDefaults : fallbackDefaults;
  const excludedDomains = new Set(excludeDomainsForTopic(profile, topic));
  const filteredDefaults = defaultDomains.filter((domain) => !excludedDomains.has(cleanDomain(domain)));
  const filteredTopicDomains = topicDomains.filter((domain) => !excludedDomains.has(cleanDomain(domain)));
  // Keep fetches locked to the configured source lists so results stay inside
  // the known domain set for the selected country/topic.
  return unique([...filteredTopicDomains, ...filteredDefaults].map(cleanDomain).filter(Boolean));
}

function tavilyTopicForProfileTopic(topic) {
  return topic === 'news' ? 'news' : 'general';
}

function selectQueryEntries(variants = [], categories = [], maxQueries = MAX_TOPIC_QUERY_LIMIT, profile = {}) {
  const entries = variants.map((query, index) => ({
    query: text(query),
    category: text(categories[index]) || profile.categories?.[index] || profile.category,
    index
  })).filter((entry) => entry.query);

  const selected = [];
  const selectedIndexes = new Set();
  const usedCategories = new Set();

  for (const entry of entries) {
    if (selected.length >= maxQueries) break;
    const categoryKey = text(entry.category).toLowerCase();
    if (categoryKey && usedCategories.has(categoryKey)) continue;
    selected.push(entry);
    selectedIndexes.add(entry.index);
    if (categoryKey) usedCategories.add(categoryKey);
  }

  for (const entry of entries) {
    if (selected.length >= maxQueries) break;
    if (selectedIndexes.has(entry.index)) continue;
    selected.push(entry);
    selectedIndexes.add(entry.index);
  }

  return selected;
}

function buildTopicQueries(profile, topic) {
  const variants = Array.isArray(profile.queryVariants?.[topic])
    ? profile.queryVariants[topic].map((v) => text(v)).filter(Boolean)
    : [];
  const fallback = text(profile.queries?.[topic]);
  const maxQueries = Math.max(
    1,
    Math.min(MAX_TOPIC_QUERY_LIMIT, variants.length ? variants.length : (profile.categories.length || 1))
  );
  const queryEntries = variants.length
    ? selectQueryEntries(variants, profile.queryCategories?.[topic] || [], maxQueries, profile)
    : selectQueryEntries([fallback].filter(Boolean), [], maxQueries, profile);
  if (!queryEntries.length) return [];

  const includeDomains = domainsForTopic(profile, topic);
  if (profile.strictSources && !includeDomains.length) return [];

  const maxResults = Math.max(1, Math.min(MAX_TAVILY_MAX_RESULTS, Number(process.env.TAVILY_MAX_RESULTS || DEFAULT_TAVILY_MAX_RESULTS) || DEFAULT_TAVILY_MAX_RESULTS));
  const requestForQuery = ({ query, category, variantIndex, includeDomainsOverride, searchDepth = 'basic', maxResultsOverride }) => ({
    profile: {
      ...profile,
      category
    },
    topic,
    variantIndex,
    type: topic,
    opportunityType: OPPORTUNITY_TYPE[topic] || 'market_news',
    sourceQuery: query,
    minTavilyScore: Math.max(0, Math.min(100, Number(profile.minTavilyScore || 0) || 0)),
    tavilyOptions: {
      topic: tavilyTopicForProfileTopic(topic),
      searchDepth,
      maxResults: maxResultsOverride || maxResults,
      timeRange: daysToTimeRange(profile.days),
      includeRawContent: true,
      timeoutMs: 30000,
      includeDomains: includeDomainsOverride || [],
      excludeDomains: excludeDomainsForTopic(profile, topic)
    }
  });

  const baseRequests = queryEntries.map((entry, variantIndex) => requestForQuery({
    query: entry.query,
    category: entry.category || profile.categories[variantIndex] || profile.category,
    variantIndex,
    includeDomainsOverride: includeDomains.length ? includeDomains : [],
    searchDepth: 'advanced'
  }));

  return baseRequests.slice(0, MAX_TOPIC_QUERY_LIMIT);
}

function articleFromResult(row, request, stats) {
  const title = text(row.title);
  const url = normalizeUrl(text(row.url));
  const snippet = text(row.snippet || row.content || row.summary);
  const rawContent = text(row.rawContent || row.raw_content);
  const summary = (snippet || rawContent).trim();
  const inferredArticleDate = resultArticleDate(row, { fallbackToNow: false });
  const articleDate = inferredArticleDate || (requiresFreshPublishedDate(request.topic) ? null : new Date());
  const dateFallbackUsed = !inferredArticleDate && Boolean(articleDate);
  const sampleRow = { ...row, title, url, sourceQuery: request.sourceQuery };
  if (!title || !url) return rejectCandidate(stats, 'missing', sampleCandidate(sampleRow, 'missing-title-or-url'));
  if (isStaticResultPage({ title, url })) return rejectCandidate(stats, 'topic', sampleCandidate(sampleRow, 'static-homepage'));
  if (!articleDate) return rejectCandidate(stats, 'date', sampleCandidate(sampleRow, 'missing-date'));
  if (inferredArticleDate && !isDateInsideWindow(inferredArticleDate, request.profile?.days || 30)) {
    return rejectCandidate(stats, 'date', sampleCandidate(sampleRow, 'old-date'));
  }
  if (!inferredArticleDate && hasOnlyOldYearSignal(row, request.profile?.days || 30)) {
    return rejectCandidate(stats, 'date', sampleCandidate(sampleRow, 'old-year-signal'));
  }
  if (
    shouldEnforcePostSourceFilter(request.topic) &&
    !isAllowedSourceResult(url, request.tavilyOptions?.includeDomains || [])
  ) {
    return rejectCandidate(stats, 'source', sampleCandidate(sampleRow, 'source-not-allowed'));
  }
  if (!resultMatchesTopicSourceType(url, request.topic, request.profile || {})) {
    return rejectCandidate(stats, 'type', sampleCandidate(sampleRow, 'wrong-topic-source-type'));
  }
  if (request.topic === 'govt' && !isAllowedGovtResult(url, request.tavilyOptions?.includeDomains || [])) {
    return rejectCandidate(stats, 'source', sampleCandidate(sampleRow, 'govt-source-not-allowed'));
  }
  if (!hasEnoughGenerationContext({ title, summary, rawContent })) {
    return rejectCandidate(stats, 'content', sampleCandidate(sampleRow, 'insufficient-content'));
  }
  const topicRule = evaluateTopicArticle({
    title,
    summary,
    rawContent,
    url,
    type: request.topic,
    source: hostFromUrl(url)
  }, {
    topic: request.topic,
    profile: request.profile || {},
    precheckOnly: true
  });
  if (!topicRule.keep) {
    const rejectReason = topicRule.reason === 'pdf' ? 'pdf' : topicRule.reason === 'sponsored' ? 'sponsored' : 'topic';
    return rejectCandidate(
      stats,
      rejectReason,
      sampleCandidate(sampleRow, topicRule.reason || rejectReason)
    );
  }
  const tavilyScore = typeof row.score === 'number' ? row.score : 50;

  const profile = request.profile || {};
  const sourceType = hostFromUrl(url);
  const sourceId = sourceIdFromHost(sourceType);
  const identityHash = articleIdentityHash({ url, title });
  return {
    profile,
    userId: profile.userId,
    savedSearchId: profile.savedSearchId,
    logId: profile.logId,
    country: profile.country,
    region: profile.region,
    location: profile.location,
    language: profile.language,
    type: request.type,
    topic: request.topic,
    variantIndex: request.variantIndex,
    opportunityType: request.opportunityType,
    category: profile.category,
    subcategory: profile.subcategory,
    subcategoryOptions: profile.subcategoryOptions || [],
    competitors: profile.competitors || [],
    days: profile.days,
    title: title.slice(0, 500),
    summary: summary.slice(0, 3000),
    aiSummary: summary.slice(0, 3000),
    rawContent: rawContent.slice(0, 20000),
    blogContext: '',
    tavilyScore,
    relevanceScore: tavilyScore,
    relevance_score: tavilyScore,
    relevanceReason: `Tavily relevance score ${tavilyScore} for ${request.topic} query variant ${request.variantIndex}.`,
    relevance_reason: `Tavily relevance score ${tavilyScore} for ${request.topic} query variant ${request.variantIndex}.`,
    url,
    hash: identityHash,
    urlHash: articleUrlHash(url),
    source: sourceNameFromHost(sourceType),
    sourceId,
    sourceType,
    allowedDomains: request.tavilyOptions?.includeDomains || [],
    sourceQuery: request.sourceQuery,
    fetched_at: new Date().toISOString(),
    publishedAt: articleDate.toISOString(),
    dateFallbackUsed,
    rawData: {
      snippet: snippet.slice(0, 4000),
      sourceQuery: request.sourceQuery,
      allowedDomains: request.tavilyOptions?.includeDomains || [],
      tavilyScore
    }
  };
}

function dedupeArticlesForAi(articles = []) {
  const byIdentity = new Map();
  const byUrl = new Map();
  const bySimilarity = new Map();
  let duplicates = 0;

  for (const article of articles) {
    const identityKey = articleIdentityHash({ url: article.url, title: article.title });
    const urlKey = articleUrlHash(article.url);
    const similarityKey = articleSimilarityKey(article);
    const existing = byIdentity.get(identityKey) || byUrl.get(urlKey) || bySimilarity.get(similarityKey);
    if (!existing) {
      byIdentity.set(identityKey, article);
      byUrl.set(urlKey, article);
      bySimilarity.set(similarityKey, article);
      continue;
    }

    duplicates += 1;
    const existingScore = Number(existing.tavilyScore || existing.relevanceScore || 0);
    const articleScore = Number(article.tavilyScore || article.relevanceScore || 0);
    if (articleScore > existingScore) {
      byIdentity.set(identityKey, article);
      byUrl.set(urlKey, article);
      bySimilarity.set(similarityKey, article);
    }
  }

  return {
    articles: [...new Set(byUrl.values())],
    duplicates
  };
}

function workflowProfile(profile = {}) {
  return {
    userId: profile.userId || '',
    savedSearchId: profile.savedSearchId || '',
    logId: profile.logId || '',
    country: profile.country || '',
    region: profile.region || '',
    category: profile.category || '',
    language: profile.language || 'en',
    startedAt: profile.startedAt || '',
    targetPerTopic: profile.targetPerTopic || DEFAULT_TARGET_PER_TOPIC
  };
}

function bestCategory(articleCategory, ai) {
  const category = text(ai?.category);
  return CATEGORIES[category] ? category : '';
}

function topCandidatesForAi(articles = []) {
  return [...articles]
    .sort((a, b) => {
      const scoreDiff = Number(b.tavilyScore || b.relevanceScore || 0) - Number(a.tavilyScore || a.relevanceScore || 0);
      if (scoreDiff) return scoreDiff;
      return String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''));
    })
    .slice(0, MAX_AI_CANDIDATES_PER_TOPIC);
}

function bestSubcategory(category, ai) {
  return normalizeSubcategory(
    category,
    ai?.subcategory || ai?.sub_category || ai?.subCategory || ai?.['sub-category'] || ai?.['sub category'],
    ''
  );
}

function resultFromArticle(article, topic, ai = {}) {
  const score = Math.max(
    0,
    Math.min(100, parseInt(ai.relevance_score ?? article.relevanceScore ?? article.tavilyScore, 10) || 0)
  );
  const category = bestCategory(article.category || article.profile?.category, ai);
  const subcategory = bestSubcategory(category, ai);

  return {
    profile: workflowProfile(article.profile),
    title: article.title,
    summary: ai.summary || article.summary || '',
    rawContent: article.rawContent || article.rawData?.rawContent || '',
    url: article.url,
    urlHash: article.urlHash,
    type: topic,
    category: category || 'IGNORE',
    subcategory,
    source: article.source || 'dynamic-search',
    sourceId: article.sourceId || article.source || 'dynamic-search',
    sourceType: article.sourceType || '',
    country: article.country || article.profile?.country || '',
    region: article.region || article.profile?.region || '',
    queryCategory: article.category || article.profile?.category || '',
    opportunityType: article.opportunityType || OPPORTUNITY_TYPE[topic] || 'market_news',
    language: article.language || article.profile?.language || 'en',
    relevanceScore: score,
    relevance_score: score,
    relevanceReason: ai.relevance_reason || '',
    relevance_reason: ai.relevance_reason || '',
    aiSummary: ai.summary || article.aiSummary || '',
    blogContext: article.blogContext || '',
    sourceQuery: article.sourceQuery || '',
    rawData: compactRawData(article.rawData, {
      sourceQuery: article.sourceQuery || '',
      allowedDomains: article.allowedDomains || [],
      tavilyScore: article.tavilyScore || null
    }),
    fetched_at: article.fetched_at || new Date().toISOString(),
    publishedAt: article.publishedAt || ''
  };
}

async function runTopic(profile, topic, onProgress) {
  const emptyTopicRun = (reason = '') => ({
    results: [],
    stats: {
      rawCandidates: 0,
      passedFilters: 0,
      outputCount: 0,
      duplicates: 0,
      rejected: filterStats(),
      aiIgnored: 0,
      categoryRejected: 0,
      scoreRejected: 0,
      searchErrors: 0,
      skippedReason: reason
    }
  });

  if (!profile.topicEnabled?.[topic]) {
    return emptyTopicRun('topic-disabled');
  }
  const systemSettings = await getSystemSettings();
  const aiConfig = { model: systemSettings.aiModel };

  const requests = buildTopicQueries(profile, topic);
  const domainSweepCount = requests.filter((request) => (
    Array.isArray(request.tavilyOptions?.includeDomains)
    && request.tavilyOptions.includeDomains.length === 1
  )).length;
  const allowedDomains = unique(requests.flatMap((request) => list(request.tavilyOptions?.includeDomains)));
  onProgress?.({
    step: `topic:${topic}:queries`,
    message: `${topic} topic: built ${requests.length} search request${requests.length === 1 ? '' : 's'} using ${allowedDomains.length} allowed domain${allowedDomains.length === 1 ? '' : 's'}${allowedDomains.length ? `: ${allowedDomains.slice(0, 12).join(', ')}${allowedDomains.length > 12 ? ` +${allowedDomains.length - 12} more` : ''}` : ' (no default/custom domains found)'}${domainSweepCount ? `; ${domainSweepCount} single-domain request${domainSweepCount === 1 ? '' : 's'}` : ''}`
  });
  const articles = [];
  let searchErrors = 0;
  let rawCandidates = 0;
  const rejected = filterStats();
  for (let i = 0; i < requests.length; i += 1) {
    const request = requests[i];
    onProgress?.({
      step: `topic:${topic}:search`,
      message: `${topic} topic: searching variant ${i + 1}/${requests.length}: ${request.sourceQuery}`
    });
    let rows = [];
    try {
      rows = await tavilyService.search(request.sourceQuery, request.tavilyOptions);
    } catch (error) {
      searchErrors += 1;
      onProgress?.({
        step: `topic:${topic}:search:error`,
        message: `${topic} topic: variant ${i + 1}/${requests.length} failed: ${error.message}`
      });
      continue;
    }
    onProgress?.({
      step: `topic:${topic}:search`,
      message: `${topic} topic: Tavily returned ${rows.length} result${rows.length === 1 ? '' : 's'} for variant ${i + 1}`
    });
    rawCandidates += rows.length;
    for (const row of rows) {
      const article = articleFromResult(row, request, rejected);
      if (article) articles.push(article);
    }
  }

  onProgress?.({
    step: `topic:${topic}:process`,
    message: `${topic} topic: processed ${rawCandidates} domain candidate${rawCandidates === 1 ? '' : 's'}; ${articles.length} passed hardcoded garbage checks; rejected missing:${rejected.missing}, date:${rejected.date}, content:${rejected.content}, source:${rejected.source}, type:${rejected.type}, score:${rejected.score}, pdf:${rejected.pdf}, sponsored:${rejected.sponsored}, static/topic:${rejected.topic}`
  });

  const deduped = dedupeArticlesForAi(articles);
  if (deduped.duplicates) {
    onProgress?.({
      step: `topic:${topic}:dedupe`,
      message: `${topic} topic: removed ${deduped.duplicates} duplicate candidate${deduped.duplicates === 1 ? '' : 's'} before AI review`
    });
  }

  const aiCandidates = topCandidatesForAi(deduped.articles);
  const aiCandidateSkipped = Math.max(0, deduped.articles.length - aiCandidates.length);
  if (aiCandidateSkipped) {
    onProgress?.({
      step: `topic:${topic}:ai:limit`,
      message: `${topic} topic: kept top ${aiCandidates.length} candidate${aiCandidates.length === 1 ? '' : 's'} for AI and skipped ${aiCandidateSkipped} lower-ranked candidate${aiCandidateSkipped === 1 ? '' : 's'} to reduce token use`
    });
  }

  onProgress?.({
    step: `topic:${topic}:ai`,
    message: `${topic} topic: sending ${aiCandidates.length} unique candidate${aiCandidates.length === 1 ? '' : 's'} to AI for business relevance, fixed category, sub-category, score, and summary`
  });
  const output = [];
  let aiIgnored = 0;
  let categoryRejected = 0;
  let scoreRejected = 0;
  const minStoreScore = minStoreScoreForProfile(profile);
  for (const article of aiCandidates) {
    let ai = {};
    try {
      ai = await aiService.classifyProfileRelevance({ article, profile, topic, aiConfig });
    } catch (_err) {
      ai = {};
    }

    if (ai.decision === 'IGNORE' || ai.category === 'IGNORE' || ai.subcategory === 'IGNORE') {
      aiIgnored += 1;
      pushSample(rejected.samples.aiIgnored, {
        reason: ai.relevance_reason || ai.reason || 'AI returned IGNORE',
        title: article.title,
        url: article.url,
        source: article.sourceType || article.source,
        score: Number(ai.relevance_score ?? ai.relevanceScore ?? 0),
        query: article.sourceQuery || ''
      });
      continue;
    }

    const resolvedCategory = bestCategory(article.category || article.profile?.category, ai);
    const resolvedSubcategory = bestSubcategory(resolvedCategory, ai);
    if (!resolvedCategory || !resolvedSubcategory) {
      categoryRejected += 1;
      pushSample(rejected.samples.rejected, {
        reason: 'invalid-ai-category-or-subcategory',
        title: article.title,
        url: article.url,
        source: article.sourceType || article.source,
        category: ai.category || '',
        subcategory: ai.subcategory || ai.sub_category || '',
        query: article.sourceQuery || ''
      });
      continue;
    }

    const rawScore = ai.relevance_score ?? ai.relevanceScore;
    const computedScore = (rawScore !== undefined && rawScore !== null && rawScore !== '')
      ? parseInt(rawScore, 10)
      : Number(article.relevanceScore || article.tavilyScore || 60);

    const result = resultFromArticle(article, topic, {
      ...ai,
      decision: 'STORE',
      category: resolvedCategory,
      subcategory: resolvedSubcategory,
      relevance_score: Math.max(0, Math.min(100, computedScore || 0)),
      summary: ai.summary || article.summary || article.aiSummary || '',
      relevance_reason: ai.relevance_reason || ai.relevanceReason || 'Matched allowed source domain and selected category.'
    });

    if (Number(result.relevanceScore || result.relevance_score || 0) < minStoreScore) {
      scoreRejected += 1;
      pushSample(rejected.samples.rejected, {
        reason: `low-score-below-${minStoreScore}`,
        title: result.title,
        url: result.url,
        source: result.sourceType || result.source,
        score: result.relevanceScore || result.relevance_score || 0,
        category: result.category,
        subcategory: result.subcategory,
        query: result.sourceQuery || ''
      });
      continue;
    }

    pushSample(rejected.samples.matched, {
      reason: result.relevanceReason || 'AI STORE',
      title: result.title,
      url: result.url,
      source: result.sourceType || result.source,
      score: result.relevanceScore || result.relevance_score || 0,
      category: result.category,
      subcategory: result.subcategory,
      query: result.sourceQuery || ''
    });
    output.push(result);
  }

  onProgress?.({
    step: `topic:${topic}:done`,
    message: `${topic} topic: kept ${output.length} result${output.length === 1 ? '' : 's'} after domain, duplicate, category, and score checks${aiIgnored ? `; ${aiIgnored} AI ignore${aiIgnored === 1 ? '' : 's'}` : ''}${categoryRejected ? `; ${categoryRejected} category mismatch reject${categoryRejected === 1 ? '' : 's'}` : ''}${scoreRejected ? `; ${scoreRejected} low-score reject${scoreRejected === 1 ? '' : 's'} (<${minStoreScore})` : ''}${searchErrors ? `; ${searchErrors} query variant${searchErrors === 1 ? '' : 's'} failed` : ''}`
  });
  return {
    results: output,
    stats: {
      rawCandidates,
      passedFilters: articles.length,
      outputCount: output.length,
      duplicates: deduped.duplicates,
      rejected,
      aiIgnored,
      categoryRejected,
      scoreRejected,
      searchErrors
    }
  };
}

function buildBackendCallback(profile, topicItems) {
  const seen = new Set();
  const byTopic = {};
  let mergeDuplicates = 0;
  const topicLimit = Math.max(1, Math.min(MAX_TARGET_PER_TOPIC, Number(profile.targetPerTopic || DEFAULT_TARGET_PER_TOPIC) || DEFAULT_TARGET_PER_TOPIC));
  const perCategoryLimit = Math.max(1, Math.min(
    DEFAULT_TARGET_PER_CATEGORY,
    Number(profile.targetPerCategory || profile.maxPerCategory || DEFAULT_TARGET_PER_CATEGORY) || DEFAULT_TARGET_PER_CATEGORY
  ));

  for (const d of topicItems) {
    if (!d.url || !d.title) continue;
    const key = articleIdentityHash({ url: d.url, title: d.title });
    if (seen.has(key)) {
      mergeDuplicates += 1;
      continue;
    }
    seen.add(key);

    const result = {
      title: d.title,
      summary: d.summary || '',
      rawContent: d.rawContent || d.rawData?.rawContent || '',
      url: d.url,
      urlHash: d.urlHash,
      type: d.type || 'news',
      category: d.category || profile.category || 'General',
      subcategory: cleanSubcategory(d.subcategory),
      source: d.source || 'dynamic-search',
      sourceId: d.sourceId || d.source || 'dynamic-search',
      sourceType: d.sourceType || '',
      country: d.country || profile.country || '',
      region: d.region || profile.region || '',
      queryCategory: d.queryCategory || d.category || '',
      opportunityType: d.opportunityType || 'market_news',
      language: d.language || profile.language || 'en',
      relevanceScore: Number(d.relevanceScore || d.relevance_score || 0),
      relevance_score: Number(d.relevance_score || d.relevanceScore || 0),
      relevanceReason: d.relevanceReason || d.relevance_reason || '',
      relevance_reason: d.relevance_reason || d.relevanceReason || '',
      aiSummary: d.aiSummary || d.summary || '',
      blogContext: d.blogContext || '',
      sourceQuery: d.sourceQuery || '',
      rawData: compactRawData(d.rawData || d.raw, {
        sourceQuery: d.sourceQuery || '',
        allowedDomains: d.allowedDomains || [],
        tavilyScore: d.tavilyScore || d.tavily_score || null
      }),
      fetched_at: d.fetched_at || new Date().toISOString(),
      publishedAt: d.publishedAt || ''
    };

    byTopic[result.type] = byTopic[result.type] || [];
    byTopic[result.type].push(result);
  }

  const results = [];
  for (const topic of ALLOWED_TOPICS) {
    const grouped = {};
    for (const row of byTopic[topic] || []) {
      const key = row.queryCategory || row.category || 'General';
      grouped[key] = grouped[key] || [];
      grouped[key].push(row);
    }
    const rows = Object.values(grouped)
      .flatMap((items) => items
        .sort((a, b) => (b.relevanceScore - a.relevanceScore) || String(b.publishedAt).localeCompare(String(a.publishedAt)))
        .slice(0, perCategoryLimit)
      )
      .sort((a, b) => (b.relevanceScore - a.relevanceScore) || String(b.publishedAt).localeCompare(String(a.publishedAt)))
      .slice(0, topicLimit);
    results.push(...rows);
  }

  return {
    userId: profile.userId || '',
    savedSearchId: profile.savedSearchId || '',
    logId: profile.logId || '',
    country: profile.country || '',
    region: profile.region || '',
    days: profile.days || 30,
    startedAt: profile.startedAt || new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    resultCount: results.length,
    totalFetched: results.length,
    mergeStats: {
      input: topicItems.length,
      duplicates: mergeDuplicates,
      unique: topicItems.length - mergeDuplicates
    },
    results
  };
}

function mergeTopicStats(topicRuns = []) {
  const stats = {
    rawCandidates: 0,
    passedFilters: 0,
    outputCount: 0,
    duplicates: 0,
    rejected: filterStats(),
    aiIgnored: 0,
    categoryRejected: 0,
    scoreRejected: 0,
    searchErrors: 0,
    debugSamples: {
      rejected: [],
      aiIgnored: [],
      matched: []
    },
    byTopic: {}
  };

  for (const run of topicRuns) {
    const topic = run.topic || 'unknown';
    const row = run.stats || {};
    const rejected = row.rejected || {};
    stats.rawCandidates += Number(row.rawCandidates || 0);
    stats.passedFilters += Number(row.passedFilters || 0);
    stats.outputCount += Number(row.outputCount || 0);
    stats.duplicates += Number(row.duplicates || 0);
    stats.aiIgnored += Number(row.aiIgnored || 0);
    stats.categoryRejected += Number(row.categoryRejected || 0);
    stats.scoreRejected += Number(row.scoreRejected || 0);
    stats.searchErrors += Number(row.searchErrors || 0);
    for (const key of Object.keys(stats.rejected)) {
      stats.rejected[key] += Number(rejected[key] || 0);
    }
    for (const key of ['rejected', 'aiIgnored', 'matched']) {
      for (const sample of rejected.samples?.[key] || []) {
        pushSample(stats.debugSamples[key], { topic, ...sample }, 10);
      }
    }
    stats.byTopic[topic] = {
      rawCandidates: Number(row.rawCandidates || 0),
      passedFilters: Number(row.passedFilters || 0),
      outputCount: Number(row.outputCount || 0),
      duplicates: Number(row.duplicates || 0),
      rejected,
      aiIgnored: Number(row.aiIgnored || 0),
      categoryRejected: Number(row.categoryRejected || 0),
      scoreRejected: Number(row.scoreRejected || 0),
      searchErrors: Number(row.searchErrors || 0)
    };
  }

  return stats;
}

async function runProfileSearch(incoming = {}, options = {}) {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const isCancelled = typeof options.isCancelled === 'function' ? options.isCancelled : () => false;
  const throwIfCancelled = () => {
    if (!isCancelled()) return;
    const error = new Error('Fetch cancelled by user');
    error.code = 'FETCH_CANCELLED';
    throw error;
  };
  if (!tavilyService.isEnabled()) throw new Error('TAVILY_API_KEY is required for code-based profile search');
  throwIfCancelled();
  onProgress?.({ step: 'normalize', message: 'Normalizing profile input and selected topics' });
  const profile = normalizeProfileInput(incoming.body || incoming);
  const selectedTopics = ALLOWED_TOPICS.filter((topic) => profile.topicEnabled?.[topic]);
  onProgress?.({ step: 'search', message: `Starting ${selectedTopics.length} selected topic${selectedTopics.length === 1 ? '' : 's'} one by one` });
  const topicRuns = [];
  for (let i = 0; i < selectedTopics.length; i += 1) {
    throwIfCancelled();
    const topic = selectedTopics[i];
    onProgress?.({
      step: `topic:${topic}:start`,
      message: `Starting ${topic} topic (${i + 1}/${selectedTopics.length})`
    });
    const topicRun = await runTopic(profile, topic, onProgress);
    throwIfCancelled();
    topicRuns.push({ topic, ...topicRun });
    onProgress?.({
      step: `topic:${topic}:complete`,
      message: `Completed ${topic} topic (${i + 1}/${selectedTopics.length})`
    });
  }
  throwIfCancelled();
  onProgress?.({ step: 'merge', message: 'Merging, deduplicating and applying per-topic limits' });
  const searchStats = mergeTopicStats(topicRuns);
  const payload = buildBackendCallback(profile, topicRuns.flatMap((run) => run.results || []));
  payload.searchStats = searchStats;
  payload.totalFetched = searchStats.rawCandidates;
  onProgress?.({
    step: 'payload',
    message: `Prepared ${payload.resultCount} final result${payload.resultCount === 1 ? '' : 's'} for saving from ${searchStats.rawCandidates} fetched candidate${searchStats.rawCandidates === 1 ? '' : 's'} (${payload.mergeStats.unique} unique after removing ${payload.mergeStats.duplicates} merge duplicate${payload.mergeStats.duplicates === 1 ? '' : 's'})`
  });
  return payload;
}

module.exports = {
  runProfileSearch,
  normalizeProfileInput
};
