const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const Article = require('../models/Article');
const FetchLog = require('../models/FetchLog');
const User = require('../models/User');
const UserSession = require('../models/UserSession');
const Plan = require('../models/Plan');
const BlogPost = require('../models/BlogPost');
const SocialPost = require('../models/SocialPost');
const AnalyticsEvent = require('../models/AnalyticsEvent');
const { protect, requireRole } = require('../middleware/auth');
const orchestrator = require('../services/orchestrator');
const { buildN8nPayload } = require('../services/queryBuilder');
const { getSystemSettings, saveSystemSettings } = require('../services/systemSettings');
const { buildSourceTrustRegistry, groupRegistryByCredibility } = require('../services/sourceTrust');
const { fetchSourceCatalog } = require('../config/fetchSources');
const {
  getPlatformFetchConfig,
  savePlatformFetchConfig,
  triggerPlatformFetch,
  getPlatformFetchStatus
} = require('../services/platformFetchService');
const { cleanupAnalyticsRetention, getDatabaseHealthSummary } = require('../services/storageMaintenance');
const { buildAdminBroadcastEmail, isConfigured: isEmailConfigured, sendEmail } = require('../services/emailService');
const { softDeleteUser, cleanupDeletedUsers, graceDays } = require('../services/userDeletionService');
const { latestUsageResetAt, effectiveMonthlyStart, startOfMonth } = require('../utils/usageReset');
const { publishTenantEvent, publishGlobalEvent, tenantKeyFor } = require('../utils/realtime');

const router = express.Router();

// Strict email validation - rejects patterns like jitesh@gmail.com.com
function isValidEmail(email) {
  const str = String(email || '').trim();
  // Basic format check
  if (!/^[^\s@]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(str)) return false;
  const [, domain] = str.split('@');
  const parts = domain.split('.');
  // Reject if more than 3 domain levels (e.g., a.b.c.d)
  if (parts.length > 3) return false;
  // Reject if last two parts are identical (e.g., .com.com, .net.net)
  if (parts.length === 3 && parts[1] === parts[2]) return false;
  return true;
}

// Escape special regex characters to prevent ReDoS attacks
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Helper to catch async route errors and pass them to next()
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const ADMIN_ROLES = ['admin', 'super_admin'];
const MANAGED_ROLES = ['user', 'admin'];
const DEFAULT_MEMBER_LIMIT = 3;
const ONLINE_WINDOW_MS = 90 * 1000;
const ARTICLE_RANK_SORT = { effectiveDay: -1, relevanceScore: -1, effectiveDate: -1 };
const AVG_AI_TOKENS_PER_RESULT = Number(process.env.AVG_AI_TOKENS_PER_RESULT || 700);
const AVG_TOKENS_PER_BLOG = Number(process.env.AVG_TOKENS_PER_BLOG || 5000);
const AVG_TOKENS_PER_SOCIAL_POST = Number(process.env.AVG_TOKENS_PER_SOCIAL_POST || 800);
const PAID_PLANS = ['growth', 'scale', 'enterprise', 'premium'];
const ACCESS_KEYS = ['canFetch', 'canCreateMembers', 'canUseContentRepository', 'canUseBlogStudio', 'canUseSavedSearches', 'canUseScheduler'];
const MAIL_SEND_CHUNK_SIZE = Math.max(1, Number(process.env.MAIL_SEND_CHUNK_SIZE || 10));
const DEFAULT_MEMBER_ACCESS = {
  canFetch: true,
  canCreateMembers: false,
  canUseContentRepository: true,
  canUseBlogStudio: false,
  canUseSavedSearches: true,
  canUseScheduler: false
};
const MAIL_AUDIENCE_OPTIONS = ['all', 'admins', 'members', 'inactive', 'custom'];

async function sourceRegistryForSettings(mapping = {}) {
  const sourceRows = await Article.aggregate([
    {
      $match: {
        sourceId: { $nin: ['', null] },
        source: { $nin: ['', null] },
        type: { $in: ['news', 'govt', 'competitor', 'evergreen'] }
      }
    },
    {
      $group: {
        _id: {
          type: '$type',
          id: '$sourceId',
          name: '$source',
          sourceType: '$sourceType'
        },
        countries: { $addToSet: '$country' },
        count: { $sum: 1 }
      }
    }
  ]);

  return buildSourceTrustRegistry(sourceRows.map((row) => ({
    type: row._id?.type,
    sourceId: row._id?.id,
    source: row._id?.name,
    sourceType: row._id?.sourceType,
    countries: row.countries,
    count: row.count
  })), mapping);
}

function startOfDay(days = 30) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - Math.max(0, Number(days || 0) - 1));
  return date;
}

function pct(part, total) {
  return total ? Math.round((Number(part || 0) / Number(total || 0)) * 100) : 0;
}

// Per-plan defaults loaded dynamically from database
async function getPlanDefaults(planId) {
  const plan = await Plan.findOne({ planId });
  if (plan) return plan.toObject();
  return {
    memberLimit: 1,
    limits: { fetchesPerMonth: 10, storageItems: 100, tokenBudgetMonthly: 50000, blogGenerationsMonthly: 3, socialPostsMonthly: 5 },
    access: { canFetch: true, canCreateMembers: false, canUseContentRepository: true, canUseBlogStudio: false, canUseSavedSearches: false, canUseScheduler: false }
  };
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

function canSeeUser(actor, target) {
  if (!target) return false;
  if (actor.role === 'super_admin') return true;
  if (target.role === 'super_admin') return false;
  return String(target._id) === String(actor._id) || String(target.tenantAdminId || '') === String(actor._id);
}

function managedUsersQuery(actor) {
  if (actor.role === 'super_admin') return {};
  return {
    role: { $ne: 'super_admin' },
    $or: [
      { _id: actor._id },
      { tenantAdminId: actor._id }
    ]
  };
}

async function teamUserIdsFor(actor) {
  if (actor.role === 'super_admin') return [];
  if (actor.role === 'admin') {
    const users = await User.find({ $or: [{ _id: actor._id }, { tenantAdminId: actor._id }] }).select('_id').lean();
    return users.map((user) => user._id);
  }
  return [actor._id];
}

async function requireFetchCapacity(req, res, next) {
  if (req.user?.role === 'super_admin') return next();

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
  if (req.user?.access?.canFetch === false) {
    return res.status(403).json({ message: 'Fetch access is disabled for this account.' });
  }

  const tenantAdminId = adminUser._id;
  const teamUsers = await User.find({ $or: [{ _id: tenantAdminId }, { tenantAdminId }] }).select('_id usageResetAt').lean();
  const userIds = teamUsers.map((u) => u._id);
  const resetAt = latestUsageResetAt(teamUsers);

  const since = effectiveMonthlyStart(resetAt);
  const limits = adminUser?.limits || {};
  const fetchLimit = Number(limits.fetchesPerMonth || 0);
  const storageLimit = Number(limits.storageItems || 0);
  const tokenLimit = Number(limits.tokenBudgetMonthly || 0);

  if (fetchLimit > 0) {
    const used = await FetchLog.countDocuments({
      startedAt: { $gte: since },
      $or: [{ userId: { $in: userIds } }, { triggeredByUser: { $in: userIds } }]
    });
    if (used >= fetchLimit) {
      return res.status(402).json(limitReachedPayload({
        limitType: 'fetchesPerMonth',
        used,
        limit: fetchLimit,
        message: `Monthly fetch limit reached (${used}/${fetchLimit}). Upgrade to run more fetches.`
      }));
    }
  }

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

  if (tokenLimit > 0) {
    const [monthFetchRows, monthBlogs, monthSocial] = await Promise.all([
      FetchLog.aggregate([
        { $match: { startedAt: { $gte: since }, $or: [{ userId: { $in: userIds } }, { triggeredByUser: { $in: userIds } }] } },
        { $group: { _id: null, inserted: { $sum: '$totalInserted' } } }
      ]),
      BlogPost.countDocuments({ tenantAdminId, createdAt: { $gte: since } }),
      SocialPost.countDocuments({ tenantAdminId, createdAt: { $gte: since } })
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

function normalizeAccessPatch(access, { allowMemberManagement = false } = {}) {
  if (!access || typeof access !== 'object') return {};
  return ACCESS_KEYS.reduce((out, key) => {
    if (key === 'canCreateMembers' && !allowMemberManagement) return out;
    if (key in access) out[key] = Boolean(access[key]);
    return out;
  }, {});
}

function normalizeMultilineText(value = '') {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

async function resolveMailRecipients({ audience = 'all', userIds = [] } = {}) {
  const selectedAudience = MAIL_AUDIENCE_OPTIONS.includes(audience) ? audience : 'all';
  const query = { email: { $exists: true, $ne: '' } };

  if (selectedAudience === 'admins') {
    query.role = { $in: ['admin', 'super_admin'] };
    query.isActive = true;
  } else if (selectedAudience === 'members') {
    query.role = 'user';
    query.isActive = true;
  } else if (selectedAudience === 'inactive') {
    query.isActive = false;
  } else if (selectedAudience === 'custom') {
    const validIds = Array.isArray(userIds)
      ? userIds.filter((id) => mongoose.Types.ObjectId.isValid(id))
      : [];
    if (!validIds.length) return [];
    query._id = { $in: validIds };
  } else {
    query.isActive = true;
    query.role = { $in: ['admin', 'user', 'super_admin'] };
  }

  return User.find(query)
    .select('name email role company isActive')
    .sort({ role: 1, name: 1, email: 1 })
    .lean();
}

async function sendAdminBroadcastToRecipients(recipients, payloadBuilder) {
  const sent = [];
  const failed = [];

  for (let index = 0; index < recipients.length; index += MAIL_SEND_CHUNK_SIZE) {
    const batch = recipients.slice(index, index + MAIL_SEND_CHUNK_SIZE);
    const batchResults = await Promise.allSettled(batch.map(async (recipient) => {
      const payload = payloadBuilder(recipient);
      await sendEmail({
        to: recipient.email,
        replyTo: process.env.EMAIL_REPLY_TO || undefined,
        ...payload
      });
      return recipient;
    }));

    batchResults.forEach((result, batchIndex) => {
      const recipient = batch[batchIndex];
      if (result.status === 'fulfilled') {
        sent.push(recipient.email);
      } else {
        failed.push({
          email: recipient.email,
          error: result.reason?.message || 'Send failed'
        });
      }
    });
  }

  return { sent, failed };
}

// Every route here requires an operational admin.
router.use(protect, requireRole(...ADMIN_ROLES));

// ============== ARTICLE MANAGEMENT ==============

async function articleManagementQuery(user, ids = null) {
  const q = {};
  if (ids) q._id = { $in: ids };
  if (user.role === 'super_admin') return q;
  const teamIds = await teamUserIdsFor(user);
  return { ...q, userId: { $in: teamIds } };
}

// PATCH /api/admin/articles/:id/publish
router.patch('/articles/:id/publish', asyncHandler(async (req, res) => {
  const q = await articleManagementQuery(req.user);
  q._id = req.params.id;
  const item = await Article.findOneAndUpdate(
    q,
    {
      $set: {
        isPublished: true,
        publishedBy: req.user._id,
        publishedAtAdmin: new Date()
      }
    },
    { new: true }
  );
  if (!item) return res.status(404).json({ message: 'Not found' });
  publishGlobalEvent('content', { scope: 'articles', action: 'published', id: String(item._id) });
  res.json({ item });
}));

// PATCH /api/admin/articles/:id/unpublish
router.patch('/articles/:id/unpublish', asyncHandler(async (req, res) => {
  const q = await articleManagementQuery(req.user);
  q._id = req.params.id;
  const item = await Article.findOneAndUpdate(
    q,
    {
      $set: {
        isPublished: false
      }
    },
    { new: true }
  );
  if (!item) return res.status(404).json({ message: 'Not found' });
  publishGlobalEvent('content', { scope: 'articles', action: 'unpublished', id: String(item._id) });
  res.json({ item });
}));

// POST /api/admin/articles/bulk-publish    body: { ids: [...] }
router.post('/articles/bulk-publish', asyncHandler(async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: 'ids[] required' });
  const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (!validIds.length) return res.status(400).json({ message: 'No valid ids provided' });

  const q = await articleManagementQuery(req.user, validIds);
  const result = await Article.updateMany(
    q,
    { $set: { isPublished: true, publishedBy: req.user._id, publishedAtAdmin: new Date() } }
  );
  publishGlobalEvent('content', { scope: 'articles', action: 'bulk-published', ids: validIds.map(String) });
  res.json({ matched: result.matchedCount, modified: result.modifiedCount });
}));

// POST /api/admin/articles/bulk-unpublish    body: { ids: [...] }
router.post('/articles/bulk-unpublish', asyncHandler(async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: 'ids[] required' });
  const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (!validIds.length) return res.status(400).json({ message: 'No valid ids provided' });

  const q = await articleManagementQuery(req.user, validIds);
  const result = await Article.updateMany(
    q,
    { $set: { isPublished: false } }
  );
  publishGlobalEvent('content', { scope: 'articles', action: 'bulk-unpublished', ids: validIds.map(String) });
  res.json({ matched: result.matchedCount, modified: result.modifiedCount });
}));

// DELETE /api/admin/articles/:id
router.delete('/articles/:id', asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid article ID' });
  }
  const q = await articleManagementQuery(req.user);
  q._id = req.params.id;
  const item = await Article.findOneAndDelete(q);
  if (!item) return res.status(404).json({ message: 'Not found' });
  publishGlobalEvent('content', { scope: 'articles', action: 'deleted', id: String(item._id) });
  res.json({ message: 'Deleted', id: req.params.id });
}));

// POST /api/admin/articles/bulk-delete    body: { ids: [...] }
router.post('/articles/bulk-delete', asyncHandler(async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: 'ids[] required' });
  const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (!validIds.length) return res.status(400).json({ message: 'No valid ids provided' });

  const q = await articleManagementQuery(req.user, validIds);
  const result = await Article.deleteMany(q);
  publishGlobalEvent('content', { scope: 'articles', action: 'bulk-deleted', ids: validIds.map(String) });
  res.json({ deleted: result.deletedCount });
}));

// PATCH /api/admin/articles/:id  (edit title, summary, category, etc.)
router.patch('/articles/:id', asyncHandler(async (req, res) => {
  const allowed = ['title', 'summary', 'category', 'subcategory', 'tags', 'country', 'aiSummary'];
  const update = {};
  for (const k of allowed) if (k in req.body) update[k] = req.body[k];
  const q = await articleManagementQuery(req.user);
  q._id = req.params.id;
  const item = await Article.findOneAndUpdate(q, update, { new: true });
  if (!item) return res.status(404).json({ message: 'Not found' });
  publishGlobalEvent('content', { scope: 'articles', action: 'updated', id: String(item._id) });
  res.json({ item });
}));

// ============== FETCH (manual trigger) ==============

let isFetching = false;
const N8N_TYPES = ['profile'];
const n8nRunning = new Set();

function n8nEnvKey(type) {
  return type === 'profile' ? 'N8N_WEBHOOK_URL' : `N8N_WEBHOOK_URL_${String(type || '').toUpperCase()}`;
}

function getN8nWebhookUrl(type) {
  const normalized = N8N_TYPES.includes(type) ? type : 'profile';
  return process.env[n8nEnvKey(normalized)] || '';
}

function getN8nStatus() {
  const configured = Object.fromEntries(N8N_TYPES.map((type) => [type, Boolean(getN8nWebhookUrl(type))]));
  const running = Object.fromEntries(N8N_TYPES.map((type) => [type, n8nRunning.has(type)]));
  return {
    isFetching: n8nRunning.size > 0,
    configured,
    running
  };
}

async function runN8nWorkflow({ triggeredByUser, user, type = 'profile' }) {
  const webhookUrl = getN8nWebhookUrl(type);
  if (!webhookUrl) {
    throw new Error(`${n8nEnvKey(type)} is not configured`);
  }

  const startedAt = new Date();
  const callbackUrl = process.env.N8N_CALLBACK_URL || '';
  const callbackSecret = process.env.N8N_CALLBACK_SECRET || '';
  const payload = buildN8nPayload(user || {}, {
    userId: String(triggeredByUser || user?._id || ''),
    trigger: 'admin_manual',
    callbackUrl,
    callbackSecret,
    startedAt: startedAt.toISOString()
  });

  const log = await FetchLog.create({
    triggeredBy: 'n8n',
    triggeredByUser,
    userId: triggeredByUser,
    status: 'running',
    startedAt,
    country: payload.country,
    region: payload.region,
    sector: payload.sector,
    query: payload.query,
    notes: 'Dynamic profile pipeline started from Admin Panel'
  });

  payload.logId = String(log._id);

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

    const body = response.data || {};
    const finishedLog = await FetchLog.findById(log._id);
    if (!finishedLog || finishedLog.status !== 'running') return;

    const finishedAt = new Date();
    const totalErrors = Number(body.totalErrors || body.errors || 0);
    finishedLog.status = body.status || (totalErrors > 0 ? 'partial' : 'success');
    finishedLog.finishedAt = finishedAt;
    finishedLog.durationMs = finishedAt.getTime() - startedAt.getTime();
    finishedLog.totalFetched = Number(body.totalFetched || body.fetched || 0);
    finishedLog.totalInserted = Number(body.totalInserted || body.inserted || 0);
    finishedLog.totalDuplicates = Number(body.totalDuplicates || body.duplicates || 0);
    finishedLog.totalErrors = totalErrors;
    finishedLog.perSource = Array.isArray(body.perSource)
      ? body.perSource
      : [{
          sourceId: 'n8n',
          sourceName: 'n8n profile pipeline',
          type: 'profile_intelligence',
          attempted: Number(body.totalFetched || body.fetched || 0),
          fetched: Number(body.totalFetched || body.fetched || 0),
          inserted: Number(body.totalInserted || body.inserted || 0),
          duplicates: Number(body.totalDuplicates || body.duplicates || 0),
          errors: totalErrors,
          errorMessages: body.errorMessage ? [body.errorMessage] : []
        }];
    finishedLog.notes = body.notes || 'Dynamic profile pipeline completed';
    await finishedLog.save();
  } catch (err) {
    await FetchLog.findByIdAndUpdate(log._id, {
      $set: {
        status: 'failed',
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        totalErrors: 1,
        perSource: [{
          sourceId: 'n8n',
          sourceName: 'n8n profile pipeline',
          type: 'profile_intelligence',
          attempted: 1,
          fetched: 0,
          inserted: 0,
          duplicates: 0,
          errors: 1,
          errorMessages: [err.message]
        }],
        notes: 'Dynamic profile pipeline trigger failed'
      }
    });
    throw err;
  }
}

// POST /api/admin/fetch    body: { types?: ['news','govt','competitor','evergreen'] }
router.post('/fetch', requireFetchCapacity, asyncHandler(async (req, res) => {
  if (isFetching) {
    return res.status(409).json({ message: 'A fetch is already in progress' });
  }
  isFetching = true;
  // Respond immediately; let scrape run in background.
  res.json({ message: 'Fetch started', triggeredBy: 'manual', startedAt: new Date() });

  try {
    await orchestrator.runAll({
      triggeredBy: 'manual',
      triggeredByUser: req.user._id,
      types: req.body?.types
    });
  } catch (err) {
    console.error('[admin] manual fetch failed:', err);
  } finally {
    isFetching = false;
  }
}));

// GET /api/admin/fetch/status
router.get('/fetch/status', (_req, res) => {
  res.json({ isFetching });
});

// POST /api/admin/n8n/run
router.post('/n8n/run', requireFetchCapacity, asyncHandler(async (req, res) => {
  const type = N8N_TYPES.includes(req.body?.type) ? req.body.type : 'profile';
  if (n8nRunning.has(type)) {
    return res.status(409).json({ message: 'The dynamic profile pipeline is already in progress' });
  }
  if (!getN8nWebhookUrl(type)) {
    return res.status(400).json({ message: `${n8nEnvKey(type)} is not configured` });
  }

  n8nRunning.add(type);
  res.json({ message: 'Dynamic profile pipeline started', triggeredBy: 'manual', type, startedAt: new Date() });

  try {
    await runN8nWorkflow({ triggeredByUser: req.user._id, user: req.user, type });
  } catch (err) {
    console.error('[admin] dynamic profile pipeline failed:', err);
  } finally {
    n8nRunning.delete(type);
  }
}));

// GET /api/admin/n8n/status
router.get('/n8n/status', (_req, res) => {
  res.json(getN8nStatus());
});

// ============== STATS ==============

router.get('/stats', asyncHandler(async (req, res) => {
  const teamQuery = req.user.role === 'super_admin'
    ? { role: { $in: ['admin', 'user'] } }
    : { $or: [{ _id: req.user._id }, { tenantAdminId: req.user._id }] };
  const teamUsers = await User.find(teamQuery)
    .select('name email role company tenantAdminId memberLimit subscriptionPlan limits access isActive lastLoginAt lastSeenAt usageResetAt')
    .lean();
  const userIds = teamUsers.map((user) => user._id);
  const resetAt = latestUsageResetAt(teamUsers);
  const currentCycleStart = effectiveMonthlyStart(resetAt);
  const adminUser = req.user.role === 'super_admin'
    ? teamUsers.find((user) => user.role === 'admin') || req.user
    : teamUsers.find((user) => String(user._id) === String(req.user._id)) || req.user;

  const [
    fetchRows,
    monthFetchRows,
    articleRows,
    monthArticleRows,
    blogRows,
    monthBlogRows,
    socialRows,
    monthSocialRows,
    recentRuns
  ] = await Promise.all([
    FetchLog.aggregate([
      { $match: { ...(resetAt ? { startedAt: { $gte: resetAt } } : {}), $or: [{ userId: { $in: userIds } }, { triggeredByUser: { $in: userIds } }] } },
      { $group: { _id: { $ifNull: ['$userId', '$triggeredByUser'] }, runs: { $sum: 1 }, inserted: { $sum: '$totalInserted' }, fetched: { $sum: '$totalFetched' }, errors: { $sum: '$totalErrors' }, failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } } } }
    ]),
    FetchLog.aggregate([
      { $match: { startedAt: { $gte: currentCycleStart }, $or: [{ userId: { $in: userIds } }, { triggeredByUser: { $in: userIds } }] } },
      { $group: { _id: { $ifNull: ['$userId', '$triggeredByUser'] }, runs: { $sum: 1 }, inserted: { $sum: '$totalInserted' }, fetched: { $sum: '$totalFetched' }, errors: { $sum: '$totalErrors' }, failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } } } }
    ]),
    Article.aggregate([{ $match: { userId: { $in: userIds }, ...(resetAt ? { fetchedAt: { $gte: resetAt } } : {}) } }, { $group: { _id: '$userId', count: { $sum: 1 } } }]),
    Article.aggregate([{ $match: { userId: { $in: userIds }, fetchedAt: { $gte: currentCycleStart } } }, { $group: { _id: '$userId', count: { $sum: 1 } } }]),
    BlogPost.aggregate([{ $match: { createdBy: { $in: userIds }, ...(resetAt ? { createdAt: { $gte: resetAt } } : {}) } }, { $group: { _id: '$createdBy', count: { $sum: 1 } } }]),
    BlogPost.aggregate([{ $match: { createdBy: { $in: userIds }, createdAt: { $gte: currentCycleStart } } }, { $group: { _id: '$createdBy', count: { $sum: 1 } } }]),
    SocialPost.aggregate([{ $match: { createdBy: { $in: userIds }, ...(resetAt ? { createdAt: { $gte: resetAt } } : {}) } }, { $group: { _id: '$createdBy', count: { $sum: 1 } } }]),
    SocialPost.aggregate([{ $match: { createdBy: { $in: userIds }, createdAt: { $gte: currentCycleStart } } }, { $group: { _id: '$createdBy', count: { $sum: 1 } } }]),
    FetchLog.find({ $or: [{ userId: { $in: userIds } }, { triggeredByUser: { $in: userIds } }] })
      .sort({ startedAt: -1 })
      .limit(8)
      .populate('userId', 'name email role')
      .populate('triggeredByUser', 'name email role')
      .lean()
  ]);

  const toMap = (rows, key = 'count') => Object.fromEntries(rows.map((row) => [String(row._id || ''), Number(row[key] || 0)]));
  const fetchMap = Object.fromEntries(fetchRows.map((row) => [String(row._id || ''), row]));
  const monthFetchMap = Object.fromEntries(monthFetchRows.map((row) => [String(row._id || ''), row]));
  const articleMap = toMap(articleRows);
  const monthArticleMap = toMap(monthArticleRows);
  const blogMap = toMap(blogRows);
  const monthBlogMap = toMap(monthBlogRows);
  const socialMap = toMap(socialRows);
  const monthSocialMap = toMap(monthSocialRows);

  const users = teamUsers.map((user) => {
    const id = String(user._id);
    const monthFetch = monthFetchMap[id] || {};
    const allFetch = fetchMap[id] || {};
    const monthArticles = Number(monthArticleMap[id] || 0);
    const monthBlogs = Number(monthBlogMap[id] || 0);
    const monthSocial = Number(monthSocialMap[id] || 0);
    const tokenEstimate = (Number(monthFetch.inserted || 0) * AVG_AI_TOKENS_PER_RESULT)
      + (monthBlogs * AVG_TOKENS_PER_BLOG)
      + (monthSocial * AVG_TOKENS_PER_SOCIAL_POST);

    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      company: user.company,
      isActive: user.isActive,
      subscriptionPlan: user.subscriptionPlan,
      limits: user.limits || {},
      access: user.access || {},
      usage: {
        totalFetches: Number(allFetch.runs || 0),
        monthFetches: Number(monthFetch.runs || 0),
        monthFetched: Number(monthFetch.fetched || 0),
        monthInserted: Number(monthFetch.inserted || 0),
        monthErrors: Number(monthFetch.errors || 0),
        monthFailedRuns: Number(monthFetch.failed || 0),
        storageItems: Number(articleMap[id] || 0),
        monthArticles,
        blogs: Number(blogMap[id] || 0),
        monthBlogs,
        socialPosts: Number(socialMap[id] || 0),
        monthSocialPosts: monthSocial,
        estimatedTokens: tokenEstimate
      }
    };
  });

  const totals = users.reduce((sum, user) => ({
    monthFetches: sum.monthFetches + user.usage.monthFetches,
    monthFetched: sum.monthFetched + user.usage.monthFetched,
    monthInserted: sum.monthInserted + user.usage.monthInserted,
    monthErrors: sum.monthErrors + user.usage.monthErrors,
    monthFailedRuns: sum.monthFailedRuns + user.usage.monthFailedRuns,
    storageItems: sum.storageItems + user.usage.storageItems,
    monthArticles: sum.monthArticles + user.usage.monthArticles,
    blogs: sum.blogs + user.usage.blogs,
    monthBlogs: sum.monthBlogs + user.usage.monthBlogs,
    socialPosts: sum.socialPosts + user.usage.socialPosts,
    monthSocialPosts: sum.monthSocialPosts + user.usage.monthSocialPosts,
    estimatedTokens: sum.estimatedTokens + user.usage.estimatedTokens
  }), {
    monthFetches: 0,
    monthFetched: 0,
    monthInserted: 0,
    monthErrors: 0,
    monthFailedRuns: 0,
    storageItems: 0,
    monthArticles: 0,
    blogs: 0,
    monthBlogs: 0,
    socialPosts: 0,
    monthSocialPosts: 0,
    estimatedTokens: 0
  });

  const limits = {
    fetchesPerMonth: Number(adminUser?.limits?.fetchesPerMonth ?? req.user.limits?.fetchesPerMonth ?? 0),
    storageItems: Number(adminUser?.limits?.storageItems ?? req.user.limits?.storageItems ?? 0),
    tokenBudgetMonthly: Number(adminUser?.limits?.tokenBudgetMonthly ?? req.user.limits?.tokenBudgetMonthly ?? 0),
    blogGenerationsMonthly: Number(adminUser?.limits?.blogGenerationsMonthly ?? req.user.limits?.blogGenerationsMonthly ?? 0),
    socialPostsMonthly: Number(adminUser?.limits?.socialPostsMonthly ?? req.user.limits?.socialPostsMonthly ?? 0),
    memberLimit: Number(adminUser?.memberLimit ?? req.user.memberLimit ?? 0)
  };

  res.json({
    monthStart: currentCycleStart,
    admin: {
      _id: adminUser?._id || req.user._id,
      name: adminUser?.name || req.user.name,
      email: adminUser?.email || req.user.email,
      subscriptionPlan: adminUser?.subscriptionPlan || req.user.subscriptionPlan || 'free'
    },
    limits,
    remaining: {
      fetchesPerMonth: Math.max(0, limits.fetchesPerMonth - totals.monthFetches),
      storageItems: Math.max(0, limits.storageItems - totals.storageItems),
      tokenBudgetMonthly: Math.max(0, limits.tokenBudgetMonthly - totals.estimatedTokens),
      blogGenerationsMonthly: Math.max(0, limits.blogGenerationsMonthly - totals.monthBlogs),
      socialPostsMonthly: Math.max(0, limits.socialPostsMonthly - totals.monthSocialPosts),
      memberSeats: Math.max(0, limits.memberLimit - users.filter((user) => user.role === 'user').length)
    },
    totals,
    users,
    recentRuns
  });
}));

// ============== SUPER ADMIN PLATFORM ==============

router.get('/super/overview', requireRole('super_admin'), asyncHandler(async (_req, res) => {
  const monthStart = startOfMonth();
  const [
    totalUsers,
    activeUsers,
    admins,
    members,
    premiumUsers,
    onlineUsers,
    totalArticles,
    monthArticles,
    totalRuns,
    monthRuns,
    failedRuns,
    monthFailedRuns,
    planRows,
    statusRows,
    topUsers,
    recentRuns
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ isActive: true }),
    User.countDocuments({ role: 'admin' }),
    User.countDocuments({ role: 'user' }),
    User.countDocuments({ subscriptionPlan: { $in: PAID_PLANS } }),
    User.countDocuments({ lastSeenAt: { $gte: new Date(Date.now() - ONLINE_WINDOW_MS) } }),
    Article.countDocuments({}),
    Article.countDocuments({ fetchedAt: { $gte: monthStart } }),
    FetchLog.countDocuments({}),
    FetchLog.countDocuments({ startedAt: { $gte: monthStart } }),
    FetchLog.countDocuments({ status: 'failed' }),
    FetchLog.countDocuments({ status: 'failed', startedAt: { $gte: monthStart } }),
    User.aggregate([{ $group: { _id: '$subscriptionPlan', count: { $sum: 1 } } }]),
    FetchLog.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    FetchLog.aggregate([
      {
        $match: {
          startedAt: { $gte: monthStart },
          sector: { $ne: 'platform intelligence' },
          $or: [
            { userId: { $exists: true, $ne: null } },
            { triggeredByUser: { $exists: true, $ne: null } }
          ]
        }
      },
      {
        $group: {
          _id: { $ifNull: ['$userId', '$triggeredByUser'] },
          runs: { $sum: 1 },
          inserted: { $sum: '$totalInserted' },
          fetched: { $sum: '$totalFetched' },
          errors: { $sum: '$totalErrors' },
          failures: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } }
        }
      },
      { $sort: { runs: -1, inserted: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          runs: 1,
          inserted: 1,
          fetched: 1,
          errors: 1,
          failures: 1,
          estimatedTokens: { $multiply: ['$inserted', AVG_AI_TOKENS_PER_RESULT] },
          user: {
            _id: '$user._id',
            name: '$user.name',
            email: '$user.email',
            company: '$user.company',
            role: '$user.role',
            subscriptionPlan: '$user.subscriptionPlan'
          }
        }
      }
    ]),
    FetchLog.find({})
      .sort({ startedAt: -1 })
      .limit(8)
      .populate('userId', 'name email company subscriptionPlan role')
      .populate('triggeredByUser', 'name email company subscriptionPlan role')
      .lean()
  ]);

  const planCounts = Object.fromEntries(planRows.map((row) => [row._id || 'free', row.count]));
  const runStatus = Object.fromEntries(statusRows.map((row) => [row._id || 'unknown', row.count]));
  const estimatedTokensThisMonth = topUsers.reduce((sum, row) => sum + Number(row.estimatedTokens || 0), 0);
  const failureRateThisMonth = monthRuns ? Math.round((monthFailedRuns / monthRuns) * 100) : 0;

  res.json({
    monthStart,
    users: {
      total: totalUsers,
      active: activeUsers,
      admins,
      members,
      premium: premiumUsers,
      free: totalUsers - premiumUsers,
      online: onlineUsers,
      planCounts
    },
    usage: {
      totalArticles,
      monthArticles,
      totalRuns,
      monthRuns,
      failedRuns,
      monthFailedRuns,
      failureRateThisMonth,
      runStatus,
      estimatedTokensThisMonth
    },
    topUsers,
    recentRuns
  });
}));

router.get('/super/analytics', requireRole('super_admin'), asyncHandler(async (_req, res) => {
  const since = startOfMonth();
  const match = { occurredAt: { $gte: since } };

  const [
    uniqueVisitors,
    uniqueSessions,
    pageViews,
    clicks,
    sectionViews,
    engagementRows,
    sectionRows,
    clickRows,
    pageRows,
    trendRows,
    roleRows,
    sessionRows
  ] = await Promise.all([
    AnalyticsEvent.distinct('visitorId', match),
    AnalyticsEvent.distinct('sessionId', match),
    AnalyticsEvent.countDocuments({ ...match, type: 'page_view' }),
    AnalyticsEvent.countDocuments({ ...match, type: 'click' }),
    AnalyticsEvent.countDocuments({ ...match, type: 'section_view' }),
    AnalyticsEvent.aggregate([
      { $match: { ...match, durationMs: { $gt: 0 } } },
      { $group: { _id: null, totalDurationMs: { $sum: '$durationMs' }, avgDurationMs: { $avg: '$durationMs' } } }
    ]),
    AnalyticsEvent.aggregate([
      { $match: { ...match, type: 'section_view', section: { $nin: ['', null] } } },
      {
        $group: {
          _id: '$section',
          views: { $sum: 1 },
          visitors: { $addToSet: '$visitorId' },
          totalDurationMs: { $sum: '$durationMs' },
          avgDurationMs: { $avg: '$durationMs' }
        }
      },
      { $project: { section: '$_id', views: 1, visitors: { $size: '$visitors' }, totalDurationMs: 1, avgDurationMs: 1, _id: 0 } },
      { $sort: { totalDurationMs: -1, views: -1 } },
      { $limit: 12 }
    ]),
    AnalyticsEvent.aggregate([
      { $match: { ...match, type: 'click' } },
      {
        $group: {
          _id: { section: { $ifNull: ['$section', 'Unknown'] }, label: { $ifNull: ['$label', 'Unknown'] } },
          clicks: { $sum: 1 },
          visitors: { $addToSet: '$visitorId' }
        }
      },
      { $project: { section: '$_id.section', label: '$_id.label', clicks: 1, visitors: { $size: '$visitors' }, _id: 0 } },
      { $sort: { clicks: -1 } },
      { $limit: 15 }
    ]),
    AnalyticsEvent.aggregate([
      { $match: { ...match, type: 'page_view', path: { $nin: ['', null] } } },
      {
        $group: {
          _id: '$path',
          views: { $sum: 1 },
          visitors: { $addToSet: '$visitorId' },
          title: { $first: '$title' }
        }
      },
      { $project: { path: '$_id', title: 1, views: 1, visitors: { $size: '$visitors' }, _id: 0 } },
      { $sort: { views: -1 } },
      { $limit: 10 }
    ]),
    AnalyticsEvent.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            day: { $dateToString: { date: '$occurredAt', format: '%Y-%m-%d', timezone: 'Asia/Kolkata' } },
            type: '$type'
          },
          count: { $sum: 1 },
          durationMs: { $sum: '$durationMs' },
          visitors: { $addToSet: '$visitorId' }
        }
      },
      { $sort: { '_id.day': 1 } }
    ]),
    AnalyticsEvent.aggregate([
      { $match: { ...match, role: { $nin: ['', null] } } },
      { $group: { _id: '$role', events: { $sum: 1 }, visitors: { $addToSet: '$visitorId' } } },
      { $project: { role: '$_id', events: 1, visitors: { $size: '$visitors' }, _id: 0 } },
      { $sort: { events: -1 } }
    ]),
    AnalyticsEvent.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$sessionId',
          pageViews: { $sum: { $cond: [{ $eq: ['$type', 'page_view'] }, 1, 0] } },
          clicks: { $sum: { $cond: [{ $eq: ['$type', 'click'] }, 1, 0] } },
          durationMs: { $sum: '$durationMs' }
        }
      },
      {
        $group: {
          _id: null,
          bouncedSessions: { $sum: { $cond: [{ $and: [{ $lte: ['$pageViews', 1] }, { $eq: ['$clicks', 0] }, { $lt: ['$durationMs', 10000] }] }, 1, 0] } },
          engagedSessions: { $sum: { $cond: [{ $or: [{ $gt: ['$clicks', 0] }, { $gte: ['$durationMs', 10000] }, { $gt: ['$pageViews', 1] }] }, 1, 0] } },
          totalSessions: { $sum: 1 }
        }
      }
    ])
  ]);

  const totalDurationMs = Number(engagementRows[0]?.totalDurationMs || 0);
  const avgEventDurationMs = Math.round(Number(engagementRows[0]?.avgDurationMs || 0));
  const sessionStats = sessionRows[0] || {};
  const dailyMap = new Map();
  const today = new Date();
  const days = Math.max(1, Math.floor((today - since) / (24 * 60 * 60 * 1000)) + 1);
  for (let i = 0; i < days; i += 1) {
    const date = new Date(since);
    date.setDate(since.getDate() + i);
    const key = date.toISOString().slice(0, 10);
    dailyMap.set(key, { day: key, pageViews: 0, clicks: 0, sectionViews: 0, engagementMs: 0, visitors: 0 });
  }
  trendRows.forEach((row) => {
    const day = row._id?.day;
    if (!day) return;
    const current = dailyMap.get(day) || { day, pageViews: 0, clicks: 0, sectionViews: 0, engagementMs: 0, visitors: 0 };
    if (row._id.type === 'page_view') current.pageViews = row.count;
    if (row._id.type === 'click') current.clicks = row.count;
    if (row._id.type === 'section_view') current.sectionViews = row.count;
    current.engagementMs += Number(row.durationMs || 0);
    current.visitors = Math.max(current.visitors, Array.isArray(row.visitors) ? row.visitors.length : 0);
    dailyMap.set(day, current);
  });

  const sectionWithRates = sectionRows.map((row) => {
    const rowClicks = clickRows
      .filter((click) => click.section === row.section)
      .reduce((sum, click) => sum + Number(click.clicks || 0), 0);
    return {
      ...row,
      clicks: rowClicks,
      clickRate: pct(rowClicks, row.views),
      avgDurationMs: Math.round(Number(row.avgDurationMs || 0))
    };
  });

  res.json({
    days,
    since,
    totals: {
      visitors: uniqueVisitors.length,
      sessions: uniqueSessions.length,
      pageViews,
      clicks,
      sectionViews,
      totalEngagedMs: totalDurationMs,
      avgEngagedMsPerSession: uniqueSessions.length ? Math.round(totalDurationMs / uniqueSessions.length) : 0,
      avgEventDurationMs,
      clickThroughRate: pct(clicks, pageViews),
      engagementRate: pct(sessionStats.engagedSessions || 0, sessionStats.totalSessions || uniqueSessions.length),
      bounceRate: pct(sessionStats.bouncedSessions || 0, sessionStats.totalSessions || uniqueSessions.length)
    },
    sections: sectionWithRates,
    clicks: clickRows,
    pages: pageRows,
    roles: roleRows,
    trend: Array.from(dailyMap.values())
  });
}));

router.get('/super/database-health', requireRole('super_admin'), asyncHandler(async (_req, res) => {
  const summary = await getDatabaseHealthSummary();
  res.json(summary);
}));

router.delete('/super/analytics/cleanup', requireRole('super_admin'), asyncHandler(async (_req, res) => {
  const result = await cleanupAnalyticsRetention();
  const summary = await getDatabaseHealthSummary();
  res.json({
    success: true,
    deleted: result.deleted,
    cutoff: result.cutoff,
    message: result.deleted
      ? `${result.deleted} old analytics events deleted.`
      : 'No old analytics events needed cleanup.',
    health: summary
  });
}));

router.get('/super/fetch/config', requireRole('super_admin'), asyncHandler(async (_req, res) => {
  const config = await getPlatformFetchConfig();
  const defaultCatalog = fetchSourceCatalog();
  const customCountries = Object.keys(config.sourceDomainsByCountry || {}).reduce((out, country) => {
    if (defaultCatalog[country]) return out;
    out[country] = { news: [], govt: [], competitor: [], evergreen: [] };
    return out;
  }, {});
  res.json({
    config,
    sourceCatalog: {
      ...defaultCatalog,
      ...customCountries
    }
  });
}));

router.put('/super/fetch/config', requireRole('super_admin'), asyncHandler(async (req, res) => {
  const config = await savePlatformFetchConfig(req.body || {});
  res.json({ config });
}));

router.get('/super/fetch/status', requireRole('super_admin'), asyncHandler(async (_req, res) => {
  res.json(getPlatformFetchStatus());
}));

router.post('/super/fetch/run', requireRole('super_admin'), asyncHandler(async (req, res) => {
  const config = req.body?.config
    ? await savePlatformFetchConfig(req.body.config)
    : await getPlatformFetchConfig();
  const result = await triggerPlatformFetch({
    triggeredByUser: req.user._id,
    config,
    trigger: 'manual'
  });
  res.json({
    ok: true,
    message: 'Platform fetch queued',
    logId: result.logId,
    config: result.config
  });
}));

// ============== SYSTEM SETTINGS ==============

router.get('/settings', requireRole('super_admin'), asyncHandler(async (_req, res) => {
  const settings = await getSystemSettings({ useCache: false });
  const sourceRegistry = await sourceRegistryForSettings(settings.sourceTrustMapping);
  res.json({
    settings,
    sourceTrust: {
      registry: sourceRegistry,
      groups: groupRegistryByCredibility(sourceRegistry)
    }
  });
}));

router.put('/settings', requireRole('super_admin'), asyncHandler(async (req, res) => {
  const allowed = ['aiModel', 'aiSummary', 'aiCategory', 'maintenanceMode', 'sourceTrustMapping', 'dashboardAppearance'];
  const patch = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
      patch[key] = req.body[key];
    }
  }
  const settings = await saveSystemSettings(patch);
  const sourceRegistry = await sourceRegistryForSettings(settings.sourceTrustMapping);
  res.json({
    settings,
    sourceTrust: {
      registry: sourceRegistry,
      groups: groupRegistryByCredibility(sourceRegistry)
    }
  });
}));

// ============== SUPER ADMIN MAIL CENTER ==============

router.get('/email/audience', requireRole('super_admin'), asyncHandler(async (_req, res) => {
  const items = await User.find({ role: { $in: ['super_admin', 'admin', 'user'] } })
    .select('name email role company isActive')
    .sort({ isActive: -1, role: 1, name: 1, email: 1 })
    .lean();

  res.json({
    configured: isEmailConfigured(),
    sender: process.env.EMAIL_FROM || '',
    replyTo: process.env.EMAIL_REPLY_TO || '',
    items
  });
}));

router.post('/email/send', requireRole('super_admin'), asyncHandler(async (req, res) => {
  if (!isEmailConfigured()) {
    return res.status(503).json({ message: 'Email delivery is not configured. Add RESEND_API_KEY and EMAIL_FROM first.' });
  }

  const audience = MAIL_AUDIENCE_OPTIONS.includes(req.body?.audience) ? req.body.audience : 'all';
  const subject = String(req.body?.subject || '').trim();
  const heading = String(req.body?.heading || '').trim() || subject;
  const preview = String(req.body?.preview || '').trim();
  const message = normalizeMultilineText(req.body?.message);
  const ctaLabel = String(req.body?.ctaLabel || '').trim();
  const ctaUrl = String(req.body?.ctaUrl || '').trim();
  const footerNote = String(req.body?.footerNote || '').trim();
  const userIds = Array.isArray(req.body?.userIds) ? req.body.userIds : [];

  if (!subject) return res.status(400).json({ message: 'Subject is required.' });
  if (!message) return res.status(400).json({ message: 'Message is required.' });
  if (subject.length > 180) return res.status(400).json({ message: 'Subject is too long.' });
  if (heading.length > 180) return res.status(400).json({ message: 'Heading is too long.' });
  if (preview.length > 220) return res.status(400).json({ message: 'Preview is too long.' });
  if (message.length > 10000) return res.status(400).json({ message: 'Message is too long.' });
  if (ctaLabel.length > 60) return res.status(400).json({ message: 'CTA label is too long.' });
  if (ctaUrl && !/^https?:\/\//i.test(ctaUrl)) {
    return res.status(400).json({ message: 'CTA URL must start with http:// or https://.' });
  }

  const recipients = await resolveMailRecipients({ audience, userIds });
  if (!recipients.length) {
    return res.status(400).json({ message: 'No recipients found for this audience.' });
  }

  const subjectLine = subject;
  const { sent, failed } = await sendAdminBroadcastToRecipients(recipients, (recipient) => {
    const payload = buildAdminBroadcastEmail({
      heading,
      preview,
      message,
      ctaLabel,
      ctaUrl,
      footerNote,
      recipientName: recipient.name || recipient.email
    });
    return {
      subject: subjectLine,
      ...payload
    };
  });

  if (!sent.length && failed.length) {
    return res.status(502).json({
      message: `Email could not be sent. ${failed.length} recipient${failed.length === 1 ? '' : 's'} failed.`,
      success: false,
      sent: 0,
      failed: failed.length,
      failures: failed.slice(0, 10)
    });
  }

  res.json({
    success: true,
    message: failed.length
      ? `Email sent to ${sent.length} recipient${sent.length === 1 ? '' : 's'}. ${failed.length} failed and can be retried.`
      : `Email sent to ${sent.length} recipient${sent.length === 1 ? '' : 's'}.`,
    sent: sent.length,
    failed: failed.length,
    failures: failed.slice(0, 10),
    audience,
    chunkSize: MAIL_SEND_CHUNK_SIZE
  });
}));

// ============== LOGS ==============

router.get('/logs', asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;
  const q = {};
  if (req.user.role !== 'super_admin') {
    const team = await User.find({ $or: [{ _id: req.user._id }, { tenantAdminId: req.user._id }] }, { _id: 1 }).lean();
    const ids = team.map((user) => user._id);
    q.$or = [
      { triggeredByUser: { $in: ids } },
      { userId: { $in: ids } }
    ];
  }
  const [items, total] = await Promise.all([
    FetchLog.find(q).sort({ startedAt: -1 }).skip(skip).limit(limit).populate('triggeredByUser', 'name email role').lean(),
    FetchLog.countDocuments(q)
  ]);
  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
}));

router.delete('/logs/cleanup', asyncHandler(async (req, res) => {
  const days = Math.max(parseInt(req.body?.days ?? req.query.days, 10) || 0, 1);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const q = { startedAt: { $lt: cutoff } };

  if (req.user.role !== 'super_admin') {
    const team = await User.find({ $or: [{ _id: req.user._id }, { tenantAdminId: req.user._id }] }, { _id: 1 }).lean();
    const ids = team.map((user) => user._id);
    q.$or = [
      { triggeredByUser: { $in: ids } },
      { userId: { $in: ids } }
    ];
  }

  const result = await FetchLog.deleteMany(q);
  res.json({ deleted: result.deletedCount || 0, days, cutoff });
}));

router.get('/logs/:id', asyncHandler(async (req, res) => {
  const item = await FetchLog.findById(req.params.id).populate('triggeredByUser', 'name email').lean();
  if (!item) return res.status(404).json({ message: 'Not found' });
  if (req.user.role !== 'super_admin') {
    const team = await User.find({ $or: [{ _id: req.user._id }, { tenantAdminId: req.user._id }] }, { _id: 1 }).lean();
    const ids = new Set(team.map((user) => String(user._id)));
    if (!ids.has(String(item.triggeredByUser || '')) && !ids.has(String(item.userId || ''))) {
      return res.status(404).json({ message: 'Not found' });
    }
  }
  res.json({ item });
}));

// ============== USER MANAGEMENT ==============

router.get('/users', asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;
  const q = managedUsersQuery(req.user);

  if (req.user.role !== 'super_admin') {
    q.role = { $ne: 'super_admin' };
  }
  if (req.query.role) {
    if (!['user', 'admin', 'super_admin'].includes(req.query.role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    if (req.query.role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.json({ items: [], page, limit, total: 0, pages: 0 });
    }
    q.role = req.query.role;
  }
  if (req.query.q) q.email = { $regex: escapeRegex(req.query.q), $options: 'i' };
  const [rawItems, total] = await Promise.all([
    User.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(q)
  ]);
  const onlineSince = Date.now() - ONLINE_WINDOW_MS;
  const items = rawItems.map((user) => ({
    ...user,
    isOnline: Boolean(user.lastSeenAt && new Date(user.lastSeenAt).getTime() >= onlineSince)
  }));
  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
}));

router.post('/users', asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    company = '',
    designation = '',
    role = 'user',
    isActive = true,
    memberLimit,
    subscriptionPlan,
    access,
    limits
  } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'name, email and password are required' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'Invalid email format. Please check for typos like multiple domain suffixes (e.g., .com.com)' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }
  if (!MANAGED_ROLES.includes(role)) {
    return res.status(400).json({ message: 'Only user and admin accounts can be created here' });
  }
  if (req.user.role !== 'super_admin' && role !== 'user') {
    return res.status(403).json({ message: 'Admins can only add members. Ask the super admin to create another admin.' });
  }

  if (req.user.role !== 'super_admin') {
    if (req.user.access?.canCreateMembers === false) {
      return res.status(403).json({ message: 'Member creation is disabled for this account.' });
    }
    const limit = Number(req.user.memberLimit ?? DEFAULT_MEMBER_LIMIT);
    const memberCount = await User.countDocuments({ tenantAdminId: req.user._id, role: 'user' });
    if (memberCount >= limit) {
      return res.status(402).json(limitReachedPayload({
        limitType: 'memberSeats',
        used: memberCount,
        limit,
        message: `Member limit reached. Your current plan allows ${limit} members. Upgrade to add more.`
      }));
    }
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const exists = await User.findOne({ email: normalizedEmail }).withDeleted();
  if (exists) return res.status(409).json({ message: 'Email already registered' });

  // Determine plan and apply defaults for super admin account creation
  let resolvedPlan = 'free';
  let resolvedDefaults = await getPlanDefaults('free');
  if (req.user.role === 'super_admin' && subscriptionPlan) {
    resolvedPlan = subscriptionPlan;
    resolvedDefaults = await getPlanDefaults(subscriptionPlan);
  }

  const user = await User.create({
    name,
    email: normalizedEmail,
    password,
    company: req.user.role === 'super_admin' ? company : (req.user.company || company),
    designation,
    role,
    createdBy: req.user._id,
    tenantAdminId: req.user.role === 'super_admin' ? undefined : req.user._id,
    memberLimit: req.user.role === 'super_admin' && role === 'admin'
      ? Number(memberLimit || resolvedDefaults.memberLimit)
      : DEFAULT_MEMBER_LIMIT,
    subscriptionPlan: resolvedPlan,
    access: req.user.role === 'super_admin'
      ? {
          ...resolvedDefaults.access,
          ...normalizeAccessPatch(access, { allowMemberManagement: role === 'admin' })
        }
      : {
          ...DEFAULT_MEMBER_ACCESS,
          ...normalizeAccessPatch(access)
        },
    limits: req.user.role === 'super_admin' ? { ...resolvedDefaults.limits, ...(limits || {}) } : undefined,
    isActive: Boolean(isActive)
  });

  if (role === 'admin' && !user.tenantAdminId) {
    user.tenantAdminId = user._id;
    await user.save();
  }

  res.status(201).json({ user: user.toPublicJSON() });
}));

router.patch('/users/:id', asyncHandler(async (req, res) => {
  const allowed = ['name', 'role', 'isActive', 'company', 'designation'];
  if (req.user.role === 'super_admin') {
    allowed.push('memberLimit', 'subscriptionPlan', 'access', 'limits');
  } else {
    allowed.push('access');
  }
  const update = {};
  for (const k of allowed) if (k in req.body) update[k] = req.body[k];
  if (update.role && !MANAGED_ROLES.includes(update.role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }
  if (req.user.role !== 'super_admin' && update.role && update.role !== 'user') {
    return res.status(403).json({ message: 'Admins cannot promote members to admin.' });
  }

  const target = await User.findById(req.params.id);
  if (!target || !canSeeUser(req.user, target)) return res.status(404).json({ message: 'Not found' });
  if (target.role === 'super_admin') {
    return res.status(403).json({ message: 'Super admin is managed by the developer' });
  }
  if (req.user.role !== 'super_admin' && String(target._id) === String(req.user._id) && update.role) {
    return res.status(403).json({ message: 'Admins cannot change their own role.' });
  }
  if (req.user.role !== 'super_admin' && update.access && target.role !== 'user') {
    return res.status(403).json({ message: 'Admins can only change access for their members.' });
  }
  if (req.user.role !== 'super_admin' && String(target._id) === String(req.user._id) && update.access) {
    return res.status(403).json({ message: 'Admins cannot change their own access.' });
  }

  const {
    access: accessPatch,
    limits: limitsPatch,
    ...directUpdate
  } = update;

  Object.assign(target, directUpdate);

  // When super admin changes the plan, auto-apply plan defaults (unless explicit overrides provided)
  if (req.user.role === 'super_admin' && update.subscriptionPlan) {
    const planDef = await getPlanDefaults(update.subscriptionPlan);
    if (!('memberLimit' in req.body)) target.memberLimit = planDef.memberLimit;
    if (!('limits' in req.body)) {
      target.limits = { ...(target.limits?.toObject?.() || target.limits || {}), ...planDef.limits };
    }
    if (!('access' in req.body)) {
      target.access = { ...(target.access?.toObject?.() || target.access || {}), ...planDef.access };
    }
  }

  if (accessPatch) {
    target.access = {
      ...(target.access?.toObject?.() || target.access || {}),
      ...normalizeAccessPatch(accessPatch, {
        allowMemberManagement: req.user.role === 'super_admin' && target.role === 'admin'
      })
    };
  }
  if (limitsPatch) target.limits = { ...(target.limits?.toObject?.() || target.limits || {}), ...limitsPatch };
  if (target.role === 'admin' && !target.tenantAdminId) target.tenantAdminId = target._id;
  const u = await target.save();
  if (!u) return res.status(404).json({ message: 'Not found' });
  publishTenantEvent(tenantKeyFor(u), 'auth', {
    scope: 'access',
    action: 'user-updated',
    userId: String(u._id)
  });
  res.json({ user: u.toPublicJSON() });
}));

router.delete('/users/:id', asyncHandler(async (req, res) => {
  if (String(req.user._id) === String(req.params.id)) {
    return res.status(400).json({ message: 'Cannot delete your own account' });
  }
  const target = await User.findById(req.params.id);
  if (!target || !canSeeUser(req.user, target)) return res.status(404).json({ message: 'Not found' });
  if (target.role === 'super_admin') {
    return res.status(403).json({ message: 'Super admin is managed by the developer' });
  }
  const result = await softDeleteUser(target, req.user, { reason: 'deleted_by_super_admin' });
  res.json({
    message: result.scope === 'tenant'
      ? `Tenant scheduled for deletion. Related data will be cleaned in the background after ${graceDays()} day(s).`
      : `User scheduled for deletion. Related data will be cleaned in the background after ${graceDays()} day(s).`,
    id: req.params.id,
    scope: result.scope,
    purgeAfter: result.purgeAfter,
    deletedUsers: result.deletedUsers
  });
}));

router.post('/users/deletion-cleanup/run', requireRole('super_admin'), asyncHandler(async (_req, res) => {
  const result = await cleanupDeletedUsers();
  res.json({
    ok: true,
    processedBatches: result.processedBatches,
    results: result.results
  });
}));

// ============== SESSION MANAGEMENT (SUPER ADMIN) ==============

router.get('/sessions', requireRole('super_admin'), asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.userId) q.userId = req.query.userId;
  if (req.query.status === 'active') {
    q.revokedAt = null;
    q.expiresAt = { $gt: new Date() };
  } else if (req.query.status === 'revoked') {
    q.revokedAt = { $ne: null };
  }

  const items = await UserSession.find(q)
    .sort({ lastActiveAt: -1, createdAt: -1 })
    .limit(Math.min(Number(req.query.limit || 200), 500))
    .populate('userId', 'name email company role subscriptionPlan isActive')
    .populate('revokedBy', 'name email role')
    .lean();

  res.json({
    items: items.map((item) => ({
      ...item,
      isActive: !item.revokedAt && new Date(item.expiresAt).getTime() > Date.now()
    }))
  });
}));

router.post('/sessions/:id/revoke', requireRole('super_admin'), asyncHandler(async (req, res) => {
  const session = await UserSession.findById(req.params.id);
  if (!session) return res.status(404).json({ message: 'Session not found' });

  session.revokedAt = new Date();
  session.revokedBy = req.user._id;
  session.revokeReason = req.body?.reason || 'revoked_by_super_admin';
  await session.save();

  const latestActive = await UserSession.findOne({
    userId: session.userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() }
  }).sort({ lastActiveAt: -1 }).select('lastActiveAt').lean();

  await User.updateOne(
    { _id: session.userId },
    { $set: { lastSeenAt: latestActive?.lastActiveAt || null } }
  );

  res.json({ message: 'Session revoked' });
}));

router.post('/users/:id/sessions/revoke-all', requireRole('super_admin'), asyncHandler(async (req, res) => {
  await UserSession.updateMany(
    {
      userId: req.params.id,
      revokedAt: null,
      expiresAt: { $gt: new Date() }
    },
    {
      $set: {
        revokedAt: new Date(),
        revokedBy: req.user._id,
        revokeReason: req.body?.reason || 'revoke_all_by_super_admin'
      }
    }
  );

  await User.updateOne({ _id: req.params.id }, { $set: { lastSeenAt: null } });
  res.json({ message: 'All user sessions revoked' });
}));

// ============== DYNAMIC PLAN CONFIGURATIONS ==============

// GET /api/admin/plans
router.get('/plans', asyncHandler(async (req, res) => {
  const items = await Plan.find({}).sort({ planId: 1 }).lean();
  res.json({ items });
}));

// PUT /api/admin/plans (Super Admin Only)
router.put('/plans', requireRole('super_admin'), asyncHandler(async (req, res) => {
  const { configs } = req.body || {};
  if (!configs || typeof configs !== 'object') {
    return res.status(400).json({ message: 'configs object is required' });
  }

  const results = [];
  for (const [planId, config] of Object.entries(configs)) {
    const updated = await Plan.findOneAndUpdate(
      { planId },
      {
        $set: {
          label: config.label || planId.toUpperCase(),
          price: config.price || '',
          priceNote: config.priceNote || '',
          memberLimit: Number(config.memberLimit ?? 1),
          limits: {
            fetchesPerMonth: Number(config.limits?.fetchesPerMonth ?? 0),
            storageItems: Number(config.limits?.storageItems ?? 0),
            tokenBudgetMonthly: Number(config.limits?.tokenBudgetMonthly ?? 0),
            blogGenerationsMonthly: Number(config.limits?.blogGenerationsMonthly ?? 0),
            socialPostsMonthly: Number(config.limits?.socialPostsMonthly ?? 0)
          },
          access: {
            canFetch: Boolean(config.access?.canFetch ?? true),
            canCreateMembers: Boolean(config.access?.canCreateMembers ?? false),
            canUseContentRepository: Boolean(config.access?.canUseContentRepository ?? true),
            canUseBlogStudio: Boolean(config.access?.canUseBlogStudio ?? false),
            canUseSavedSearches: Boolean(config.access?.canUseSavedSearches ?? false),
            canUseScheduler: Boolean(config.access?.canUseScheduler ?? false)
          }
        }
      },
      { new: true, upsert: true }
    );
    results.push(updated);

    // Propagate changes to all users on this plan
    await User.updateMany(
      { subscriptionPlan: planId },
      {
        $set: {
          memberLimit: updated.memberLimit,
          limits: updated.limits,
          access: updated.access
        }
      }
    );
  }

  res.json({ success: true, items: results });
}));

// POST /api/admin/usage/reset
router.post('/usage/reset', requireRole('super_admin'), asyncHandler(async (req, res) => {
  const scope = req.body?.scope === 'all_time' ? 'all_time' : 'current_month';
  const resetAt = new Date();

  let userQuery;
  if (req.user.role === 'super_admin' && req.body?.userId && mongoose.Types.ObjectId.isValid(req.body.userId)) {
    const target = await User.findById(req.body.userId).select('_id role tenantAdminId').lean();
    if (!target) return res.status(404).json({ message: 'Target user not found' });
    const ownerId = target.role === 'admin' ? target._id : (target.tenantAdminId || target._id);
    userQuery = { $or: [{ _id: ownerId }, { tenantAdminId: ownerId }] };
  } else {
    userQuery = req.user.role === 'super_admin'
      ? { role: { $in: ['admin', 'user'] } }
      : { $or: [{ _id: req.user._id }, { tenantAdminId: req.user._id }] };
  }

  const users = await User.find(userQuery).select('_id').lean();
  const userIds = users.map((user) => user._id);
  await User.updateMany({ _id: { $in: userIds } }, { $set: { usageResetAt: resetAt } });

  res.json({
    success: true,
    scope,
    users: userIds.length,
    resetAt,
    message: 'Usage counters reset successfully. Existing articles, blogs, and social posts were kept.'
  });
}));

module.exports = router;
