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
const MAX_TOPIC_QUERY_LIMIT = 10;

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
    categories: unique(list(incoming.categories || incoming.selectedCategories || incoming.category)).slice(0, MAX_TOPIC_QUERY_LIMIT),
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
    targetPerTopic: Math.max(1, Math.min(10, Number(incoming.targetPerTopic || incoming.maxPerTopic || 10) || 10)),
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
  if (!profile.strictSources) return profile.userDomains || [];
  const topicDomains = unique(list(profile.sourceDomainsByTopic?.[topic]));
  return topicDomains.length ? topicDomains : profile.preferredDomains;
}

function buildTopicQueries(profile, topic) {
  const variants = Array.isArray(profile.queryVariants?.[topic])
    ? profile.queryVariants[topic].map((v) => text(v)).filter(Boolean)
    : [];
  const fallback = text(profile.queries?.[topic]);
  const maxQueries = Math.max(1, Math.min(MAX_TOPIC_QUERY_LIMIT, profile.categories.length || 1));
  const queries = (variants.length ? variants : [fallback].filter(Boolean)).slice(0, maxQueries);
  if (!queries.length) return [];

  const includeDomains = domainsForTopic(profile, topic);

  return queries.map((query, variantIndex) => ({
    profile: {
      ...profile,
      category: text(profile.queryCategories?.[topic]?.[variantIndex]) || profile.categories[variantIndex] || profile.category
    },
    topic,
    variantIndex,
    type: topic,
    opportunityType: OPPORTUNITY_TYPE[topic] || 'market_news',
    sourceQuery: query,
    minTavilyScore: Math.max(0, Math.min(100, Number(profile.minTavilyScore || 10) || 10)),
    tavilyOptions: {
      topic: 'news',
      searchDepth: 'advanced',
      maxResults: Math.max(1, Math.min(10, Number(process.env.TAVILY_MAX_RESULTS || 10) || 10)),
      timeRange: daysToTimeRange(profile.days),
      includeRawContent: false,
      timeoutMs: 30000,
      includeDomains: includeDomains.length ? includeDomains : []
    }
  }));
}

function articleFromResult(row, request) {
  const title = text(row.title);
  const url = text(row.url);
  const snippet = text(row.snippet || row.content || row.summary);
  const rawContent = text(row.rawContent || row.raw_content);
  const summary = [snippet, rawContent].filter(Boolean).join('\n\n').trim();
  if (!title || !url) return null;

  const tavilyScore = typeof row.score === 'number' ? row.score : 50;
  if (tavilyScore < (request.minTavilyScore || 0)) return null;

  const profile = request.profile || {};
  const sourceType = hostFromUrl(url);
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
    urlHash: hashUrl(url.toLowerCase().replace(/\/$/, '')),
    source: sourceType,
    sourceId: sourceType,
    sourceType,
    sourceQuery: request.sourceQuery,
    fetched_at: new Date().toISOString(),
    publishedAt: row.publishedAt || new Date().toISOString()
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
    targetPerTopic: profile.targetPerTopic || 10
  };
}

function bestSubcategory(articleSubcategory, ai) {
  const existing = text(articleSubcategory);
  const fromAi = text(ai?.subcategory || ai?.sub_category || ai?.subCategory || ai?.['sub-category'] || ai?.['sub category']);
  return isAllPlaceholder(existing) ? fromAi : (existing || fromAi);
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
    category: article.category || article.profile?.category || 'General',
    subcategory: bestSubcategory(article.subcategory, ai),
    source: article.source || 'dynamic-search',
    sourceId: article.sourceId || article.source || 'dynamic-search',
    sourceType: article.sourceType || '',
    country: article.country || article.profile?.country || '',
    region: article.region || article.profile?.region || '',
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

  onProgress?.({
    step: `topic:${topic}:ai`,
    message: `${topic} topic: filtering ${articles.length} candidate${articles.length === 1 ? '' : 's'} with AI relevance`
  });
  const output = [];
  for (const article of articles) {
    const ai = await aiService.classifyProfileRelevance({ article, profile, topic });
    const score = Math.max(0, Math.min(100, parseInt(ai.relevance_score, 10) || 0));
    const decision = text(ai.decision).toUpperCase();
    const ignored = decision !== 'STORE' || score < 40 || text(ai.category).toUpperCase() === 'IGNORE';
    if (ignored) continue;

    output.push(resultFromArticle(article, topic, ai));
  }

  if (!output.length && articles.length) {
    onProgress?.({
      step: `topic:${topic}:filtered`,
      message: `${topic} topic: AI filtered out all ${articles.length} candidate${articles.length === 1 ? '' : 's'} — none met the relevance threshold`
    });
  }

  onProgress?.({
    step: `topic:${topic}:done`,
    message: `${topic} topic: kept ${output.length} relevant result${output.length === 1 ? '' : 's'}${searchErrors ? `; ${searchErrors} query variant${searchErrors === 1 ? '' : 's'} failed` : ''}`
  });
  return output;
}

function buildBackendCallback(profile, topicItems) {
  const seen = new Set();
  const byTopic = {};
  const topicLimit = Math.max(1, Math.min(10, Number(profile.targetPerTopic || 10) || 10));

  for (const d of topicItems) {
    if (!d.url || !d.title) continue;
    const key = String(d.urlHash || d.url).toLowerCase();
    if (seen.has(key)) continue;
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
    const rows = (byTopic[topic] || [])
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
  onProgress?.({ step: 'payload', message: `Prepared ${payload.resultCount} final result${payload.resultCount === 1 ? '' : 's'} for saving` });
  return payload;
}

module.exports = {
  runProfileSearch,
  normalizeProfileInput
};
