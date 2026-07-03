const {
  NEWS_SOURCES,
  GOVT_SOURCES,
  COMPETITOR_SOURCES,
  ALL_SOURCES
} = require('../config/sources');
const { canonicalCountry, isAllowedDomainForCountry } = require('../config/fetchSources');

const SOURCE_CREDIBILITY_LEVELS = ['high', 'moderate', 'low'];
const SOURCE_CREDIBILITY_LABELS = {
  high: 'High Credibility',
  moderate: 'Moderate Credibility',
  low: 'Low Credibility'
};

function cleanText(value) {
  return String(value || '').trim();
}

function normalizeDomain(value) {
  return cleanText(value)
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .toLowerCase();
}

function normalizeToken(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function tokenWithPrefix(prefix, value) {
  const token = cleanText(value);
  return token ? `${prefix}:${token}` : '';
}

function domainToken(value) {
  return tokenWithPrefix('domain', normalizeDomain(value));
}

function idToken(value) {
  return tokenWithPrefix('id', normalizeToken(value));
}

function nameToken(value) {
  return tokenWithPrefix('name', normalizeToken(value));
}

function normalizeCredibility(value, fallback = 'moderate') {
  const normalized = cleanText(value).toLowerCase();
  return SOURCE_CREDIBILITY_LEVELS.includes(normalized) ? normalized : fallback;
}

function emptySourceTrustMapping() {
  return {
    high: [],
    moderate: [],
    low: []
  };
}

function normalizeSourceTrustMapping(value = {}) {
  const mapping = emptySourceTrustMapping();
  for (const level of SOURCE_CREDIBILITY_LEVELS) {
    const list = Array.isArray(value?.[level]) ? value[level] : [];
    mapping[level] = [...new Set(list.map((item) => cleanText(item)).filter(Boolean))];
  }
  return mapping;
}

function sourceIdentityTokens(source = {}) {
  const tokens = [
    domainToken(source.sourceType || source.origin || source.domain),
    idToken(source.sourceId || source.id),
    nameToken(source.source || source.sourceName || source.name)
  ].filter(Boolean);
  return [...new Set(tokens)];
}

const DEFAULT_HIGH_TRUST_TOKENS = new Set(
  ALL_SOURCES.flatMap((source) => sourceIdentityTokens({
    sourceId: source.id,
    source: source.name,
    sourceType: source.origin
  }))
);

const DEFAULT_SOURCE_TYPE_BY_ID = new Map([
  ...NEWS_SOURCES.map((source) => [source.id, 'news']),
  ...GOVT_SOURCES.map((source) => [source.id, 'govt']),
  ...COMPETITOR_SOURCES.map((source) => [source.id, 'competitor'])
]);

function matchesMappedCredibility(tokens = [], mapping = emptySourceTrustMapping()) {
  const normalized = normalizeSourceTrustMapping(mapping);
  for (const level of SOURCE_CREDIBILITY_LEVELS) {
    const mapped = new Set(normalized[level]);
    if (tokens.some((token) => mapped.has(token))) {
      return level;
    }
  }
  return '';
}

function resolveSourceCredibility(source = {}, mapping = emptySourceTrustMapping()) {
  const tokens = sourceIdentityTokens(source);
  const explicit = matchesMappedCredibility(tokens, mapping);
  if (explicit) return explicit;

  const sourceType = cleanText(source.type || source.articleType || source.topic).toLowerCase();
  const sourceHost = normalizeDomain(source.sourceType || source.origin || source.domain);
  const sourceCountries = [
    canonicalCountry(cleanText(source.country))
  ]
    .concat(Array.isArray(source.countries) ? source.countries.map((value) => canonicalCountry(cleanText(value))) : [])
    .filter(Boolean);
  if (
    sourceHost &&
    sourceType &&
    ['news', 'govt', 'competitor', 'evergreen'].includes(sourceType) &&
    sourceCountries.length &&
    !sourceCountries.some((country) => isAllowedDomainForCountry({
      country,
      type: sourceType === 'evergreen' ? 'news' : sourceType,
      host: sourceHost,
      allowedDomains: source.allowedDomains || source.includeDomains || source.rawData?.allowedDomains || []
    }))
  ) {
    return 'low';
  }

  if (tokens.some((token) => DEFAULT_HIGH_TRUST_TOKENS.has(token))) {
    return 'high';
  }
  return 'moderate';
}

function resolveTrustKey(source = {}) {
  return (
    domainToken(source.sourceType || source.origin || source.domain) ||
    idToken(source.sourceId || source.id) ||
    nameToken(source.source || source.sourceName || source.name)
  );
}

function registrySort(a, b) {
  return String(a.name || '').localeCompare(String(b.name || ''))
    || String(a.sourceId || '').localeCompare(String(b.sourceId || ''));
}

function buildSourceTrustRegistry(sourceRows = [], mapping = emptySourceTrustMapping()) {
  const registry = new Map();

  for (const source of ALL_SOURCES) {
    const trustKey = resolveTrustKey({
      sourceId: source.id,
      source: source.name,
      sourceType: source.origin
    });
    if (!trustKey) continue;
    registry.set(trustKey, {
      trustKey,
      sourceId: source.id,
      sourceType: source.origin,
      name: source.name,
      credibility: resolveSourceCredibility({
        sourceId: source.id,
        source: source.name,
        sourceType: source.origin
      }, mapping),
      countries: [],
      count: 0,
      types: DEFAULT_SOURCE_TYPE_BY_ID.get(source.id) ? [DEFAULT_SOURCE_TYPE_BY_ID.get(source.id)] : [],
      isDefault: true
    });
  }

  for (const row of sourceRows) {
    const trustKey = resolveTrustKey(row);
    if (!trustKey) continue;

    const current = registry.get(trustKey) || {
      trustKey,
      sourceId: cleanText(row.sourceId || row.id),
      sourceType: normalizeDomain(row.sourceType || row.origin),
      name: cleanText(row.source || row.sourceName || row.name),
      credibility: 'moderate',
      countries: [],
      count: 0,
      types: [],
      isDefault: false
    };

    const nextName = cleanText(row.source || row.sourceName || row.name) || current.name;
    const nextSourceId = cleanText(row.sourceId || row.id) || current.sourceId;
    const nextSourceType = normalizeDomain(row.sourceType || row.origin) || current.sourceType;
    const merged = {
      ...current,
      sourceId: nextSourceId,
      sourceType: nextSourceType,
      name: nextName,
      credibility: resolveSourceCredibility({
        sourceId: nextSourceId,
        source: nextName,
        sourceType: nextSourceType
      }, mapping),
      countries: [...new Set([...(current.countries || []), ...((row.countries || []).map((item) => cleanText(item)).filter(Boolean))])].sort(),
      count: Number(current.count || 0) + Number(row.count || 0),
      types: [...new Set([...(current.types || []), cleanText(row.type)])].filter(Boolean).sort(),
      isDefault: current.isDefault
    };

    registry.set(trustKey, merged);
  }

  return [...registry.values()].sort(registrySort);
}

function groupRegistryByCredibility(items = []) {
  return {
    high: items.filter((item) => item.credibility === 'high'),
    moderate: items.filter((item) => item.credibility === 'moderate'),
    low: items.filter((item) => item.credibility === 'low')
  };
}

module.exports = {
  SOURCE_CREDIBILITY_LEVELS,
  SOURCE_CREDIBILITY_LABELS,
  emptySourceTrustMapping,
  normalizeSourceTrustMapping,
  normalizeCredibility,
  sourceIdentityTokens,
  resolveSourceCredibility,
  resolveTrustKey,
  buildSourceTrustRegistry,
  groupRegistryByCredibility
};
