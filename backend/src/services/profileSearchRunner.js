const tavilyService = require('./tavilyService');
const aiService = require('./aiService');
const { hashUrl } = require('../utils/hash');
const { CATEGORIES } = require('../config/categories');

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
const MAX_TOPIC_QUERY_LIMIT = Math.max(1, Math.min(30, Number(process.env.MAX_SEARCH_VARIANTS_PER_TOPIC || 18) || 18));
const DEFAULT_TARGET_PER_CATEGORY = 10;
const DEFAULT_TARGET_PER_TOPIC = 150;
const MAX_TARGET_PER_TOPIC = 150;
const DEFAULT_TAVILY_MAX_RESULTS = 20;
const MAX_TAVILY_MAX_RESULTS = 20;
const MIN_STORE_SCORE = Math.max(0, Math.min(100, Number(process.env.AI_RELEVANCE_MIN_SCORE || 50) || 50));
const BROAD_DISCOVERY_MAX_RESULTS = Math.max(1, Math.min(10, Number(process.env.BROAD_DISCOVERY_MAX_RESULTS || 6) || 6));

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

function articleIdentityHash({ url, title }) {
  return hashUrl([
    normalizedUrl(url),
    text(title).toLowerCase()
  ].join('|'));
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
        unique(list(domains))
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
    preferredDomains: unique(list(incoming.preferredDomains || incoming.includeDomains || incoming.sources)),
    userDomains: unique(list(incoming.userDomains || incoming.user_domains)),
    sourceDomainsByTopic,
    strictSources: Boolean(incoming.strictSources || incoming.strict_sources),
    competitors: unique(list(incoming.competitors)),
    days: Math.max(1, Math.min(365, Number(incoming.days || 30) || 30)),
    targetPerTopic: Math.max(1, Math.min(MAX_TARGET_PER_TOPIC, Number(incoming.targetPerTopic || incoming.maxPerTopic || DEFAULT_TARGET_PER_TOPIC) || DEFAULT_TARGET_PER_TOPIC)),
    minTavilyScore: incoming.minTavilyScore,
    language: text(incoming.language || defaultLanguage()),
    timezone: text(incoming.timezone || defaultTimezone()),
    callbackUrl: text(incoming.callbackUrl),
    callbackSecret: text(incoming.callbackSecret || incoming.secret),
    startedAt: incoming.startedAt || now
  };

  if (!profile.userId) throw new Error('userId is required');
  if (!profile.categories.length) profile.categories = [profile.category || defaultCategory()].filter(Boolean);
  return profile;
}

function domainsForTopic(profile, topic) {
  const topicDomains = unique(list(profile.sourceDomainsByTopic?.[topic]));
  const preferredDomains = unique(list(profile.preferredDomains));
  const userDomains = unique(list(profile.userDomains));
  if (profile.strictSources) return topicDomains.length ? topicDomains : (preferredDomains.length ? preferredDomains : userDomains);
  return unique([...(topicDomains.length ? topicDomains : preferredDomains), ...userDomains]);
}

function sourceFallbackQuery(profile, topic) {
  return [
    profile.country,
    profile.region,
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

function buildTopicQueries(profile, topic) {
  const variants = Array.isArray(profile.queryVariants?.[topic])
    ? profile.queryVariants[topic].map((v) => text(v)).filter(Boolean)
    : [];
  const fallback = text(profile.queries?.[topic]);
  const maxQueries = Math.max(
    1,
    Math.min(MAX_TOPIC_QUERY_LIMIT, variants.length ? variants.length : (profile.categories.length || 1))
  );
  const queries = (variants.length ? variants : [fallback].filter(Boolean)).slice(0, maxQueries);
  if (!queries.length) return [];

  const includeDomains = domainsForTopic(profile, topic);

  const maxResults = Math.max(1, Math.min(MAX_TAVILY_MAX_RESULTS, Number(process.env.TAVILY_MAX_RESULTS || DEFAULT_TAVILY_MAX_RESULTS) || DEFAULT_TAVILY_MAX_RESULTS));
  const requestForQuery = ({ query, category, variantIndex, includeDomainsOverride, searchDepth = 'advanced', maxResultsOverride }) => ({
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
      topic: topic === 'evergreen' ? 'general' : 'news',
      searchDepth,
      maxResults: maxResultsOverride || maxResults,
      timeRange: daysToTimeRange(profile.days),
      includeRawContent: false,
      timeoutMs: 30000,
      includeDomains: includeDomainsOverride || []
    }
  });

  const baseRequests = queries.map((query, variantIndex) => requestForQuery({
    query,
    category: text(profile.queryCategories?.[topic]?.[variantIndex]) || profile.categories[variantIndex] || profile.category,
    variantIndex,
    includeDomainsOverride: includeDomains.length ? includeDomains : []
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
        minTavilyScore: 0,
        tavilyOptions: {
          topic: topic === 'evergreen' ? 'general' : 'news',
          searchDepth: 'advanced',
          maxResults,
          timeRange: daysToTimeRange(profile.days),
          includeRawContent: false,
          timeoutMs: 30000,
          includeDomains
        }
      }]
    : [];

  const broadDiscoveryRequests = profile.strictSources
    ? []
    : profile.categories.map((category, index) => ({
        profile: {
          ...profile,
          category
        },
        topic,
        variantIndex: baseRequests.length + sourceFallbackRequests.length + index,
        type: topic,
        opportunityType: OPPORTUNITY_TYPE[topic] || 'market_news',
        sourceQuery: broadDiscoveryQuery(profile, topic, category),
        minTavilyScore: 0,
        tavilyOptions: {
          topic: topic === 'evergreen' ? 'general' : 'news',
          searchDepth: 'basic',
          maxResults: BROAD_DISCOVERY_MAX_RESULTS,
          timeRange: daysToTimeRange(profile.days),
          includeRawContent: false,
          timeoutMs: 30000,
          includeDomains: topic === 'govt' ? includeDomains : []
        }
      })).filter((request) => topic !== 'govt' || request.tavilyOptions.includeDomains.length);

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

function articleFromResult(row, request) {
  const title = text(row.title);
  const url = text(row.url);
  const snippet = text(row.snippet || row.content || row.summary);
  const rawContent = text(row.rawContent || row.raw_content);
  const summary = [snippet, rawContent].filter(Boolean).join('\n\n').trim();
  if (!title || !url) return null;
  if (request.topic === 'govt' && !isAllowedGovtResult(url, request.tavilyOptions?.includeDomains || [])) {
    return null;
  }
  if (request.topic === 'evergreen' && !isEvergreenResult({ title, url, summary })) {
    return null;
  }

  const tavilyScore = typeof row.score === 'number' ? row.score : 50;
  if (tavilyScore < (request.minTavilyScore || 0)) return null;

  const profile = request.profile || {};
  const sourceType = hostFromUrl(url);
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
    tavilyScore,
    relevanceScore: tavilyScore,
    relevance_score: tavilyScore,
    relevanceReason: `Tavily relevance score ${tavilyScore} for ${request.topic} query variant ${request.variantIndex}.`,
    relevance_reason: `Tavily relevance score ${tavilyScore} for ${request.topic} query variant ${request.variantIndex}.`,
    url,
    urlHash: identityHash,
    source: sourceType,
    sourceId: sourceType,
    sourceType,
    sourceQuery: request.sourceQuery,
    fetched_at: new Date().toISOString(),
    publishedAt: row.publishedAt || new Date().toISOString()
  };
}

function dedupeArticlesForAi(articles = []) {
  const byIdentity = new Map();
  let duplicates = 0;

  for (const article of articles) {
    const key = articleIdentityHash({ url: article.url, title: article.title });
    const existing = byIdentity.get(key);
    if (!existing) {
      byIdentity.set(key, article);
      continue;
    }

    duplicates += 1;
    const existingScore = Number(existing.tavilyScore || existing.relevanceScore || 0);
    const articleScore = Number(article.tavilyScore || article.relevanceScore || 0);
    if (articleScore > existingScore) byIdentity.set(key, article);
  }

  return {
    articles: [...byIdentity.values()],
    duplicates
  };
}

function workflowProfile(profile = {}) {
  return {
    userId: profile.userId || '',
    savedSearchId: profile.savedSearchId || '',
    logId: profile.logId || '',
    callbackUrl: profile.callbackUrl || '',
    callbackSecret: profile.callbackSecret || '',
    country: profile.country || '',
    region: profile.region || '',
    category: profile.category || '',
    language: profile.language || 'en',
    startedAt: profile.startedAt || '',
    targetPerTopic: profile.targetPerTopic || DEFAULT_TARGET_PER_TOPIC
  };
}

function bestSubcategory(articleSubcategory, ai) {
  const existing = text(articleSubcategory);
  const fromAi = text(ai?.subcategory || ai?.sub_category || ai?.subCategory || ai?.['sub-category'] || ai?.['sub category']);
  return isAllPlaceholder(existing) ? fromAi : (existing || fromAi);
}

function bestCategory(articleCategory, ai) {
  const fromAi = text(ai?.category);
  if (CATEGORIES[fromAi]) return fromAi;
  const existing = text(articleCategory);
  return CATEGORIES[existing] ? existing : 'General';
}

function resultFromArticle(article, topic, ai = {}) {
  const score = Math.max(
    0,
    Math.min(100, parseInt(ai.relevance_score ?? article.relevanceScore ?? article.tavilyScore, 10) || 0)
  );

  return {
    profile: workflowProfile(article.profile),
    title: article.title,
    summary: ai.summary || article.summary || '',
    url: article.url,
    urlHash: article.urlHash,
    type: topic,
    category: bestCategory(article.category || article.profile?.category, ai),
    subcategory: bestSubcategory(article.subcategory, ai),
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
    sourceQuery: article.sourceQuery || '',
    fetched_at: article.fetched_at || new Date().toISOString(),
    publishedAt: article.publishedAt || new Date().toISOString()
  };
}

async function runTopic(profile, topic, onProgress) {
  if (!profile.topicEnabled?.[topic]) return [];

  const requests = buildTopicQueries(profile, topic);
  onProgress?.({
    step: `topic:${topic}:queries`,
    message: `${topic} topic: built ${requests.length} query variant${requests.length === 1 ? '' : 's'}`
  });
  const articles = [];
  let searchErrors = 0;
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
    for (const row of rows) {
      const article = articleFromResult(row, request);
      if (article) articles.push(article);
    }
  }

  const deduped = dedupeArticlesForAi(articles);
  if (deduped.duplicates) {
    onProgress?.({
      step: `topic:${topic}:dedupe`,
      message: `${topic} topic: removed ${deduped.duplicates} duplicate candidate${deduped.duplicates === 1 ? '' : 's'} before AI review`
    });
  }

  onProgress?.({
    step: `topic:${topic}:ai`,
    message: `${topic} topic: reviewing ${deduped.articles.length} unique candidate${deduped.articles.length === 1 ? '' : 's'} with AI relevance`
  });
  const output = [];
  let aiKept = 0;
  for (const article of deduped.articles) {
    const ai = await aiService.classifyProfileRelevance({ article, profile, topic });
    const score = Math.max(0, Math.min(100, parseInt(ai.relevance_score, 10) || 0));
    const decision = text(ai.decision).toUpperCase();
    const aiCategory = text(ai.category);
    const ignored = decision !== 'STORE' || score < MIN_STORE_SCORE || text(ai.category).toUpperCase() === 'IGNORE' || !CATEGORIES[aiCategory];
    if (ignored) continue;

    output.push(resultFromArticle(article, topic, ai));
    aiKept += 1;
  }

  if (!output.length && deduped.articles.length) {
    onProgress?.({
      step: `topic:${topic}:filtered`,
      message: `${topic} topic: no result met the AI relevance threshold`
    });
  }

  onProgress?.({
    step: `topic:${topic}:done`,
    message: `${topic} topic: kept ${output.length} AI-relevant result${output.length === 1 ? '' : 's'} (score >= ${MIN_STORE_SCORE})${searchErrors ? `; ${searchErrors} query variant${searchErrors === 1 ? '' : 's'} failed` : ''}`
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
      sourceQuery: d.sourceQuery || '',
      fetched_at: d.fetched_at || new Date().toISOString(),
      publishedAt: d.publishedAt || new Date().toISOString()
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
    callbackUrl: profile.callbackUrl || '',
    callbackSecret: profile.callbackSecret || '',
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
  if (!tavilyService.isEnabled()) throw new Error('TAVILY_API_KEY is required for code-based profile search');
  onProgress?.({ step: 'normalize', message: 'Normalizing profile input and selected topics' });
  const profile = normalizeProfileInput(incoming.body || incoming);
  const selectedTopics = ALLOWED_TOPICS.filter((topic) => profile.topicEnabled?.[topic]);
  onProgress?.({ step: 'search', message: `Starting ${selectedTopics.length} selected topic${selectedTopics.length === 1 ? '' : 's'} one by one` });
  const topicResults = [];
  for (let i = 0; i < selectedTopics.length; i += 1) {
    const topic = selectedTopics[i];
    onProgress?.({
      step: `topic:${topic}:start`,
      message: `Starting ${topic} topic (${i + 1}/${selectedTopics.length})`
    });
    const results = await runTopic(profile, topic, onProgress);
    topicResults.push(results);
    onProgress?.({
      step: `topic:${topic}:complete`,
      message: `Completed ${topic} topic (${i + 1}/${selectedTopics.length})`
    });
  }
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
