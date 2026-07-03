const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const FetchLog = require('../models/FetchLog');
const Article = require('../models/Article');
const BlogPost = require('../models/BlogPost');
const SocialPost = require('../models/SocialPost');
const SavedSearch = require('../models/SavedSearch');
const UserResult = require('../models/UserResult');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { buildN8nPayload, cleanList } = require('../services/queryBuilder');
const { runProfileSearch } = require('../services/profileSearchRunner');
const { persistProfileResults } = require('../services/profileResultsService');
const { evaluateTopicArticle } = require('../services/articleTopicRules');
const progress = require('../services/profileRunProgress');
const { hashUrl } = require('../utils/hash');
const { latestUsageResetAt, effectiveMonthlyStart } = require('../utils/usageReset');
const { publishGlobalEvent, publishTenantEvent } = require('../utils/realtime');
const { acquire } = require('../utils/concurrencyGate');

const router = express.Router();
const ADMIN_ROLES = ['admin', 'super_admin'];
const AVG_AI_TOKENS_PER_RESULT = Number(process.env.AVG_AI_TOKENS_PER_RESULT || 700);
const AVG_TOKENS_PER_BLOG = Number(process.env.AVG_TOKENS_PER_BLOG || 5000);
const AVG_TOKENS_PER_SOCIAL_POST = Number(process.env.AVG_TOKENS_PER_SOCIAL_POST || 800);
const DEFAULT_MIN_STORE_SCORE = Math.max(0, Math.min(100, Number(process.env.AI_RELEVANCE_MIN_SCORE || 30) || 30));

function tenantScopeKey(user) {
  if (!user?._id) return 'anonymous';
  if (user.role === 'user') return String(user.tenantAdminId || user._id);
  return String(user._id);
}

function primaryPayloadQuery(payload = {}) {
  const queries = payload.queries && typeof payload.queries === 'object' ? payload.queries : {};
  return payload.customQueryOverride || queries.news || queries.govt || queries.competitor || queries.evergreen || '';
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

async function requireProfileAutomation(req, res, next) {
  try {
    if (req.user?.role === 'super_admin') return next();

    let adminUser = req.user;
    if (req.user?.role === 'user' && req.user?.tenantAdminId) {
      const fetchedAdmin = await User.findById(req.user.tenantAdminId);
      if (fetchedAdmin) {
        adminUser = fetchedAdmin;
      }
    }

    if (adminUser?.access?.canFetch === false && adminUser?.access?.canUseScheduler === false) {
      return res.status(403).json({ message: 'Fetch and scheduler access is disabled for this account.' });
    }

    if (req.user?.role === 'admin') return next();

    if (req.user?.role === 'user') {
      const memberCanFetch = req.user.access?.canFetch === true;
      const memberCanSchedule = req.user.access?.canUseScheduler === true;

      const adminCanFetch = adminUser.access?.canFetch !== false;
      const adminCanSchedule = adminUser.access?.canUseScheduler !== false;

      if (memberCanFetch && adminCanFetch) return next();
      if (memberCanSchedule && adminCanSchedule) return next();
    }

    return res.status(403).json({ message: 'Only authorized accounts can manage intelligence profiles.' });
  } catch (err) {
    next(err);
  }
}

function limitReachedPayload({ message, limitType, used, limit }) {
  return {
    code: 'LIMIT_REACHED',
    message,
    limitType,
    used: Number(used || 0),
    limit: Number(limit || 0),
    upgradePath: `/premium?limit=${encodeURIComponent(limitType || 'usage')}`
  };
}

async function requireFetchAccess(req, res, next) {
  if (req.user?.role === 'super_admin') return next();
  if (req.user?.access?.canFetch === false) {
    return res.status(403).json({ message: 'Fetch access is disabled for this account.' });
  }

  let adminUser = req.user;
  if (req.user?.role === 'user' && req.user?.tenantAdminId) {
    const fetchedAdmin = await User.findById(req.user.tenantAdminId);
    if (fetchedAdmin) {
      adminUser = fetchedAdmin;
    }
  }

  if (adminUser?.access?.canFetch === false) {
    return res.status(403).json({ message: 'Fetch access is disabled for this admin account.' });
  }

  const tenantAdminId = adminUser._id;
  const teamUsers = await User.find({ $or: [{ _id: tenantAdminId }, { tenantAdminId }] }).select('_id usageResetAt').lean();
  const userIds = teamUsers.map((u) => u._id);
  const resetAt = latestUsageResetAt(teamUsers);
  const currentCycleStart = effectiveMonthlyStart(resetAt);

  const limit = Number(adminUser?.limits?.fetchesPerMonth ?? 30);
  if (limit > 0) {
    const used = await FetchLog.countDocuments({
      startedAt: { $gte: currentCycleStart },
      $or: [
        { userId: { $in: userIds } },
        { triggeredByUser: { $in: userIds } }
      ]
    });
    if (used >= limit) {
      return res.status(402).json(limitReachedPayload({
        limitType: 'fetchesPerMonth',
        used,
        limit,
        message: `Monthly fetch limit reached (${used}/${limit}). Upgrade or ask super admin to increase access.`
      }));
    }
  }

  const storageLimit = Number(adminUser?.limits?.storageItems ?? 0);
  if (storageLimit > 0) {
    const storageQuery = { userId: { $in: userIds } };
    if (resetAt) storageQuery.fetchedAt = { $gte: resetAt };
    const used = await Article.countDocuments(storageQuery);
    if (used >= storageLimit) {
      return res.status(402).json(limitReachedPayload({
        limitType: 'storageItems',
        used,
        limit: storageLimit,
        message: `Stored signals limit reached (${used}/${storageLimit}). Upgrade for more storage.`
      }));
    }
  }

  const tokenLimit = Number(adminUser?.limits?.tokenBudgetMonthly ?? 0);
  if (tokenLimit > 0) {
    const [monthFetchRows, monthBlogs, monthSocial] = await Promise.all([
      FetchLog.aggregate([
        {
          $match: {
            startedAt: { $gte: currentCycleStart },
            $or: [
              { userId: { $in: userIds } },
              { triggeredByUser: { $in: userIds } }
            ]
          }
        },
        { $group: { _id: null, inserted: { $sum: '$totalInserted' } } }
      ]),
      BlogPost.countDocuments({ tenantAdminId, createdAt: { $gte: currentCycleStart } }),
      SocialPost.countDocuments({ tenantAdminId, createdAt: { $gte: currentCycleStart } })
    ]);
    const used = (Number(monthFetchRows[0]?.inserted || 0) * AVG_AI_TOKENS_PER_RESULT)
      + (monthBlogs * AVG_TOKENS_PER_BLOG)
      + (monthSocial * AVG_TOKENS_PER_SOCIAL_POST);
    if (used >= tokenLimit) {
      return res.status(402).json(limitReachedPayload({
        limitType: 'tokenBudgetMonthly',
        used,
        limit: tokenLimit,
        message: `Monthly token budget reached (${used}/${tokenLimit}). Upgrade before starting more AI-heavy work.`
      }));
    }
  }
  next();
}

function verifySecret(req, res, next) {
  const expected = process.env.N8N_CALLBACK_SECRET;
  if (!expected) {
    return res.status(500).json({ message: 'N8N_CALLBACK_SECRET is not configured' });
  }

  // Accept either header `x-n8n-secret` (standard) or `x-callback-secret` (workflow variants),
  // or body fields `secret` / `callbackSecret`.
  const provided = req.get('x-n8n-secret') || req.get('x-callback-secret') || req.body?.secret || req.body?.callbackSecret;

  // Debug log (masked) to help troubleshooting locally. Do not log secrets in production.
  try {
    if (provided) {
      const masked = String(provided).length > 8 ? `${String(provided).slice(0, 4)}...${String(provided).slice(-4)}` : '****';
      console.debug(`[n8n.verifySecret] provided=${masked}`);
    } else {
      console.debug('[n8n.verifySecret] no secret provided in headers/body');
    }
  } catch (e) {
    /* ignore logging errors */
  }

  if (provided !== expected) {
    return res.status(401).json({ message: 'Invalid n8n callback secret' });
  }

  next();
}

function normalizeStatus(status) {
  if (['running', 'success', 'partial', 'failed'].includes(status)) return status;
  return 'success';
}

function cleanLogId(value) {
  const id = String(value || '').trim().replace(/^=+/, '');
  return mongoose.Types.ObjectId.isValid(id) ? id : '';
}

function minStoreScoreForBody(body = {}) {
  return Math.max(0, Math.min(100, Number(body.minStoreScore ?? DEFAULT_MIN_STORE_SCORE) || DEFAULT_MIN_STORE_SCORE));
}

async function resolveExistingLogId(body = {}) {
  const directLogId = cleanLogId(body.logId);
  if (directLogId) return directLogId;

  const query = { triggeredBy: 'n8n' };
  const userId = mongoose.Types.ObjectId.isValid(body.userId) ? new mongoose.Types.ObjectId(body.userId) : null;
  const savedSearchId = mongoose.Types.ObjectId.isValid(body.savedSearchId) ? new mongoose.Types.ObjectId(body.savedSearchId) : null;
  const startedAt = body.startedAt ? new Date(body.startedAt) : null;

  if (userId) query.userId = userId;
  if (savedSearchId) query.savedSearchId = savedSearchId;
  if (body.query) query.query = String(body.query).slice(0, 300);

  if (startedAt && !Number.isNaN(startedAt.getTime())) {
    query.startedAt = {
      $gte: new Date(startedAt.getTime() - (2 * 60 * 60 * 1000)),
      $lte: new Date(startedAt.getTime() + (2 * 60 * 60 * 1000))
    };
  } else {
    query.startedAt = { $gte: new Date(Date.now() - (6 * 60 * 60 * 1000)) };
  }

  const existing = await FetchLog.findOne(query).sort({ startedAt: -1, createdAt: -1 }).select('_id').lean();
  return existing?._id ? String(existing._id) : '';
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
      sourceId: String(row.sourceId || row.source || row.sourceName || 'n8n'),
      sourceName: String(row.sourceName || row.source || 'n8n workflow'),
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

function totalsFromPayload(body, perSource) {
  const summed = perSource.reduce(
    (acc, row) => ({
      fetched: acc.fetched + Number(row.fetched || 0),
      inserted: acc.inserted + Number(row.inserted || 0),
      duplicates: acc.duplicates + Number(row.duplicates || 0),
      errors: acc.errors + Number(row.errors || 0)
    }),
    { fetched: 0, inserted: 0, duplicates: 0, errors: 0 }
  );

  return {
    totalFetched: Number(body.totalFetched ?? body.fetched ?? summed.fetched ?? 0),
    totalInserted: Number(body.totalInserted ?? body.inserted ?? summed.inserted ?? 0),
    totalDuplicates: Number(body.totalDuplicates ?? body.duplicates ?? summed.duplicates ?? 0),
    totalErrors: Number(body.totalErrors ?? body.errors ?? summed.errors ?? 0)
  };
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

router.post('/log', verifySecret, async (req, res, next) => {
  try {
    const body = req.body || {};
    const now = new Date();
    const perSource = normalizePerSource(body.perSource);
    const totals = totalsFromPayload(body, perSource);
    const startedAt = body.startedAt ? new Date(body.startedAt) : now;
    const finishedAt = body.finishedAt ? new Date(body.finishedAt) : now;
    const status = normalizeStatus(body.status || (totals.totalErrors > 0 ? 'partial' : 'success'));

    const update = {
      triggeredBy: body.triggeredBy || 'n8n',
      status,
      startedAt,
      finishedAt,
      durationMs: Math.max(finishedAt.getTime() - startedAt.getTime(), 0),
      perSource,
      ...totals,
      notes: body.notes || 'n8n workflow callback'
    };

    const logId = await resolveExistingLogId(body);
    const log = logId
      ? await FetchLog.findByIdAndUpdate(logId, { $set: update }, { new: true, upsert: false })
      : await FetchLog.create(update);

    if (!log) {
      return res.status(404).json({ message: 'Fetch log not found' });
    }

    res.json({ ok: true, logId: log._id });
  } catch (err) {
    next(err);
  }
});

router.get('/saved-searches', protect, requireProfileAutomation, asyncHandler(async (req, res) => {
  let adminUser = req.user;
  if (req.user?.role === 'user' && req.user?.tenantAdminId) {
    const fetchedAdmin = await User.findById(req.user.tenantAdminId);
    if (fetchedAdmin) {
      adminUser = fetchedAdmin;
    }
  }

  if (adminUser?.access?.canUseSavedSearches === false) {
    return res.status(403).json({ message: 'Saved searches are disabled for this admin account.' });
  }
  if (req.user?.access?.canUseSavedSearches === false) {
    return res.status(403).json({ message: 'Saved searches are disabled for this account.' });
  }
  const items = await SavedSearch.find({ userId: req.user._id }).sort({ updatedAt: -1 }).lean();
  res.json({ items });
}));

router.post('/saved-searches', protect, requireProfileAutomation, asyncHandler(async (req, res) => {
  let adminUser = req.user;
  if (req.user?.role === 'user' && req.user?.tenantAdminId) {
    const fetchedAdmin = await User.findById(req.user.tenantAdminId);
    if (fetchedAdmin) {
      adminUser = fetchedAdmin;
    }
  }

  if (adminUser?.access?.canUseSavedSearches === false) {
    return res.status(403).json({ message: 'Saved searches are disabled for this admin account.' });
  }
  if (req.user?.access?.canUseSavedSearches === false) {
    return res.status(403).json({ message: 'Saved searches are disabled for this account.' });
  }
  const {
    name,
    country,
    region,
    category,
    categories,
    subcategory,
    subcategoryOptions,
    competitors,
    topics,
    sources,
    preferredDomains,
    strictSources,
    days,
    targetPerTopic,
    minTavilyScore,
    query,
    customQueryOverride,
    language,
    timezone
  } = req.body || {};

  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: 'saved search name is required' });
  }

  const savedSearchName = String(name).trim();
  const update = {
    userId: req.user._id,
    name: savedSearchName,
    country: country || req.user.country || 'India',
    region: region || req.user.region || '',
    category: category || req.user.category || '',
    categories: cleanList(categories).length ? cleanList(categories) : cleanList(req.user.categories || req.user.category),
    subcategory: subcategory || req.user.subcategory || '',
    subcategoryOptions: cleanList(subcategoryOptions),
    competitors: Object.prototype.hasOwnProperty.call(req.body, 'competitors') ? cleanList(competitors) : cleanList(req.user.competitors),
    topics: cleanList(topics).length ? cleanList(topics) : cleanList(req.user.topics),
    sources: cleanList(sources || preferredDomains),
    strictSources: Boolean(strictSources),
    days: Number(days || req.user.days || 30),
    targetPerTopic: Number(targetPerTopic || 150),
    minTavilyScore: minTavilyScore === undefined || minTavilyScore === null || minTavilyScore === '' ? undefined : Number(minTavilyScore),
    query: query || customQueryOverride || '',
    language: language || req.user.language || 'en',
    timezone: timezone || req.user.timezone || 'Asia/Kolkata'
  };

  const item = await SavedSearch.findOneAndUpdate(
    { userId: req.user._id, name: savedSearchName },
    { $set: update },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  res.status(201).json({ item });
}));

router.post('/trigger', protect, requireProfileAutomation, requireFetchAccess, asyncHandler(async (req, res) => {
  const useN8nWebhook = process.env.PROFILE_SEARCH_USE_N8N === 'true';
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (useN8nWebhook && !webhookUrl) {
    return res.status(500).json({ message: 'N8N_WEBHOOK_URL is not configured' });
  }

  const user = req.user;
  let savedSearch = null;
  const savedSearchId = String(req.body.savedSearchId || '').trim();
  if (savedSearchId && mongoose.Types.ObjectId.isValid(savedSearchId)) {
    savedSearch = await SavedSearch.findOne({ _id: savedSearchId, userId: req.user._id });
  }

  if (!savedSearch && req.body.saveSearchName) {
    savedSearch = await SavedSearch.create({
      userId: req.user._id,
      name: String(req.body.saveSearchName).trim(),
      country: req.body.country || user.country || 'India',
      region: req.body.region || user.region || '',
      category: req.body.category || user.category || '',
      categories: cleanList(req.body.categories).length ? cleanList(req.body.categories) : cleanList(user.categories || user.category),
      subcategory: req.body.subcategory || user.subcategory || '',
      subcategoryOptions: cleanList(req.body.subcategoryOptions || req.body.subcategory_options || req.body.categoryOptions),
      competitors: Object.prototype.hasOwnProperty.call(req.body, 'competitors') ? cleanList(req.body.competitors) : cleanList(user.competitors),
      topics: cleanList(req.body.topics).length ? cleanList(req.body.topics) : cleanList(user.topics),
      sources: Object.prototype.hasOwnProperty.call(req.body, 'sources') || Object.prototype.hasOwnProperty.call(req.body, 'preferredDomains')
        ? cleanList(req.body.sources || req.body.preferredDomains)
        : cleanList(user.sources),
      strictSources: Boolean(req.body.strictSources || req.body.strict_sources),
      days: Number(req.body.days || user.days || 30),
      targetPerTopic: Number(req.body.targetPerTopic || req.body.maxPerTopic || 150),
      minTavilyScore: req.body.minTavilyScore === undefined || req.body.minTavilyScore === null || req.body.minTavilyScore === ''
        ? undefined
        : Number(req.body.minTavilyScore),
      minStoreScore: req.body.minStoreScore === undefined || req.body.minStoreScore === null || req.body.minStoreScore === ''
        ? undefined
        : Number(req.body.minStoreScore),
      query: req.body.query || req.body.customQueryOverride || '',
      language: req.body.language || user.language || 'en',
      timezone: req.body.timezone || user.timezone || 'Asia/Kolkata'
    });
  }

  const payload = buildN8nPayload({
    ...user.toObject(),
    ...req.body,
    ...(savedSearch ? savedSearch.toObject() : {}),
    userId: user._id.toString(),
    savedSearchId: savedSearch ? savedSearch._id.toString() : savedSearchId || ''
  }, {
    callbackUrl: process.env.N8N_CALLBACK_URL || `${req.protocol}://${req.get('host')}/api/n8n/results`,
    callbackSecret: process.env.N8N_CALLBACK_SECRET || ''
  });

  const log = await FetchLog.create({
    triggeredBy: 'n8n',
    triggeredByUser: req.user._id,
    userId: req.user._id,
    savedSearchId: savedSearch ? savedSearch._id : undefined,
    country: payload.country,
    region: payload.region,
    sector: 'professional services',
    query: primaryPayloadQuery(payload),
    status: 'running',
    startedAt: new Date(),
    notes: savedSearch ? `Profile saved-search triggered: ${savedSearch.name}` : 'Profile trigger started'
  });

  payload.logId = String(log._id);
  const scopeKey = tenantScopeKey(req.user);

  if (!useN8nWebhook) {
    if (req.body?.async === true || req.body?.async === 'true') {
      const logId = String(log._id);
      progress.startRun(logId, 'Fetch queued in backend runner');

      setImmediate(async () => {
        let release = null;
        try {
          release = acquire('fetch', scopeKey);
          progress.updateRun(logId, { step: 'start', percent: 8, message: 'Backend fetch started' });
          const resultPayload = await runProfileSearch(payload, {
            onProgress: ({ step, message }) => progress.updateRun(logId, { step, message })
          });
          progress.updateRun(logId, { step: 'save', percent: 88, message: 'Saving results to database' });
          const persisted = await persistProfileResults(resultPayload);

          if (savedSearch) {
            savedSearch.lastTriggeredAt = new Date();
            await savedSearch.save();
          }

          progress.finishRun(logId, {
            status: 'success',
            step: 'complete',
            percent: 100,
            resultCount: resultPayload.resultCount,
            processed: persisted.processed,
            message: `Fetch complete: ${persisted.processed} result${persisted.processed === 1 ? '' : 's'} saved`
          });
        } catch (error) {
          await FetchLog.findByIdAndUpdate(log._id, {
            status: 'failed',
            finishedAt: new Date(),
            durationMs: Date.now() - new Date(log.startedAt).getTime(),
            totalErrors: 1,
            notes: `code profile-search failed: ${error.message}`
          });
          progress.finishRun(logId, {
            status: 'failed',
            step: 'failed',
            percent: 100,
            error: error.message,
            message: `Fetch failed: ${error.message}`
          });
        } finally {
          release?.();
        }
      });

      return res.json({
        ok: true,
        message: 'Profile search queued by backend code runner',
        logId: log._id,
        mode: 'code',
        async: true
      });
    }

    let release = null;
    try {
      release = acquire('fetch', scopeKey);
      const resultPayload = await runProfileSearch(payload);
      const persisted = await persistProfileResults(resultPayload);

      if (savedSearch) {
        savedSearch.lastTriggeredAt = new Date();
        await savedSearch.save();
      }

      return res.json({
        ok: true,
        message: 'Profile search completed by backend code runner',
        logId: log._id,
        resultCount: resultPayload.resultCount,
        processed: persisted.processed,
        mode: 'code'
      });
    } catch (error) {
      await FetchLog.findByIdAndUpdate(log._id, {
        status: 'failed',
        finishedAt: new Date(),
        durationMs: Date.now() - new Date(log.startedAt).getTime(),
        totalErrors: 1,
        notes: `code profile-search failed: ${error.message}`
      });
      throw error;
    } finally {
      release?.();
    }
  }

  try {
    const response = await axios.post(
      webhookUrl,
      payload,
      {
        timeout: parseInt(process.env.N8N_WEBHOOK_TIMEOUT_MS, 10) || 1000 * 60 * 20,
        headers: {
          ...(process.env.N8N_WEBHOOK_SECRET ? { 'x-n8n-secret': process.env.N8N_WEBHOOK_SECRET } : {})
        }
      }
    );

    if (savedSearch) {
      savedSearch.lastTriggeredAt = new Date();
      await savedSearch.save();
    }

    res.json({ ok: true, message: 'n8n workflow trigger sent', logId: log._id, webhookResponse: response.data, mode: 'n8n' });
  } catch (error) {
    await FetchLog.findByIdAndUpdate(log._id, {
      status: 'failed',
      finishedAt: new Date(),
      durationMs: Date.now() - new Date(log.startedAt).getTime(),
      totalErrors: 1,
      notes: `n8n trigger failed: ${error.message}`
    });
    throw error;
  }
}));

router.get('/runs/:logId/progress', protect, requireProfileAutomation, asyncHandler(async (req, res) => {
  const state = progress.getRun(req.params.logId);
  if (state) return res.json(state);

  const logId = cleanLogId(req.params.logId);
  if (!logId) return res.status(404).json({ message: 'Run progress not found' });

  const log = await FetchLog.findById(logId).lean();
  if (!log) return res.status(404).json({ message: 'Run progress not found' });

  res.json({
    runId: String(log._id),
    status: log.status,
    step: log.status,
    percent: log.status === 'running' ? 50 : 100,
    startedAt: log.startedAt,
    finishedAt: log.finishedAt,
    resultCount: log.resultCount,
    messages: [{
      at: (log.finishedAt || log.startedAt || new Date()).toISOString?.() || new Date().toISOString(),
      step: log.status,
      message: log.notes || `Fetch ${log.status}`
    }]
  });
}));

router.post('/results', verifySecret, asyncHandler(async (req, res, next) => {
  const body = req.body || {};
  const rawItems = Array.isArray(body.results) ? body.results.slice(0, 2000) : [];
  if (body.results && body.results.length > 2000) {
    console.warn(`[n8n] /results received ${body.results.length} items — capped to 2000`);
  }
  const items = dedupeResultItems(rawItems);
  const filteredItems = items.filter((item) => {
    const topicType = normalizeArticleType(item);
    const score = Number(item.relevance_score ?? item.relevanceScore ?? item.tavilyScore ?? item.tavily_score ?? 0);
    if (score < minStoreScoreForBody(body)) return false;
    return evaluateTopicArticle({
      ...item,
      type: topicType
    }, {
      topic: topicType,
      profile: {
        competitors: Array.isArray(body.competitors) ? body.competitors : []
      }
    }).keep;
  });
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

  const ops = filteredItems.map((item) => {
    const url = String(item.url || item.link || '').trim();
    const { rawHash, storedHash } = articleHashForItem(item);
    const articleType = normalizeArticleType(item);
    const rawContent = String(item.rawContent || item.raw_content || item.rawData?.rawContent || item.raw?.rawContent || '').slice(0, 20000);
    const blogContext = String(item.blog_context || item.blogContext || item.rawData?.blogContext || item.raw?.blogContext || rawContent || '').slice(0, 12000);
    const tavilyAnswer = String(item.tavily_answer || item.tavilyAnswer || item.rawData?.tavilyAnswer || item.raw?.tavilyAnswer || '').slice(0, 4000);
    return {
      updateOne: {
        filter: { urlHash: storedHash },
        update: {
          $set: {
            title: String(item.title || '').slice(0, 500),
            summary: String(item.summary || item.ai_summary || item.aiSummary || rawContent || '').slice(0, 4000),
            url,
            type: articleType,
            source: item.source || item.sourceName || 'n8n',
            sourceId: item.sourceId || item.source || 'n8n',
            sourceType: item.sourceType || '',
            category: item.category || 'General',
            subcategory: item.sub_category || item.subcategory || '',
            country: item.country || body.country || 'India',
            region: item.region || '',
            opportunityType: item.opportunityType || item.opportunity_type || 'market_news',
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
            rawContent,
            blogContext,
            tavilyAnswer,
            rawData: item.rawData || item.raw || {
              sourceQuery: item.source_query || item.sourceQuery || body.query || '',
              rawContent,
              blogContext,
              tavilyAnswer,
              tavilyScore: item.tavilyScore || item.tavily_score || null
            },
            urlHash: storedHash,
            fetchedAt: item.fetched_at ? new Date(item.fetched_at) : new Date(),
            userId: userObjectId || undefined,
            savedSearchId: savedSearchObjectId || undefined,
            sourceQuery: String(item.source_query || item.sourceQuery || body.query || '').slice(0, 300)
          }
        },
        upsert: true
      }
    };
  });

  if (ops.length) {
    await Article.bulkWrite(ops, { ordered: false });
  }

  if (userObjectId && filteredItems.length) {
    const hashes = filteredItems.map((item) => articleHashForItem(item).storedHash).filter(Boolean);
    const articles = await Article.find({ urlHash: { $in: hashes } }, { _id: 1, urlHash: 1 }).lean();
    const articleByHash = new Map(articles.map((article) => [article.urlHash, article]));
    const resultOps = filteredItems.map((item) => {
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

  const update = {
    triggeredBy: 'n8n',
    status: 'success',
    startedAt: body.startedAt ? new Date(body.startedAt) : new Date(),
    finishedAt: body.finishedAt ? new Date(body.finishedAt) : new Date(),
    durationMs: body.finishedAt && body.startedAt ? Math.max(new Date(body.finishedAt).getTime() - new Date(body.startedAt).getTime(), 0) : 0,
    perSource: normalizePerSource(body.perSource),
    totalFetched: Number(body.totalFetched ?? body.fetched ?? body.resultCount ?? filteredItems.length),
    totalInserted: filteredItems.length,
    totalDuplicates: Number(body.totalDuplicates ?? body.duplicates ?? 0),
    totalErrors: Number(body.totalErrors ?? body.errors ?? 0),
    notes: body.notes || 'n8n callback results received',
    userId: userObjectId || undefined,
    savedSearchId: savedSearchObjectId || undefined,
    country: body.country || '',
    region: body.region || '',
    sector: body.sector || '',
    query: body.query || '',
    resultCount: filteredItems.length
  };

  const logId = await resolveExistingLogId(body);
  const log = logId
    ? await FetchLog.findByIdAndUpdate(logId, { $set: update }, { new: true, upsert: false })
    : await FetchLog.create(update);

  if (!log) {
    return res.status(404).json({ message: 'Fetch log not found' });
  }

  if (items.length > 0) {
    if (userObjectId) {
      publishTenantEvent(String(userObjectId), 'content', {
        scope: 'articles',
        action: 'fetched',
        count: items.length
      });
    } else {
      publishGlobalEvent('content', {
        scope: 'articles',
        action: 'fetched',
        count: items.length
      });
    }
  }

  res.json({ ok: true, processed: items.length, logId: log._id });
}));

module.exports = router;
