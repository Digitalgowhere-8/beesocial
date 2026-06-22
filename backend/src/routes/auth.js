const express = require('express');
const Joi = require('joi');
const User = require('../models/User');
const Plan = require('../models/Plan');
const { protect, signToken } = require('../middleware/auth');

const router = express.Router();

// Helper to catch async route errors and pass them to next()
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ---------------- Schemas ----------------
const registerSchema = Joi.object({
  name: Joi.string().min(2).max(120).required(),
  email: Joi.string().email().required(),
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
  email: Joi.string().email().required(),
  password: Joi.string().required()
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

// POST /api/auth/register   (creates a pending normal user)
router.post('/register', asyncHandler(async (req, res) => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.message });

  const exists = await User.findOne({ email: value.email.toLowerCase() });
  if (exists) return res.status(409).json({ message: 'Email already registered' });

  const user = await User.create({
    ...value,
    email: value.email.toLowerCase(),
    role: 'user',
    isActive: false,
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

  res.status(201).json({
    message: 'Registration submitted. An admin must approve your account before you can sign in.',
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
    return res.status(403).json({ message: 'Your account is pending admin approval.' });
  }

  const match = await user.matchPassword(value.password);
  if (!match) return res.status(401).json({ message: 'Invalid credentials' });

  user.lastLoginAt = new Date();
  user.lastSeenAt = user.lastLoginAt;
  await user.save();

  const token = signToken(user);
  res.json({ token, user: user.toPublicJSON() });
}));

// GET /api/auth/me
router.get('/me', protect, (req, res) => {
  res.json({ user: req.user.toPublicJSON() });
});

// GET /api/auth/plans
router.get('/plans', protect, asyncHandler(async (_req, res) => {
  const items = await Plan.find({}).sort({ planId: 1 }).lean();
  res.json({ items });
}));

// POST /api/auth/logout
router.post('/logout', protect, asyncHandler(async (req, res) => {
  req.user.lastSeenAt = null;
  await req.user.save();
  res.json({ message: 'Logged out' });
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
  await user.save();
  res.json({ message: 'Password updated' });
}));

module.exports = router;
