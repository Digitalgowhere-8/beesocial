const tavilyService = require('./tavilyService');
const aiService = require('./aiService');
const { getSystemSettings } = require('./systemSettings');
const { hashUrl } = require('../utils/hash');
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
const MAX_TOPIC_QUERY_LIMIT = Math.max(1, Math.min(10, Number(process.env.MAX_SEARCH_VARIANTS_PER_TOPIC || 5) || 5));
const DEFAULT_TARGET_PER_CATEGORY = 10;
const DEFAULT_TARGET_PER_TOPIC = 100;
const MAX_TARGET_PER_TOPIC = 100;
const DEFAULT_TAVILY_MAX_RESULTS = 5;
const MAX_TAVILY_MAX_RESULTS = 5;
const DEFAULT_MIN_STORE_SCORE = Math.max(0, Math.min(100, Number(process.env.AI_RELEVANCE_MIN_SCORE || 30) || 30));
const BROAD_DISCOVERY_MAX_RESULTS = Math.max(1, Math.min(5, Number(process.env.BROAD_DISCOVERY_MAX_RESULTS || 3) || 3));

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

function isValidParsedDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

function parseDateCandidate(value) {
  const parsed = new Date(value);
  return isValidParsedDate(parsed) ? parsed : null;
}

function extractTextDates(value = '') {
  const source = text(value).replace(/\s+/g, ' ').trim();
  if (!source) return [];

  const patterns = [
    /\b(?:last\s+updated?|last\s+update|updated?|published|effective(?:\s+date)?|as\s+of)\s*[:\-]?\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/gi,
    /\b(?:last\s+updated?|last\s+update|updated?|published|effective(?:\s+date)?|as\s+of)\s*[:\-]?\s*([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})/gi,
    /\b(?:last\s+updated?|last\s+update|updated?|published|effective(?:\s+date)?|as\s+of)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2})/gi,
    /\b(?:last\s+updated?|last\s+update|updated?|published|effective(?:\s+date)?|as\s+of)\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/gi
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

function resultArticleDate(row = {}) {
  return inferResultDate(row) || new Date();
}

function resultMatchesDayWindow(row, maxAgeDays = 30) {
  const publishedAt = resultArticleDate(row);
  const ageMs = Date.now() - publishedAt.getTime();
  return ageMs <= Math.max(1, maxAgeDays) * 24 * 60 * 60 * 1000;
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
  return text(value).toLowerCase().replace(/\/$/, '');
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
  return {
    missing: 0,
    date: 0,
    source: 0,
    type: 0,
    score: 0,
    pdf: 0,
    topic: 0
  };
}

function minStoreScoreForProfile(profile = {}) {
  return Math.max(
    0,
    Math.min(100, Number(profile.minStoreScore ?? DEFAULT_MIN_STORE_SCORE) || DEFAULT_MIN_STORE_SCORE)
  );
}

function rejectCandidate(stats, reason) {
  if (stats && Object.prototype.hasOwnProperty.call(stats, reason)) {
    stats[reason] += 1;
  }
  return null;
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
  const fallbackDefaults = unique(
    defaultSourceDomainsForCountry(
      canonicalCountry(profile.country || defaultCountry()),
      topic === 'govt' ? 'govt' : topic === 'competitor' ? 'competitor' : 'news'
    ).map(cleanDomain).filter(Boolean)
  );
  const defaultDomains = configuredDefaults.length ? configuredDefaults : fallbackDefaults;
  // Keep fetches locked to the configured source lists so results stay inside
  // the known domain set for the selected country/topic.
  if (defaultDomains.length) return defaultDomains;
  return topicDomains;
}

function tavilyTopicForProfileTopic(topic) {
  return topic === 'news' ? 'news' : 'general';
}

function sourceFallbackQuery(profile, topic) {
  if (topic === 'govt') {
    return [
      profile.country,
      profile.region,
      profile.category,
      'official government regulation policy circular announcement tax employment licensing company registry compliance'
    ].map((part) => text(part)).filter(Boolean).join(' ');
  }

  return [
    profile.country,
    profile.region,
    profile.category,
    profile.subcategory,
    topic === 'evergreen' ? 'guide checklist requirements' : 'latest update announcement news policy compliance tax business economy',
    topic === 'competitor' ? list(profile.competitors).join(' ') : '',
    'professional services'
  ].map((part) => text(part)).filter(Boolean).join(' ');
}

function broadDiscoveryQuery(profile, topic, category) {
  return [
    profile.country,
    profile.region,
    category,
    topic === 'evergreen'
      ? 'guide requirements checklist'
      : 'latest announcement update regulation compliance business news',
    topic === 'competitor' ? list(profile.competitors).join(' ') : ''
  ].map((part) => text(part)).filter(Boolean).join(' ');
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
      includeDomains: includeDomainsOverride || []
    }
  });

  const baseRequests = queryEntries.map((entry, variantIndex) => requestForQuery({
    query: entry.query,
    category: entry.category || profile.categories[variantIndex] || profile.category,
    variantIndex,
    includeDomainsOverride: includeDomains.length ? includeDomains : [],
    searchDepth: topic === 'govt' ? 'advanced' : 'basic'
  }));

  const sourceFallbackRequests = includeDomains.length
    ? [{
        profile: {
          ...profile,
          category: profile.categories[0] || profile.category
        },
        topic,
        variantIndex: baseRequests.length,
        type: topic,
        opportunityType: OPPORTUNITY_TYPE[topic] || 'market_news',
        sourceQuery: sourceFallbackQuery(profile, topic),
        minTavilyScore: Math.max(0, Math.min(100, Number(profile.minTavilyScore || 0) || 0)),
        tavilyOptions: {
          topic: tavilyTopicForProfileTopic(topic),
          searchDepth: topic === 'govt' ? 'advanced' : 'basic',
          maxResults,
          timeRange: daysToTimeRange(profile.days),
          includeRawContent: true,
          timeoutMs: 30000,
          includeDomains
        }
      }]
    : [];

  const broadDiscoveryRequests = [];

  const interleaved = [];
  const broadByCategory = new Map(broadDiscoveryRequests.map((request) => [request.profile.category, request]));
  const usedBroad = new Set();
  for (const request of baseRequests) {
    interleaved.push(request);
    const broad = broadByCategory.get(request.profile.category);
    if (broad && !usedBroad.has(request.profile.category)) {
      interleaved.push(broad);
      usedBroad.add(request.profile.category);
    }
  }

  for (const request of broadDiscoveryRequests) {
    if (!usedBroad.has(request.profile.category)) interleaved.push(request);
  }

  return [...interleaved.slice(0, MAX_TOPIC_QUERY_LIMIT), ...sourceFallbackRequests];
}

function articleFromResult(row, request, stats) {
  const title = text(row.title);
  const url = text(row.url);
  const snippet = text(row.snippet || row.content || row.summary);
  const rawContent = text(row.rawContent || row.raw_content);
  const summary = [snippet, rawContent].filter(Boolean).join('\n\n').trim();
  const articleDate = resultArticleDate(row);
  if (!title || !url) return rejectCandidate(stats, 'missing');
  if (!resultMatchesDayWindow(row, request.profile?.days || 30)) {
    return rejectCandidate(stats, 'date');
  }
  if (
    shouldEnforcePostSourceFilter(request.topic) &&
    !isAllowedSourceResult(url, request.tavilyOptions?.includeDomains || [])
  ) {
    return rejectCandidate(stats, 'source');
  }
  if (request.topic === 'govt' && !isAllowedGovtResult(url, request.tavilyOptions?.includeDomains || [])) {
    return rejectCandidate(stats, 'source');
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
    profile: request.profile || {}
  });
  if (!topicRule.keep) {
    return rejectCandidate(stats, topicRule.reason === 'pdf' ? 'pdf' : 'topic');
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
    blogContext: [rawContent, snippet].filter(Boolean).join('\n\n').slice(0, 12000),
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
    rawData: {
      rawContent: rawContent.slice(0, 20000),
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
  return normalizeCategory(ai?.category, articleCategory);
}

function resultFromArticle(article, topic, ai = {}) {
  const score = Math.max(
    0,
    Math.min(100, parseInt(ai.relevance_score ?? article.relevanceScore ?? article.tavilyScore, 10) || 0)
  );
  const category = bestCategory(article.category || article.profile?.category, ai);
  const subcategory = normalizeSubcategory(
    category,
    ai.subcategory || ai.sub_category || ai.subCategory || ai['sub-category'] || ai['sub category'],
    article.subcategory
  );

  return {
    profile: workflowProfile(article.profile),
    title: article.title,
    summary: ai.summary || article.summary || '',
    rawContent: article.rawContent || article.rawData?.rawContent || '',
    url: article.url,
    urlHash: article.urlHash,
    type: topic,
    category,
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
    blogContext: article.blogContext || article.rawContent || article.summary || '',
    sourceQuery: article.sourceQuery || '',
    rawData: article.rawData || {
      rawContent: article.rawContent || '',
      sourceQuery: article.sourceQuery || '',
      allowedDomains: article.allowedDomains || [],
      tavilyScore: article.tavilyScore || null
    },
    fetched_at: article.fetched_at || new Date().toISOString(),
    publishedAt: article.publishedAt || ''
  };
}

function selectedCategoriesForProfile(profile = {}) {
  const selected = unique(
    list(profile.categories).map((category) => normalizeCategory(category)).filter(Boolean)
  );
  if (selected.length) return selected;
  return [normalizeCategory(profile.category)].filter(Boolean);
}

function selectedSubcategoryForProfile(profile = {}, category = '') {
  const selected = cleanSubcategory(profile.subcategory);
  if (!selected) return '';
  return normalizeSubcategory(category || normalizeCategory(profile.category), selected, selected);
}

function articleMatchesSelection(profile = {}, ai = {}, article = {}) {
  const aiCategory = normalizeCategory(ai.category, article.category || profile.category);
  const allowedCategories = selectedCategoriesForProfile(profile);
  if (allowedCategories.length && !allowedCategories.includes(aiCategory)) return false;

  const selectedSubcategory = selectedSubcategoryForProfile(profile, aiCategory);
  if (!selectedSubcategory) return true;

  const aiSubcategory = normalizeSubcategory(
    aiCategory,
    ai.subcategory || ai.sub_category || ai.subCategory || ai['sub-category'] || ai['sub category'],
    article.subcategory || profile.subcategory
  );
  return aiSubcategory === selectedSubcategory;
}

async function runTopic(profile, topic, onProgress) {
  if (!profile.topicEnabled?.[topic]) return [];
  const systemSettings = await getSystemSettings();
  const aiConfig = { model: systemSettings.aiModel };

  const requests = buildTopicQueries(profile, topic);
  onProgress?.({
    step: `topic:${topic}:queries`,
    message: `${topic} topic: built ${requests.length} query variant${requests.length === 1 ? '' : 's'}`
  });
  const articles = [];
  let searchErrors = 0;
  let rawCandidates = 0;
  const rejected = filterStats();
  for (let i = 0; i < requests.length; i += 1) {
    const request = requests[i];
    onProgress?.({
      step: `topic:${topic}:search`,
      message: `${topic} topic: searching variant ${i + 1}/${requests.length}`
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
    message: `${topic} topic: processed ${rawCandidates} Tavily candidate${rawCandidates === 1 ? '' : 's'}; ${articles.length} passed filters; rejected missing:${rejected.missing}, date:${rejected.date}, source:${rejected.source}, type:${rejected.type}, score:${rejected.score}, pdf:${rejected.pdf}, topic:${rejected.topic}`
  });

  const deduped = dedupeArticlesForAi(articles);
  if (deduped.duplicates) {
    onProgress?.({
      step: `topic:${topic}:dedupe`,
      message: `${topic} topic: removed ${deduped.duplicates} duplicate candidate${deduped.duplicates === 1 ? '' : 's'} before AI review`
    });
  }

  onProgress?.({
    step: `topic:${topic}:ai`,
    message: `${topic} topic: enriching ${deduped.articles.length} unique candidate${deduped.articles.length === 1 ? '' : 's'} and checking selected category fit`
  });
  const output = [];
  let categoryRejected = 0;
  let scoreRejected = 0;
  const minStoreScore = minStoreScoreForProfile(profile);
  for (const article of deduped.articles) {
    let ai = {};
    try {
      ai = await aiService.classifyProfileRelevance({ article, profile, topic, aiConfig });
    } catch (_err) {
      ai = {};
    }

    if (ai.decision === 'IGNORE' || ai.category === 'IGNORE' || ai.subcategory === 'IGNORE') {
      continue;
    }

    const resolvedCategory = bestCategory(article.category || article.profile?.category, ai);
    const resolvedSubcategory = normalizeSubcategory(
      resolvedCategory,
      ai.subcategory || ai.sub_category || ai.subCategory || ai['sub-category'] || ai['sub category'],
      article.subcategory || profile.subcategory
    );

    if (!articleMatchesSelection(profile, { category: resolvedCategory, subcategory: resolvedSubcategory }, article)) {
      categoryRejected += 1;
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
      continue;
    }

    output.push(result);
  }

  onProgress?.({
    step: `topic:${topic}:done`,
    message: `${topic} topic: kept ${output.length} result${output.length === 1 ? '' : 's'} after domain, duplicate, category, and score checks${categoryRejected ? `; ${categoryRejected} category mismatch reject${categoryRejected === 1 ? '' : 's'}` : ''}${scoreRejected ? `; ${scoreRejected} low-score reject${scoreRejected === 1 ? '' : 's'} (<${minStoreScore})` : ''}${searchErrors ? `; ${searchErrors} query variant${searchErrors === 1 ? '' : 's'} failed` : ''}`
  });
  return output;
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
      blogContext: d.blogContext || d.rawContent || d.summary || '',
      sourceQuery: d.sourceQuery || '',
      rawData: d.rawData || d.raw || {
        rawContent: d.rawContent || '',
        sourceQuery: d.sourceQuery || '',
        allowedDomains: d.allowedDomains || [],
        tavilyScore: d.tavilyScore || d.tavily_score || null
      },
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
  const topicResults = [];
  for (let i = 0; i < selectedTopics.length; i += 1) {
    throwIfCancelled();
    const topic = selectedTopics[i];
    onProgress?.({
      step: `topic:${topic}:start`,
      message: `Starting ${topic} topic (${i + 1}/${selectedTopics.length})`
    });
    const results = await runTopic(profile, topic, onProgress);
    throwIfCancelled();
    topicResults.push(results);
    onProgress?.({
      step: `topic:${topic}:complete`,
      message: `Completed ${topic} topic (${i + 1}/${selectedTopics.length})`
    });
  }
  throwIfCancelled();
  onProgress?.({ step: 'merge', message: 'Merging, deduplicating and applying per-topic limits' });
  const payload = buildBackendCallback(profile, topicResults.flat());
  onProgress?.({
    step: 'payload',
    message: `Prepared ${payload.resultCount} final result${payload.resultCount === 1 ? '' : 's'} for saving (${payload.mergeStats.unique} unique after removing ${payload.mergeStats.duplicates} merge duplicate${payload.mergeStats.duplicates === 1 ? '' : 's'})`
  });
  return payload;
}

module.exports = {
  runProfileSearch,
  normalizeProfileInput
};
