const mongoose = require('mongoose');

const userSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionId: { type: String, required: true, unique: true, index: true },
    deviceLabel: { type: String, default: '', trim: true, maxlength: 160 },
    browser: { type: String, default: '', trim: true, maxlength: 80 },
    os: { type: String, default: '', trim: true, maxlength: 80 },
    ip: { type: String, default: '', trim: true, maxlength: 80 },
    userAgent: { type: String, default: '', trim: true, maxlength: 512 },
    lastActiveAt: { type: Date, default: Date.now, index: true },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null, index: true },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    revokeReason: { type: String, default: '', trim: true, maxlength: 160 }
  },
  { timestamps: true }
);

userSessionSchema.index({ userId: 1, revokedAt: 1, expiresAt: 1 });

module.exports = mongoose.model('UserSession', userSessionSchema);
