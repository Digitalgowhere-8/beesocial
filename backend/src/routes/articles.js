const express = require('express');
const Article = require('../models/Article');
const UserResult = require('../models/UserResult');
const { protect } = require('../middleware/auth');
const { asTree } = require('../config/categories');
const { configuredFetchCountries } = require('../config/fetchSources');

const router = express.Router();
const isAdminUser = (user) => ['admin', 'super_admin'].includes(user.role);

// Escape special regex characters to prevent ReDoS attacks
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const DEFAULT_ARTICLE_SORT = { fetchedDate: -1, relevanceScore: -1, effectiveDate: -1 };
const DASHBOARD_TIMEZONE = 'Asia/Kolkata';
const DASHBOARD_TIMEZONE_OFFSET_MINUTES = 330;
const DAY_MS = 24 * 60 * 60 * 1000;

function tenantOwnerIds(user) {
  if (!user?._id) return [];
  if (user.role === 'super_admin') return [];
  if (user.role === 'admin') return [user._id];
  return [user.tenantAdminId || user._id];
}

function sharedArticleScope() {
  return [
    { userId: { $exists: false } },
    { userId: null }
  ];
}

function scopedOwnerQuery(ownerIds = []) {
  if (!ownerIds.length) return {};
  return { $or: [{ userId: { $in: ownerIds } }, ...sharedArticleScope()] };
}

function formatDashboardDate(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DASHBOARD_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function parseDateInputParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function parseDashboardDateBoundary(value, endOfDay = false) {
  if (!value) return null;

  const parts = parseDateInputParts(value);
  if (parts) {
    const startUtc = Date.UTC(parts.year, parts.month - 1, parts.day) -
      DASHBOARD_TIMEZONE_OFFSET_MINUTES * 60 * 1000;
    return new Date(endOfDay ? startUtc + DAY_MS - 1 : startUtc);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return date;
}

function parseFilterDateStart(value) {
  return parseDashboardDateBoundary(value, false);
}

function parseFilterDateEnd(value) {
  return parseDashboardDateBoundary(value, true);
}

function dashboardDateRangeMatch(from, to) {
  const start = parseFilterDateStart(from);
  const end = parseFilterDateEnd(to);
  if (!start && !end) return null;

  const match = {};
  if (start) match.$gte = start;
  if (end) match.$lte = end;
  return match;
}

function withEffectiveDateSort(match, extraStages = []) {
  return [
    { $match: match },
    {
      $addFields: {
        fetchedDate: {
          $convert: {
            input: '$fetchedAt',
            to: 'date',
            onError: new Date(0),
            onNull: new Date(0)
          }
        },
        effectiveDate: {
          $convert: {
            input: { $ifNull: ['$publishedAt', '$fetchedAt'] },
            to: 'date',
            onError: new Date(0),
            onNull: new Date(0)
          }
        }
      }
    },
    {
      $addFields: {
        fetchedDay: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$fetchedDate',
            timezone: DASHBOARD_TIMEZONE
          }
        },
        effectiveDay: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$effectiveDate',
            timezone: DASHBOARD_TIMEZONE
          }
        }
      }
    },
    { $sort: DEFAULT_ARTICLE_SORT },
    ...extraStages
  ];
}

function sortByName(a, b) {
  return String(a?.name || a?._id || '').localeCompare(String(b?.name || b?._id || ''));
}

function optionLabel(value) {
  return String(value || '').trim();
}

function emptySourcesByType() {
  return {
    news: [],
    govt: [],
    competitor: [],
    evergreen: []
  };
}

function buildDataCategoryTree(rows = []) {
  const tree = {};
  for (const row of rows) {
    const category = optionLabel(row._id?.category);
    const subcategory = optionLabel(row._id?.subcategory);
    if (!category) continue;
    if (!tree[category]) tree[category] = new Set();
    if (subcategory) tree[category].add(subcategory);
  }
  return Object.fromEntries(
    Object.entries(tree)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, subcategories]) => [category, [...subcategories].sort()])
  );
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
 *  from / to   - ISO date strings; filters by fetchedAt in the dashboard timezone
 */
function buildQuery(req, opts = {}) {
  const q = {};
  const ownerIds = tenantOwnerIds(req.user);

  // Enforce a strict minimum relevance threshold of 30 before displaying any article
  const minScoreThreshold = Math.max(0, Math.min(100, Number(process.env.AI_RELEVANCE_MIN_SCORE || 30) || 30));
  q.relevanceScore = { $gte: minScoreThreshold };

  if (req.query.type) {
    const types = req.query.type.split(',').map((s) => s.trim()).filter(Boolean);
    if (types.length === 1) q.type = types[0];
    else if (types.length > 1) q.type = { $in: types };
  }

  if (req.query.category)    q.category = req.query.category;
  if (req.query.subcategory) q.subcategory = req.query.subcategory;
  if (req.query.source)      q.sourceId = req.query.source;
  if (req.query.country)     q.country = req.query.country;
  if (req.query.region)      q.region = req.query.region;
  if (req.query.sector)      q.sector = req.query.sector;
  if (req.query.opportunityType) q.opportunityType = req.query.opportunityType;
  if (req.query.userId && req.user.role === 'super_admin') q.userId = req.query.userId;
  if (req.query.savedSearchId) q.savedSearchId = req.query.savedSearchId;

  if (req.query.sharedOnly === 'true') {
    Object.assign(q, { $or: sharedArticleScope() });
  } else if (req.query.personalOnly === 'true') {
    q.userId = req.user._id;
  } else if (req.query.ownerOnly === 'true' && ownerIds.length) {
    if (q.userId) {
      q.$and = [...(q.$and || []), { userId: q.userId }, { userId: { $in: ownerIds } }];
      delete q.userId;
    } else {
      q.userId = { $in: ownerIds };
    }
  } else if (ownerIds.length) {
    if (q.userId) {
      q.$and = [...(q.$and || []), { userId: q.userId }, scopedOwnerQuery(ownerIds)];
      delete q.userId;
    } else {
      Object.assign(q, scopedOwnerQuery(ownerIds));
    }
  } else if (req.query.personalized === 'true' && req.user.role === 'super_admin') {
    q.userId = req.user._id;
  }

  if (req.query.q) {
    q.title = { $regex: escapeRegex(req.query.q.trim()), $options: 'i' };
  }

  return q;
}

async function savedArticleIdsForUser(user) {
  if (!user?._id) return [];
  const rows = await UserResult.find(
    { userId: user._id, saved: true, dismissed: { $ne: true } },
    { articleId: 1 }
  ).lean();
  return rows.map((row) => row.articleId).filter(Boolean);
}

async function applySavedFilter(req, query) {
  if (req.query.saved !== 'true') return query;
  const ids = await savedArticleIdsForUser(req.user);
  return { ...query, _id: { $in: ids } };
}

async function annotateSaved(req, items = []) {
  if (!req.user?._id || !items.length) return items;
  const ids = items.map((item) => item._id).filter(Boolean);
  const rows = await UserResult.find(
    { userId: req.user._id, articleId: { $in: ids }, saved: true, dismissed: { $ne: true } },
    { articleId: 1 }
  ).lean();
  const savedIds = new Set(rows.map((row) => String(row.articleId)));
  return items.map((item) => ({ ...item, isSaved: savedIds.has(String(item._id)) }));
}

function canAccessArticle(user, article) {
  const ownerIds = tenantOwnerIds(user).map((id) => String(id));
  const isShared = !article.userId;
  if (isShared) return true;
  if (ownerIds.length && !ownerIds.includes(String(article.userId || ''))) return false;
  return true;
}

// ---------- META endpoints (filter dropdowns) ----------
router.get('/meta/filters', protect, asyncHandler(async (req, res) => {
  const ownerIds = tenantOwnerIds(req.user);
  const scope = scopedOwnerQuery(ownerIds);
  const visibleScope = scope;
  const [countries, regions, sectors, opportunityTypes, sourceRows, categoryRows] = await Promise.all([
    Article.distinct('country', { ...visibleScope, country: { $nin: ['', null] } }),
    Article.distinct('region', { ...visibleScope, region: { $nin: ['', null] } }),
    Article.distinct('sector', { ...visibleScope, sector: { $nin: ['', null] } }),
    Article.distinct('opportunityType', { ...visibleScope, opportunityType: { $nin: ['', null] } }),
    Article.aggregate([
      {
        $match: {
          ...visibleScope,
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
            name: '$source'
          },
          countries: { $addToSet: '$country' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.type': 1, '_id.name': 1 } }
    ]),
    Article.aggregate([
      {
        $match: {
          ...visibleScope,
          category: { $nin: ['', null, 'General'] }
        }
      },
      {
        $group: {
          _id: {
            category: '$category',
            subcategory: '$subcategory'
          },
          count: { $sum: 1 }
        }
      }
    ])
  ]);

  const sources = emptySourcesByType();
  for (const row of sourceRows) {
    const type = row._id?.type;
    if (!sources[type]) continue;
    sources[type].push({
      id: optionLabel(row._id?.id),
      name: optionLabel(row._id?.name),
      countries: (row.countries || []).map(optionLabel).filter(Boolean),
      count: row.count
    });
  }
  for (const type of Object.keys(sources)) {
    sources[type] = sources[type].filter((source) => source.id && source.name).sort(sortByName);
  }

  res.json({
    categories: asTree(),
    dataCategories: buildDataCategoryTree(categoryRows),
    fetchCountries: configuredFetchCountries(),
    countries: countries.map(optionLabel).filter(Boolean).sort(),
    regions: regions.map(optionLabel).filter(Boolean).sort(),
    sectors: sectors.map(optionLabel).filter(Boolean).sort(),
    opportunityTypes: opportunityTypes.map(optionLabel).filter(Boolean).sort(),
    sources,
    types: [
      { id: 'news',       label: 'News Articles' },
      { id: 'govt',       label: 'Government Updates' },
      { id: 'competitor', label: 'Competitor Intel' },
      { id: 'evergreen',  label: 'Evergreen Guides' }
    ]
  });
}));

// GET /api/articles/counts — returns total counts for all columns after filtering
router.get('/counts', protect, asyncHandler(async (req, res) => {
  const baseQuery = await applySavedFilter(
    req,
    buildQuery(req)
  );
  const dateRange = dashboardDateRangeMatch(req.query.from, req.query.to);

  const pipeline = [
    { $match: baseQuery },
    {
      $addFields: {
        fetchedDate: {
          $convert: {
            input: '$fetchedAt',
            to: 'date',
            onError: new Date(0),
            onNull: new Date(0)
          }
        }
      }
    }
  ];

  if (dateRange) {
    pipeline.push({ $match: { fetchedDate: dateRange } });
  }

  pipeline.push({
    $group: {
      _id: '$type',
      count: { $sum: 1 }
    }
  });

  const counts = await Article.aggregate(pipeline);

  const response = {
    news: 0,
    govt: 0,
    competitor: 0,
    evergreen: 0
  };

  for (const row of counts) {
    if (response[row._id] !== undefined) {
      response[row._id] = row.count;
    }
  }

  res.json(response);
}));

// ---------- DASHBOARD endpoint ----------
// GET /api/articles/dashboard?limit=20&from=...&to=...&category=...
// Returns 4 buckets in one round-trip.
router.get('/dashboard', protect, asyncHandler(async (req, res) => {
  const baseQuery = await applySavedFilter(
    req,
    buildQuery(req)
  );
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : null;
  const offset = req.query.offset ? parseInt(req.query.offset, 10) : 0;
  const dateRange = dashboardDateRangeMatch(req.query.from, req.query.to);

  const types = ['news', 'govt', 'competitor', 'evergreen'];
  const results = await Promise.all(
    types.map((t) => {
      const pipeline = withEffectiveDateSort({ ...baseQuery, type: t });
      if (dateRange) {
        pipeline.push({ $match: { fetchedDate: dateRange } });
      }
      if (offset && offset > 0) {
        pipeline.push({ $skip: offset });
      }
      if (limit && limit > 0) {
        pipeline.push({ $limit: limit });
      }
      return Article.aggregate(pipeline);
    })
  );

  const annotated = await Promise.all(results.map((items) => annotateSaved(req, items)));

  res.json({
    news: annotated[0],
    govt: annotated[1],
    competitor: annotated[2],
    evergreen: annotated[3]
  });
}));

// GET /api/articles/velocity
// Returns real signal counts for the last 7 days using fetchedAt.
router.get('/velocity', protect, asyncHandler(async (req, res) => {
  const baseQuery = buildQuery(req);
  const datasetScope = req.query.scope === 'dataset';
  const now = new Date();
  const todayStart = parseFilterDateStart(formatDashboardDate(now)) || now;
  const start = new Date(todayStart.getTime() - 6 * DAY_MS);
  const explicitDateRange = dashboardDateRangeMatch(req.query.from, req.query.to);

  const pipeline = [
    { $match: baseQuery },
    {
      $addFields: {
        fetchedDate: {
          $convert: {
            input: '$fetchedAt',
            to: 'date',
            onError: new Date(0),
            onNull: new Date(0)
          }
        }
      }
    },
  ];

  if (explicitDateRange) {
    pipeline.push({ $match: { fetchedDate: explicitDateRange } });
  } else if (!datasetScope) {
    pipeline.push({ $match: { fetchedDate: { $gte: start, $lte: now } } });
  }

  pipeline.push(
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$fetchedDate',
            timezone: DASHBOARD_TIMEZONE
          }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  );

  const rows = await Article.aggregate(pipeline);

  if (datasetScope) {
    const days = rows.map((row) => {
      const date = new Date(`${row._id}T12:00:00.000Z`);
      return {
        date: row._id,
        day: date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
        count: row.count
      };
    });
    return res.json({ days });
  }

  const counts = Object.fromEntries(rows.map((row) => [row._id, row.count]));
  const days = Array.from({ length: 7 }).map((_, i) => {
    const date = new Date(start.getTime() + i * DAY_MS);
    const key = formatDashboardDate(date);
    return {
      date: key,
      day: date.toLocaleDateString('en-US', {
        weekday: 'short',
        timeZone: DASHBOARD_TIMEZONE
      }).toUpperCase(),
      count: counts[key] || 0
    };
  });

  res.json({ days });
}));

// ---------- LIST endpoint (paginated) ----------
// GET /api/articles?type=news&category=...&page=1&limit=20
router.get('/', protect, asyncHandler(async (req, res) => {
  const q = await applySavedFilter(req, buildQuery(req));
  const dateRange = dashboardDateRangeMatch(req.query.from, req.query.to);

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
      ? Article.aggregate(withEffectiveDateSort(q, [
        ...(dateRange ? [{ $match: { fetchedDate: dateRange } }] : []),
        { $sort: sortObj },
        { $skip: skip },
        { $limit: limit }
      ]))
      : Article.aggregate(withEffectiveDateSort(q, [
        ...(dateRange ? [{ $match: { fetchedDate: dateRange } }] : []),
        { $skip: skip },
        { $limit: limit }
      ])),
    Article.aggregate(withEffectiveDateSort(q, [
      ...(dateRange ? [{ $match: { fetchedDate: dateRange } }] : []),
      { $count: 'total' }
    ]))
  ]);

  const totalCount = total[0]?.total || 0;

  res.json({
    items: await annotateSaved(req, items),
    page,
    limit,
    total: totalCount,
    pages: Math.ceil(totalCount / limit)
  });
}));

router.post('/:id/save', protect, asyncHandler(async (req, res) => {
  const item = await Article.findById(req.params.id).lean();
  if (!item || !canAccessArticle(req.user, item)) {
    return res.status(404).json({ message: 'Not found' });
  }

  await UserResult.findOneAndUpdate(
    {
      userId: req.user._id,
      articleId: item._id,
      savedSearchId: item.savedSearchId || undefined
    },
    {
      $set: {
        userId: req.user._id,
        articleId: item._id,
        savedSearchId: item.savedSearchId || undefined,
        relevanceScore: Number(item.relevanceScore || 0),
        relevanceReason: item.relevanceReason || '',
        matchedInterests: item.matchedInterests || [],
        saved: true,
        dismissed: false
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.json({ ok: true, item: { ...item, isSaved: true } });
}));

router.delete('/:id/save', protect, asyncHandler(async (req, res) => {
  await UserResult.updateMany(
    { userId: req.user._id, articleId: req.params.id },
    { $set: { saved: false } }
  );
  res.json({ ok: true, articleId: req.params.id, isSaved: false });
}));

// ---------- SINGLE article ----------
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const item = await Article.findById(req.params.id).lean();
  if (!item) return res.status(404).json({ message: 'Not found' });

  if (!canAccessArticle(req.user, item)) {
    return res.status(404).json({ message: 'Not found' });
  }
  const [annotated] = await annotateSaved(req, [item]);
  res.json({ item: annotated });
}));

module.exports = router;
