const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getSystemSettings } = require('../services/systemSettings');

const PUBLIC_PATHS = [
  '/api/health',
  '/api/auth/login',
  '/api/auth/logout'
];

function isPublicPath(path) {
  return PUBLIC_PATHS.some((item) => path === item || path.startsWith(`${item}/`));
}

async function maintenanceGuard(req, res, next) {
  if (!req.path.startsWith('/api') || isPublicPath(req.path)) return next();

  try {
    const settings = await getSystemSettings();
    if (!settings.maintenanceMode) return next();

    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('role isActive');
        if (user?.isActive && user.role === 'super_admin') return next();
      } catch {
        // Fall through to maintenance response.
      }
    }

    return res.status(503).json({
      code: 'MAINTENANCE_MODE',
      message: 'The platform is temporarily under maintenance. Please try again later.'
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { maintenanceGuard };
