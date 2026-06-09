const express = require('express');
const Article = require('../models/Article');
const { protect } = require('../middleware/auth');
const { asTree } = require('../config/categories');
const { NEWS_SOURCES, GOVT_SOURCES, COMPETITOR_SOURCES, EVERGREEN_TOPICS } = require('../config/sources');

const router = express.Router();
const isAdminUser = (user) => ['admin', 'super_admin'].includes(user.role);
const DEFAULT_ARTICLE_SORT = { relevanceScore: -1, effectiveDate: -1, fetchedAt: -1 };

function withEffectiveDateSort(match, extraStages = []) {
  return [
    { $match: match },
    { $addFields: { effectiveDate: { $ifNull: ['$publishedAt', '$fetchedAt'] } } },
    { $sort: DEFAULT_ARTICLE_SORT },
    ...extraStages
  ];
}

// Helper to catch async route errors and pass them to next()
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Build a Mongo query from URL query params.
 *
 *  type        - news | govt | competitor | evergreen | comma-separated
 *  category    - main category
 *  subcategory - sub-category
 *  source      - sourceId
 *  q           - full-text search keyword (title)
 *  from / to   - ISO date strings; filters by fetchedAt
 *  publishedOnly - 'true' to return only isPublished=true
 */
function buildQuery(req, opts = {}) {
  const q = {};

  // Visibility rule:
  //   - Non-admins ALWAYS see only published.
  //   - Admin can opt-in to published-only via ?publishedOnly=true.
  if (opts.forUser) {
    q.isPublished = true;
  } else if (req.query.publishedOnly === 'true') {
    q.isPublished = true;
  } else if (req.query.publishedOnly === 'false') {
    q.isPublished = false;
  }

  if (req.query.type) {
    const types = req.query.type.split(',').map((s) => s.trim()).filter(Boolean);
    if (types.length === 1) q.type = types[0];
    else if (types.length > 1) q.type = { $in: types };
  }

  if (req.query.category)    q.category = req.query.category;
  if (req.query.subcategory) q.subcategory = req.query.subcategory;
  if (req.query.source)      q.sourceId = req.query.source;
  if (req.query.country)     q.country = req.query.country;

  if (req.query.from || req.query.to) {
    q.fetchedAt = {};
    if (req.query.from) q.fetchedAt.$gte = new Date(req.query.from);
    if (req.query.to)   q.fetchedAt.$lte = new Date(req.query.to);
  }

  if (req.query.q) {
    q.title = { $regex: req.query.q.trim(), $options: 'i' };
  }

  return q;
}

// ---------- META endpoints (filter dropdowns) ----------
router.get('/meta/filters', protect, (_req, res) => {
  res.json({
    categories: asTree(),
    sources: {
      news: NEWS_SOURCES.map((s) => ({ id: s.id, name: s.name })),
      govt: GOVT_SOURCES.map((s) => ({ id: s.id, name: s.name })),
      competitor: COMPETITOR_SOURCES.map((s) => ({ id: s.id, name: s.name })),
      evergreen: EVERGREEN_TOPICS.map((s) => ({ id: s.id, name: s.topic }))
    },
    types: [
      { id: 'news',       label: 'News' },
      { id: 'govt',       label: 'Government Updates' },
      { id: 'competitor', label: 'Competitors' },
      { id: 'evergreen',  label: 'Evergreen' }
    ]
  });
});

// ---------- DASHBOARD endpoint ----------
// GET /api/articles/dashboard?limit=20&from=...&to=...&category=...
// Returns 4 buckets in one round-trip.
router.get('/dashboard', protect, asyncHandler(async (req, res) => {
  const baseQuery = buildQuery(req, { forUser: !isAdminUser(req.user) || req.query.publishedOnly !== 'false' });
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : null;

  const types = ['news', 'govt', 'competitor', 'evergreen'];
  const results = await Promise.all(
    types.map((t) => {
      const pipeline = withEffectiveDateSort({ ...baseQuery, type: t });
      if (limit && limit > 0) {
        pipeline.push({ $limit: limit });
      }
      return Article.aggregate(pipeline);
    })
  );

  res.json({
    news: results[0],
    govt: results[1],
    competitor: results[2],
    evergreen: results[3]
  });
}));

// GET /api/articles/velocity
// Returns real signal counts for the last 7 days using publishedAt when present, otherwise fetchedAt.
router.get('/velocity', protect, asyncHandler(async (req, res) => {
  const baseQuery = buildQuery(req, { forUser: !isAdminUser(req.user) });
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);

  const rows = await Article.aggregate([
    { $match: baseQuery },
    { $addFields: { effectiveDate: { $ifNull: ['$publishedAt', '$fetchedAt'] } } },
    { $match: { effectiveDate: { $gte: start, $lte: now } } },
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$effectiveDate',
            timezone: 'Asia/Singapore'
          }
        },
        count: { $sum: 1 }
      }
    }
  ]);

  const counts = Object.fromEntries(rows.map((row) => [row._id, row.count]));
  const days = Array.from({ length: 7 }).map((_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const key = date.toISOString().slice(0, 10);
    return {
      date: key,
      day: date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
      count: counts[key] || 0
    };
  });

  res.json({ days });
}));

// ---------- LIST endpoint (paginated) ----------
// GET /api/articles?type=news&category=...&page=1&limit=20
router.get('/', protect, asyncHandler(async (req, res) => {
  // Users only see published. Admins see all unless they filter.
  const forUser = !isAdminUser(req.user);
  const q = buildQuery(req, { forUser });

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
  const skip = (page - 1) * limit;

  const sort = (req.query.sort || '').toString();
  const sortObj = {};
  if (sort) {
    for (const part of sort.split(',')) {
      if (!part) continue;
      if (part.startsWith('-')) sortObj[part.slice(1)] = -1;
      else sortObj[part] = 1;
    }
  }

  const [items, total] = await Promise.all([
    sort
      ? Article.find(q).sort(sortObj).skip(skip).limit(limit).lean()
      : Article.aggregate(withEffectiveDateSort(q, [{ $skip: skip }, { $limit: limit }])),
    Article.countDocuments(q)
  ]);

  res.json({
    items,
    page,
    limit,
    total,
    pages: Math.ceil(total / limit)
  });
}));

// ---------- SINGLE article ----------
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const item = await Article.findById(req.params.id).lean();
  if (!item) return res.status(404).json({ message: 'Not found' });

  // Users can only see published items
  if (!isAdminUser(req.user) && !item.isPublished) {
    return res.status(404).json({ message: 'Not found' });
  }
  res.json({ item });
}));

module.exports = router;
