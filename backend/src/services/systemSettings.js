const SystemSetting = require('../models/SystemSetting');

const SETTINGS_KEY = 'platform';
const DEFAULT_SETTINGS = {
  aiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  aiSummary: false,
  aiCategory: false,
  maintenanceMode: false
};

let cachedSettings = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5000;

function normalizeSettings(value = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    maintenanceMode: Boolean(value.maintenanceMode),
    aiSummary: Boolean(value.aiSummary),
    aiCategory: Boolean(value.aiCategory),
    aiModel: String(value.aiModel || DEFAULT_SETTINGS.aiModel)
  };
}

async function getSystemSettings({ useCache = true } = {}) {
  const now = Date.now();
  if (useCache && cachedSettings && now - cachedAt < CACHE_TTL_MS) {
    return cachedSettings;
  }

  const row = await SystemSetting.findOne({ key: SETTINGS_KEY }).lean();
  cachedSettings = normalizeSettings(row?.value || {});
  cachedAt = now;
  return cachedSettings;
}

async function saveSystemSettings(patch = {}) {
  const current = await getSystemSettings({ useCache: false });
  const next = normalizeSettings({ ...current, ...patch });
  await SystemSetting.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { $set: { value: next } },
    { upsert: true, new: true }
  );
  cachedSettings = next;
  cachedAt = Date.now();
  return next;
}

module.exports = {
  getSystemSettings,
  saveSystemSettings
};
