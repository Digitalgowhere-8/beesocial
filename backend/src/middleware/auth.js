const jwt = require('jsonwebtoken');
const User = require('../models/User');
const UserSession = require('../models/UserSession');

const PRESENCE_TOUCH_INTERVAL_MS = 30 * 1000;
const SESSION_TOUCH_INTERVAL_MS = 30 * 1000;
const REALTIME_TOKEN_EXPIRES_IN = process.env.REALTIME_TOKEN_EXPIRES_IN || '2m';

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    return { token: header.slice(7), source: 'header' };
  }
  if (req.query?.token) {
    return { token: String(req.query.token), source: 'query' };
  }
  return { token: '', source: '' };
}

function verifyRealtimeRequestToken(decoded, req) {
  return decoded?.purpose === 'realtime'
    && req.baseUrl === '/api/realtime'
    && req.path === '/stream';
}

/**
 * `protect` - verifies the JWT in `Authorization: Bearer <token>`
 *  and attaches `req.user`.
 */
async function protect(req, res, next) {
  const { token, source } = extractToken(req);

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (source === 'query' && !verifyRealtimeRequestToken(decoded, req)) {
      return res.status(401).json({ message: 'Query token is not allowed for this endpoint' });
    }
    if (!decoded.sid) {
      return res.status(401).json({ message: 'Session missing. Please log in again.' });
    }
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'User not found or inactive' });
    }

    const session = await UserSession.findOne({
      sessionId: decoded.sid,
      userId: user._id,
      revokedAt: null,
      expiresAt: { $gt: new Date() }
    });
    if (!session) {
      return res.status(401).json({ message: 'Session expired or revoked. Please log in again.' });
    }

    if (user.passwordChangedAt) {
      const changedTime = Math.floor(user.passwordChangedAt.getTime() / 1000);
      if (decoded.iat < changedTime) {
        return res.status(401).json({ message: 'Password recently changed. Please log in again.' });
      }
    }

    const now = Date.now();
    const lastSeen = user.lastSeenAt ? new Date(user.lastSeenAt).getTime() : 0;
    const shouldTouchPresence = req.path !== '/logout' && !req.originalUrl.endsWith('/auth/logout');
    if (shouldTouchPresence && (!lastSeen || now - lastSeen > PRESENCE_TOUCH_INTERVAL_MS)) {
      user.lastSeenAt = new Date(now);
      User.updateOne({ _id: user._id }, { $set: { lastSeenAt: user.lastSeenAt } }).catch((err) => {
        console.error('[auth] failed to update presence:', err.message);
      });
    }

    const sessionLastActive = session.lastActiveAt ? new Date(session.lastActiveAt).getTime() : 0;
    if (shouldTouchPresence && (!sessionLastActive || now - sessionLastActive > SESSION_TOUCH_INTERVAL_MS)) {
      session.lastActiveAt = new Date(now);
      UserSession.updateOne({ _id: session._id }, { $set: { lastActiveAt: session.lastActiveAt } }).catch((err) => {
        console.error('[auth] failed to update session activity:', err.message);
      });
    }

    req.user = user;
    req.session = session;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token invalid or expired' });
  }
}

/**
 * `requireRole('admin', 'super_admin')` - middleware factory that allows only the given role(s).
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Not authorized' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: `Forbidden: requires role ${roles.join(' or ')}` });
    }
    next();
  };
}

function signToken(user, sessionId) {
  return jwt.sign(
    { id: user._id, role: user.role, sid: sessionId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function signRealtimeToken(user, sessionId) {
  return jwt.sign(
    { id: user._id, role: user.role, sid: sessionId, purpose: 'realtime' },
    process.env.JWT_SECRET,
    { expiresIn: REALTIME_TOKEN_EXPIRES_IN }
  );
}

module.exports = { protect, requireRole, signToken, signRealtimeToken };
