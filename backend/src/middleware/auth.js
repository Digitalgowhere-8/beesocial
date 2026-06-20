const jwt = require('jsonwebtoken');
const User = require('../models/User');

const PRESENCE_TOUCH_INTERVAL_MS = 30 * 1000;

/**
 * `protect` - verifies the JWT in `Authorization: Bearer <token>`
 *  and attaches `req.user`.
 */
async function protect(req, res, next) {
  let token;
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) token = header.slice(7);

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'User not found or inactive' });
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

    req.user = user;
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

function signToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

module.exports = { protect, requireRole, signToken };
