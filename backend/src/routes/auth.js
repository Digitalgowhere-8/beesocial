const express = require('express');
const Joi = require('joi');
const User = require('../models/User');
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
  designation: Joi.string().allow('').max(120)
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const updateSchema = Joi.object({
  name: Joi.string().min(2).max(120),
  company: Joi.string().allow('').max(120),
  designation: Joi.string().allow('').max(120),
  interests: Joi.array().items(Joi.string()),
  avatar: Joi.string().allow('').uri({ allowRelative: false })
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
    isActive: false
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

  Object.assign(req.user, value);
  await req.user.save();
  res.json({ user: req.user.toPublicJSON() });
}));

// POST /api/auth/change-password
router.post('/change-password', protect, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ message: 'newPassword must be at least 6 chars' });
  }
  const user = await User.findById(req.user._id).select('+password');
  const ok = await user.matchPassword(currentPassword || '');
  if (!ok) return res.status(401).json({ message: 'Current password is incorrect' });

  user.password = newPassword;
  await user.save();
  res.json({ message: 'Password updated' });
}));

module.exports = router;
