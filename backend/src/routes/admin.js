const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const Article = require('../models/Article');
const FetchLog = require('../models/FetchLog');
const User = require('../models/User');
const Plan = require('../models/Plan');
const BlogPost = require('../models/BlogPost');
const SocialPost = require('../models/SocialPost');
const { protect, requireRole } = require('../middleware/auth');
const orchestrator = require('../services/orchestrator');
const { buildN8nPayload } = require('../services/queryBuilder');
const { getSystemSettings, saveSystemSettings } = require('../services/systemSettings');

const router = express.Router();

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
const ACCESS_KEYS = ['canFetch', 'canCreateMembers', 'canUseBlogStudio', 'canUseSavedSearches', 'canUseScheduler'];
const DEFAULT_MEMBER_ACCESS = {
  canFetch: true,
  canCreateMembers: false,
  canUseBlogStudio: false,
  canUseSavedSearches: true,
  canUseScheduler: false
};

// Per-plan defaults loaded dynamically from database
async function getPlanDefaults(planId) {
  const plan = await Plan.findOne({ planId });
  if (plan) return plan.toObject();
  return {
    memberLimit: 1,
    limits: { fetchesPerMonth: 10, storageItems: 100, tokenBudgetMonthly: 50000 },
    access: { canFetch: true, canCreateMembers: false, canUseBlogStudio: false, canUseSavedSearches: false, canUseScheduler: false }
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

function normalizeAccessPatch(access, { allowMemberManagement = false } = {}) {
  if (!access || typeof access !== 'object') return {};
  return ACCESS_KEYS.reduce((out, key) => {
    if (key === 'canCreateMembers' && !allowMemberManagement) return out;
    if (key in access) out[key] = Boolean(access[key]);
    return out;
  }, {});
}

function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

// Every route here requires an operational admin.
router.use(protect, requireRole(...ADMIN_ROLES));

// ============== ARTICLE MANAGEMENT ==============

// PATCH /api/admin/articles/:id/publish
router.patch('/articles/:id/publish', asyncHandler(async (req, res) => {
  const item = await Article.findByIdAndUpdate(
    req.params.id,
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
  res.json({ item });
}));

// PATCH /api/admin/articles/:id/unpublish
router.patch('/articles/:id/unpublish', asyncHandler(async (req, res) => {
  const item = await Article.findByIdAndUpdate(
    req.params.id,
    {
      $set: {
        isPublished: false
      }
    },
    { new: true }
  );
  if (!item) return res.status(404).json({ message: 'Not found' });
  res.json({ item });
}));

// POST /api/admin/articles/bulk-publish    body: { ids: [...] }
router.post('/articles/bulk-publish', asyncHandler(async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: 'ids[] required' });
  const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (!validIds.length) return res.status(400).json({ message: 'No valid ids provided' });

  const result = await Article.updateMany(
    { _id: { $in: validIds } },
    { $set: { isPublished: true, publishedBy: req.user._id, publishedAtAdmin: new Date() } }
  );
  res.json({ matched: result.matchedCount, modified: result.modifiedCount });
}));

// POST /api/admin/articles/bulk-unpublish    body: { ids: [...] }
router.post('/articles/bulk-unpublish', asyncHandler(async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: 'ids[] required' });
  const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (!validIds.length) return res.status(400).json({ message: 'No valid ids provided' });

  const result = await Article.updateMany(
    { _id: { $in: validIds } },
    { $set: { isPublished: false } }
  );
  res.json({ matched: result.matchedCount, modified: result.modifiedCount });
}));

// DELETE /api/admin/articles/:id
router.delete('/articles/:id', asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid article ID' });
  }
  const item = await Article.findByIdAndDelete(req.params.id);
  if (!item) return res.status(404).json({ message: 'Not found' });
  res.json({ message: 'Deleted', id: req.params.id });
}));

// POST /api/admin/articles/bulk-delete    body: { ids: [...] }
router.post('/articles/bulk-delete', asyncHandler(async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: 'ids[] required' });
  const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (!validIds.length) return res.status(400).json({ message: 'No valid ids provided' });

  const result = await Article.deleteMany({ _id: { $in: validIds } });
  res.json({ deleted: result.deletedCount });
}));

// PATCH /api/admin/articles/:id  (edit title, summary, category, etc.)
router.patch('/articles/:id', asyncHandler(async (req, res) => {
  const allowed = ['title', 'summary', 'category', 'subcategory', 'tags', 'country', 'aiSummary'];
  const update = {};
  for (const k of allowed) if (k in req.body) update[k] = req.body[k];
  const item = await Article.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!item) return res.status(404).json({ message: 'Not found' });
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
router.post('/fetch', asyncHandler(async (req, res) => {
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
router.post('/n8n/run', asyncHandler(async (req, res) => {
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
  const monthStart = startOfMonth();
  const teamQuery = req.user.role === 'super_admin'
    ? { role: { $in: ['admin', 'user'] } }
    : { $or: [{ _id: req.user._id }, { tenantAdminId: req.user._id }] };
  const teamUsers = await User.find(teamQuery)
    .select('name email role company tenantAdminId memberLimit subscriptionPlan limits access isActive lastLoginAt lastSeenAt')
    .lean();
  const userIds = teamUsers.map((user) => user._id);
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
      { $match: { $or: [{ userId: { $in: userIds } }, { triggeredByUser: { $in: userIds } }] } },
      { $group: { _id: { $ifNull: ['$userId', '$triggeredByUser'] }, runs: { $sum: 1 }, inserted: { $sum: '$totalInserted' }, fetched: { $sum: '$totalFetched' }, errors: { $sum: '$totalErrors' }, failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } } } }
    ]),
    FetchLog.aggregate([
      { $match: { startedAt: { $gte: monthStart }, $or: [{ userId: { $in: userIds } }, { triggeredByUser: { $in: userIds } }] } },
      { $group: { _id: { $ifNull: ['$userId', '$triggeredByUser'] }, runs: { $sum: 1 }, inserted: { $sum: '$totalInserted' }, fetched: { $sum: '$totalFetched' }, errors: { $sum: '$totalErrors' }, failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } } } }
    ]),
    Article.aggregate([{ $match: { userId: { $in: userIds } } }, { $group: { _id: '$userId', count: { $sum: 1 } } }]),
    Article.aggregate([{ $match: { userId: { $in: userIds }, fetchedAt: { $gte: monthStart } } }, { $group: { _id: '$userId', count: { $sum: 1 } } }]),
    BlogPost.aggregate([{ $match: { createdBy: { $in: userIds } } }, { $group: { _id: '$createdBy', count: { $sum: 1 } } }]),
    BlogPost.aggregate([{ $match: { createdBy: { $in: userIds }, createdAt: { $gte: monthStart } } }, { $group: { _id: '$createdBy', count: { $sum: 1 } } }]),
    SocialPost.aggregate([{ $match: { createdBy: { $in: userIds } } }, { $group: { _id: '$createdBy', count: { $sum: 1 } } }]),
    SocialPost.aggregate([{ $match: { createdBy: { $in: userIds }, createdAt: { $gte: monthStart } } }, { $group: { _id: '$createdBy', count: { $sum: 1 } } }]),
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
    memberLimit: Number(adminUser?.memberLimit ?? req.user.memberLimit ?? 0)
  };

  res.json({
    monthStart,
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
      { $match: { startedAt: { $gte: monthStart } } },
      {
        $group: {
          _id: '$userId',
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
      .populate('userId', 'name email company subscriptionPlan')
      .populate('triggeredByUser', 'name email company subscriptionPlan')
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

// ============== SYSTEM SETTINGS ==============

router.get('/settings', requireRole('super_admin'), asyncHandler(async (_req, res) => {
  const settings = await getSystemSettings({ useCache: false });
  res.json({ settings });
}));

router.put('/settings', requireRole('super_admin'), asyncHandler(async (req, res) => {
  const allowed = ['aiModel', 'aiSummary', 'aiCategory', 'maintenanceMode'];
  const patch = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
      patch[key] = req.body[key];
    }
  }
  const settings = await saveSystemSettings(patch);
  res.json({ settings });
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
    FetchLog.find(q).sort({ startedAt: -1 }).skip(skip).limit(limit).populate('triggeredByUser', 'name email').lean(),
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
      return res.status(402).json({
        message: `Member limit reached. Your current plan allows ${limit} members. Upgrade to add more.`
      });
    }
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const exists = await User.findOne({ email: normalizedEmail });
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
  await target.deleteOne();
  res.json({ message: 'Deleted', id: req.params.id });
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
            tokenBudgetMonthly: Number(config.limits?.tokenBudgetMonthly ?? 0)
          },
          access: {
            canFetch: Boolean(config.access?.canFetch ?? true),
            canCreateMembers: Boolean(config.access?.canCreateMembers ?? false),
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

module.exports = router;
