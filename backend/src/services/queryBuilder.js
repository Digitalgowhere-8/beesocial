const { CATEGORIES } = require('../config/categories');
const {
  canonicalCountry,
  mergeSourceDomains,
  NEWS_SOURCE_DOMAINS_BY_COUNTRY,
  GOVT_SOURCE_DOMAINS_BY_COUNTRY,
  COMPETITOR_SOURCE_DOMAINS_BY_COUNTRY
} = require('../config/fetchSources');
const {
  CATEGORY_QUERY_PHRASES,
  GOVT_CATEGORY_QUERY_PHRASES,
  COUNTRY_CATEGORY_QUERY_PHRASES,
  GOVT_QUERY_BUCKETS_BY_COUNTRY,
  DEFAULT_GOVT_QUERY_BUCKETS,
  COMPETITOR_QUERY_TEMPLATES,
  GOVT_QUERY_TEMPLATES,
  COUNTRY_AUTHORITY_HINTS,
  TOPIC_QUERY_TEMPLATES
} = require('../config/queryTemplates');
const DEFAULT_TOPICS = (process.env.FETCH_TOPICS || 'news,govt,competitor,evergreen')
  .split(',')
  .map((topic) => topic.trim().toLowerCase())
  .filter(Boolean);
const DEFAULT_TARGET_PER_TOPIC = 150;
const MAX_TARGET_PER_TOPIC = 150;
const MAX_SEARCH_QUERY_LENGTH = Math.max(100, Math.min(400, Number(process.env.MAX_SEARCH_QUERY_LENGTH || 400) || 400));
const DEFAULT_COMPETITOR_QUERY_NAMES = [
  'Tricor',
  'Vistra',
  'Intertrust',
  'Aztec Group',
  'Hawksford',
  'TMF Group',
  'BoardRoom',
  'Citco',
  'IQ-EQ',
  'Apex Group',
  'Acclime',
  'ZEDRA'
];

function queryTermList(...groups) {
  return [...new Set(
    groups
      .flatMap((group) => Array.isArray(group) ? group : [group])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  )].join(' ');
}

function cleanText(value) {
  return String(value || '').trim();
}

function cleanList(value) {
  if (Array.isArray(value)) {
    return value.map(cleanText).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(',').map(cleanText).filter(Boolean);
  }
  return [];
}

function cleanDomain(value) {
  return cleanText(value)
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .toLowerCase();
}

function cleanSourceDomains(value) {
  return [...new Set(cleanList(value).map(cleanDomain).filter(Boolean))];
}

function knownDomainsForCountry(country) {
  const selected = canonicalCountry(cleanText(country));
  return [
    ...(NEWS_SOURCE_DOMAINS_BY_COUNTRY[selected] || []),
    ...(GOVT_SOURCE_DOMAINS_BY_COUNTRY[selected] || []),
    ...(COMPETITOR_SOURCE_DOMAINS_BY_COUNTRY[selected] || [])
  ].map(cleanDomain).filter(Boolean);
}

function removeKnownOtherMarketDomains(domains = [], country = '') {
  const selected = canonicalCountry(cleanText(country));
  const selectedDomains = new Set(knownDomainsForCountry(selected));
  const otherDomains = new Set(
    Object.keys(NEWS_SOURCE_DOMAINS_BY_COUNTRY)
      .filter((market) => market !== selected)
      .flatMap((market) => knownDomainsForCountry(market))
  );

  return cleanSourceDomains(domains).filter((domain) => (
    selectedDomains.has(domain) || !otherDomains.has(domain)
  ));
}

function uniqueList(value) {
  return [...new Set(cleanList(value))];
}

function selectedCategories(profile = {}) {
  const categories = uniqueList(profile.categories || profile.selectedCategories || profile.selected_categories)
    .filter((category) => CATEGORIES[category] || category);
  if (categories.length) return categories;
  return [cleanText(profile.category) || defaultCategory()].filter(Boolean);
}

function defaultCountry() {
  return cleanText(process.env.DEFAULT_FETCH_COUNTRY);
}

function defaultCategory() {
  return cleanText(process.env.DEFAULT_FETCH_CATEGORY) || Object.keys(CATEGORIES || {})[0] || 'General';
}

function defaultTimezone() {
  return cleanText(process.env.DEFAULT_FETCH_TIMEZONE) || 'Asia/Kolkata';
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

function isLikelyGovernmentDomain(domain) {
  const value = cleanDomain(domain);
  return (
    value.includes('.gov.') ||
    value.endsWith('.gov') ||
    value.endsWith('.gov.sg') ||
    value.endsWith('.gov.hk') ||
    value.endsWith('gov.sg') ||
    value.endsWith('gov.hk') ||
    ['mas.gov.sg', 'acra.gov.sg', 'iras.gov.sg', 'mom.gov.sg', 'edb.gov.sg', 'mti.gov.sg', 'sfc.hk', 'hkma.gov.hk', 'cr.gov.hk', 'ird.gov.hk'].includes(value)
  );
}

function isAllSubcategories(value) {
  const normalized = cleanText(value).toLowerCase();
  return !normalized || [
    'all',
    'all category',
    'all categories',
    'all subcategory',
    'all sub-category',
    'all subcategories',
    'all sub-categories',
    'all sub categories'
  ].includes(normalized);
}

function normalizeTopic(value) {
  const topic = cleanText(value).toLowerCase();
  return DEFAULT_TOPICS.includes(topic) ? topic : '';
}

function normalizeTopics(value) {
  const topics = uniqueList(value).map(normalizeTopic).filter(Boolean);
  return topics.length ? topics : DEFAULT_TOPICS;
}

function quoteIfNeeded(value) {
  const text = cleanText(value);
  if (!text) return '';
  return /\s/.test(text) ? `"${text.replace(/"/g, '')}"` : text;
}

function compactQuery(parts) {
  const query = parts
    .flatMap((part) => Array.isArray(part) ? part : [part])
    .map(cleanText)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (query.length <= MAX_SEARCH_QUERY_LENGTH) return query;

  const words = query.split(' ');
  const trimmed = [];
  let totalLength = 0;

  for (const word of words) {
    const nextLength = totalLength ? totalLength + 1 + word.length : word.length;
    if (nextLength > MAX_SEARCH_QUERY_LENGTH) break;
    trimmed.push(word);
    totalLength = nextLength;
  }

  if (trimmed.length) return trimmed.join(' ');
  return query.slice(0, MAX_SEARCH_QUERY_LENGTH).trim();
}

function cleanMarketTerms(country, value) {
  return cleanText(value).replace(/\s+/g, ' ').trim();
}

function removeDuplicateAuthorityTerms(intent = '', authorities = '') {
  const authorityWords = new Set(
    cleanText(authorities)
      .split(/\s+/)
      .map((word) => word.toLowerCase())
      .filter((word) => word.length > 2)
  );
  if (!authorityWords.size) return cleanText(intent);
  return cleanText(intent)
    .split(/\s+/)
    .filter((word) => !authorityWords.has(word.toLowerCase()))
    .join(' ');
}

function categoryQuery(category) {
  const selectedCategory = cleanText(category) || defaultCategory();
  return CATEGORIES[selectedCategory]?.keywords?.join(' ') || selectedCategory;
}

function categoryQueryPhrase(category, topic = '') {
  return topic === 'govt'
    ? GOVT_CATEGORY_QUERY_PHRASES[cleanText(category)] || CATEGORY_QUERY_PHRASES[cleanText(category)] || categoryQuery(category)
    : CATEGORY_QUERY_PHRASES[cleanText(category)] || categoryQuery(category);
}

function countryCategoryQueryPhrase(country, category, topic = '') {
  const countryPhrase = COUNTRY_CATEGORY_QUERY_PHRASES[canonicalCountry(cleanText(country))]?.[cleanText(category)];
  if (countryPhrase) return countryPhrase;
  const selectedCategory = cleanText(category);
  if (topic === 'govt') {
    return GOVT_CATEGORY_QUERY_PHRASES[selectedCategory] || CATEGORY_QUERY_PHRASES[selectedCategory] || categoryQuery(category);
  }
  return CATEGORY_QUERY_PHRASES[selectedCategory] || categoryQuery(category);
}

function buildLocation(profile = {}) {
  return compactQuery([cleanText(profile.country) || defaultCountry(), cleanText(profile.region)]);
}

function subcategoryNamesForCategory(category) {
  const selectedCategory = cleanText(category);
  if (!selectedCategory) return [];
  const entry = CATEGORIES[selectedCategory];
  return entry?.subcategories ? Object.keys(entry.subcategories) : [];
}

function subcategoryKeywords(category, subcategory) {
  const selectedCategory = cleanText(category);
  const selectedSubcategory = cleanText(subcategory);
  if (!selectedCategory || !selectedSubcategory) return [];
  return cleanList(CATEGORIES[selectedCategory]?.subcategories?.[selectedSubcategory]);
}

function categoryScope(profile = {}) {
  const category = cleanText(profile.category) || defaultCategory();
  const subcategory = cleanText(profile.subcategory);
  const categoryOptions = cleanList(
    profile.subcategoryOptions ||
    profile.subcategory_options ||
    profile.categoryOptions ||
    profile.category_options ||
    profile.subcategories
  );
  const allSubcategories = categoryOptions.length ? categoryOptions : subcategoryNamesForCategory(category);
  const selectedSubcategories = isAllSubcategories(subcategory) ? allSubcategories : [subcategory].filter(Boolean);
  const selectedKeywords = selectedSubcategories
    .flatMap((item) => subcategoryKeywords(category, item))
    .filter(Boolean);

  return {
    category,
    subcategory: isAllSubcategories(subcategory) ? '' : subcategory,
    isAllSubcategories: isAllSubcategories(subcategory),
    categoryOptions: allSubcategories,
    selectedSubcategories,
    selectedKeywords
  };
}

function currentIntelYear(profile = {}) {
  return Math.min(2100, Number(profile.year || profile.currentYear || new Date().getFullYear()) || new Date().getFullYear());
}

function selectedSubcategoryQueryTerms(profile = {}, category = '') {
  const selectedCategory = cleanText(category) || cleanText(profile.category) || defaultCategory();
  const selectedSubcategory = cleanText(profile.subcategory);
  if (!selectedSubcategory || isAllSubcategories(selectedSubcategory)) return '';
  return queryTermList(selectedSubcategory, subcategoryKeywords(selectedCategory, selectedSubcategory).slice(0, 5));
}

function authorityHintsForCountry(country) {
  return COUNTRY_AUTHORITY_HINTS[canonicalCountry(cleanText(country))] || cleanText(country);
}

function authorityQueryTerms(country) {
  const normalizedCountry = canonicalCountry(cleanText(country));
  const authorityHints = authorityHintsForCountry(normalizedCountry);
  if (!authorityHints) return '';
  const countryWords = new Set(normalizedCountry.toLowerCase().split(/\s+/).filter(Boolean));
  return authorityHints
    .split(/\s+/)
    .filter((term) => term && !countryWords.has(term.toLowerCase()))
    .join(' ');
}

function renderQueryTemplate(template, values = {}) {
  return compactQuery([
    String(template || '')
      .replace(/\{country\}/g, values.country || '')
      .replace(/\{year\}/g, values.year || '')
      .replace(/\{intent\}/g, values.intent || '')
      .replace(/\{authorities\}/g, values.authorities || '')
      .replace(/\{competitors\}/g, values.competitors || '')
  ]);
}

function defaultCompetitorTerms(competitors = []) {
  return (competitors.length ? competitors : DEFAULT_COMPETITOR_QUERY_NAMES)
    .map(quoteIfNeeded)
    .join(' OR ');
}

function buildGovtQueryVariants(profile = {}) {
  const country = canonicalCountry(cleanText(profile.country) || defaultCountry());
  const year = currentIntelYear(profile);
  const authorities = authorityQueryTerms(country);
  const templates = GOVT_QUERY_BUCKETS_BY_COUNTRY[country] || DEFAULT_GOVT_QUERY_BUCKETS;
  return templates.map((template) => renderQueryTemplate(template, {
    country,
    year,
    authorities
  })).filter(Boolean);
}

function buildCompetitorQueryVariants(profile = {}) {
  const country = canonicalCountry(cleanText(profile.country) || defaultCountry());
  const year = currentIntelYear(profile);
  const competitors = defaultCompetitorTerms(uniqueList(profile.competitors));
  return COMPETITOR_QUERY_TEMPLATES.map((template) => renderQueryTemplate(template, {
    country,
    year,
    competitors
  })).filter(Boolean);
}

function buildCategoryQueryVariants(topic, category, profile = {}) {
  const country = canonicalCountry(cleanText(profile.country) || defaultCountry());
  const year = currentIntelYear(profile);
  const competitors = uniqueList(profile.competitors);
  const authorityHints = authorityQueryTerms(country);
  if (topic === 'govt') {
    return GOVT_QUERY_TEMPLATES.map((template) => renderQueryTemplate(template, {
      country,
      year,
      authorities: authorityHints,
      intent: cleanMarketTerms(country, removeDuplicateAuthorityTerms(
        countryCategoryQueryPhrase(country, category, topic),
        authorityHints
      ))
    })).filter(Boolean);
  }
  const intent = cleanMarketTerms(country, countryCategoryQueryPhrase(country, category, topic));
  const selectedSubcategoryTerms = cleanMarketTerms(country, selectedSubcategoryQueryTerms(profile, category));
  const topicIntent = cleanMarketTerms(country, [intent, selectedSubcategoryTerms].filter(Boolean).join(' '));
  const competitorTerms = defaultCompetitorTerms(competitors);
  const template = TOPIC_QUERY_TEMPLATES[topic] || TOPIC_QUERY_TEMPLATES.default;
  return [
    renderQueryTemplate(template, {
      country,
      year,
      intent: topicIntent,
      authorities: authorityHints,
      competitors: competitorTerms
    })
  ].filter(Boolean);
}

function buildTopicQueryVariants(profile = {}) {
  const topics = normalizeTopics(profile.topics);
  const competitors = uniqueList(profile.competitors);
  const customQueryOverride = cleanText(profile.customQueryOverride || profile.custom_query_override || profile.query);
  const categories = selectedCategories(profile);
  const queries = {};

  for (const topic of topics) {
    let categoryVariants = [];
    if (topic === 'govt') {
      categoryVariants = buildGovtQueryVariants(profile);
    } else if (topic === 'competitor') {
      categoryVariants = buildCompetitorQueryVariants({ ...profile, competitors });
    } else {
      categoryVariants = categories.flatMap((category) => (
        buildCategoryQueryVariants(topic, category, { ...profile, competitors })
      )).filter(Boolean);
    }
    // Only send category-specific queries — no broad generic fallback
    // that could bring in unrelated articles from outside the configured categories.
    queries[topic] = customQueryOverride
      ? [customQueryOverride]
      : [...new Set(categoryVariants.filter(Boolean))];
  }

  return queries;
}

function buildTopicQueryCategories(profile = {}) {
  const topics = normalizeTopics(profile.topics);
  const customQueryOverride = cleanText(profile.customQueryOverride || profile.custom_query_override || profile.query);
  const categories = selectedCategories(profile);
  return Object.fromEntries(
    topics.map((topic) => {
      if (topic === 'govt') {
        return [
          topic,
          customQueryOverride
            ? [categories[0] || defaultCategory()]
            : buildGovtQueryVariants(profile).map(() => categories[0] || defaultCategory())
        ];
      }
      if (topic === 'competitor') {
        return [
          topic,
          customQueryOverride
            ? [categories[0] || defaultCategory()]
            : buildCompetitorQueryVariants(profile).map(() => 'Competitor Intelligence')
        ];
      }
      return [
        topic,
        customQueryOverride
          ? [categories[0] || defaultCategory()]
          : categories.flatMap((category) => buildCategoryQueryVariants(topic, category, profile).map(() => category))
      ];
    })
  );
}

function buildProfileSearchPayload(profile = {}, extra = {}) {
  const country = canonicalCountry(cleanText(profile.country) || defaultCountry());
  const timezone = cleanText(profile.fetchSchedule?.timezone || profile.schedule?.timezone || profile.timezone) || defaultTimezone();
  const topics = normalizeTopics(profile.topics);
  const days = Math.max(1, Math.min(365, Number(profile.days || profile.maxAgeDays || 30) || 30));
  const targetPerTopic = Math.max(
    1,
    Math.min(MAX_TARGET_PER_TOPIC, Number(profile.targetPerTopic || profile.maxPerTopic || DEFAULT_TARGET_PER_TOPIC) || DEFAULT_TARGET_PER_TOPIC)
  );
  const sourceDomains = removeKnownOtherMarketDomains(cleanSourceDomains(
    profile.preferredDomains ||
    profile.preferred_domains ||
    profile.sources ||
    profile.includeDomains ||
    profile.include_domains
  ), country);
  const typedSourceDomains = ['news', 'govt', 'competitor', 'evergreen'].reduce((out, type) => {
    out[type] = cleanSourceDomains(profile.sourceDomainsByType?.[type]);
    return out;
  }, {});
  const hasTypedSourceDomains = Object.values(typedSourceDomains).some((items) => items.length);
  const newsSourceDomains = hasTypedSourceDomains && typedSourceDomains.news.length
    ? typedSourceDomains.news
    : sourceDomains;
  const mergedSources = mergeSourceDomains({
    country,
    type: 'news',
    userSources: newsSourceDomains,
    strictSources: profile.strictSources || profile.strict_sources
  });
  const sourceDomainsByTopic = Object.fromEntries(
    topics.map((topic) => {
      const sourceTypes = sourceTypesForTopic(topic);
      const explicitTopicSources = typedSourceDomains[topic] || [];
      let topicUserSources = hasTypedSourceDomains
        ? (
          explicitTopicSources.length
            ? explicitTopicSources
            : sourceTypes.flatMap((sourceType) => typedSourceDomains[sourceType] || [])
        )
        : (
          topic === 'evergreen'
            ? sourceDomains
            : (sourceTypes.includes('govt') ? sourceDomains.filter(isLikelyGovernmentDomain) : sourceDomains)
        );
      if (topic === 'competitor') {
        topicUserSources = topicUserSources.filter((domain) => !isLikelyGovernmentDomain(domain));
      }
      const merged = sourceTypes.reduce((out, sourceType) => {
        const row = mergeSourceDomains({
          country,
          type: sourceType,
          userSources: topicUserSources,
          strictSources: profile.strictSources || profile.strict_sources
        });
        out.includeDomains.push(...row.includeDomains);
        return out;
      }, { includeDomains: [] });
      return [topic, cleanSourceDomains(merged.includeDomains)];
    })
  );
  const defaultDomainsByTopic = Object.fromEntries(
    topics.map((topic) => {
      const merged = sourceTypesForTopic(topic).reduce((out, sourceType) => {
        const row = mergeSourceDomains({
          country,
          type: sourceType,
          userSources: [],
          strictSources: profile.strictSources || profile.strict_sources
        });
        out.defaultDomains.push(...row.defaultDomains);
        return out;
      }, { defaultDomains: [] });
      return [topic, cleanSourceDomains(merged.defaultDomains)];
    })
  );
  const scope = categoryScope(profile);
  const categories = selectedCategories({ ...profile, category: scope.category });
  const primaryCategory = categories[0] || scope.category;
  const competitors = uniqueList(profile.competitors);
  const queryVariants = buildTopicQueryVariants({ ...profile, topics });
  const queryCategories = buildTopicQueryCategories({ ...profile, topics, categories });
  const queries = Object.fromEntries(
    Object.entries(queryVariants).map(([topic, items]) => [topic, items[0] || ''])
  );
  const customQueryOverride = cleanText(profile.customQueryOverride || profile.custom_query_override || profile.query);
  // Fetching stays limited to the selected country's default domains plus any
  // explicitly added sources so admin and super-admin follow the same rules.
  const strictSources = true;

  const payload = {
    userId: profile.userId || profile._id?.toString?.() || '',
    savedSearchId: profile.savedSearchId || '',
    logId: profile.logId || '',
    trigger: cleanText(profile.trigger) || 'manual',
    country,
    region: cleanText(profile.region),
    location: buildLocation(profile),
    companyName: cleanText(profile.companyName || profile.comanyName || profile.company || profile.businessName || profile.organization),
    category: primaryCategory,
    categories,
    subcategory: scope.subcategory,
    topics,
    queries,
    queryVariants,
    queryCategories,
    days,
    targetPerTopic,
    language: cleanText(profile.language) || 'en',
    timezone,
    strictSources,
    preferredDomains: mergedSources.includeDomains,
    defaultDomains: mergedSources.defaultDomains,
    sourceDomainsByTopic,
    defaultDomainsByTopic,
    userDomains: mergedSources.userDomains,
    sourceDomainsByType: typedSourceDomains,
    ...extra
  };

  if (customQueryOverride) payload.customQueryOverride = customQueryOverride;
  if (competitors.length) payload.competitors = competitors;
  if (scope.categoryOptions.length) payload.subcategoryOptions = scope.categoryOptions;
  if (profile.minsourceScore !== undefined && profile.minsourceScore !== null && profile.minsourceScore !== '') {
    payload.minsourceScore = Math.max(0, Math.min(100, Number(profile.minsourceScore) || 0));
  }
  if (profile.minStoreScore !== undefined && profile.minStoreScore !== null && profile.minStoreScore !== '') {
    payload.minStoreScore = Math.max(0, Math.min(100, Number(profile.minStoreScore) || 0));
  }

  return payload;
}

module.exports = {
  buildTopicQueryVariants,
  buildProfileSearchPayload,
  cleanList,
  cleanSourceDomains
};

