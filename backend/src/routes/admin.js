const express = require('express');
const axios = require('axios');
const Article = require('../models/Article');
const FetchLog = require('../models/FetchLog');
const User = require('../models/User');
const { protect, requireRole } = require('../middleware/auth');
const orchestrator = require('../services/orchestrator');

const router = express.Router();

// Helper to catch async route errors and pass them to next()
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const ADMIN_ROLES = ['admin', 'super_admin'];
const MANAGED_ROLES = ['user', 'admin'];
const ONLINE_WINDOW_MS = 90 * 1000;
const ARTICLE_RANK_SORT = { effectiveDay: -1, relevanceScore: -1, effectiveDate: -1 };

function canSeeUser(actor, target) {
  if (!target) return false;
  return actor.role === 'super_admin' || target.role !== 'super_admin';
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

  const result = await Article.updateMany(
    { _id: { $in: ids } },
    { $set: { isPublished: true, publishedBy: req.user._id, publishedAtAdmin: new Date() } }
  );
  res.json({ matched: result.matchedCount, modified: result.modifiedCount });
}));

// POST /api/admin/articles/bulk-unpublish    body: { ids: [...] }
router.post('/articles/bulk-unpublish', asyncHandler(async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: 'ids[] required' });
  const result = await Article.updateMany(
    { _id: { $in: ids } },
    { $set: { isPublished: false } }
  );
  res.json({ matched: result.matchedCount, modified: result.modifiedCount });
}));

// DELETE /api/admin/articles/:id
router.delete('/articles/:id', asyncHandler(async (req, res) => {
  const item = await Article.findByIdAndDelete(req.params.id);
  if (!item) return res.status(404).json({ message: 'Not found' });
  res.json({ message: 'Deleted', id: req.params.id });
}));

// POST /api/admin/articles/bulk-delete    body: { ids: [...] }
router.post('/articles/bulk-delete', asyncHandler(async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: 'ids[] required' });
  const result = await Article.deleteMany({ _id: { $in: ids } });
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
const N8N_TYPES = ['news', 'govt', 'competitor', 'evergreen'];
const n8nRunning = new Set();

function n8nEnvKey(type) {
  return `N8N_WEBHOOK_URL_${String(type || '').toUpperCase()}`;
}

function getN8nWebhookUrl(type) {
  const normalized = N8N_TYPES.includes(type) ? type : 'news';
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

async function runN8nWorkflow({ triggeredByUser, type = 'news' }) {
  const webhookUrl = getN8nWebhookUrl(type);
  if (!webhookUrl) {
    throw new Error(`${n8nEnvKey(type)} is not configured`);
  }

  const startedAt = new Date();
  const log = await FetchLog.create({
    triggeredBy: 'n8n',
    triggeredByUser,
    status: 'running',
    startedAt,
    notes: `n8n ${type} workflow started from Admin Panel`
  });

  const callbackUrl = process.env.N8N_CALLBACK_URL || '';
  const callbackSecret = process.env.N8N_CALLBACK_SECRET || '';

  try {
    const response = await axios.post(
      webhookUrl,
      {
        trigger: 'manual',
        type,
        logId: String(log._id),
        startedAt: startedAt.toISOString(),
        callbackUrl,
        callbackSecret
      },
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
          sourceName: `n8n ${type} workflow`,
          type,
          attempted: Number(body.totalFetched || body.fetched || 0),
          fetched: Number(body.totalFetched || body.fetched || 0),
          inserted: Number(body.totalInserted || body.inserted || 0),
          duplicates: Number(body.totalDuplicates || body.duplicates || 0),
          errors: totalErrors,
          errorMessages: body.errorMessage ? [body.errorMessage] : []
        }];
    finishedLog.notes = body.notes || `n8n ${type} workflow completed`;
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
          sourceName: `n8n ${type} workflow`,
          type,
          attempted: 1,
          fetched: 0,
          inserted: 0,
          duplicates: 0,
          errors: 1,
          errorMessages: [err.message]
        }],
        notes: `n8n ${type} workflow trigger failed`
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
  const type = N8N_TYPES.includes(req.body?.type) ? req.body.type : 'news';
  if (n8nRunning.has(type)) {
    return res.status(409).json({ message: `The n8n ${type} workflow is already in progress` });
  }
  if (!getN8nWebhookUrl(type)) {
    return res.status(400).json({ message: `${n8nEnvKey(type)} is not configured` });
  }

  n8nRunning.add(type);
  res.json({ message: `n8n ${type} workflow started`, triggeredBy: 'manual', type, startedAt: new Date() });

  try {
    await runN8nWorkflow({ triggeredByUser: req.user._id, type });
  } catch (err) {
    console.error(`[admin] n8n ${type} workflow failed:`, err);
  } finally {
    n8nRunning.delete(type);
  }
}));

// GET /api/admin/n8n/status
router.get('/n8n/status', (_req, res) => {
  res.json(getN8nStatus());
});

// ============== STATS ==============

router.get('/stats', asyncHandler(async (_req, res) => {
  const [total, published, unpublished, byType, byCategory, recent] = await Promise.all([
    Article.countDocuments({}),
    Article.countDocuments({ isPublished: true }),
    Article.countDocuments({ isPublished: false }),
    Article.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]),
    Article.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]),
    Article.aggregate([
      {
        $addFields: {
          effectiveDate: {
            $convert: {
              input: { $ifNull: ['$fetchedAt', '$publishedAt'] },
              to: 'date',
              onError: new Date(0),
              onNull: new Date(0)
            }
          }
        }
      },
      {
        $addFields: {
          effectiveDay: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$effectiveDate',
              timezone: 'Asia/Kolkata'
            }
          }
        }
      },
      { $sort: ARTICLE_RANK_SORT },
      { $limit: 5 },
      { $project: { title: 1, type: 1, source: 1, fetchedAt: 1, publishedAt: 1, effectiveDate: 1, relevanceScore: 1, isPublished: 1 } }
    ])
  ]);
  res.json({
    counts: { total, published, unpublished },
    byType: Object.fromEntries(byType.map((x) => [x._id, x.count])),
    byCategory: byCategory.map((x) => ({ category: x._id, count: x.count })),
    recent
  });
}));

// ============== LOGS ==============

router.get('/logs', asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    FetchLog.find({}).sort({ startedAt: -1 }).skip(skip).limit(limit).populate('triggeredByUser', 'name email').lean(),
    FetchLog.countDocuments({})
  ]);
  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
}));

router.get('/logs/:id', asyncHandler(async (req, res) => {
  const item = await FetchLog.findById(req.params.id).populate('triggeredByUser', 'name email').lean();
  if (!item) return res.status(404).json({ message: 'Not found' });
  res.json({ item });
}));

// ============== USER MANAGEMENT ==============

router.get('/users', asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;
  const q = {};

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
  if (req.query.q) q.email = { $regex: req.query.q, $options: 'i' };
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
  const { name, email, password, company = '', designation = '', role = 'user', isActive = true } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'name, email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }
  if (!MANAGED_ROLES.includes(role)) {
    return res.status(400).json({ message: 'Only user and admin accounts can be created here' });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const exists = await User.findOne({ email: normalizedEmail });
  if (exists) return res.status(409).json({ message: 'Email already registered' });

  const user = await User.create({
    name,
    email: normalizedEmail,
    password,
    company,
    designation,
    role,
    isActive: Boolean(isActive)
  });
  res.status(201).json({ user: user.toPublicJSON() });
}));

router.patch('/users/:id', asyncHandler(async (req, res) => {
  const allowed = ['name', 'role', 'isActive', 'company', 'designation'];
  const update = {};
  for (const k of allowed) if (k in req.body) update[k] = req.body[k];
  if (update.role && !MANAGED_ROLES.includes(update.role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }

  const target = await User.findById(req.params.id);
  if (!target || !canSeeUser(req.user, target)) return res.status(404).json({ message: 'Not found' });
  if (target.role === 'super_admin') {
    return res.status(403).json({ message: 'Super admin is managed by the developer' });
  }

  Object.assign(target, update);
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

module.exports = router;
