require('dotenv').config();

// --------- Startup Env Validation ---------
const REQUIRED_ENV = ['MONGO_URI', 'JWT_SECRET'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[boot] FATAL: Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { connectDB } = require('./config/db');
const { maintenanceGuard } = require('./middleware/maintenance');
const cronRunner = require('./jobs/cron');

const authRoutes = require('./routes/auth');
const articleRoutes = require('./routes/articles');
const adminRoutes = require('./routes/admin');
const profileSearchRoutes = require('./routes/profileSearch');
const blogRoutes = require('./routes/blogs');
const analyticsRoutes = require('./routes/analytics');
const realtimeRoutes = require('./routes/realtime');

const PORT = parseInt(process.env.PORT, 10) || 5000;
const AUTH_RATE_LIMIT_WINDOW_MS = parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000;
const AUTH_RATE_LIMIT_MAX = parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 200;
const EXPENSIVE_RATE_LIMIT_WINDOW_MS = parseInt(process.env.EXPENSIVE_RATE_LIMIT_WINDOW_MS, 10) || 60 * 1000;
const EXPENSIVE_RATE_LIMIT_MAX = parseInt(process.env.EXPENSIVE_RATE_LIMIT_MAX, 10) || 30;
const ANALYTICS_RATE_LIMIT_WINDOW_MS = parseInt(process.env.ANALYTICS_RATE_LIMIT_WINDOW_MS, 10) || 60 * 1000;
const ANALYTICS_RATE_LIMIT_MAX = parseInt(process.env.ANALYTICS_RATE_LIMIT_MAX, 10) || 300;

const app = express();
app.disable('x-powered-by');

// Enable 'trust proxy' to support correct IP rate-limiting behind proxies like Render
app.set('trust proxy', 1);

// --------- Middleware ---------
app.use(helmet());
app.use(express.json({ limit: '1mb' }));

const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const frontendOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const configuredOriginPatterns = (process.env.CORS_ORIGIN_PATTERNS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((pattern) => {
    try {
      return new RegExp(pattern);
    } catch (err) {
      console.warn(`[boot] Ignoring invalid CORS_ORIGIN_PATTERNS entry "${pattern}": ${err.message}`);
      return null;
    }
  })
  .filter(Boolean);
const defaultDevOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];
const configuredAllowedOrigins = [...new Set([...configuredOrigins, ...frontendOrigins])];
const allowedOrigins = configuredAllowedOrigins.length
  ? configuredAllowedOrigins
  : (process.env.NODE_ENV === 'production' ? [] : defaultDevOrigins);
function isAllowedCorsOrigin(origin) {
  return allowedOrigins.includes(origin) || configuredOriginPatterns.some((pattern) => pattern.test(origin));
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (isAllowedCorsOrigin(origin)) return callback(null, true);
      return callback(new Error('CORS origin not allowed'));
    },
    credentials: false
  })
);

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

function rateLimitKey(req) {
  const authHeader = String(req.headers.authorization || '').trim();
  if (authHeader.startsWith('Bearer ')) {
    return `token:${authHeader.slice(7)}`;
  }
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || 'anonymous';
}

// Rate-limit auth routes to discourage brute force
app.use(
  '/api/auth',
  rateLimit({
    windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
    max: AUTH_RATE_LIMIT_MAX,
    keyGenerator: rateLimitKey,
    standardHeaders: true,
    legacyHeaders: false
  })
);

// Rate-limit expensive AI / scraping endpoints
const expensiveLimit = rateLimit({
  windowMs: EXPENSIVE_RATE_LIMIT_WINDOW_MS,
  max: EXPENSIVE_RATE_LIMIT_MAX,
  keyGenerator: rateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests on this endpoint. Please wait a moment and try again.' }
});
app.use('/api/profile-search/trigger', expensiveLimit);
app.use('/api/blogs/generate', expensiveLimit);
app.use('/api/blogs/linkedin/generate', expensiveLimit);
app.use('/api/admin/fetch', expensiveLimit);
app.use('/api/admin/super/fetch/run', expensiveLimit);
app.use(
  '/api/analytics/events',
  rateLimit({
    windowMs: ANALYTICS_RATE_LIMIT_WINDOW_MS,
    max: ANALYTICS_RATE_LIMIT_MAX,
    keyGenerator: rateLimitKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many analytics events. Please slow down and try again shortly.' }
  })
);

// --------- Health ---------
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    env: process.env.NODE_ENV || 'development',
    time: new Date().toISOString()
  });
});

app.use(maintenanceGuard);

// --------- Routes ---------
app.use('/api/auth', authRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/profile-search', profileSearchRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/realtime', realtimeRoutes);

// Compatibility for deployments/proxies that route the API host directly
// without preserving the /api prefix.
app.use('/auth', authRoutes);
app.use('/analytics', analyticsRoutes);
app.use('/articles', articleRoutes);
app.use('/admin', adminRoutes);
app.use('/profile-search', profileSearchRoutes);
app.use('/blogs', blogRoutes);
app.use('/realtime', realtimeRoutes);

// --------- 404 + Error ---------
app.use((req, res) => res.status(404).json({ message: `Not found: ${req.method} ${req.path}` }));
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' ? { stack: err.stack } : {})
  });
});

// --------- Boot ---------
async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log('----------------------------------------------');
    console.log('  BeeSocial API');
    console.log(`  Listening on http://localhost:${PORT}`);
    console.log(`  ENV: ${process.env.NODE_ENV || 'development'}`);
    console.log('----------------------------------------------');
    cronRunner.start();
  });
}

start().catch((err) => {
  console.error('[boot] failed:', err.message || err);
  if (process.env.DEBUG_BOOT === 'true' && err.stack) {
    console.error(err.stack);
    if (err.cause) console.error('[boot] cause:', err.cause);
  }
  process.exit(1);
});
