const mongoose = require('mongoose');

const savedSearchSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    country: { type: String, default: 'India', trim: true, maxlength: 120 },
    region: { type: String, default: '', trim: true, maxlength: 120 },
    sector: { type: String, default: '', trim: true, maxlength: 120 },
    userType: { type: String, default: '', trim: true, maxlength: 120 },
    category: { type: String, default: '', trim: true, maxlength: 120 },
    categories: [{ type: String, trim: true, maxlength: 120 }],
    subcategory: { type: String, default: '', trim: true, maxlength: 120 },
    subcategoryOptions: [{ type: String, trim: true, maxlength: 120 }],
    competitors: [{ type: String, trim: true, maxlength: 120 }],
    topics: [{ type: String, enum: ['news', 'govt', 'competitor', 'evergreen'] }],
    sources: [{ type: String, trim: true }],
    strictSources: { type: Boolean, default: false },
    days: { type: Number, default: 30, min: 1, max: 365 },
    targetPerTopic: { type: Number, default: 10, min: 1, max: 20 },
    minTavilyScore: { type: Number, min: 0, max: 100 },
    query: { type: String, default: '', trim: true, maxlength: 500 },
    language: { type: String, default: 'en', trim: true, maxlength: 10 },
    timezone: { type: String, default: 'Asia/Kolkata', trim: true, maxlength: 80 },
    schedule: {
      enabled: { type: Boolean, default: false },
      frequency: { type: String, enum: ['daily', 'weekly'], default: 'daily' },
      time: { type: String, default: '07:00', trim: true, maxlength: 5 },
      timezone: { type: String, default: 'Asia/Kolkata', trim: true, maxlength: 80 },
      lastRunAt: { type: Date },
      nextRunAt: { type: Date }
    },
    lastTriggeredAt: { type: Date }
  },
  { timestamps: true }
);

savedSearchSchema.index({ userId: 1, name: 1 });

module.exports = mongoose.model('SavedSearch', savedSearchSchema);
