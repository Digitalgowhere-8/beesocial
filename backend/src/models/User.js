const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email']
    },
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: ['user', 'admin', 'super_admin'], default: 'user', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    tenantAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    memberLimit: { type: Number, default: 3, min: 0, max: 1000 },
    subscriptionPlan: { type: String, enum: ['free', 'growth', 'scale', 'enterprise', 'premium'], default: 'free', index: true },
    access: {
      canFetch: { type: Boolean, default: true },
      canCreateMembers: { type: Boolean, default: true },
      canUseContentRepository: { type: Boolean, default: true },
      canUseBlogStudio: { type: Boolean, default: true },
      canUseSavedSearches: { type: Boolean, default: true },
      canUseScheduler: { type: Boolean, default: true }
    },
    limits: {
      fetchesPerMonth: { type: Number, default: 30, min: 0, max: 100000 },
      resultsPerFetch: { type: Number, default: 10, min: 1, max: 100 },
      storageItems: { type: Number, default: 1000, min: 0, max: 1000000 },
      tokenBudgetMonthly: { type: Number, default: 100000, min: 0, max: 100000000 },
      blogGenerationsMonthly: { type: Number, default: 10, min: 0, max: 100000 },
      socialPostsMonthly: { type: Number, default: 20, min: 0, max: 100000 }
    },

    // Profile fields
    company: { type: String, default: '', trim: true, maxlength: 120 },
    designation: { type: String, default: '', trim: true, maxlength: 120 },
    country: { type: String, default: 'India', trim: true, maxlength: 120 },
    region: { type: String, default: '', trim: true, maxlength: 120 },
    userType: { type: String, default: '', trim: true, maxlength: 120 },
    sector: { type: String, default: '', trim: true, maxlength: 120 },
    category: { type: String, default: '', trim: true, maxlength: 120 },
    categories: [{ type: String, trim: true, maxlength: 120 }],
    subcategory: { type: String, default: '', trim: true, maxlength: 120 },
    competitors: [{ type: String, trim: true, maxlength: 120 }],
    interests: [{ type: String }],         // categories the user wants to follow
    goals: [{ type: String }],
    topics: [{ type: String, enum: ['news', 'govt', 'competitor', 'evergreen'] }],
    sources: [{ type: String }],
    days: { type: Number, default: 30, min: 1, max: 365 },
    query: { type: String, default: '', trim: true, maxlength: 500 },
    language: { type: String, default: 'en', trim: true, maxlength: 10 },
    timezone: { type: String, default: 'Asia/Kolkata', trim: true, maxlength: 80 },
    fetchSchedule: {
      enabled: { type: Boolean, default: false },
      frequency: { type: String, enum: ['daily', 'weekly'], default: 'daily' },
      dayOfWeek: { type: String, enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], default: 'Monday' },
      time: { type: String, default: '07:00', trim: true, maxlength: 5 },
      timezone: { type: String, default: 'Asia/Kolkata', trim: true, maxlength: 80 },
      lastRunAt: { type: Date },
      nextRunAt: { type: Date }
    },
    usageResetAt: { type: Date, default: null },
    avatar: { type: String, default: '' },  // optional URL
    passwordChangedAt: { type: Date },
    passwordResetToken: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },
    welcomeEmailSentAt: { type: Date, default: null },

    lastLoginAt: { type: Date },
    lastSeenAt: { type: Date },
    isActive: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    deleteReason: { type: String, default: '', trim: true, maxlength: 200 },
    purgeAfter: { type: Date, default: null, index: true },
    deletionBatchId: { type: String, default: '', trim: true, index: true },
    deletionRootUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    deletionScope: { type: String, enum: ['', 'user', 'tenant'], default: '' },
    cleanupStatus: { type: String, enum: ['', 'pending', 'in_progress', 'failed'], default: '', index: true },
    cleanupStartedAt: { type: Date, default: null },
    cleanupError: { type: String, default: '', trim: true, maxlength: 500 }
  },
  { timestamps: true }
);

userSchema.index({ tenantAdminId: 1, role: 1 });
userSchema.index({ deletedAt: 1, purgeAfter: 1, cleanupStatus: 1 });

userSchema.query.withDeleted = function withDeleted() {
  return this.setOptions({ withDeleted: true });
};

function excludeSoftDeleted(next) {
  if (this.getOptions && this.getOptions().withDeleted) return next();
  const query = this.getQuery();
  if (Object.prototype.hasOwnProperty.call(query, 'deletedAt')) return next();
  this.where({ deletedAt: null });
  return next();
}

userSchema.pre('find', excludeSoftDeleted);
userSchema.pre('findOne', excludeSoftDeleted);
userSchema.pre('countDocuments', excludeSoftDeleted);
userSchema.pre('count', excludeSoftDeleted);

// Hash password on save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  if (!this.isNew) {
    this.passwordChangedAt = Date.now() - 1000;
  }
  next();
});

// Method to compare password during login
userSchema.methods.matchPassword = async function (entered) {
  return bcrypt.compare(entered, this.password);
};

// Public JSON (strip password etc.)
userSchema.methods.toPublicJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
