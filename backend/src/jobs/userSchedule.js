const axios = require('axios');
const FetchLog = require('../models/FetchLog');
const User = require('../models/User');
const { buildN8nPayload } = require('../services/queryBuilder');
const { runProfileSearch } = require('../services/profileSearchRunner');
const { persistProfileResults } = require('../services/profileResultsService');
const progress = require('../services/profileRunProgress');

const runningUsers = new Set();

function isValidTime(value) {
  return /^\d{2}:\d{2}$/.test(String(value || ''));
}

function safeTimezone(value, fallback = 'Asia/Kolkata') {
  const timezone = String(value || fallback);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return fallback;
  }
}

function zonedParts(date, timezone) {
  const safeZone = safeTimezone(timezone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: safeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function dateKeyInZone(date, timezone) {
  const parts = zonedParts(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function minutesInZone(date, timezone) {
  const parts = zonedParts(date, timezone);
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function hasSchedulerAccess(user = {}) {
  if (user.role === 'super_admin') return true;
  return user.access?.canUseScheduler !== false;
}

function shouldRunNow(user, now = new Date()) {
  if (!hasSchedulerAccess(user)) return false;

  const schedule = user.fetchSchedule || {};
  if (!schedule.enabled) return false;

  const timezone = safeTimezone(schedule.timezone || user.timezone || 'Asia/Kolkata');
  const time = isValidTime(schedule.time) ? schedule.time : '07:00';
  const [hour, minute] = time.split(':').map(Number);
  const targetMinutes = hour * 60 + minute;
  const currentMinutes = minutesInZone(now, timezone);

  if (currentMinutes < targetMinutes) return false;

  if (!schedule.lastRunAt) return true;

  const lastKey = dateKeyInZone(new Date(schedule.lastRunAt), timezone);
  const todayKey = dateKeyInZone(now, timezone);
  if (lastKey === todayKey) return false;

  if (schedule.frequency === 'weekly') {
    const elapsedMs = now.getTime() - new Date(schedule.lastRunAt).getTime();
    return elapsedMs >= 6.5 * 24 * 60 * 60 * 1000;
  }

  return true;
}

async function triggerUser(user) {
  const useN8nWebhook = process.env.PROFILE_SEARCH_USE_N8N === 'true';
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (useN8nWebhook && !webhookUrl) throw new Error('N8N_WEBHOOK_URL is not configured');

  const startedAt = new Date();
  const publicApiUrl = String(process.env.PUBLIC_API_URL || process.env.API_BASE_URL || '').replace(/\/$/, '');
  const payload = buildN8nPayload(user, {
    userId: user._id.toString(),
    trigger: 'schedule',
    callbackUrl: process.env.N8N_CALLBACK_URL || (publicApiUrl ? `${publicApiUrl}/api/n8n/results` : ''),
    callbackSecret: process.env.N8N_CALLBACK_SECRET || '',
    startedAt: startedAt.toISOString()
  });

  const log = await FetchLog.create({
    triggeredBy: 'n8n',
    userId: user._id,
    country: payload.country,
    region: payload.region,
    sector: payload.sector,
    query: payload.query,
    status: 'running',
    startedAt,
    notes: 'Scheduled profile intelligence trigger'
  });

  payload.logId = String(log._id);
  progress.startRun(payload.logId, 'Fetch queued from scheduler');

  try {
    if (!useN8nWebhook) {
      progress.updateRun(payload.logId, {
        step: 'start',
        percent: 8,
        message: 'Scheduled fetch started'
      });
      const resultPayload = await runProfileSearch(payload, {
        onProgress: ({ step, message }) => progress.updateRun(payload.logId, { step, message })
      });
      progress.updateRun(payload.logId, {
        step: 'save',
        percent: 88,
        message: 'Saving scheduled results to database'
      });
      await persistProfileResults(resultPayload);
      progress.finishRun(payload.logId, {
        status: 'success',
        step: 'complete',
        processed: resultPayload.resultCount,
        resultCount: resultPayload.resultCount,
        message: `Scheduled fetch complete: ${resultPayload.resultCount} result${resultPayload.resultCount === 1 ? '' : 's'} saved`
      });
      user.fetchSchedule.lastRunAt = startedAt;
      await user.save();
      return;
    }

    await axios.post(webhookUrl, payload, {
      timeout: parseInt(process.env.N8N_WEBHOOK_TIMEOUT_MS, 10) || 1000 * 60 * 20,
      headers: {
        ...(process.env.N8N_WEBHOOK_SECRET ? { 'x-n8n-secret': process.env.N8N_WEBHOOK_SECRET } : {})
      }
    });

    user.fetchSchedule.lastRunAt = startedAt;
    await user.save();
  } catch (error) {
    await FetchLog.findByIdAndUpdate(log._id, {
      status: 'failed',
      finishedAt: new Date(),
      durationMs: Date.now() - startedAt.getTime(),
      totalErrors: 1,
      notes: `Scheduled n8n trigger failed: ${error.message}`
    });
    progress.finishRun(payload.logId, {
      status: 'failed',
      step: 'failed',
      error: error.message,
      message: `Scheduled fetch failed: ${error.message}`
    });
    throw error;
  }
}

// Stagger delay between triggers to avoid simultaneous API rate limit hits.
// Default: 3000ms (3 seconds) between each user. Override via SCHEDULE_STAGGER_MS env var.
const STAGGER_MS = parseInt(process.env.SCHEDULE_STAGGER_MS, 10) || 3000;

async function runDueSchedules() {
  const candidates = await User.find({
    isActive: true,
    role: { $in: ['admin', 'super_admin'] },
    'fetchSchedule.enabled': true,
    $or: [
      { role: 'super_admin' },
      { 'access.canUseScheduler': { $ne: false } }
    ]
  }).limit(parseInt(process.env.SCHEDULE_SCAN_LIMIT, 10) || 200);

  const now = new Date();
  const due = candidates.filter((user) => shouldRunNow(user, now));
  const batchSize = parseInt(process.env.SCHEDULE_BATCH_SIZE, 10) || 20;

  let staggerIndex = 0;
  for (const user of due.slice(0, batchSize)) {
    const id = user._id.toString();
    if (runningUsers.has(id)) continue;
    runningUsers.add(id);

    // Delay each trigger by (index × STAGGER_MS) so they don't all fire simultaneously.
    // e.g. User 1 → 0s, User 2 → 3s, User 3 → 6s, User 4 → 9s ...
    const delay = staggerIndex * STAGGER_MS;
    staggerIndex += 1;

    setTimeout(() => {
      triggerUser(user)
        .catch((err) => console.error(`[schedule] failed for ${id}:`, err.message))
        .finally(() => runningUsers.delete(id));
    }, delay);
  }

  return { checked: candidates.length, due: due.length, triggered: Math.min(due.length, batchSize) };
}

module.exports = {
  runDueSchedules,
  shouldRunNow
};
