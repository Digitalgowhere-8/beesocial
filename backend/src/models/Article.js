const mongoose = require('mongoose');

/**
 * ARTICLE MODEL
 * -------------
 * One document = one piece of intelligence (news / govt update / competitor / evergreen).
 *
 * Deduplication strategy:
 *   - `urlHash` is a SHA-256 of the normalised URL.
 *   - It has a UNIQUE index, so MongoDB itself refuses duplicates.
 *   - The orchestrator uses `findOneAndUpdate({ urlHash }, ..., { upsert: true })`
 *     which makes re-fetching the same article idempotent.
 *
 * Visibility:
 *   - `isPublished=false` (default): only admins can see it.
 *   - `isPublished=true`: visible to all logged-in users.
 *   - Super admin sets this via the Admin Panel.
 */
const articleSchema = new mongoose.Schema(
  {
    // Core identity
    title:    { type: String, required: true, trim: true, maxlength: 500, index: 'text' },
    summary:  { type: String, default: '', maxlength: 4000 },
    url:      { type: String, required: true, trim: true, maxlength: 2000 },
    urlHash:  { type: String, required: true, unique: true, index: true },
    contentFingerprint: { type: String, default: '', index: true },

    // Classification
    type: {
      type: String,
      enum: ['news', 'govt', 'competitor', 'evergreen'],
      required: true,
      index: true
    },
    category:    { type: String, default: 'General', index: true },   // e.g. "Accounting and Tax"
    subcategory: { type: String, default: '', index: true },          // e.g. "Tax Filing & Compliance"
    tags:        [{ type: String, lowercase: true, trim: true }],

    // Source attribution
    source:     { type: String, required: true, index: true }, // human label e.g. "ACRA"
    sourceId:   { type: String, required: true, index: true }, // slug e.g. "acra"
    sourceType: { type: String },                              // host eg. "acra.gov.sg"

    // Timing
    publishedAt: { type: Date, default: null, index: true }, // date article appeared at source (best-effort)
    fetchedAt:   { type: Date, default: Date.now, index: true },

    // Geography (extensible across countries and regions)
    country: { type: String, default: 'India', index: true },
    region: { type: String, default: '', index: true },
    sector: { type: String, default: '', index: true },
    opportunityType: { type: String, default: 'market_news', index: true },
    targetUserTypes: [{ type: String }],
    matchedInterests: [{ type: String }],
    sourceQuery: { type: String, default: '' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    savedSearchId: { type: mongoose.Schema.Types.ObjectId, ref: 'SavedSearch', index: true },
    language: { type: String, default: 'en', index: true },

    // AI / relevance
    relevanceScore: { type: Number, default: 0 },
    relevanceReason: { type: String, default: '', maxlength: 500 },
    aiSummary:      { type: String, default: '', maxlength: 2000 },

    // Useful context snippets (trimmed — no full raw payload)
    rawContent:   { type: String, default: '', maxlength: 20000 },
    blogContext:  { type: String, default: '', maxlength: 12000 },
    sourceAnswer: { type: String, default: '', maxlength: 4000 },
    rawData: { type: mongoose.Schema.Types.Mixed, default: undefined },

    // Workflow
    isPublished: { type: Boolean, default: true, index: true },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    publishedAtAdmin: { type: Date }
    // raw field removed — saves significant storage per article
  },
  { timestamps: true }
);

// Compound indexes for common filter combinations
articleSchema.index({ type: 1, isPublished: 1, relevanceScore: -1, publishedAt: -1, fetchedAt: -1 });
articleSchema.index({ category: 1, type: 1, relevanceScore: -1, publishedAt: -1, fetchedAt: -1 });
articleSchema.index({ subcategory: 1, relevanceScore: -1, publishedAt: -1, fetchedAt: -1 });
articleSchema.index({ source: 1, relevanceScore: -1, publishedAt: -1, fetchedAt: -1 });
articleSchema.index({ userId: 1, savedSearchId: 1, relevanceScore: -1 });
articleSchema.index({ region: 1, sector: 1, opportunityType: 1 });
articleSchema.index({ type: 1, country: 1, contentFingerprint: 1, publishedAt: -1, fetchedAt: -1 });

module.exports = mongoose.model('Article', articleSchema);
