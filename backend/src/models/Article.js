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

    // Geography (extensible — default Singapore)
    country: { type: String, default: 'Singapore', index: true },

    // AI / relevance
    relevanceScore: { type: Number, default: 0 },   // 0-100, populated by Tavily / OpenAI when available
    aiSummary:      { type: String, default: '' },  // AI-generated short summary (optional)

    // Workflow
    isPublished: { type: Boolean, default: true, index: true },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    publishedAtAdmin: { type: Date },

    // Raw payload (optional, useful for debugging)
    raw: { type: mongoose.Schema.Types.Mixed }
  },
  { timestamps: true }
);

// Compound indexes for common filter combinations
articleSchema.index({ type: 1, isPublished: 1, relevanceScore: -1, publishedAt: -1, fetchedAt: -1 });
articleSchema.index({ category: 1, type: 1, relevanceScore: -1, publishedAt: -1, fetchedAt: -1 });
articleSchema.index({ subcategory: 1, relevanceScore: -1, publishedAt: -1, fetchedAt: -1 });
articleSchema.index({ source: 1, relevanceScore: -1, publishedAt: -1, fetchedAt: -1 });

module.exports = mongoose.model('Article', articleSchema);
