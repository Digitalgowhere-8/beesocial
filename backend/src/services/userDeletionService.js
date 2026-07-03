const mongoose = require('mongoose');
const User = require('../models/User');
const UserSession = require('../models/UserSession');
const Article = require('../models/Article');
const UserResult = require('../models/UserResult');
const SavedSearch = require('../models/SavedSearch');
const FetchLog = require('../models/FetchLog');
const BlogPost = require('../models/BlogPost');
const SocialPost = require('../models/SocialPost');

const DEFAULT_SOFT_DELETE_GRACE_DAYS = Math.max(1, Number(process.env.USER_SOFT_DELETE_GRACE_DAYS || 7));

function graceDays() {
  return Math.max(1, Number(process.env.USER_SOFT_DELETE_GRACE_DAYS || DEFAULT_SOFT_DELETE_GRACE_DAYS));
}

function purgeAfterDate(baseDate = new Date()) {
  return new Date(baseDate.getTime() + graceDays() * 24 * 60 * 60 * 1000);
}

function isTenantAdmin(user = {}) {
  return user?.role === 'admin' && String(user?.tenantAdminId || user?._id || '') === String(user?._id || '');
}

async function softDeleteUser(target, actor, { reason = 'deleted_by_super_admin' } = {}) {
  if (!target?._id) throw new Error('Target user is required');

  const now = new Date();
  const purgeAfter = purgeAfterDate(now);
  const scope = isTenantAdmin(target) ? 'tenant' : 'user';
  const deletionBatchId = new mongoose.Types.ObjectId().toString();

  const scopedUsers = scope === 'tenant'
    ? await User.find({
        $or: [
          { _id: target._id },
          { tenantAdminId: target._id },
          { createdBy: target._id }
        ]
      }).withDeleted().select('_id role tenantAdminId createdBy deletedAt').lean()
    : await User.find({ _id: target._id }).withDeleted().select('_id role tenantAdminId deletedAt').lean();

  const userIds = scopedUsers
    .filter((user) => !user.deletedAt)
    .map((user) => user._id);

  if (!userIds.length) {
    return {
      scope,
      deletedUsers: 0,
      userIds: [],
      purgeAfter,
      alreadyDeleted: true
    };
  }

  await User.updateMany(
    { _id: { $in: userIds } },
    {
      $set: {
        isActive: false,
        deletedAt: now,
        deletedBy: actor?._id || null,
        deleteReason: reason,
        purgeAfter,
        deletionBatchId,
        deletionRootUserId: target._id,
        deletionScope: scope,
        cleanupStatus: 'pending',
        cleanupStartedAt: null,
        cleanupError: '',
        lastSeenAt: null
      },
      $unset: {
        passwordResetToken: 1,
        passwordResetExpiresAt: 1
      }
    }
  );

  await UserSession.updateMany(
    { userId: { $in: userIds }, revokedAt: null },
    {
      $set: {
        revokedAt: now,
        revokedBy: actor?._id || null,
        revokeReason: 'soft_deleted'
      }
    }
  );

  return {
    scope,
    deletedUsers: userIds.length,
    userIds: userIds.map(String),
    purgeAfter,
    deletionBatchId
  };
}

async function cleanupDeletionBatch(batchId) {
  const users = await User.find({ deletionBatchId: batchId })
    .withDeleted()
    .select('_id role tenantAdminId deletedAt purgeAfter cleanupStatus deletionRootUserId deletionScope')
    .lean();

  if (!users.length) {
    return { deletedUsers: 0, deletedArticles: 0, deletedBlogs: 0, deletedSocialPosts: 0, deletedLogs: 0, deletedSavedSearches: 0, deletedUserResults: 0, deletedSessions: 0 };
  }

  const rootUserId = users[0].deletionRootUserId || users[0]._id;
  const scope = users[0].deletionScope || 'user';
  const userIds = users.map((user) => user._id);

  await User.updateMany(
    { _id: { $in: userIds } },
    {
      $set: {
        cleanupStatus: 'in_progress',
        cleanupStartedAt: new Date(),
        cleanupError: ''
      }
    }
  );

  try {
    const savedSearchIds = await SavedSearch.find({ userId: { $in: userIds } }).select('_id').lean();
    const savedSearchIdList = savedSearchIds.map((item) => item._id);

    const articleRows = await Article.find({ userId: { $in: userIds } }).select('_id').lean();
    const articleIds = articleRows.map((item) => item._id);

    const [
      userResultByUser,
      userResultByArticle,
      savedSearchDelete,
      articleDelete,
      fetchLogDelete,
      sessionDelete,
      blogDelete,
      socialDelete
    ] = await Promise.all([
      UserResult.deleteMany({ userId: { $in: userIds } }),
      articleIds.length ? UserResult.deleteMany({ articleId: { $in: articleIds } }) : Promise.resolve({ deletedCount: 0 }),
      SavedSearch.deleteMany({ _id: { $in: savedSearchIdList } }),
      Article.deleteMany({ _id: { $in: articleIds } }),
      FetchLog.deleteMany({
        $or: [
          { userId: { $in: userIds } },
          { triggeredByUser: { $in: userIds } },
          ...(savedSearchIdList.length ? [{ savedSearchId: { $in: savedSearchIdList } }] : [])
        ]
      }),
      UserSession.deleteMany({ userId: { $in: userIds } }),
      scope === 'tenant'
        ? BlogPost.deleteMany({ tenantAdminId: rootUserId })
        : BlogPost.deleteMany({ createdBy: { $in: userIds } }),
      scope === 'tenant'
        ? SocialPost.deleteMany({ tenantAdminId: rootUserId })
        : SocialPost.deleteMany({ createdBy: { $in: userIds } })
    ]);

    const userDelete = await User.deleteMany({ _id: { $in: userIds } });

    return {
      deletedUsers: Number(userDelete.deletedCount || 0),
      deletedArticles: Number(articleDelete.deletedCount || 0),
      deletedBlogs: Number(blogDelete.deletedCount || 0),
      deletedSocialPosts: Number(socialDelete.deletedCount || 0),
      deletedLogs: Number(fetchLogDelete.deletedCount || 0),
      deletedSavedSearches: Number(savedSearchDelete.deletedCount || 0),
      deletedUserResults: Number(userResultByUser.deletedCount || 0) + Number(userResultByArticle.deletedCount || 0),
      deletedSessions: Number(sessionDelete.deletedCount || 0)
    };
  } catch (error) {
    await User.updateMany(
      { _id: { $in: userIds } },
      {
        $set: {
          cleanupStatus: 'failed',
          cleanupError: String(error.message || error).slice(0, 500)
        }
      }
    );
    throw error;
  }
}

async function cleanupDeletedUsers({ baseDate = new Date(), limit = 20 } = {}) {
  const dueUsers = await User.find({
    deletedAt: { $ne: null },
    purgeAfter: { $lte: baseDate },
    cleanupStatus: { $in: ['pending', 'failed'] },
    deletionBatchId: { $nin: ['', null] }
  })
    .withDeleted()
    .sort({ purgeAfter: 1, deletedAt: 1 })
    .limit(Math.max(1, limit) * 20)
    .select('deletionBatchId')
    .lean();

  const batchIds = [...new Set(dueUsers.map((user) => String(user.deletionBatchId || '')).filter(Boolean))].slice(0, Math.max(1, limit));
  const results = [];

  for (const batchId of batchIds) {
    const result = await cleanupDeletionBatch(batchId);
    results.push({ batchId, ...result });
  }

  return {
    processedBatches: results.length,
    results
  };
}

module.exports = {
  cleanupDeletedUsers,
  graceDays,
  purgeAfterDate,
  softDeleteUser
};
