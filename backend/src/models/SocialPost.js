const mongoose = require('mongoose');

const socialPostSchema = new mongoose.Schema(
  {
    tenantAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sourceArticleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', index: true },
    platform: { type: String, enum: ['linkedin', 'instagram', 'facebook'], default: 'linkedin', index: true },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft', index: true },
    selectedTopic: { type: String, default: '', trim: true, maxlength: 300 },
    postText: { type: String, required: true, maxlength: 10000 },
    hashtags: [{ type: String, trim: true, maxlength: 80 }],
    framework: { type: String, default: '' },
    topicTier: { type: String, default: '' },
    emotionalJob: { type: String, default: '' },
    sourceSnapshot: { type: Object, default: () => ({}) },
    options: { type: Object, default: () => ({}) },
    publishedAt: { type: Date }
  },
  { timestamps: true }
);

socialPostSchema.index({ tenantAdminId: 1, platform: 1, updatedAt: -1 });
socialPostSchema.index({ tenantAdminId: 1, status: 1, updatedAt: -1 });

module.exports = mongoose.model('SocialPost', socialPostSchema);
