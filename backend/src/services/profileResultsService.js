const mongoose = require('mongoose');
const FetchLog = require('../models/FetchLog');
const Article = require('../models/Article');
const UserResult = require('../models/UserResult');
const { hashUrl, normalizeUrl } = require('../utils/hash');
const { publishGlobalEvent, publishTenantEvent } = require('../utils/realtime');
const { CATEGORIES } = require('../config/categories');
const {
  articleWindowEnd,
  articleWindowStart,
  buildContentFingerprint,
  choosePreferredGovernmentItem
} = require('./articleIntakePolicy');
const { canonicalCountry, isAllowedDomainForCountry } = require('../config/fetchSources');

function cleanLogId(value) {
  const id = String(value || '').trim().replace(/^=+/, '');
  return mongoose.Types.ObjectId.isValid(id) ? id : '';
}

function dedupeResultItems(items = []) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    const url = normalizeUrl(String(item?.url || item?.link || '').trim());
    const normalizedTitle = String(item?.title || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const rawKey = item?.urlHash || item?.hash || url || `${normalizedTitle}:${item?.source || ''}`;
    const fallbackSimilarityKey = `${normalizedTitle}:${String(item?.source || item?.sourceId || '').toLowerCase()}:${String(item?.publishedAt || '').slice(0, 10)}`;
    const key = hashUrl(String(rawKey).toLowerCase().replace(/\/$/, ''));
    const similarityKey = hashUrl(fallbackSimilarityKey);
    if (seen.has(key)) continue;
    if (normalizedTitle && seen.has(similarityKey)) continue;
    seen.add(key);
    if (normalizedTitle) seen.add(similarityKey);
    deduped.push(item);
  }

  return deduped;
}

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

function hostFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./i, '').toLowerCase();
  } catch (_err) {
    return normalizeDomain(value);
  }
}

function normalizeTitle(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleHostKey(title, host) {
  const normalizedTitle = normalizeTitle(title);
  const normalizedHost = normalizeDomain(host);
  return normalizedTitle && normalizedHost ? `${normalizedHost}|${normalizedTitle}` : '';
}

function resultAllowedDomains(item = {}) {
  const rawAllowed = item.allowedDomains
    || item.includeDomains
    || item.include_domains
    || item.rawData?.allowedDomains
    || item.rawData?.includeDomains
    || [];

  if (Array.isArray(rawAllowed)) return rawAllowed;
  if (typeof rawAllowed === 'string') {
    return rawAllowed.split(',').map((value) => cleanText(value)).filter(Boolean);
  }
  return [];
}

function compactRawDataForArticle(item = {}, body = {}) {
  const rawData = item.rawData && typeof item.rawData === 'object' ? item.rawData : {};
  const raw = item.raw && typeof item.raw === 'object' ? item.raw : {};
  return {
    sourceQuery: item.source_query || item.sourceQuery || rawData.sourceQuery || raw.sourceQuery || body.query || '',
    queryCategory: item.queryCategory || rawData.queryCategory || raw.queryCategory || '',
    sourceScore: item.sourceScore || item.source_score || rawData.sourceScore || raw.sourceScore || null,
    allowedDomains: resultAllowedDomains(item),
    provider: item.provider || rawData.provider || raw.provider || '',
    masterArticleId: item.masterArticleId || rawData.masterArticleId || raw.masterArticleId || '',
    contentHash: item.contentHash || rawData.contentHash || raw.contentHash || '',
    snippet: String(item.snippet || item.content || rawData.snippet || raw.snippet || '').slice(0, 4000)
  };
}

function validSubcategoriesForCategory(category) {
  return Object.keys(CATEGORIES[cleanText(category)]?.subcategories || {});
}

function normalizeCategory(value, fallback = '') {
  const current = cleanText(value);
  if (CATEGORIES[current]) return current;
  const fallbackCategory = cleanText(fallback);
  if (CATEGORIES[fallbackCategory]) return fallbackCategory;
  return Object.keys(CATEGORIES)[0] || 'Corporate Services';
}

function normalizeSubcategory(category, value, fallback = '') {
  const allowed = validSubcategoriesForCategory(category);
  if (!allowed.length) return '';

  const candidates = [value, fallback]
    .map(cleanText)
    .filter(Boolean)
    .filter((candidate) => !/^all( sub[- ]?categor(?:y|ies))?$/i.test(candidate));

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

function normalizePerSource(perSource) {
  if (typeof perSource === 'string') {
    try {
      perSource = JSON.parse(perSource);
    } catch (_err) {
      perSource = [perSource];
    }
  }
  if (!Array.isArray(perSource)) return [];

  return perSource.map((row) => {
    if (typeof row === 'string') {
      try {
        row = JSON.parse(row);
      } catch (_err) {
        row = { sourceId: row, sourceName: row };
      }
    }
    row = row && typeof row === 'object' ? row : {};
    return {
      sourceId: String(row.sourceId || row.source || row.sourceName || 'profile-search'),
      sourceName: String(row.sourceName || row.source || 'profile search'),
      type: String(row.type || 'news'),
      attempted: Number(row.attempted || row.fetched || 0),
      fetched: Number(row.fetched || 0),
      inserted: Number(row.inserted || 0),
      duplicates: Number(row.duplicates || 0),
      errors: Number(row.errors || 0),
      errorMessages: Array.isArray(row.errorMessages) ? row.errorMessages.slice(0, 3).map((m) => String(m).slice(0, 200)) : []
    };
  });
}

function normalizeArticleType(item = {}) {
  const raw = String(item.type || item.stream || item.articleType || '').toLowerCase();
  const opportunity = String(item.opportunityType || item.opportunity_type || item.category || '').toLowerCase();
  if (['news', 'govt', 'competitor', 'evergreen'].includes(raw)) return raw;
  if (/(scheme|grant|policy|tender|compliance|government|funding)/.test(opportunity)) return 'govt';
  if (/(competitor|rival)/.test(opportunity)) return 'competitor';
  if (/(research|guide|innovation|incubation|accelerator)/.test(opportunity)) return 'evergreen';
  return 'news';
}

function defaultCountry() {
  return String(process.env.DEFAULT_FETCH_COUNTRY || '').trim();
}

function isCrossCountySource(item = {}, body = {}) {
  if (item.rawData?.provider === 'master' || item.provider === 'master' || body.provider === 'master') return false;
  const articleType = normalizeArticleType(item);
  if (!['news', 'govt', 'competitor', 'evergreen'].includes(articleType)) return false;

  const country = canonicalCountry(item.country || body.country || defaultCountry());
  const host = normalizeDomain(item.sourceType || item.source_type || item.domain || item.url);
  if (!country || !host) return false;

  return !isAllowedDomainForCountry({
    country,
    type: articleType === 'evergreen' ? 'news' : articleType,
    host,
    allowedDomains: resultAllowedDomains(item)
  });
}

function minStoreScore(body = {}) {
  const fallback = Math.max(0, Math.min(100, Number(process.env.AI_RELEVANCE_MIN_SCORE || 30) || 30));
  return Math.max(0, Math.min(100, Number(body.minStoreScore ?? fallback) || fallback));
}

async function persistProfileResults(body = {}, options = {}) {
  const rawItems = Array.isArray(body.results) ? body.results : [];
  const dedupedItems = dedupeResultItems(rawItems);
  const userObjectId = mongoose.Types.ObjectId.isValid(body.userId) ? new mongoose.Types.ObjectId(body.userId) : null;
  const savedSearchObjectId = mongoose.Types.ObjectId.isValid(body.savedSearchId) ? new mongoose.Types.ObjectId(body.savedSearchId) : null;
  const filteredItems = [];
  const filteredCounts = {
    blockedDomain: 0,
    staticPage: 0,
    stale: 0,
    crossCountyDomain: 0,
    topicRejected: 0,
    lowScore: 0,
    incomingDuplicate: 0,
    existingDuplicate: 0
  };

  const articleHashForItem = (item) => {
    const url = String(item.url || item.link || '').trim();
    const rawHash = url
      ? hashUrl(url)
      : item.urlHash || item.hash || hashUrl(`${item.title || 'untitled'}:${item.source || item.sourceId || ''}:${item.publishedAt || ''}`);
    return {
      rawHash,
      storedHash: rawHash
    };
  };

  const incomingGovernmentByFingerprint = new Map();
  const storeFloor = minStoreScore(body);
  for (const item of dedupedItems) {
    const score = Number(item.relevance_score ?? item.relevanceScore ?? item.sourceScore ?? item.source_score ?? 0);
    if (score < storeFloor) {
      filteredCounts.lowScore += 1;
      continue;
    }
    const topicType = normalizeArticleType(item);
    item.type = topicType;
    if (isCrossCountySource(item, body)) {
      filteredCounts.crossCountyDomain += 1;
      continue;
    }

    if (String(item.type || '').toLowerCase() !== 'govt') {
      filteredItems.push(item);
      continue;
    }

    const fingerprint = buildContentFingerprint(item);
    item.contentFingerprint = fingerprint;
    if (!fingerprint) {
      filteredItems.push(item);
      continue;
    }

    const existing = incomingGovernmentByFingerprint.get(fingerprint);
    if (!existing) {
      incomingGovernmentByFingerprint.set(fingerprint, item);
      continue;
    }

    filteredCounts.incomingDuplicate += 1;
    incomingGovernmentByFingerprint.set(fingerprint, choosePreferredGovernmentItem(existing, item));
  }

  filteredItems.push(...incomingGovernmentByFingerprint.values());

  const governmentItems = filteredItems.filter((item) => String(item.type || '').toLowerCase() === 'govt' && item.contentFingerprint);
  if (governmentItems.length) {
    const existingCandidates = await Article.find({
      type: 'govt',
      country: { $in: [...new Set(governmentItems.map((item) => item.country || body.country || defaultCountry()).filter(Boolean))] },
      contentFingerprint: { $in: [...new Set(governmentItems.map((item) => item.contentFingerprint).filter(Boolean))] },
      $or: governmentItems.flatMap((item) => {
        const country = item.country || body.country || defaultCountry();
        return [{
          country,
          contentFingerprint: item.contentFingerprint,
          publishedAt: { $gte: articleWindowStart(item), $lte: articleWindowEnd(item) }
        }, {
          country,
          contentFingerprint: item.contentFingerprint,
          fetchedAt: { $gte: articleWindowStart(item), $lte: articleWindowEnd(item) }
        }];
      })
    }).select('_id url type country contentFingerprint source sourceId sourceType publishedAt fetchedAt relevanceScore').lean();

    const existingByFingerprint = new Map();
    for (const row of existingCandidates) {
      const key = `${row.country || ''}|${row.contentFingerprint || ''}`;
      const current = existingByFingerprint.get(key);
      existingByFingerprint.set(key, current ? choosePreferredGovernmentItem(current, row) : row);
    }

    const finalItems = [];
    for (const item of filteredItems) {
      if (String(item.type || '').toLowerCase() !== 'govt' || !item.contentFingerprint) {
        finalItems.push(item);
        continue;
      }
      const country = item.country || body.country || defaultCountry();
      const key = `${country}|${item.contentFingerprint}`;
      const existing = existingByFingerprint.get(key);
      if (!existing) {
        finalItems.push(item);
        continue;
      }
      filteredCounts.existingDuplicate += 1;
    }
    filteredItems.length = 0;
    filteredItems.push(...finalItems);
  }

  let items = filteredItems;
  if (items.length) {
    const identityRows = items.map((item) => {
      const url = normalizeUrl(String(item.url || item.link || '').trim());
      const sourceHost = normalizeDomain(item.sourceType || item.source_type || item.domain || hostFromUrl(url));
      return {
        item,
        url,
        normalizedUrl: normalizeUrl(url),
        urlHash: articleHashForItem(item).storedHash,
        sourceHost,
        titleHostKey: titleHostKey(item.title, sourceHost)
      };
    });
    const urlHashes = [...new Set(identityRows.map((row) => row.urlHash).filter(Boolean))];
    const urls = [...new Set(identityRows.flatMap((row) => [row.url, row.normalizedUrl]).filter(Boolean))];
    const titles = [...new Set(identityRows.map((row) => cleanText(row.item.title)).filter(Boolean))];
    const sourceHosts = [...new Set(identityRows.map((row) => row.sourceHost).filter(Boolean))];
    const existingArticles = await Article.find({
      $or: [
        urlHashes.length ? { urlHash: { $in: urlHashes } } : null,
        urls.length ? { url: { $in: urls } } : null,
        titles.length && sourceHosts.length ? { title: { $in: titles }, sourceType: { $in: sourceHosts } } : null
      ].filter(Boolean)
    }).select('_id title url urlHash sourceType').lean();
    const existingHashes = new Set(existingArticles.map((article) => String(article.urlHash || '')).filter(Boolean));
    const existingUrls = new Set(
      existingArticles
        .flatMap((article) => [article.url, normalizeUrl(article.url || '')])
        .map((url) => String(url || ''))
        .filter(Boolean)
    );
    const existingTitleHosts = new Set(
      existingArticles
        .map((article) => titleHostKey(article.title, article.sourceType || hostFromUrl(article.url || '')))
        .filter(Boolean)
    );
    const nextItems = [];
    for (const row of identityRows) {
      if (
        existingHashes.has(row.urlHash)
        || existingUrls.has(row.url)
        || existingUrls.has(row.normalizedUrl)
        || existingTitleHosts.has(row.titleHostKey)
      ) {
        filteredCounts.existingDuplicate += 1;
        continue;
      }
      nextItems.push(row.item);
    }
    items = nextItems;
  }

  const ops = items.map((item) => {
    const url = String(item.url || item.link || '').trim();
    const { rawHash, storedHash } = articleHashForItem(item);
    const articleType = normalizeArticleType(item);
    const rawContent = String(item.rawContent || item.raw_content || item.rawData?.rawContent || item.raw?.rawContent || '').slice(0, 20000);
    const blogContext = String(item.blog_context || item.blogContext || item.rawData?.blogContext || item.raw?.blogContext || '').slice(0, 12000);
    const sourceAnswer = String(item.source_answer || item.sourceAnswer || item.rawData?.sourceAnswer || item.raw?.sourceAnswer || '').slice(0, 4000);
    const category = normalizeCategory(item.category, body.category);
    const subcategory = normalizeSubcategory(category, item.sub_category || item.subcategory, body.subcategory || body.sub_category);
    return {
      updateOne: {
        filter: { urlHash: storedHash },
        update: {
          $set: {
            url
          },
          $setOnInsert: {
            title: String(item.title || '').slice(0, 500),
            summary: String(item.summary || item.ai_summary || item.aiSummary || rawContent || '').slice(0, 4000),
            type: articleType,
            source: item.source || item.sourceName || 'profile-search',
            sourceId: item.sourceId || item.source || 'profile-search',
            sourceType: item.sourceType || '',
            category,
            subcategory,
            country: item.country || body.country || defaultCountry(),
            region: item.region || '',
            sector: item.sector || '',
            opportunityType: item.opportunityType || item.opportunity_type || 'market_news',
            language: item.language || item.lang || 'en',
            aiSummary: String(item.ai_summary || item.aiSummary || item.summary || '').slice(0, 2000),
            rawContent,
            blogContext,
            sourceAnswer,
            rawData: compactRawDataForArticle(item, body),
            publishedAt: item.publishedAt ? new Date(item.publishedAt) : undefined,
            fetchedAt: item.fetched_at ? new Date(item.fetched_at) : new Date(),
            sourceQuery: String(item.source_query || item.sourceQuery || body.query || '').slice(0, 300),
            relevanceScore: Number(item.relevance_score ?? item.relevanceScore ?? 0),
            relevanceReason: String(item.relevance_reason || item.relevanceReason || '').slice(0, 500),
            matchedInterests: Array.isArray(item.matched_terms)
              ? item.matched_terms
              : Array.isArray(item.matched_interests)
                ? item.matched_interests
                : Array.isArray(item.matchedInterests)
                  ? item.matchedInterests
                  : [],
            targetUserTypes: Array.isArray(item.targetUserTypes) ? item.targetUserTypes : [],
            contentFingerprint: item.contentFingerprint || buildContentFingerprint({
              ...item,
              type: articleType,
              country: item.country || body.country || defaultCountry(),
              summary: item.summary || item.ai_summary || item.aiSummary || ''
            }),
            urlHash: storedHash,
            userId: userObjectId || undefined,
            savedSearchId: savedSearchObjectId || undefined
          }
        },
        upsert: true
      }
    };
  });

  let writeResult = null;
  if (ops.length) {
    writeResult = await Article.bulkWrite(ops, { ordered: false });
  }
  const inserted = Number(writeResult?.upsertedCount || 0);
  const upsertedIds = writeResult?.upsertedIds || {};
  const insertedIndexes = new Set(
    Object.keys(upsertedIds)
      .map((index) => Number(index))
      .filter((index) => Number.isInteger(index))
  );
  const duplicates = Math.max(0, items.length - inserted) + filteredCounts.incomingDuplicate + filteredCounts.existingDuplicate;

  if (userObjectId && insertedIndexes.size) {
    const insertedItems = items.filter((_item, index) => insertedIndexes.has(index));
    const hashes = insertedItems.map((item) => articleHashForItem(item).storedHash).filter(Boolean);
    const articles = await Article.find({ urlHash: { $in: hashes } }, { _id: 1, urlHash: 1 }).lean();
    const articleByHash = new Map(articles.map((article) => [article.urlHash, article]));
    const resultOps = insertedItems.map((item) => {
      const urlHash = articleHashForItem(item).storedHash;
      const article = articleByHash.get(urlHash);
      if (!article) return null;
      const matchedInterests = Array.isArray(item.matched_terms)
        ? item.matched_terms
        : Array.isArray(item.matched_interests)
          ? item.matched_interests
          : Array.isArray(item.matchedInterests)
            ? item.matchedInterests
            : [];
      return {
        updateOne: {
          filter: {
            userId: userObjectId,
            articleId: article._id,
            savedSearchId: savedSearchObjectId || undefined
          },
          update: {
            $setOnInsert: {
              userId: userObjectId,
              articleId: article._id,
              savedSearchId: savedSearchObjectId || undefined,
              relevanceScore: Number(item.relevance_score ?? item.relevanceScore ?? 0),
              relevanceReason: item.relevance_reason || item.relevanceReason || '',
              matchedInterests
            }
          },
          upsert: true
        }
      };
    }).filter(Boolean);
    if (resultOps.length) {
      await UserResult.bulkWrite(resultOps, { ordered: false });
    }
  }

  if (options.skipLog) {
    return {
      ok: true,
      processed: items.length,
      inserted,
      duplicates,
      filteredOut: Object.values(filteredCounts).reduce((sum, count) => sum + Number(count || 0), 0),
      filterBreakdown: filteredCounts
    };
  }

  const update = {
    triggeredBy: body.trigger === 'manual' || body.trigger === 'admin_manual' ? 'manual' : 'system',
    status: 'success',
    startedAt: body.startedAt ? new Date(body.startedAt) : new Date(),
    finishedAt: body.finishedAt ? new Date(body.finishedAt) : new Date(),
    durationMs: body.finishedAt && body.startedAt ? Math.max(new Date(body.finishedAt).getTime() - new Date(body.startedAt).getTime(), 0) : 0,
    perSource: normalizePerSource(body.perSource),
    totalFetched: Number(body.totalFetched ?? body.fetched ?? body.resultCount ?? items.length),
    totalInserted: Number(body.totalInserted ?? body.inserted ?? inserted),
    totalDuplicates: Number(body.totalDuplicates ?? body.duplicates ?? duplicates),
    totalErrors: Number(body.totalErrors ?? body.errors ?? 0),
    userId: userObjectId || undefined,
    savedSearchId: savedSearchObjectId || undefined,
    country: body.country || '',
    region: body.region || '',
    sector: body.sector || '',
    query: body.query || '',
    resultCount: items.length,
    notes: body.notes || `code profile-search results received (filtered: ${Object.values(filteredCounts).reduce((sum, count) => sum + Number(count || 0), 0)})`
  };

  const logId = cleanLogId(body.logId);
  const log = logId
    ? await FetchLog.findByIdAndUpdate(logId, { $set: update }, { new: true, upsert: false })
    : await FetchLog.create(update);

  if (!log) {
    const err = new Error('Fetch log not found');
    err.status = 404;
    throw err;
  }

  if (inserted > 0) {
    if (userObjectId) {
      publishTenantEvent(String(userObjectId), 'content', {
        scope: 'articles',
        action: 'fetched',
        count: inserted
      });
    } else {
      publishGlobalEvent('content', {
        scope: 'articles',
        action: 'fetched',
        count: inserted
      });
    }
  }

  return { ok: true, processed: items.length, inserted, duplicates, logId: log._id };
}

module.exports = {
  persistProfileResults,
  dedupeResultItems,
  normalizePerSource,
  normalizeArticleType,
  cleanLogId
};
