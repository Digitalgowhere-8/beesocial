const mongoose = require('mongoose');

const analyticsEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['page_view', 'click', 'section_view', 'engagement'],
      required: true,
      index: true
    },
    sessionId: { type: String, required: true, index: true, maxlength: 80 },
    visitorId: { type: String, required: true, index: true, maxlength: 80 },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    role: { type: String, default: '', maxlength: 40, index: true },
    path: { type: String, default: '', maxlength: 240, index: true },
    title: { type: String, default: '', maxlength: 180 },
    section: { type: String, default: '', maxlength: 140, index: true },
    label: { type: String, default: '', maxlength: 180 },
    targetType: { type: String, default: '', maxlength: 60 },
    value: { type: Number, default: 1 },
    durationMs: { type: Number, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: undefined },
    userAgent: { type: String, default: '', maxlength: 300 },
    ipHash: { type: String, default: '', maxlength: 80, index: true },
    occurredAt: { type: Date, default: Date.now, index: true }
  },
  { timestamps: true }
);

analyticsEventSchema.index({ occurredAt: -1, type: 1 });
analyticsEventSchema.index({ path: 1, section: 1, occurredAt: -1 });
analyticsEventSchema.index({ visitorId: 1, sessionId: 1, occurredAt: -1 });

module.exports = mongoose.model('AnalyticsEvent', analyticsEventSchema);
