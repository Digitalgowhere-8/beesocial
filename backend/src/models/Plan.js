const mongoose = require('mongoose');

const planSchema = new mongoose.Schema(
  {
    planId: { type: String, required: true, unique: true, index: true },
    label: { type: String, required: true },
    price: { type: String, default: '' },
    priceNote: { type: String, default: '' },
    memberLimit: { type: Number, default: 1, min: 0, max: 1000 },
    limits: {
      fetchesPerMonth: { type: Number, default: 10, min: 0, max: 100000 },
      storageItems: { type: Number, default: 100, min: 0, max: 1000000 },
      tokenBudgetMonthly: { type: Number, default: 50000, min: 0, max: 100000000 }
    },
    access: {
      canFetch: { type: Boolean, default: true },
      canCreateMembers: { type: Boolean, default: false },
      canUseBlogStudio: { type: Boolean, default: false },
      canUseSavedSearches: { type: Boolean, default: false },
      canUseScheduler: { type: Boolean, default: false }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Plan', planSchema);
