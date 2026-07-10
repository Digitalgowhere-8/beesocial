const mongoose = require('mongoose');
const AnalyticsEvent = require('../models/AnalyticsEvent');
const FetchLog = require('../models/FetchLog');
const Article = require('../models/Article');
const BlogPost = require('../models/BlogPost');
const SocialPost = require('../models/SocialPost');
const User = require('../models/User');

function startOfCurrentMonth(baseDate = new Date()) {
  return new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
}

function fetchLogRetentionCutoff(baseDate = new Date()) {
  return new Date(baseDate.getTime() - (90 * 24 * 60 * 60 * 1000));
}

async function cleanupAnalyticsRetention({ baseDate = new Date() } = {}) {
  const cutoff = startOfCurrentMonth(baseDate);
  const result = await AnalyticsEvent.deleteMany({ occurredAt: { $lt: cutoff } });
  return {
    deleted: Number(result.deletedCount || 0),
    cutoff
  };
}

async function readCollectionStats(model, label) {
  const collectionName = model.collection.collectionName;
  let stats = null;
  try {
    stats = await mongoose.connection.db.command({ collStats: collectionName, scale: 1024 * 1024 });
  } catch {
    stats = null;
  }

  const count = typeof stats?.count === 'number'
    ? stats.count
    : await model.estimatedDocumentCount();

  return {
    key: collectionName,
    label,
    count,
    storageSizeMb: Number(stats?.storageSize || 0),
    totalSizeMb: Number(stats?.size || 0),
    indexSizeMb: Number(stats?.totalIndexSize || 0),
    avgObjSizeKb: stats?.avgObjSize ? Number(stats.avgObjSize / 1024) : 0
  };
}

async function getDatabaseHealthSummary() {
  const monthStart = startOfCurrentMonth();
  const analyticsCleanupCutoff = monthStart;
  const logCutoff = fetchLogRetentionCutoff();
  const db = mongoose.connection.db;

  let dbStats = null;
  try {
    dbStats = await db.command({ dbStats: 1, scale: 1024 * 1024 });
  } catch {
    dbStats = null;
  }

  const [
    collections,
    analyticsTotal,
    analyticsCurrentMonth,
    analyticsPendingCleanup,
    lastAnalyticsEvent,
    logsPendingTtlCleanup
  ] = await Promise.all([
    Promise.all([
      readCollectionStats(AnalyticsEvent, 'Analytics Events'),
      readCollectionStats(Article, 'Articles'),
      readCollectionStats(FetchLog, 'Fetch Logs'),
      readCollectionStats(BlogPost, 'Blog Content'),
      readCollectionStats(SocialPost, 'Social Posts'),
      readCollectionStats(User, 'Users')
    ]),
    AnalyticsEvent.countDocuments({}),
    AnalyticsEvent.countDocuments({ occurredAt: { $gte: monthStart } }),
    AnalyticsEvent.countDocuments({ occurredAt: { $lt: analyticsCleanupCutoff } }),
    AnalyticsEvent.findOne({}).sort({ occurredAt: -1 }).select('occurredAt').lean(),
    FetchLog.countDocuments({ startedAt: { $lt: logCutoff } })
  ]);

  return {
    checkedAt: new Date(),
    retention: {
      analyticsWindow: 'current_month',
      analyticsCutoff: analyticsCleanupCutoff,
      fetchLogTtlDays: 90
    },
    database: {
      collections: Number(dbStats?.collections || collections.length || 0),
      objects: Number(dbStats?.objects || 0),
      dataSizeMb: Number(dbStats?.dataSize || 0),
      storageSizeMb: Number(dbStats?.storageSize || 0),
      indexSizeMb: Number(dbStats?.indexSize || 0)
    },
    analytics: {
      totalEvents: analyticsTotal,
      currentMonthEvents: analyticsCurrentMonth,
      pendingCleanup: analyticsPendingCleanup,
      lastEventAt: lastAnalyticsEvent?.occurredAt || null
    },
    hygiene: {
      logsPendingTtlCleanup: logsPendingTtlCleanup
    },
    collections
  };
}

module.exports = {
  startOfCurrentMonth,
  cleanupAnalyticsRetention,
  getDatabaseHealthSummary
};
