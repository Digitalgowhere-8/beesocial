const FetchLog = require('../models/FetchLog');
const { CATEGORIES } = require('../config/categories');
const { configuredFetchCountries } = require('../config/fetchSources');
const { buildN8nPayload, cleanList } = require('./queryBuilder');
const { getSystemSettings, saveSystemSettings } = require('./systemSettings');
const { runProfileSearch } = require('./profileSearchRunner');
const { persistProfileResults } = require('./profileResultsService');
const progress = require('./profileRunProgress');
const { publishGlobalEvent } = require('../utils/realtime');

const TOPICS = ['news', 'govt', 'competitor', 'evergreen'];
const DEFAULT_CONFIG = {
  countries: [],
  topics: TOPICS,
  days: 30,
  targetPerTopic: 150,
  minTavilyScore: undefined,
  language: 'en',
  timezone: 'Asia/Kolkata',
  schedule: {
    enabled: false,
    frequency: 'daily',
    time: '07:00',
    timezone: 'Asia/Kolkata',
    lastRunAt: null
  }
};

let running = false;
let runningLogId = '';

function unique(values) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function normalizeConfig(value = {}) {
  const allowedCountries = configuredFetchCountries();
  const countries = unique(value.countries)
    .filter((country) => allowedCountries.includes(country));
  const topics = unique(value.topics)
    .map((topic) => topic.toLowerCase())
    .filter((topic) => TOPICS.includes(topic));
  const schedule = value.schedule && typeof value.schedule === 'object' ? value.schedule : {};

  return {
    ...DEFAULT_CONFIG,
    ...value,
    countries,
    topics: topics.length ? topics : DEFAULT_CONFIG.topics,
    days: Math.max(1, Math.min(365, Number(value.days || DEFAULT_CONFIG.days) || DEFAULT_CONFIG.days)),
    targetPerTopic: Math.max(1, Math.min(150, Number(value.targetPerTopic || DEFAULT_CONFIG.targetPerTopic) || DEFAULT_CONFIG.targetPerTopic)),
    minTavilyScore: value.minTavilyScore === undefined || value.minTavilyScore === null || value.minTavilyScore === ''
      ? undefined
      : Math.max(0, Math.min(100, Number(value.minTavilyScore) || 0)),
    language: String(value.language || DEFAULT_CONFIG.language),
    timezone: String(value.timezone || DEFAULT_CONFIG.timezone),
    schedule: {
      enabled: Boolean(schedule.enabled),
      frequency: schedule.frequency === 'weekly' ? 'weekly' : 'daily',
      time: /^\d{2}:\d{2}$/.test(String(schedule.time || '')) ? schedule.time : DEFAULT_CONFIG.schedule.time,
      timezone: String(schedule.timezone || value.timezone || DEFAULT_CONFIG.schedule.timezone),
      lastRunAt: schedule.lastRunAt || null
    }
  };
}

async function getPlatformFetchConfig() {
  const settings = await getSystemSettings({ useCache: false });
  return normalizeConfig(settings.platformFetch || {});
}

function scheduleSignature(schedule = {}) {
  return [
    Boolean(schedule.enabled),
    schedule.frequency === 'weekly' ? 'weekly' : 'daily',
    /^\d{2}:\d{2}$/.test(String(schedule.time || '')) ? schedule.time : DEFAULT_CONFIG.schedule.time,
    String(schedule.timezone || DEFAULT_CONFIG.schedule.timezone)
  ].join('|');
}

async function savePlatformFetchConfig(patch = {}) {
  const current = await getSystemSettings({ useCache: false });
  const previous = normalizeConfig(current.platformFetch || {});
  const next = normalizeConfig({ ...(current.platformFetch || {}), ...patch });
  const scheduleChanged = scheduleSignature(previous.schedule) !== scheduleSignature(next.schedule);

  if (scheduleChanged) {
    next.schedule.lastRunAt = null;
  }

  await saveSystemSettings({ platformFetch: next });
  return next;
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
  return Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: safeTimezone(timezone),
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).formatToParts(date).map((part) => [part.type, part.value]));
}

function dateKeyInZone(date, timezone) {
  const parts = zonedParts(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function minutesInZone(date, timezone) {
  const parts = zonedParts(date, timezone);
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function shouldRunNow(config, now = new Date()) {
  const schedule = config.schedule || {};
  if (!schedule.enabled || !config.countries.length || !config.topics.length) return false;
  const timezone = safeTimezone(schedule.timezone || config.timezone);
  const [hour, minute] = String(schedule.time || '07:00').split(':').map(Number);
  const targetMinutes = hour * 60 + minute;
  const currentMinutes = minutesInZone(now, timezone);
  if (currentMinutes < targetMinutes) return false;
  if (!schedule.lastRunAt) return true;
  if (dateKeyInZone(new Date(schedule.lastRunAt), timezone) === dateKeyInZone(now, timezone)) return false;
  if (schedule.frequency === 'weekly') {
    return now.getTime() - new Date(schedule.lastRunAt).getTime() >= 6.5 * 24 * 60 * 60 * 1000;
  }
  return true;
}

function resultRows(country, payload, persisted) {
  const byTopic = {};
  for (const item of payload.results || []) {
    const type = item.type || 'news';
    byTopic[type] = byTopic[type] || { fetched: 0, inserted: 0 };
    byTopic[type].fetched += 1;
  }
  let remainingInserted = Number(persisted.inserted || 0);
  return Object.entries(byTopic).map(([type, row]) => {
    const inserted = Math.min(row.fetched, remainingInserted);
    remainingInserted -= inserted;
    return {
      sourceId: `platform-${country}-${type}`,
      sourceName: `${country} ${type}`,
      type,
      attempted: row.fetched,
      fetched: row.fetched,
      inserted,
      duplicates: Math.max(0, row.fetched - inserted),
      errors: 0,
      errorMessages: []
    };
  });
}

async function updateLogTotals(logId, patch) {
  await FetchLog.findByIdAndUpdate(logId, { $set: patch });
}

async function runPlatformFetchJob({ logId, triggeredByUser, config, trigger = 'manual' }) {
  const startedAt = new Date();
  const categories = Object.keys(CATEGORIES);
  const totals = { fetched: 0, inserted: 0, duplicates: 0, errors: 0 };
  const perSource = [];

  for (let i = 0; i < config.countries.length; i += 1) {
    const country = config.countries[i];
    const countryPrefix = `${country} (${i + 1}/${config.countries.length})`;
    const basePercent = 8 + Math.floor((i / config.countries.length) * 82);
    progress.updateRun(logId, {
      step: `country:${country}:start`,
      percent: basePercent,
      message: `${countryPrefix}: starting ${config.topics.length} selected topic fetch`
    });

    try {
      const payload = buildN8nPayload({
        // Scheduled platform fetch is global, so it may not have a real user id.
        // Use a stable synthetic id for the search pipeline and clear ownership
        // again before persisting the final shared results.
        userId: String(triggeredByUser || 'platform-scheduler'),
        trigger,
        country,
        categories,
        topics: config.topics,
        days: config.days,
        targetPerTopic: config.targetPerTopic,
        minTavilyScore: config.minTavilyScore,
        language: config.language,
        timezone: config.timezone,
        strictSources: false
      }, {
        logId: String(logId),
        startedAt: startedAt.toISOString()
      });

      const resultPayload = await runProfileSearch(payload, {
        onProgress: ({ step, message }) => progress.updateRun(logId, {
          step,
          percent: Math.min(90, basePercent + 4),
          message: `${countryPrefix}: ${message}`
        })
      });

      const persisted = await persistProfileResults({
        ...resultPayload,
        userId: '',
        savedSearchId: '',
        logId: '',
        country,
        global: true
      }, { skipLog: true });

      totals.fetched += Number(resultPayload.resultCount || 0);
      totals.inserted += Number(persisted.inserted || 0);
      totals.duplicates += Number(persisted.duplicates || 0);
      perSource.push(...resultRows(country, resultPayload, persisted));
      await updateLogTotals(logId, {
        totalFetched: totals.fetched,
        totalInserted: totals.inserted,
        totalDuplicates: totals.duplicates,
        totalErrors: totals.errors,
        perSource,
        resultCount: totals.inserted,
        notes: `Platform fetch running: ${countryPrefix} complete`
      });
      progress.updateRun(logId, {
        step: `country:${country}:saved`,
        percent: Math.min(92, basePercent + Math.floor(82 / config.countries.length)),
        message: `${countryPrefix}: saved ${persisted.inserted} new result${persisted.inserted === 1 ? '' : 's'} (${persisted.duplicates} duplicate${persisted.duplicates === 1 ? '' : 's'})`
      });
    } catch (error) {
      totals.errors += 1;
      perSource.push({
        sourceId: `platform-${country}`,
        sourceName: `${country} platform fetch`,
        type: 'profile_intelligence',
        attempted: 1,
        fetched: 0,
        inserted: 0,
        duplicates: 0,
        errors: 1,
        errorMessages: [error.message]
      });
      await updateLogTotals(logId, {
        totalFetched: totals.fetched,
        totalInserted: totals.inserted,
        totalDuplicates: totals.duplicates,
        totalErrors: totals.errors,
        perSource,
        notes: `Platform fetch error for ${country}: ${error.message}`
      });
      progress.updateRun(logId, {
        step: `country:${country}:error`,
        message: `${countryPrefix}: failed: ${error.message}`
      });
    }
  }

  const finishedAt = new Date();
  const status = totals.errors && totals.inserted === 0 ? 'failed' : totals.errors ? 'partial' : 'success';
  await FetchLog.findByIdAndUpdate(logId, {
    $set: {
      status,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      totalFetched: totals.fetched,
      totalInserted: totals.inserted,
      totalDuplicates: totals.duplicates,
      totalErrors: totals.errors,
      perSource,
      resultCount: totals.inserted,
      notes: `Platform fetch ${status}: ${totals.inserted} new, ${totals.duplicates} duplicate, ${totals.errors} error`
    }
  });

  progress.finishRun(logId, {
    status,
    step: 'complete',
    processed: totals.inserted,
    resultCount: totals.fetched,
    message: `Platform fetch ${status}: ${totals.inserted} new result${totals.inserted === 1 ? '' : 's'} saved`
  });

  if (trigger === 'schedule') {
    const latest = await getPlatformFetchConfig();
    await savePlatformFetchConfig({
      ...latest,
      schedule: { ...(latest.schedule || {}), lastRunAt: startedAt.toISOString() }
    });
  }

  if (totals.inserted > 0) {
    publishGlobalEvent('content', {
      scope: 'articles',
      action: 'platform-fetched',
      count: totals.inserted
    });
  }
}

async function triggerPlatformFetch({ triggeredByUser, config, trigger = 'manual' }) {
  if (running) {
    const err = new Error('A platform fetch is already running');
    err.status = 409;
    throw err;
  }
  const normalized = normalizeConfig(config || await getPlatformFetchConfig());
  if (!normalized.countries.length) {
    const err = new Error('Select at least one country before running platform fetch');
    err.status = 400;
    throw err;
  }
  if (!normalized.topics.length) {
    const err = new Error('Select at least one topic before running platform fetch');
    err.status = 400;
    throw err;
  }

  const log = await FetchLog.create({
    triggeredBy: trigger === 'schedule' ? 'cron' : 'manual',
    triggeredByUser,
    status: 'running',
    startedAt: new Date(),
    country: normalized.countries.join(', '),
    sector: 'platform intelligence',
    query: `${normalized.countries.length} countries, ${normalized.topics.join(', ')}`,
    notes: 'Platform fetch queued by super admin'
  });

  running = true;
  runningLogId = String(log._id);
  progress.startRun(runningLogId, 'Platform fetch queued');

  setImmediate(() => {
    runPlatformFetchJob({ logId: runningLogId, triggeredByUser, config: normalized, trigger })
      .catch(async (error) => {
        await FetchLog.findByIdAndUpdate(log._id, {
          $set: {
            status: 'failed',
            finishedAt: new Date(),
            durationMs: Date.now() - new Date(log.startedAt).getTime(),
            totalErrors: 1,
            notes: `Platform fetch failed: ${error.message}`
          }
        });
        progress.finishRun(runningLogId, {
          status: 'failed',
          step: 'failed',
          error: error.message,
          message: `Platform fetch failed: ${error.message}`
        });
      })
      .finally(() => {
        running = false;
        runningLogId = '';
      });
  });

  return { logId: log._id, config: normalized };
}

async function runDuePlatformFetch() {
  if (running) return { checked: 1, due: 0, triggered: 0, running: true };
  const config = await getPlatformFetchConfig();
  if (!shouldRunNow(config)) return { checked: 1, due: 0, triggered: 0 };
  await triggerPlatformFetch({ triggeredByUser: undefined, config, trigger: 'schedule' });
  return { checked: 1, due: 1, triggered: 1 };
}

function getPlatformFetchStatus() {
  return { running, logId: runningLogId };
}

module.exports = {
  TOPICS,
  getPlatformFetchConfig,
  savePlatformFetchConfig,
  triggerPlatformFetch,
  runDuePlatformFetch,
  getPlatformFetchStatus,
  normalizeConfig
};
