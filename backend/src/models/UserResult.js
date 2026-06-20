const mongoose = require('mongoose');

const userResultSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    articleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', required: true, index: true },
    savedSearchId: { type: mongoose.Schema.Types.ObjectId, ref: 'SavedSearch', index: true },
    relevanceScore: { type: Number, default: 0 },
    relevanceReason: { type: String, default: '', maxlength: 2000 },
    matchedInterests: [{ type: String }],
    seen: { type: Boolean, default: false, index: true },
    saved: { type: Boolean, default: false, index: true },
    dismissed: { type: Boolean, default: false, index: true }
  },
  { timestamps: true }
);

userResultSchema.index({ userId: 1, articleId: 1, savedSearchId: 1 }, { unique: true });
userResultSchema.index({ userId: 1, relevanceScore: -1, createdAt: -1 });

module.exports = mongoose.model('UserResult', userResultSchema);
