const mongoose = require('mongoose');

const MAX_FETCH_LOG_QUERY_LENGTH = 300;

function normalizeFetchLogQuery(value) {
  const text = typeof value === 'string' ? value : String(value ?? '');
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= MAX_FETCH_LOG_QUERY_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_FETCH_LOG_QUERY_LENGTH - 3).trimEnd()}...`;
}

function applyQueryNormalization(update) {
  if (!update || typeof update !== 'object') return;

  if (Object.prototype.hasOwnProperty.call(update, 'query')) {
    update.query = normalizeFetchLogQuery(update.query);
  }

  if (update.$set && Object.prototype.hasOwnProperty.call(update.$set, 'query')) {
    update.$set.query = normalizeFetchLogQuery(update.$set.query);
  }
}

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
      enum: ['cron', 'manual', 'system'],
      required: true,
      index: true
    },
    triggeredByUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    savedSearchId: { type: mongoose.Schema.Types.ObjectId, ref: 'SavedSearch' },
    country: { type: String, default: '' },
    region: { type: String, default: '' },
    sector: { type: String, default: '', maxlength: 100 },
    query: { type: String, default: '', maxlength: MAX_FETCH_LOG_QUERY_LENGTH, set: normalizeFetchLogQuery },
    resultCount: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ['running', 'success', 'partial', 'failed', 'cancelled'],
      default: 'running',
      index: true
    },

    startedAt:  { type: Date, default: Date.now },
    finishedAt: { type: Date },
    durationMs: { type: Number },

    // Per-source breakdown. Kept flexible because different runners can send
    // this as objects, JSON strings, or legacy string rows.
    perSource: [{ type: mongoose.Schema.Types.Mixed }],
    debugSamples: { type: mongoose.Schema.Types.Mixed, default: undefined },
    progressMessages: [{ type: mongoose.Schema.Types.Mixed }],

    // Aggregate totals
    totalFetched:   { type: Number, default: 0 },
    totalMatched:   { type: Number, default: 0 },
    totalRejected:  { type: Number, default: 0 },
    totalAiIgnored: { type: Number, default: 0 },
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

fetchLogSchema.pre('validate', function normalizeDocumentQuery(next) {
  this.query = normalizeFetchLogQuery(this.query);
  next();
});

['findOneAndUpdate', 'findByIdAndUpdate', 'updateOne', 'updateMany'].forEach((hook) => {
  fetchLogSchema.pre(hook, function normalizeUpdatedQuery(next) {
    applyQueryNormalization(this.getUpdate());
    next();
  });
});

module.exports = mongoose.model('FetchLog', fetchLogSchema);
