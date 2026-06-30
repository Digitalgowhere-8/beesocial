const express = require('express');
const Joi = require('joi');
const crypto = require('crypto');
const User = require('../models/User');
const Plan = require('../models/Plan');
const UserSession = require('../models/UserSession');
const { protect, signToken, signRealtimeToken } = require('../middleware/auth');
const { buildPasswordResetEmail, isConfigured: isEmailConfigured, sendEmail } = require('../services/emailService');

const router = express.Router();
const JWT_SESSION_DAYS = Math.max(1, Number(process.env.JWT_SESSION_DAYS || 7));
const PASSWORD_RESET_TOKEN_TTL_MINUTES = Math.max(5, Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 15));

function sessionExpiryDate() {
  return new Date(Date.now() + JWT_SESSION_DAYS * 24 * 60 * 60 * 1000);
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || '';
}

function parseDeviceInfo(userAgent = '') {
  const ua = String(userAgent || '');
  const browser =
    /Edg\//i.test(ua) ? 'Edge'
      : /Chrome\//i.test(ua) ? 'Chrome'
      : /Firefox\//i.test(ua) ? 'Firefox'
      : /Safari\//i.test(ua) && !/Chrome\//i.test(ua) ? 'Safari'
      : /OPR\//i.test(ua) ? 'Opera'
      : 'Unknown';
  const os =
    /Windows/i.test(ua) ? 'Windows'
      : /Mac OS X/i.test(ua) ? 'macOS'
      : /Android/i.test(ua) ? 'Android'
      : /iPhone|iPad|iOS/i.test(ua) ? 'iOS'
      : /Linux/i.test(ua) ? 'Linux'
      : 'Unknown';
  return {
    browser,
    os,
    deviceLabel: `${browser} on ${os}`
  };
}

async function revokeSessionsForUser(userId, { exceptSessionId = '', revokedBy = null, reason = '' } = {}) {
  const query = {
    userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() }
  };
  if (exceptSessionId) query.sessionId = { $ne: exceptSessionId };
  await UserSession.updateMany(query, {
    $set: {
      revokedAt: new Date(),
      revokedBy,
      revokeReason: reason || 'revoked'
    }
  });
}

async function syncUserPresenceFromSessions(userId) {
  const latestSession = await UserSession.findOne({
    userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() }
  }).sort({ lastActiveAt: -1 }).select('lastActiveAt').lean();

  await User.updateOne(
    { _id: userId },
    { $set: { lastSeenAt: latestSession?.lastActiveAt || null } }
  );
}

// Strict email validation - rejects patterns like jitesh@gmail.com.com
function isValidEmail(email) {
  const str = String(email || '').trim();
  // Basic format check
  if (!/^[^\s@]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(str)) return false;
  const [, domain] = str.split('@');
  const parts = domain.split('.');
  // Reject if more than 3 domain levels (e.g., a.b.c.d)
  if (parts.length > 3) return false;
  // Reject if last two parts are identical (e.g., .com.com, .net.net)
  if (parts.length === 3 && parts[1] === parts[2]) return false;
  return true;
}

// Helper to catch async route errors and pass them to next()
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ---------------- Schemas ----------------
const registerSchema = Joi.object({
  name: Joi.string().min(2).max(120).required(),
  email: Joi.string().email().required().custom((value) => {
    if (!isValidEmail(value)) throw new Error('Invalid email format. Please check for typos like multiple domain suffixes (e.g., .com.com)');
    return value;
  }),
  password: Joi.string().min(6).max(128).required(),
  company: Joi.string().allow('').max(120),
  designation: Joi.string().allow('').max(120),
  country: Joi.string().allow('').max(120),
  region: Joi.string().allow('').max(120),
  sector: Joi.string().allow('').max(120),
  userType: Joi.string().allow('').max(120),
  category: Joi.string().allow('').max(120),
  categories: Joi.array().items(Joi.string().max(120)),
  subcategory: Joi.string().allow('').max(120),
  competitors: Joi.array().items(Joi.string().max(120)),
  topics: Joi.array().items(Joi.string().valid('news', 'govt', 'competitor', 'evergreen')),
  sources: Joi.array().items(Joi.string().max(120)),
  days: Joi.number().integer().min(1).max(365),
  query: Joi.string().allow('').max(500),
  language: Joi.string().allow('').max(10),
  timezone: Joi.string().allow('').max(80),
  fetchSchedule: Joi.object({
    enabled: Joi.boolean(),
    frequency: Joi.string().valid('daily', 'weekly'),
    dayOfWeek: Joi.string().valid('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'),
    time: Joi.string().pattern(/^\d{2}:\d{2}$/),
    timezone: Joi.string().allow('').max(80)
  })
});

const loginSchema = Joi.object({
  email: Joi.string().email().required().custom((value) => {
    if (!isValidEmail(value)) throw new Error('Invalid email format. Please check for typos like multiple domain suffixes (e.g., .com.com)');
    return value;
  }),
  password: Joi.string().required()
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required().custom((value) => {
    if (!isValidEmail(value)) throw new Error('Invalid email format. Please check for typos like multiple domain suffixes (e.g., .com.com)');
    return value;
  })
});

const resetPasswordSchema = Joi.object({
  token: Joi.string().trim().min(20).required(),
  newPassword: Joi.string().min(6).max(128).required()
});

const updateSchema = Joi.object({
  name: Joi.string().min(2).max(120),
  company: Joi.string().allow('').max(120),
  designation: Joi.string().allow('').max(120),
  country: Joi.string().allow('').max(120),
  region: Joi.string().allow('').max(120),
  sector: Joi.string().allow('').max(120),
  userType: Joi.string().allow('').max(120),
  category: Joi.string().allow('').max(120),
  categories: Joi.array().items(Joi.string().max(120)),
  subcategory: Joi.string().allow('').max(120),
  competitors: Joi.array().items(Joi.string().max(120)),
  topics: Joi.array().items(Joi.string().valid('news', 'govt', 'competitor', 'evergreen')),
  sources: Joi.array().items(Joi.string().max(120)),
  days: Joi.number().integer().min(1).max(365),
  query: Joi.string().allow('').max(500),
  language: Joi.string().allow('').max(10),
  timezone: Joi.string().allow('').max(80),
  fetchSchedule: Joi.object({
    enabled: Joi.boolean(),
    frequency: Joi.string().valid('daily', 'weekly'),
    dayOfWeek: Joi.string().valid('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'),
    time: Joi.string().pattern(/^\d{2}:\d{2}$/),
    timezone: Joi.string().allow('').max(80)
  }),
  avatar: Joi.string().allow('')
});

// ---------------- Routes ----------------

// POST /api/auth/register   (creates a pending admin account)
router.post('/register', asyncHandler(async (req, res) => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.message });

  const exists = await User.findOne({ email: value.email.toLowerCase() });
  if (exists) return res.status(409).json({ message: 'Email already registered' });

  const user = await User.create({
    ...value,
    email: value.email.toLowerCase(),
    role: 'admin',
    isActive: false,
    memberLimit: 3,
    access: {
      canFetch: true,
      canCreateMembers: true,
      canUseContentRepository: true,
      canUseBlogStudio: false,
      canUseSavedSearches: true,
      canUseScheduler: false
    },
    country: value.country || 'India',
    region: value.region || '',
    sector: value.sector || '',
    userType: value.userType || '',
    category: value.category || '',
    categories: Array.isArray(value.categories) ? value.categories : [],
    subcategory: value.subcategory || '',
    competitors: Array.isArray(value.competitors) ? value.competitors : [],
    topics: Array.isArray(value.topics) ? value.topics : ['news', 'govt', 'competitor', 'evergreen'],
    sources: Array.isArray(value.sources) ? value.sources : [],
    days: Number(value.days || 30),
    query: value.query || '',
    language: value.language || 'en',
    timezone: value.timezone || 'Asia/Kolkata',
    fetchSchedule: {
      enabled: Boolean(value.fetchSchedule?.enabled),
      frequency: value.fetchSchedule?.frequency || 'daily',
      time: value.fetchSchedule?.time || '07:00',
      timezone: value.fetchSchedule?.timezone || value.timezone || 'Asia/Kolkata'
    }
  });

  user.tenantAdminId = user._id;
  await user.save();

  res.status(201).json({
    message: 'Registration submitted. A super admin must approve your admin account before you can sign in.',
    user: user.toPublicJSON()
  });
}));

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.message });

  const user = await User.findOne({ email: value.email.toLowerCase() }).select('+password');
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });
  if (!user.isActive) {
    return res.status(403).json({ message: 'Your account is pending super admin approval.' });
  }

  const match = await user.matchPassword(value.password);
  if (!match) return res.status(401).json({ message: 'Invalid credentials' });

  user.lastLoginAt = new Date();
  user.lastSeenAt = user.lastLoginAt;
  await user.save();

  const sessionMeta = parseDeviceInfo(req.headers['user-agent']);
  const session = await UserSession.create({
    userId: user._id,
    sessionId: crypto.randomBytes(24).toString('hex'),
    deviceLabel: sessionMeta.deviceLabel,
    browser: sessionMeta.browser,
    os: sessionMeta.os,
    ip: clientIp(req),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 512),
    lastActiveAt: user.lastLoginAt,
    expiresAt: sessionExpiryDate()
  });

  const token = signToken(user, session.sessionId);
  res.json({ token, user: user.toPublicJSON(), session: session.toObject() });
}));

// POST /api/auth/forgot-password
router.post('/forgot-password', asyncHandler(async (req, res) => {
  const { error, value } = forgotPasswordSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.message });
  if (!isEmailConfigured()) {
    return res.status(503).json({ message: 'Password recovery email is not configured yet.' });
  }

  const normalizedEmail = value.email.toLowerCase();
  const user = await User.findOne({ email: normalizedEmail, isActive: true }).select('name email');
  const genericMessage = 'If this email exists in our system, we have sent a password reset link.';

  if (!user) return res.json({ message: genericMessage });

  const resetToken = crypto.randomBytes(32).toString('hex');
  const hashedResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000);
  const frontendBaseUrl = String(process.env.FRONTEND_URL || '').replace(/\/$/, '');

  if (!frontendBaseUrl) {
    return res.status(500).json({ message: 'FRONTEND_URL is missing on the server.' });
  }

  user.passwordResetToken = hashedResetToken;
  user.passwordResetExpiresAt = expiresAt;
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${frontendBaseUrl}/reset-password?token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(user.email)}`;
  const emailPayload = buildPasswordResetEmail({
    name: user.name,
    resetUrl,
    expiresMinutes: PASSWORD_RESET_TOKEN_TTL_MINUTES
  });

  try {
    await sendEmail({
      to: user.email,
      replyTo: process.env.EMAIL_REPLY_TO || undefined,
      ...emailPayload
    });
  } catch (sendError) {
    user.passwordResetToken = undefined;
    user.passwordResetExpiresAt = undefined;
    await user.save({ validateBeforeSave: false });
    throw sendError;
  }

  res.json({ message: genericMessage });
}));

// POST /api/auth/reset-password
router.post('/reset-password', asyncHandler(async (req, res) => {
  const { error, value } = resetPasswordSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.message });

  const hashedToken = crypto.createHash('sha256').update(value.token).digest('hex');
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpiresAt: { $gt: new Date() }
  }).select('+password +passwordResetToken +passwordResetExpiresAt');

  if (!user) {
    return res.status(400).json({ message: 'This reset link is invalid or has expired.' });
  }

  user.password = value.newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpiresAt = undefined;
  user.lastLoginAt = new Date();
  user.lastSeenAt = user.lastLoginAt;
  await user.save();

  await revokeSessionsForUser(user._id, {
    revokedBy: user._id,
    reason: 'password_reset'
  });

  res.json({ message: 'Password reset successful. You can now sign in with your new password.' });
}));

// GET /api/auth/me
router.get('/me', protect, (req, res) => {
  res.json({ user: req.user.toPublicJSON(), session: req.session?.toObject?.() || null });
});

function fetchScheduleSignature(schedule = {}, fallbackTimezone = 'Asia/Kolkata') {
  return [
    Boolean(schedule?.enabled),
    schedule?.frequency === 'weekly' ? 'weekly' : 'daily',
    /^\d{2}:\d{2}$/.test(String(schedule?.time || '')) ? schedule.time : '07:00',
    String(schedule?.timezone || fallbackTimezone || 'Asia/Kolkata')
  ].join('|');
}

// GET /api/auth/plans
router.get('/plans', protect, asyncHandler(async (_req, res) => {
  const items = await Plan.find({}).sort({ planId: 1 }).lean();
  res.json({ items });
}));

// POST /api/auth/realtime-token
router.post('/realtime-token', protect, asyncHandler(async (req, res) => {
  const token = signRealtimeToken(req.user, req.session.sessionId);
  res.json({ token });
}));

// POST /api/auth/logout
router.post('/logout', protect, asyncHandler(async (req, res) => {
  if (req.session) {
    req.session.revokedAt = new Date();
    req.session.revokedBy = req.user._id;
    req.session.revokeReason = 'logout';
    await req.session.save();
  }
  await syncUserPresenceFromSessions(req.user._id);
  res.json({ message: 'Logged out' });
}));

// GET /api/auth/sessions
router.get('/sessions', protect, asyncHandler(async (req, res) => {
  const items = await UserSession.find({ userId: req.user._id })
    .sort({ lastActiveAt: -1, createdAt: -1 })
    .lean();

  res.json({
    items: items.map((item) => ({
      ...item,
      isCurrent: req.session ? item.sessionId === req.session.sessionId : false,
      isActive: !item.revokedAt && new Date(item.expiresAt).getTime() > Date.now()
    }))
  });
}));

// POST /api/auth/sessions/:id/revoke
router.post('/sessions/:id/revoke', protect, asyncHandler(async (req, res) => {
  const session = await UserSession.findOne({ _id: req.params.id, userId: req.user._id });
  if (!session) return res.status(404).json({ message: 'Session not found' });

  session.revokedAt = new Date();
  session.revokedBy = req.user._id;
  session.revokeReason = req.body?.reason || 'revoked_by_user';
  await session.save();
  await syncUserPresenceFromSessions(req.user._id);

  res.json({ message: 'Session revoked', sessionId: session.sessionId });
}));

// POST /api/auth/logout-all
router.post('/logout-all', protect, asyncHandler(async (req, res) => {
  await revokeSessionsForUser(req.user._id, {
    revokedBy: req.user._id,
    reason: 'logout_all'
  });
  await syncUserPresenceFromSessions(req.user._id);
  res.json({ message: 'All sessions revoked' });
}));

// PATCH /api/auth/me
router.patch('/me', protect, asyncHandler(async (req, res) => {
  const { error, value } = updateSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.message });

  const update = { ...value };
  if (!['admin', 'super_admin'].includes(req.user.role)) {
    delete update.country;
    delete update.region;
    delete update.sector;
    delete update.userType;
    delete update.category;
    delete update.categories;
    delete update.subcategory;
    delete update.competitors;
    delete update.topics;
    delete update.sources;
    delete update.days;
    delete update.query;
    delete update.language;
    delete update.timezone;
    delete update.fetchSchedule;
  }

  if (update.fetchSchedule) {
    const previousSignature = fetchScheduleSignature(req.user.fetchSchedule, req.user.timezone);
    const nextSignature = fetchScheduleSignature(update.fetchSchedule, update.timezone || req.user.timezone);
    if (previousSignature !== nextSignature) {
      update.fetchSchedule = {
        ...req.user.fetchSchedule?.toObject?.(),
        ...update.fetchSchedule,
        lastRunAt: null
      };
    }
  }

  Object.assign(req.user, update);
  await req.user.save();
  res.json({ user: req.user.toPublicJSON() });
}));

// POST /api/auth/change-password
router.post('/change-password', protect, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6 || newPassword.length > 128) {
    return res.status(400).json({ message: 'newPassword must be between 6 and 128 characters' });
  }
  const user = await User.findById(req.user._id).select('+password');
  const ok = await user.matchPassword(currentPassword || '');
  if (!ok) return res.status(401).json({ message: 'Current password is incorrect' });

  user.password = newPassword;
  user.lastLoginAt = new Date();
  user.lastSeenAt = user.lastLoginAt;
  await user.save();

  await revokeSessionsForUser(user._id, {
    revokedBy: user._id,
    reason: 'password_changed'
  });

  const sessionMeta = parseDeviceInfo(req.headers['user-agent']);
  const session = await UserSession.create({
    userId: user._id,
    sessionId: crypto.randomBytes(24).toString('hex'),
    deviceLabel: sessionMeta.deviceLabel,
    browser: sessionMeta.browser,
    os: sessionMeta.os,
    ip: clientIp(req),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 512),
    lastActiveAt: user.lastLoginAt,
    expiresAt: sessionExpiryDate()
  });
  const token = signToken(user, session.sessionId);

  res.json({ message: 'Password updated', token, user: user.toPublicJSON(), session: session.toObject() });
}));

module.exports = router;
