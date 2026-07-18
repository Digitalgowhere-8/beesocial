const express = require('express');
const mongoose = require('mongoose');
const FetchLog = require('../models/FetchLog');
const SavedSearch = require('../models/SavedSearch');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { buildProfileSearchPayload, cleanList } = require('../services/queryBuilder');
const { runProfileSearch } = require('../services/profileSearchRunner');
const { persistProfileResults } = require('../services/profileResultsService');
const progress = require('../services/profileRunProgress');
const { latestUsageResetAt, effectiveMonthlyStart } = require('../utils/usageReset');
const { acquire } = require('../utils/concurrencyGate');

const router = express.Router();
const DEFAULT_MIN_STORE_SCORE = Math.max(0, Math.min(100, Number(process.env.AI_RELEVANCE_MIN_SCORE || 30) || 30));
const AVG_AI_TOKENS_PER_RESULT = Number(process.env.AVG_AI_TOKENS_PER_RESULT || 700);
const AVG_TOKENS_PER_BLOG = Number(process.env.AVG_TOKENS_PER_BLOG || 5000);
const AVG_TOKENS_PER_SOCIAL_POST = Number(process.env.AVG_TOKENS_PER_SOCIAL_POST || 800);

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
      if (fetchedAdmin) adminUser = fetchedAdmin;
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
      if ((memberCanFetch && adminCanFetch) || (memberCanSchedule && adminCanSchedule)) return next();
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
    if (fetchedAdmin) adminUser = fetchedAdmin;
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
      $or: [{ userId: { $in: userIds } }, { triggeredByUser: { $in: userIds } }]
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

  const tokenLimit = Number(adminUser?.limits?.tokenBudgetMonthly ?? 0);
  if (tokenLimit > 0) {
    const [monthFetchRows, BlogPost, SocialPost] = await Promise.all([
      FetchLog.aggregate([
        {
          $match: {
            startedAt: { $gte: currentCycleStart },
            $or: [{ userId: { $in: userIds } }, { triggeredByUser: { $in: userIds } }]
          }
        },
        { $group: { _id: null, inserted: { $sum: '$totalInserted' } } }
      ]),
      require('../models/BlogPost').countDocuments({ tenantAdminId, createdAt: { $gte: currentCycleStart } }),
      require('../models/SocialPost').countDocuments({ tenantAdminId, createdAt: { $gte: currentCycleStart } })
    ]);
    const used = (Number(monthFetchRows[0]?.inserted || 0) * AVG_AI_TOKENS_PER_RESULT)
      + (BlogPost * AVG_TOKENS_PER_BLOG)
      + (SocialPost * AVG_TOKENS_PER_SOCIAL_POST);
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

function cleanLogId(value) {
  const id = String(value || '').trim().replace(/^=+/, '');
  return mongoose.Types.ObjectId.isValid(id) ? id : '';
}

router.get('/saved-searches', protect, requireProfileAutomation, asyncHandler(async (req, res) => {
  let adminUser = req.user;
  if (req.user?.role === 'user' && req.user?.tenantAdminId) {
    const fetchedAdmin = await User.findById(req.user.tenantAdminId);
    if (fetchedAdmin) adminUser = fetchedAdmin;
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
    if (fetchedAdmin) adminUser = fetchedAdmin;
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
    minStoreScore,
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
    minStoreScore: minStoreScore === undefined || minStoreScore === null || minStoreScore === '' ? undefined : Number(minStoreScore),
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

  const payload = buildProfileSearchPayload({
    ...user.toObject(),
    ...req.body,
    ...(savedSearch ? savedSearch.toObject() : {}),
    userId: user._id.toString(),
    savedSearchId: savedSearch ? savedSearch._id.toString() : savedSearchId || ''
  }, { startedAt: new Date().toISOString() });

  const log = await FetchLog.create({
    triggeredBy: 'manual',
    triggeredByUser: req.user._id,
    userId: req.user._id,
    savedSearchId: savedSearch ? savedSearch._id : undefined,
    country: payload.country,
    region: payload.region,
    sector: 'professional services',
    query: primaryPayloadQuery(payload),
    status: 'running',
    startedAt: new Date(),
    notes: savedSearch ? `Profile saved-search triggered: ${savedSearch.name}` : 'Profile search started'
  });

  payload.logId = String(log._id);
  const scopeKey = tenantScopeKey(req.user);

  if (req.body?.async === true || req.body?.async === 'true') {
    const logId = String(log._id);
    progress.startRun(logId, 'Fetch queued in backend runner');

    setImmediate(async () => {
      let release = null;
      try {
        release = acquire('fetch', scopeKey);
        progress.updateRun(logId, { step: 'start', percent: 8, message: 'Backend fetch started' });
        const resultPayload = await runProfileSearch(payload, {
          onProgress: ({ step, message }) => progress.updateRun(logId, { step, message }),
          isCancelled: () => progress.isCancelled(logId)
        });
        if (progress.isCancelled(logId)) {
          const err = new Error('Fetch cancelled by user');
          err.code = 'FETCH_CANCELLED';
          throw err;
        }
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
        if (error.code === 'FETCH_CANCELLED' || progress.isCancelled(logId)) {
          await FetchLog.findByIdAndUpdate(log._id, {
            status: 'cancelled',
            finishedAt: new Date(),
            durationMs: Date.now() - new Date(log.startedAt).getTime(),
            notes: 'Profile search cancelled by user'
          });
          progress.finishRun(logId, {
            status: 'cancelled',
            step: 'cancelled',
            percent: 100,
            message: 'Fetch cancelled.'
          });
          return;
        }
        await FetchLog.findByIdAndUpdate(log._id, {
          status: 'failed',
          finishedAt: new Date(),
          durationMs: Date.now() - new Date(log.startedAt).getTime(),
          totalErrors: 1,
          notes: `Profile search failed: ${error.message}`
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
      message: 'Profile search queued by backend runner',
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
      message: 'Profile search completed by backend runner',
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
      notes: `Profile search failed: ${error.message}`
    });
    throw error;
  } finally {
    release?.();
  }
}));

router.post('/runs/:logId/cancel', protect, requireProfileAutomation, asyncHandler(async (req, res) => {
  const logId = cleanLogId(req.params.logId);
  if (!logId) return res.status(400).json({ message: 'Valid run id is required' });

  const log = await FetchLog.findById(logId);
  if (!log) return res.status(404).json({ message: 'Fetch run not found' });

  const isOwner = String(log.userId || '') === String(req.user._id)
    || String(log.triggeredByUser || '') === String(req.user._id);
  if (req.user.role !== 'super_admin' && !isOwner) {
    return res.status(403).json({ message: 'You cannot cancel this fetch run.' });
  }

  progress.cancelRun(logId, 'Fetch cancellation requested by user');
  await FetchLog.findByIdAndUpdate(logId, {
    status: 'cancelled',
    finishedAt: new Date(),
    durationMs: log.startedAt ? Date.now() - new Date(log.startedAt).getTime() : undefined,
    notes: 'Fetch cancellation requested by user'
  });

  res.json({ ok: true, message: 'Fetch cancellation requested.' });
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

module.exports = router;
