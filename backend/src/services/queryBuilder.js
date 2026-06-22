const { CATEGORIES } = require('../config/categories');
const { canonicalCountry, mergeSourceDomains } = require('../config/fetchSources');
const DEFAULT_TOPICS = (process.env.FETCH_TOPICS || 'news,govt,competitor,evergreen')
  .split(',')
  .map((topic) => topic.trim().toLowerCase())
  .filter(Boolean);
const DEFAULT_TARGET_PER_TOPIC = 150;
const MAX_TARGET_PER_TOPIC = 150;
const CATEGORY_QUERY_MAP = {
  'Corporate Services':
    'company incorporation company registration company formation company secretary corporate compliance entity management business setup market entry branch office representative office share registry acquisition liquidation regulatory update',
  'Accounting & Tax':
    'corporate tax income tax tax filing VAT GST sales tax indirect tax payroll tax accounting bookkeeping financial reporting tax advisory tax incentive government grant budget tax refund compliance filing requirement regulatory update',
  'Compliance & Governance':
    'business compliance corporate governance AML KYC risk management beneficial ownership licensing regulatory filing audit requirement enforcement policy circular compliance update',
  'HR & Employment':
    'labour law employment law work pass immigration visa payroll social security provident fund employee compliance workforce policy hiring regulation HR compliance rule change',
  'Fund Administration':
    'fund administration fund governance private fund investment fund fund manager licensing fund compliance investor reporting regulatory circular asset management compliance update',
  'Financial Advisory':
    'M&A merger acquisition corporate advisory restructuring valuation transaction advisory business consultancy fundraising investment deal market entry strategic advisory regulatory update',
  'Fiduciary & Trust Services':
    'trust services fiduciary services family office private client wealth management succession planning estate planning trustee tax incentive asset protection regulatory requirement',
  'Cross Border & FDI':
    'foreign investment FDI market entry cross border business expansion investment approval company setup trade policy investment regulation international business compliance',
  'Economy & Trade':
    'economy trade investment government budget tax incentive business policy industry scheme grant export import market outlook economic update business announcement'
};

const EVERGREEN_QUERY_MAP = {
  'Corporate Services':
    'how to incorporate a company company registration requirements company secretary business setup compliance guide entity management requirements',
  'Accounting & Tax':
    'corporate tax filing GST VAT accounting compliance requirements bookkeeping tax incentive tax refund guide business tax requirements',
  'Compliance & Governance':
    'business compliance requirements AML KYC corporate governance risk management licensing regulatory filing guide company compliance checklist',
  'HR & Employment':
    'employment law payroll compliance work pass immigration visa labour law hiring employee compliance requirements guide',
  'Fund Administration':
    'fund administration requirements fund governance private fund compliance fund manager licensing investor reporting guide',
  'Financial Advisory':
    'M&A advisory corporate restructuring valuation fundraising transaction advisory business consultancy market entry guide',
  'Fiduciary & Trust Services':
    'family office setup trust services fiduciary services private client wealth management succession planning requirements guide',
  'Cross Border & FDI':
    'foreign investment requirements FDI company setup market entry business expansion cross border compliance guide',
  'Economy & Trade':
    'business economy trade government incentive grant scheme investment policy market opportunity guide'
};

const CATEGORY_GOVT_INTENT_MAP = {
  'Corporate Services': 'company registration incorporation business regulation policy law rule change',
  'Accounting & Tax': 'government budget tax incentive grant GST VAT corporate tax new announcement',
  'Compliance & Governance': 'AML compliance corporate governance risk regulation policy circular announcement',
  'HR & Employment': 'labour law employment rule work pass immigration social security change policy',
  'Fund Administration': 'fund regulation private equity asset management licensing circular policy update',
  'Financial Advisory': 'M&A restructuring insolvency financial advisory ESG regulation policy announcement',
  'Fiduciary & Trust Services': 'family office trust wealth management AML regulation circular policy announcement',
  'Cross Border & FDI': 'foreign investment FDI market entry cross border business regulation policy update',
  'Economy & Trade': 'government policy reform foreign investment business regulation budget trade update'
};

const COMPETITOR_QUERY_MAP = {
  'Corporate Services':
    'company incorporation company registration corporate services company secretary entity management competitor expansion acquisition partnership new office service launch',
  'Accounting & Tax':
    'accounting tax advisory bookkeeping payroll GST VAT corporate tax competitor expansion acquisition partnership new service launch client announcement',
  'Compliance & Governance':
    'compliance governance AML KYC risk management licensing regulatory filing competitor expansion acquisition partnership service launch hiring',
  'HR & Employment':
    'employment law payroll immigration visa work pass HR compliance competitor expansion partnership hiring new office service launch',
  'Fund Administration':
    'fund administration fund governance private fund asset management competitor expansion acquisition partnership fund services launch',
  'Financial Advisory':
    'M&A advisory restructuring valuation transaction advisory fundraising competitor acquisition partnership deal announcement service launch',
  'Fiduciary & Trust Services':
    'trust services fiduciary services family office wealth management competitor expansion partnership acquisition service launch senior appointment',
  'Cross Border & FDI':
    'FDI foreign investment market entry cross border business expansion competitor partnership acquisition new office service launch',
  'Economy & Trade':
    'economy trade investment business policy market outlook competitor expansion partnership acquisition business announcement'
};

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
  return parts
    .flatMap((part) => Array.isArray(part) ? part : [part])
    .map(cleanText)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function categoryQuery(category) {
  const selectedCategory = cleanText(category) || defaultCategory();
  return CATEGORY_QUERY_MAP[selectedCategory] || CATEGORIES[selectedCategory]?.keywords?.join(' ') || selectedCategory;
}

function evergreenCategoryQuery(category) {
  const selectedCategory = cleanText(category) || defaultCategory();
  return EVERGREEN_QUERY_MAP[selectedCategory] || categoryQuery(selectedCategory);
}

function govtCategoryQuery(category) {
  const selectedCategory = cleanText(category) || defaultCategory();
  return CATEGORY_GOVT_INTENT_MAP[selectedCategory] || categoryQuery(selectedCategory);
}

function competitorCategoryQuery(category) {
  const selectedCategory = cleanText(category) || defaultCategory();
  return COMPETITOR_QUERY_MAP[selectedCategory] || compactQuery([categoryQuery(selectedCategory), 'competitor expansion partnership acquisition service launch']);
}

function topicQueryForCategory(topic, category, competitors = []) {
  if (topic === 'govt') return govtCategoryQuery(category);
  if (topic === 'evergreen') return evergreenCategoryQuery(category);
  if (topic === 'competitor') {
    return compactQuery([
      competitors.length ? competitors.map(quoteIfNeeded).filter(Boolean).join(' OR ') : '',
      competitorCategoryQuery(category)
    ]);
  }
  return categoryQuery(category);
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

function daysToTimeRange(days) {
  const value = Number(days || 30);
  if (value <= 1) return 'day';
  if (value <= 7) return 'week';
  if (value <= 31) return 'month';
  return 'year';
}

function currentIntelYear(profile = {}) {
  return Math.min(2100, Number(profile.year || profile.currentYear || new Date().getFullYear()) || new Date().getFullYear());
}

function categorySubcategoryTerms(category, limit = 5) {
  const subcategories = Object.keys(CATEGORIES[cleanText(category)]?.subcategories || {});
  return subcategories.slice(0, limit).join(' ');
}

function categoryKeywordTerms(category, limit = 10) {
  const selectedCategory = cleanText(category);
  const categoryKeywords = cleanList(CATEGORIES[selectedCategory]?.keywords).slice(0, 4);
  const subcategoryKeywords = Object.values(CATEGORIES[selectedCategory]?.subcategories || {})
    .flatMap((keywords) => cleanList(keywords).slice(0, 2))
    .slice(0, limit);
  return [...new Set([...categoryKeywords, ...subcategoryKeywords])].join(' ');
}

function buildCategoryQueryVariants(topic, category, profile = {}) {
  const country = cleanText(profile.country) || defaultCountry();
  const region = cleanText(profile.region);
  const location = buildLocation({ country, region });
  const year = currentIntelYear(profile);
  const competitors = uniqueList(profile.competitors);
  const base = categoryQuery(category);
  const subcategoryTerms = categorySubcategoryTerms(category);
  const keywordTerms = categoryKeywordTerms(category);

  if (topic === 'evergreen') {
    return [
      compactQuery([location, category, subcategoryTerms, 'requirements guide checklist', year]),
      compactQuery([location, keywordTerms || base, 'compliance guide requirements']),
      compactQuery([location, 'how to', category, 'business services'])
    ];
  }

  if (topic === 'competitor') {
    const competitorText = competitors.length ? competitors.map(quoteIfNeeded).join(' OR ') : '';
    return [
      compactQuery([competitorText, location, category, 'expansion acquisition partnership new office service launch', year]),
      compactQuery([competitorText, location, base, 'competitor intelligence market update', year]),
      compactQuery([competitorText, location, 'professional services corporate services expansion', year])
    ];
  }

  const intent = topic === 'govt'
    ? 'policy regulatory announcement law rule circular update'
    : 'latest news announcement policy compliance business update';

  return [
    compactQuery([location, category, subcategoryTerms, intent, year]),
    compactQuery([location, keywordTerms || base, 'latest announcement update', year]),
    compactQuery([location, category, 'regulation compliance tax business news', year])
  ];
}

function buildTopicQueries(profile = {}) {
  const variants = buildTopicQueryVariants(profile);
  return Object.fromEntries(
    Object.entries(variants).map(([topic, items]) => [topic, items[0] || ''])
  );
}

function buildTopicQueryVariants(profile = {}) {
  const topics = normalizeTopics(profile.topics);
  const competitors = uniqueList(profile.competitors);
  const customQueryOverride = cleanText(profile.customQueryOverride || profile.custom_query_override || profile.query);
  const categories = selectedCategories(profile);
  const queries = {};

  for (const topic of topics) {
    queries[topic] = customQueryOverride
      ? [customQueryOverride]
      : categories.flatMap((category) => buildCategoryQueryVariants(topic, category, { ...profile, competitors })).filter(Boolean);
  }

  return queries;
}

function buildTopicQueryCategories(profile = {}) {
  const topics = normalizeTopics(profile.topics);
  const customQueryOverride = cleanText(profile.customQueryOverride || profile.custom_query_override || profile.query);
  const categories = selectedCategories(profile);
  return Object.fromEntries(
    topics.map((topic) => [
      topic,
      customQueryOverride
        ? [categories[0] || defaultCategory()]
        : categories.flatMap((category) => buildCategoryQueryVariants(topic, category, profile).map(() => category))
    ])
  );
}

function recencyTerms(profile = {}) {
  return `${currentIntelYear(profile)} latest recent newly announced updated current`;
}

function buildOpportunityQuery(profile = {}) {
  const existing = cleanText(profile.query);
  const recency = recencyTerms(profile);
  if (existing) return compactQuery([existing, recency]);

  const country = cleanText(profile.country) || defaultCountry();
  const region = cleanText(profile.region);
  const sector = cleanText(profile.sector) || 'professional services';
  const userType = cleanText(profile.userType) || 'company';
  const companyName = cleanText(profile.companyName || profile.comanyName || profile.company);
  const scope = categoryScope(profile);
  const subcategoryFocus = scope.isAllSubcategories
    ? scope.selectedSubcategories.join(' OR ')
    : scope.selectedSubcategories.join(' OR ');
  const keywordFocus = scope.selectedKeywords.slice(0, 12).join(' OR ');
  const location = buildLocation({ country, region });

  return compactQuery([
    location,
    companyName,
    sector,
    scope.category,
    subcategoryFocus ? `(${subcategoryFocus})` : '',
    keywordFocus ? `(${keywordFocus})` : '',
    userType,
    recency,
    'law regulation compliance business update'
  ]);
}

function buildN8nPayload(profile = {}, extra = {}) {
  const country = canonicalCountry(cleanText(profile.country) || defaultCountry());
  const timezone = cleanText(profile.fetchSchedule?.timezone || profile.schedule?.timezone || profile.timezone) || defaultTimezone();
  const topics = normalizeTopics(profile.topics);
  const days = Math.max(1, Math.min(365, Number(profile.days || profile.maxAgeDays || 30) || 30));
  const targetPerTopic = Math.max(
    1,
    Math.min(MAX_TARGET_PER_TOPIC, Number(profile.targetPerTopic || profile.maxPerTopic || DEFAULT_TARGET_PER_TOPIC) || DEFAULT_TARGET_PER_TOPIC)
  );
  const sourceDomains = cleanSourceDomains(
    profile.preferredDomains ||
    profile.preferred_domains ||
    profile.sources ||
    profile.includeDomains ||
    profile.include_domains
  );
  const mergedSources = mergeSourceDomains({
    country,
    type: 'news',
    userSources: sourceDomains,
    strictSources: profile.strictSources || profile.strict_sources
  });
  const sourceDomainsByTopic = Object.fromEntries(
    topics.map((topic) => {
      const merged = mergeSourceDomains({
        country,
        type: sourceTypeForTopic(topic),
        userSources: sourceDomains,
        strictSources: profile.strictSources || profile.strict_sources
      });
      return [topic, merged.includeDomains];
    })
  );
  const defaultDomainsByTopic = Object.fromEntries(
    topics.map((topic) => {
      const merged = mergeSourceDomains({
        country,
        type: sourceTypeForTopic(topic),
        userSources: [],
        strictSources: profile.strictSources || profile.strict_sources
      });
      return [topic, merged.defaultDomains];
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
  const strictSources = Boolean(profile.strictSources || profile.strict_sources);

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
    ...extra
  };

  if (customQueryOverride) payload.customQueryOverride = customQueryOverride;
  if (competitors.length) payload.competitors = competitors;
  if (scope.categoryOptions.length) payload.subcategoryOptions = scope.categoryOptions;
  if (profile.minTavilyScore !== undefined && profile.minTavilyScore !== null && profile.minTavilyScore !== '') {
    payload.minTavilyScore = Math.max(0, Math.min(100, Number(profile.minTavilyScore) || 0));
  }

  return payload;
}

module.exports = {
  buildOpportunityQuery,
  buildTopicQueries,
  buildTopicQueryVariants,
  buildN8nPayload,
  cleanList,
  cleanSourceDomains
};
