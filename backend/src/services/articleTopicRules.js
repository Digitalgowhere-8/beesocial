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

function evaluateTopicArticle(item = {}, options = {}) {
  const topic = text(options.topic || item.type).toLowerCase();
  const profile = options.profile || {};
  const body = buildTopicText(item);

  if (!body) return { keep: false, reason: 'empty-content' };
  if (isPdfLike(item)) return { keep: false, reason: 'pdf' };

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
      'circular',
      'consultation',
      'regulation',
      'regulatory update',
      'gazette',
      'guidelines issued',
      'new rule',
      'policy update',
      'press release',
      'public notice',
      'tax update',
      'licensing update'
    ];
    if (includesAny(body, blockedGovtTerms)) return { keep: false, reason: 'govt-static' };
    if (!includesAny(body, positiveGovtTerms)) return { keep: false, reason: 'govt-non-update' };
    return { keep: true };
  }

  if (topic === 'news') {
    const blockedNewsTerms = [
      ...genericReferenceTerms,
      'guide',
      'checklist',
      'requirements',
      'how to',
      'overview',
      'explainer',
      'manual'
    ];
    const positiveNewsTerms = [
      '/news/',
      'news',
      'announced',
      'announcement',
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
      'business times',
      'reuters',
      'bloomberg'
    ];
    if (includesAny(body, blockedNewsTerms)) return { keep: false, reason: 'news-non-news' };
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
    if (!includesAny(body, positiveCompetitorTerms)) return { keep: false, reason: 'competitor-non-activity' };
    return { keep: true };
  }

  if (topic === 'evergreen') {
    const positiveEvergreenTerms = [
      'guide',
      'checklist',
      'requirements',
      'process',
      'procedure',
      'how to',
      'overview',
      'explainer',
      'manual',
      'filing',
      'registration',
      'compliance',
      'eligibility',
      'set up',
      'setup'
    ];
    const blockedEvergreenTerms = [
      ...genericReferenceTerms.filter((term) => term !== 'faq' && term !== 'frequently asked questions'),
      '/news/',
      '/press/',
      '/press-release',
      'press release',
      'announced',
      'announcement',
      'breaking news',
      'market update',
      'acquired',
      'acquisition'
    ];
    if (includesAny(body, blockedEvergreenTerms)) return { keep: false, reason: 'evergreen-non-evergreen' };
    if (!includesAny(body, positiveEvergreenTerms)) return { keep: false, reason: 'evergreen-non-evergreen' };
    return { keep: true };
  }

  return { keep: true };
}

module.exports = {
  evaluateTopicArticle
};
