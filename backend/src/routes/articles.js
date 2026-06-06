const express = require('express');
const Article = require('../models/Article');
const { protect } = require('../middleware/auth');
const { asTree } = require('../config/categories');
const { NEWS_SOURCES, GOVT_SOURCES, COMPETITOR_SOURCES, EVERGREEN_TOPICS } = require('../config/sources');

const router = express.Router();

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
  const baseQuery = buildQuery(req, { forUser: req.user.role !== 'super_admin' || req.query.publishedOnly !== 'false' });
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : null;

  const types = ['news', 'govt', 'competitor', 'evergreen'];
  const results = await Promise.all(
    types.map((t) => {
      const q = Article.find({ ...baseQuery, type: t }).sort({ relevanceScore: -1, fetchedAt: -1 });
      if (limit && limit > 0) {
        q.limit(limit);
      }
      return q.lean();
    })
  );

  res.json({
    news: results[0],
    govt: results[1],
    competitor: results[2],
    evergreen: results[3]
  });
}));

// ---------- LIST endpoint (paginated) ----------
// GET /api/articles?type=news&category=...&page=1&limit=20
router.get('/', protect, asyncHandler(async (req, res) => {
  // Users only see published. Admins see all unless they filter.
  const forUser = req.user.role !== 'super_admin';
  const q = buildQuery(req, { forUser });

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
  const skip = (page - 1) * limit;

  const sort = (req.query.sort || '-fetchedAt').toString();
  const sortObj = {};
  for (const part of sort.split(',')) {
    if (!part) continue;
    if (part.startsWith('-')) sortObj[part.slice(1)] = -1;
    else sortObj[part] = 1;
  }

  const [items, total] = await Promise.all([
    Article.find(q).sort(sortObj).skip(skip).limit(limit).lean(),
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
  if (req.user.role !== 'super_admin' && !item.isPublished) {
    return res.status(404).json({ message: 'Not found' });
  }
  res.json({ item });
}));

module.exports = router;
