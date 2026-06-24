const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const AnalyticsEvent = require('../models/AnalyticsEvent');

const router = express.Router();

const ALLOWED_TYPES = new Set(['page_view', 'click', 'section_view', 'engagement']);
const MAX_BATCH = 30;

function cleanText(value, max = 180) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function hashIp(value) {
  const salt = process.env.ANALYTICS_SALT || process.env.JWT_SECRET || 'analytics';
  return crypto.createHash('sha256').update(`${salt}:${value || ''}`).digest('hex').slice(0, 48);
}

function optionalUser(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ') || !process.env.JWT_SECRET) return {};
  try {
    const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    return {
      userId: mongoose.Types.ObjectId.isValid(decoded.id) ? decoded.id : undefined,
      role: cleanText(decoded.role, 40)
    };
  } catch {
    return {};
  }
}

function normalizeEvent(raw, req, authUser) {
  const type = cleanText(raw.type, 40);
  if (!ALLOWED_TYPES.has(type)) return null;

  const sessionId = cleanText(raw.sessionId, 80);
  const visitorId = cleanText(raw.visitorId, 80);
  if (!sessionId || !visitorId) return null;

  const durationMs = Math.max(0, Math.min(30 * 60 * 1000, Number(raw.durationMs || 0) || 0));
  const value = Math.max(0, Math.min(1000000, Number(raw.value || 1) || 1));
  const occurredAt = raw.occurredAt ? new Date(raw.occurredAt) : new Date();
  const safeOccurredAt = Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt;

  return {
    type,
    sessionId,
    visitorId,
    userId: authUser.userId,
    role: authUser.role || cleanText(raw.role, 40),
    path: cleanText(raw.path, 240),
    title: cleanText(raw.title, 180),
    section: cleanText(raw.section, 140),
    label: cleanText(raw.label, 180),
    targetType: cleanText(raw.targetType, 60),
    value,
    durationMs,
    metadata: raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : undefined,
    userAgent: cleanText(req.headers['user-agent'], 300),
    ipHash: hashIp(req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress),
    occurredAt: safeOccurredAt
  };
}

router.post('/events', async (req, res, next) => {
  try {
    const authUser = optionalUser(req);
    const incoming = Array.isArray(req.body?.events) ? req.body.events : [req.body];
    const docs = incoming.slice(0, MAX_BATCH)
      .map((event) => normalizeEvent(event || {}, req, authUser))
      .filter(Boolean);

    if (docs.length) await AnalyticsEvent.insertMany(docs, { ordered: false });
    res.status(202).json({ accepted: docs.length });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
