const mongoose = require('mongoose');

/**
 * FETCH LOG
 * ---------
 * Recorded each time the scrape orchestrator runs (manual or cron).
 * Powers the "Logs" tab in the Admin Panel so admins can see what ran,
 * what failed, and how many new items were stored.
 */
const fetchLogSchema = new mongoose.Schema(
  {
    runId: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString(),
      index: true
    },

    triggeredBy: {
      type: String,
      enum: ['cron', 'manual', 'system', 'n8n'],
      required: true,
      index: true
    },
    triggeredByUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    savedSearchId: { type: mongoose.Schema.Types.ObjectId, ref: 'SavedSearch' },
    country: { type: String, default: '' },
    region: { type: String, default: '' },
    sector: { type: String, default: '', maxlength: 100 },
    query: { type: String, default: '', maxlength: 300 },
    resultCount: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ['running', 'success', 'partial', 'failed'],
      default: 'running',
      index: true
    },

    startedAt:  { type: Date, default: Date.now },
    finishedAt: { type: Date },
    durationMs: { type: Number },

    // Per-source breakdown. Kept flexible because n8n can send this as
    // objects, JSON strings, or legacy string rows depending on node setup.
    perSource: [{ type: mongoose.Schema.Types.Mixed }],

    // Aggregate totals
    totalFetched:   { type: Number, default: 0 },
    totalInserted:  { type: Number, default: 0 },
    totalDuplicates:{ type: Number, default: 0 },
    totalErrors:    { type: Number, default: 0 },

    notes: { type: String, maxlength: 500 }
  },
  { timestamps: true }
);

fetchLogSchema.index({ startedAt: -1 });
// Auto-delete logs older than 90 days to prevent unbounded storage growth
fetchLogSchema.index({ startedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('FetchLog', fetchLogSchema);
