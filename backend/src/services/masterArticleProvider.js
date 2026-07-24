const mongoose = require('mongoose');
const { hashUrl, normalizeUrl } = require('../utils/hash');

let masterConnectionPromise = null;

function text(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function list(value) {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => text(item)).filter(Boolean);
  return [];
}

function unique(values = []) {
  return [...new Set(values.map((item) => text(item)).filter(Boolean))];
}

function envFlag(name, fallback = false) {
  const raw = text(process.env[name]);
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function masterMongoUri() {
  return text(
    process.env.MASTER_ARTICLES_MONGO_URI
    || process.env.MASTER_ARTICLES_URI
    || process.env.SCRAPER_MONGO_URI
    || process.env.MONGO_URI
  );
}

function masterDbName() {
  return text(process.env.MASTER_ARTICLES_DB || process.env.SCRAPER_MONGO_DB || process.env.MONGO_DB);
}

function masterCollectionName() {
  return text(process.env.MASTER_ARTICLES_COLLECTION || process.env.SCRAPER_MONGO_COLLECTION || 'master_articles');
}

async function getMasterConnection() {
  const uri = masterMongoUri();
  if (!uri) throw new Error('MASTER_ARTICLES_MONGO_URI or SCRAPER_MONGO_URI is required for master fetch provider');
  if (!masterConnectionPromise) {
    const options = {
      serverSelectionTimeoutMS: Math.max(1000, Number(process.env.MASTER_ARTICLES_MONGO_TIMEOUT_MS || 8000) || 8000),
      maxPoolSize: Math.max(1, Number(process.env.MASTER_ARTICLES_MONGO_POOL_SIZE || 5) || 5)
    };
    const dbName = masterDbName();
    if (dbName) options.dbName = dbName;
    masterConnectionPromise = mongoose.createConnection(uri, options).asPromise();
  }
  return masterConnectionPromise;
}

async function getMasterCollection() {
  const connection = await getMasterConnection();
  return connection.db.collection(masterCollectionName());
}

function sourceNameFromHost(host = '') {
  const clean = text(host).replace(/^www\./i, '');
  if (!clean) return 'master-article';
  return clean
    .split('.')[0]
    .split(/[-_]/)
    .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : '')
    .join(' ')
    .trim() || clean;
}

function hostFromUrl(url = '') {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch (_error) {
    return text(url).replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase();
  }
}

function dateRange(days = 30) {
  const maxDays = Math.max(1, Math.min(365, Number(days || 30) || 30));
  const to = new Date();
  const from = new Date(to.getTime() - ((maxDays - 1) * 24 * 60 * 60 * 1000));
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

function articleDate(row = {}) {
  const candidates = [row.publishedAt, row.fetchedAt, row.createdAt, row.updatedAt];
  for (const candidate of candidates) {
    const date = candidate instanceof Date ? candidate : new Date(candidate || '');
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
}

function topicValue(row = {}) {
  return text(row.type || row.topic || row.intelligenceBucket || '').toLowerCase();
}

function candidateQuery(profile = {}, topic = '') {
  const countries = unique([profile.country, ...(profile.countries || [])]);
  const { from, to } = dateRange(profile.days);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const topicTerms = unique([topic, topic === 'govt' ? 'government' : '', topic === 'competitor' ? 'competitor_intelligence' : '']);

  return {
    isActive: { $ne: false },
    ...(countries.length ? { country: { $in: countries } } : {}),
    ...(topicTerms.length ? {
      $or: [
        { type: { $in: topicTerms } },
        { topic: { $in: topicTerms } },
        { intelligenceBucket: { $in: topicTerms } }
      ]
    } : {}),
    $and: [{
      $or: [
        { recordType: 'intelligence_content' },
        { recordType: { $exists: false } },
        { recordType: null }
      ]
    }, {
      $or: [
        { publishedAt: { $gte: from, $lte: to } },
        { fetchedAt: { $gte: from, $lte: to } },
        { createdAt: { $gte: from, $lte: to } },
        { publishedAt: { $gte: fromIso, $lte: toIso } },
        { fetchedAt: { $gte: fromIso, $lte: toIso } },
        { createdAt: { $gte: fromIso, $lte: toIso } }
      ]
    }]
  };
}

function masterArticleToCandidate(row = {}, profile = {}, topic = '') {
  const originalUrl = text(row.url || row.canonicalUrl || row.link);
  const normalizedUrl = normalizeUrl(originalUrl);
  const url = originalUrl;
  const host = text(row.sourceDomain || row.sourceType || hostFromUrl(normalizedUrl || url));
  const source = text(row.source || row.sourceName || sourceNameFromHost(host));
  const publishedAt = articleDate(row);
  const rawContent = text(row.content || row.rawContent || row.articleText || row.text).slice(0, 20000);
  const summary = text(row.summary || row.description || rawContent).slice(0, 4000);
  const urlHash = text(row.urlHash) || (normalizedUrl ? hashUrl(normalizedUrl) : '');
  const score = Math.max(0, Math.min(100, Number(row.relevanceScore || row.sourceScore || 60) || 60));

  return {
    profile: {
      userId: profile.userId || '',
      savedSearchId: profile.savedSearchId || '',
      logId: profile.logId || '',
      country: profile.country || row.country || '',
      region: profile.region || '',
      category: profile.category || '',
      language: profile.language || 'en',
      startedAt: profile.startedAt || '',
      targetPerTopic: profile.targetPerTopic
    },
    title: text(row.title || row.headline || 'Untitled intelligence item'),
    summary,
    rawContent,
    aiSummary: text(row.aiSummary || row.summary || ''),
    blogContext: text(row.blogContext || rawContent).slice(0, 12000),
    url,
    hash: urlHash || text(row.contentHash),
    urlHash,
    contentHash: text(row.contentHash),
    type: topic || topicValue(row) || 'news',
    category: text(row.category || profile.category || ''),
    categories: profile.categories || [],
    subcategory: text(row.subcategory || profile.subcategory || ''),
    subcategoryOptions: profile.subcategoryOptions || [],
    source,
    sourceId: text(row.sourceId || row.sourceSlug || source || host || 'master-article'),
    sourceType: host,
    sourceQuery: text(row.sourceQuery || `master:${profile.country || row.country || ''}:${topic || topicValue(row)}`),
    country: text(row.country || profile.country || ''),
    region: text(row.region || profile.region || ''),
    language: text(row.language || profile.language || 'en'),
    relevanceScore: score,
    relevance_score: score,
    relevanceReason: text(row.relevanceReason || 'Candidate selected from scraper master database.'),
    relevance_reason: text(row.relevanceReason || 'Candidate selected from scraper master database.'),
    fetched_at: row.fetchedAt || new Date().toISOString(),
    publishedAt: publishedAt.toISOString(),
    rawData: {
      masterArticleId: row._id ? String(row._id) : '',
      sourceQuery: text(row.sourceQuery || ''),
      snippet: summary,
      contentHash: text(row.contentHash),
      originalUrl,
      canonicalUrl: text(row.canonicalUrl || ''),
      normalizedUrl,
      provider: 'master'
    }
  };
}

async function fetchMasterCandidates(profile = {}, topic = '') {
  const collection = await getMasterCollection();
  const limit = Math.max(1, Math.min(500, Number(process.env.MASTER_FETCH_CANDIDATE_LIMIT || profile.targetPerTopic || 120) || 120));
  const rows = await collection
    .find(candidateQuery(profile, topic))
    .sort({ publishedAt: -1, fetchedAt: -1, createdAt: -1 })
    .limit(limit)
    .toArray();

  return rows
    .filter((row) => text(row.title || row.headline) && text(row.url || row.canonicalUrl || row.link))
    .map((row) => masterArticleToCandidate(row, profile, topic));
}

function isMasterProvider() {
  return true;
}

module.exports = {
  fetchMasterCandidates,
  isMasterProvider,
  masterArticleToCandidate
};
