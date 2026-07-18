const { CATEGORIES } = require('../config/categories');

function text(value) {
  return String(value || '').trim();
}

function cleanDomain(value) {
  return text(value)
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .toLowerCase();
}

function hostFromUrl(url) {
  const value = text(url);
  try {
    return new URL(value).hostname.replace(/^www\./, '').toLowerCase();
  } catch (_err) {
    const match = value.match(/^https?:\/\/(?:www\.)?([^/]+)/i);
    return match ? match[1].toLowerCase() : '';
  }
}

function normalizeWords(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(haystack, terms = []) {
  return terms.some((term) => haystack.includes(term));
}

const MARKET_SERVICE_ANGLE_TERMS = [
  'listing rules',
  'listing requirements',
  'prospectus',
  'disclosure requirement',
  'corporate governance',
  'regulatory approval',
  'compliance',
  'tax',
  'fund administration',
  'corporate advisory',
  'market entry',
  'company incorporation',
  'company registration',
  'business registration',
  'foreign entity registration',
  'transfer of registration',
  're domiciliation',
  'redomiciliation',
  'cross border',
  'foreign investment',
  'fdi'
];

const ACTIONABLE_SERVICE_ANGLE_TERMS = [
  'aml',
  'anti money laundering',
  'business registration',
  'company incorporation',
  'company registration',
  'company secretary',
  'corporate governance',
  'disclosure requirement',
  'employment pass',
  'filing requirement',
  'foreign entity registration',
  'gst',
  'immigration',
  'kyc',
  'labour law',
  'licensing requirement',
  'listing requirements',
  'payroll',
  'policy update',
  'regulatory approval',
  'regulatory compliance',
  'regulatory requirement',
  'regulatory update',
  'statutory filing',
  'tax filing',
  'tax incentive',
  'tax refund',
  'transfer of registration',
  'work pass'
];

const WEAK_SERVICE_TERMS = new Set([
  'acquisition',
  'business',
  'business expansion',
  'company',
  'corporate',
  'corporate services',
  'market entry',
  'market expansion'
]);

function selectedCategories(profile = {}) {
  const categories = []
    .concat(Array.isArray(profile.categories) ? profile.categories : [])
    .concat(profile.category ? [profile.category] : [])
    .map((value) => text(value))
    .filter(Boolean);
  return [...new Set(categories)];
}

function selectedSubcategories(profile = {}) {
  const subcategories = []
    .concat(Array.isArray(profile.subcategoryOptions) ? profile.subcategoryOptions : [])
    .concat(profile.subcategory ? [profile.subcategory] : [])
    .map((value) => text(value))
    .filter(Boolean)
    .filter((value) => !/^all( sub[- ]?categor(?:y|ies))?$/i.test(value));
  return [...new Set(subcategories)];
}

function serviceKeywordsForProfile(profile = {}) {
  const categories = selectedCategories(profile);
  const subcategories = selectedSubcategories(profile);
  const keywords = new Set();

  const addKeyword = (value) => {
    const normalized = normalizeWords(value);
    if (WEAK_SERVICE_TERMS.has(normalized)) return;
    if (normalized && normalized.length > 2) keywords.add(normalized);
  };

  for (const category of categories) {
    const entry = CATEGORIES[category];
    if (!entry) continue;
    addKeyword(category);
    (entry.keywords || []).forEach(addKeyword);

    const targetSubcategories = subcategories.length
      ? subcategories.filter((subcategory) => entry.subcategories?.[subcategory])
      : Object.keys(entry.subcategories || {});

    for (const subcategory of targetSubcategories) {
      addKeyword(subcategory);
      (entry.subcategories?.[subcategory] || []).forEach(addKeyword);
    }
  }

  if (!keywords.size) {
    [
      'corporate',
      'business',
      'tax',
      'compliance',
      'payroll',
      'employment',
      'market entry',
      'trust',
      'fund administration',
      'foreign investment'
    ].forEach(addKeyword);
  }

  return [...keywords];
}

function hasServiceMatch(body, profile = {}) {
  const keywords = serviceKeywordsForProfile(profile);
  return keywords.some((term) => body.includes(term));
}

function isMarketOnlyNoise(body) {
  const marketOnlyTerms = [
    'stock market',
    'stocks',
    'shares',
    'equities',
    'trading session',
    'market rally',
    'market selloff',
    'roller coaster',
    'currency',
    'foreign exchange',
    'forex',
    'yen',
    'dollar',
    'exchange rate',
    'bond yields',
    'treasury yields',
    'bumper crop of ipos',
    'ipo pipeline',
    'ipos'
  ];
  return includesAny(body, marketOnlyTerms) && !includesAny(body, MARKET_SERVICE_ANGLE_TERMS);
}

function isOfficialGovtHost(item = {}) {
  const host = cleanDomain(hostFromUrl(item.url || item.link) || item.sourceType || item.source);
  return (
    host.endsWith('.gov') ||
    host.includes('.gov.') ||
    host.endsWith('.gov.sg') ||
    host.endsWith('.gov.hk') ||
    host.endsWith('.gov.uk') ||
    host.endsWith('.gov.au') ||
    host.endsWith('.gov.my') ||
    host.endsWith('.gov.ph') ||
    host.endsWith('.gov.ae')
  );
}

function competitorMentions(textBody, competitors = [], source = '', url = '') {
  const normalizedSource = normalizeWords(source);
  const normalizedHost = normalizeWords(cleanDomain(hostFromUrl(url)));
  return competitors.some((name) => {
    const normalized = normalizeWords(name);
    if (!normalized) return false;
    return (
      textBody.includes(normalized) ||
      normalizedSource.includes(normalized) ||
      normalizedHost.includes(normalized)
    );
  });
}

function buildTopicText(item = {}) {
  return [
    item.title,
    item.summary,
    item.aiSummary,
    item.rawContent,
    item.blogContext,
    item.url,
    item.source,
    item.sourceType,
    item.relevanceReason
  ].map(normalizeWords).filter(Boolean).join(' ');
}

function isPdfLike(item = {}) {
  const url = text(item.url || item.link).toLowerCase();
  const title = text(item.title).toLowerCase();
  return (
    /\.pdf(?:$|[?#])/i.test(url) ||
    url.includes('/pdf/') ||
    title.startsWith('[pdf]') ||
    title.includes(' pdf ')
  );
}

function isStaticPageLike(item = {}) {
  const title = normalizeWords(item.title);
  if (title === 'home' || title.startsWith('home ')) return true;
  if (title.includes('newsletter') || title.includes('acraconnect')) return true;
  const url = text(item.url || item.link);
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

function evaluateTopicArticle(item = {}, options = {}) {
  const topic = text(options.topic || item.type).toLowerCase();
  const profile = options.profile || {};
  const precheckOnly = Boolean(options.precheckOnly);
  const body = buildTopicText(item);

  if (!body) return { keep: false, reason: 'empty-content' };
  if (isPdfLike(item)) return { keep: false, reason: 'pdf' };
  if (isStaticPageLike(item)) return { keep: false, reason: 'static-page' };

  const sponsoredTerms = [
    'advertising partner',
    'sponsored content',
    'paid content',
    'paid post',
    'partner content',
    'brand studio',
    'native advertising',
    'content has been produced by our advertising partner'
  ];
  if (includesAny(body, sponsoredTerms)) return { keep: false, reason: 'sponsored' };

  if (precheckOnly) {
    const boilerplateOnlyTerms = [
      'printer icon',
      'linkedin logo',
      'bluesky logo',
      'facebook logo',
      'x logo',
      'print article',
      'share this article'
    ];
    if (includesAny(body, boilerplateOnlyTerms) && !includesAny(body, [
      'official announcement',
      'new law',
      'regulation',
      'circular',
      'consultation',
      'deadline',
      'effective from',
      'takes effect',
      'published on',
      'last updated'
    ])) {
      return { keep: false, reason: 'static-page' };
    }

    const staticPageTerms = [
      'login',
      'sign in',
      'sign up',
      'search results',
      'site map',
      'sitemap',
      'newsletter archive',
      'newsletter issue',
      'subscribe',
      'registration form',
      'quick links',
      'e service',
      'e-service',
      'portal homepage',
      '404',
      'page not found'
    ];
    const titleAndUrl = normalizeWords([item.title, item.url].map(text).filter(Boolean).join(' '));
    if (includesAny(titleAndUrl, staticPageTerms)) return { keep: false, reason: 'static-page' };
    return { keep: true };
  }

  const genericReferenceTerms = [
    'faq',
    'frequently asked questions',
    'help center',
    'knowledge base',
    'documentation',
    'article library',
    'featured insights',
    'insights',
    'thought leadership'
  ];

  const unrelatedSectorTerms = [
    'anti dumping',
    'arbitration',
    'battery',
    'cancer',
    'child protection',
    'oncology',
    'tumor',
    'tumour',
    'hospital',
    'patient',
    'medical',
    'medicine',
    'clinical trial',
    'vaccine',
    'pharma',
    'pharmaceutical',
    'biotech',
    'healthcare treatment',
    'construction',
    'defence',
    'defense',
    'electric vehicle',
    'energy',
    'export control',
    'export controls',
    'furniture',
    'housing',
    'land sale',
    'litigation',
    'manufacturing',
    'military',
    'mining',
    'oil and gas',
    'oil & gas',
    'patent',
    'property',
    'real estate',
    'retail',
    'sanction',
    'sanctions',
    'shipping',
    'social welfare',
    'south china sea',
    'student housing',
    'tourism',
    'trade war',
    'transport'
  ];

  const serviceMatch = hasServiceMatch(body, profile) || includesAny(body, MARKET_SERVICE_ANGLE_TERMS);
  const actionableServiceMatch = includesAny(body, ACTIONABLE_SERVICE_ANGLE_TERMS);
  if (includesAny(body, unrelatedSectorTerms) && !actionableServiceMatch) {
    return { keep: false, reason: 'irrelevant-sector' };
  }
  if (isMarketOnlyNoise(body)) {
    return { keep: false, reason: 'market-only' };
  }

  if (topic === 'govt') {
    const blockedGovtTerms = [
      ...genericReferenceTerms,
      '/faq',
      '/faqs',
      '/article/',
      '/articles/',
      '/guide',
      '/guides',
      '/how-to',
      '/help'
    ];
    const positiveGovtTerms = [
      'announcement',
      'amendment',
      'bill',
      'circular',
      'consultation',
      'enactment',
      'regulation',
      'regulatory update',
      'rule',
      'rules',
      'gazette',
      'guidelines issued',
      'new rule',
      'policy update',
      'press release',
      'public notice',
      'tax update',
      'licensing update',
      'update',
      'requirements',
      'steps',
      'registration',
      'registering',
      'filing',
      'application',
      'process',
      'transfer of registration',
      'foreign entity',
      're domiciliation',
      're domiciliation',
      'redomiciliation'
    ];
    const officialServiceGuideTerms = [
      'requirements',
      'steps',
      'registration',
      'registering',
      'business registration',
      'company registration',
      'company incorporation',
      'foreign entity',
      'foreign business',
      'transfer of registration',
      're domiciliation',
      're domiciliation',
      'redomiciliation',
      'filing',
      'application',
      'process',
      'setting up a foreign business'
    ];
    const officialServiceGuide = isOfficialGovtHost(item) && serviceMatch && includesAny(body, officialServiceGuideTerms);
    if (includesAny(body, blockedGovtTerms) && !officialServiceGuide) return { keep: false, reason: 'govt-static' };
    if (!serviceMatch) return { keep: false, reason: 'govt-non-service' };
    if (!includesAny(body, positiveGovtTerms) && !officialServiceGuide) return { keep: false, reason: 'govt-non-update' };
    return { keep: true };
  }

  if (topic === 'news') {
    const evergreenOnlyTerms = ['guide', 'checklist', 'how to', 'manual'];
    const positiveNewsTerms = [
      'news',
      'announced',
      'announcement',
      'business',
      'compliance',
      'consultation',
      'economy',
      'employment',
      'reports',
      'reported',
      'launches',
      'launched',
      'acquires',
      'acquired',
      'merger',
      'deal',
      'investment',
      'market update',
      'policy',
      'regulation',
      'regulatory',
      'tax',
      'update',
      'business times',
      'reuters',
      'bloomberg'
    ];
    if (includesAny(body, genericReferenceTerms) && !includesAny(body, positiveNewsTerms)) {
      return { keep: false, reason: 'news-non-news' };
    }
    if (includesAny(body, evergreenOnlyTerms) && !includesAny(body, positiveNewsTerms)) {
      return { keep: false, reason: 'news-non-news' };
    }
    if (!serviceMatch) return { keep: false, reason: 'news-non-service' };
    if (!includesAny(body, positiveNewsTerms)) return { keep: false, reason: 'news-non-news' };
    return { keep: true };
  }

  if (topic === 'competitor') {
    const competitors = Array.isArray(profile.competitors) ? profile.competitors : [];
    const blockedCompetitorTerms = [
      ...genericReferenceTerms,
      'mid year outlook',
      'outlook',
      'trends',
      'trend report',
      'industry outlook',
      'market outlook',
      'whitepaper',
      'survey',
      'research report',
      'private capital outlook',
      'deals outlook'
    ];
    const positiveCompetitorTerms = [
      'acquisition',
      'acquires',
      'acquired',
      'merger',
      'partnered',
      'partnership',
      'launches',
      'launched',
      'opens',
      'opened',
      'opening',
      'expands',
      'expansion',
      'new office',
      'appoints',
      'appointed',
      'hires',
      'hired',
      'wins',
      'invests',
      'investment',
      'deal',
      'service launch'
    ];
    if (includesAny(body, blockedCompetitorTerms)) return { keep: false, reason: 'competitor-generic' };
    if (competitors.length && !competitorMentions(body, competitors, item.source, item.url)) {
      return { keep: false, reason: 'competitor-missing-name' };
    }
    if (!serviceMatch) return { keep: false, reason: 'competitor-non-service' };
    if (!includesAny(body, positiveCompetitorTerms)) return { keep: false, reason: 'competitor-non-activity' };
    return { keep: true };
  }

  if (topic === 'evergreen') {
    const positiveEvergreenTerms = [
      'guide',
      'checklist',
      'requirements',
      'requirement',
      'process',
      'procedure',
      'how to',
      'overview',
      'explainer',
      'manual',
      'filing',
      'registration',
      'incorporation',
      'compliance',
      'eligibility',
      'license',
      'licence',
      'licensing',
      'tax',
      'employment',
      'company',
      'business',
      'service',
      'services',
      'forms',
      'information',
      'set up',
      'setup'
    ];
    const blockedEvergreenTerms = [
      'adb sees',
      'appeals court',
      'businesses warned',
      'grants tax relief',
      'new simplified documentary',
      'feedback on',
      'feedback sought',
      'forum',
      'opinion',
      'pending cases',
      'press release',
      'proposed reform',
      'proposed reforms',
      'proposed governance reform',
      'proposed governance reforms',
      'reform covering',
      'reforms covering',
      'seeks feedback',
      'shuts down',
      'warned vs',
      'announced',
      'announcement',
      'breaking news',
      'market update',
      'acquired',
      'acquisition'
    ];
    if (includesAny(body, blockedEvergreenTerms)) return { keep: false, reason: 'evergreen-non-evergreen' };
    if (!serviceMatch) return { keep: false, reason: 'evergreen-non-service' };
    if (!includesAny(body, positiveEvergreenTerms)) return { keep: false, reason: 'evergreen-non-evergreen' };
    return { keep: true };
  }

  return { keep: true };
}

module.exports = {
  evaluateTopicArticle
};
