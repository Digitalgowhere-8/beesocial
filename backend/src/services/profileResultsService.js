const mongoose = require('mongoose');
const FetchLog = require('../models/FetchLog');
const Article = require('../models/Article');
const UserResult = require('../models/UserResult');
const { hashUrl } = require('../utils/hash');
const { publishGlobalEvent, publishTenantEvent } = require('../utils/realtime');

function cleanLogId(value) {
  const id = String(value || '').trim().replace(/^=+/, '');
  return mongoose.Types.ObjectId.isValid(id) ? id : '';
}

function dedupeResultItems(items = []) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    const url = String(item?.url || item?.link || '').trim();
    const rawKey = item?.urlHash || item?.hash || url || `${item?.title || 'untitled'}:${item?.source || ''}`;
    const key = hashUrl(String(rawKey).toLowerCase().replace(/\/$/, ''));
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
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

async function persistProfileResults(body = {}, options = {}) {
  const rawItems = Array.isArray(body.results) ? body.results : [];
  const items = dedupeResultItems(rawItems);
  const userObjectId = mongoose.Types.ObjectId.isValid(body.userId) ? new mongoose.Types.ObjectId(body.userId) : null;
  const savedSearchObjectId = mongoose.Types.ObjectId.isValid(body.savedSearchId) ? new mongoose.Types.ObjectId(body.savedSearchId) : null;

  const articleHashForItem = (item) => {
    const url = String(item.url || item.link || '').trim();
    const rawHash = item.urlHash || item.hash || (url ? hashUrl(url) : hashUrl(`${item.title || 'untitled'}:${body.userId || ''}:${Date.now()}`));
    const tenantKey = userObjectId ? String(userObjectId) : 'global';
    return {
      rawHash,
      storedHash: hashUrl(`${tenantKey}:${rawHash}`)
    };
  };

  const ops = items.map((item) => {
    const url = String(item.url || item.link || '').trim();
    const { rawHash, storedHash } = articleHashForItem(item);
    const articleType = normalizeArticleType(item);
    const blogContext = String(item.blog_context || item.blogContext || item.raw?.blogContext || item.raw_content || '').slice(0, 3000);
    const tavilyAnswer = String(item.tavily_answer || item.tavilyAnswer || item.raw?.tavilyAnswer || '').slice(0, 1200);
    return {
      updateOne: {
        filter: { urlHash: storedHash },
        update: {
          $set: {
            title: String(item.title || '').slice(0, 500),
            summary: String(item.summary || item.ai_summary || item.aiSummary || '').slice(0, 2000),
            url,
            type: articleType,
            source: item.source || item.sourceName || 'profile-search',
            sourceId: item.sourceId || item.source || 'profile-search',
            sourceType: item.sourceType || '',
            category: item.category || 'General',
            subcategory: item.sub_category || item.subcategory || '',
            country: item.country || body.country || defaultCountry(),
            region: item.region || '',
            sector: item.sector || '',
            opportunityType: item.opportunityType || item.opportunity_type || 'market_news',
            targetUserTypes: Array.isArray(item.targetUserTypes) ? item.targetUserTypes : [],
            matchedInterests: Array.isArray(item.matched_terms)
              ? item.matched_terms
              : Array.isArray(item.matched_interests)
                ? item.matched_interests
                : Array.isArray(item.matchedInterests)
                  ? item.matchedInterests
                  : [],
            language: item.language || item.lang || 'en',
            relevanceScore: Number(item.relevance_score ?? item.relevanceScore ?? 0),
            relevanceReason: String(item.relevance_reason || item.relevanceReason || '').slice(0, 500),
            aiSummary: String(item.ai_summary || item.aiSummary || item.summary || '').slice(0, 2000),
            blogContext,
            tavilyAnswer,
            rawData: item.rawData || item.raw || {
              sourceQuery: item.source_query || item.sourceQuery || body.query || '',
              queryCategory: item.queryCategory || '',
              tavilyScore: item.tavilyScore || item.tavily_score || null,
              blogContext,
              tavilyAnswer
            },
            urlHash: storedHash,
            fetchedAt: item.fetched_at ? new Date(item.fetched_at) : new Date(),
            publishedAt: item.publishedAt ? new Date(item.publishedAt) : undefined,
            userId: userObjectId || undefined,
            savedSearchId: savedSearchObjectId || undefined,
            sourceQuery: String(item.source_query || item.sourceQuery || body.query || '').slice(0, 300)
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
  const duplicates = Math.max(0, items.length - inserted);

  if (userObjectId && items.length) {
    const hashes = items.map((item) => articleHashForItem(item).storedHash).filter(Boolean);
    const articles = await Article.find({ urlHash: { $in: hashes } }, { _id: 1, urlHash: 1 }).lean();
    const articleByHash = new Map(articles.map((article) => [article.urlHash, article]));
    const resultOps = items.map((item) => {
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
            $set: {
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
    return { ok: true, processed: items.length, inserted, duplicates };
  }

  const update = {
    triggeredBy: 'n8n',
    status: 'success',
    startedAt: body.startedAt ? new Date(body.startedAt) : new Date(),
    finishedAt: body.finishedAt ? new Date(body.finishedAt) : new Date(),
    durationMs: body.finishedAt && body.startedAt ? Math.max(new Date(body.finishedAt).getTime() - new Date(body.startedAt).getTime(), 0) : 0,
    perSource: normalizePerSource(body.perSource),
    totalFetched: Number(body.totalFetched ?? body.fetched ?? body.resultCount ?? items.length),
    totalInserted: Number(body.totalInserted ?? body.inserted ?? inserted),
    totalDuplicates: Number(body.totalDuplicates ?? body.duplicates ?? duplicates),
    totalErrors: Number(body.totalErrors ?? body.errors ?? 0),
    notes: body.notes || 'code profile-search results received',
    userId: userObjectId || undefined,
    savedSearchId: savedSearchObjectId || undefined,
    country: body.country || '',
    region: body.region || '',
    sector: body.sector || '',
    query: body.query || '',
    resultCount: items.length
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
