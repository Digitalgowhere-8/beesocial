const SystemSetting = require('../models/SystemSetting');
const { normalizeSourceTrustMapping } = require('./sourceTrust');

const SETTINGS_KEY = 'platform';
const DEFAULT_SETTINGS = {
  aiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  aiSummary: false,
  aiCategory: false,
  maintenanceMode: false,
  dashboardAppearance: {
    topicColors: {
      govt: { accent: '#2bb98a', soft: '#eefbf6', border: '#c4f1de', text: '#13795b' },
      news: { accent: '#4c82ff', soft: '#eff4ff', border: '#cfe0ff', text: '#2857c5' },
      evergreen: { accent: '#9a6bff', soft: '#f4efff', border: '#e1d2ff', text: '#6f43d6' },
      competitor: { accent: '#f4a524', soft: '#fff6e8', border: '#ffe0ad', text: '#c87907' }
    },
    sourceTrustColors: {
      high: { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857', icon: '#10b981' },
      moderate: { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c', icon: '#f59e0b' },
      low: { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c', icon: '#ef4444' }
    },
    relevanceScoreBands: [
      { key: 'high', label: 'High Relevance', min: 80, bg: '#ecfdf5', border: '#a7f3d0', text: '#047857' },
      { key: 'medium', label: 'Qualified', min: 60, bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
      { key: 'low', label: 'Low Relevance', min: 0, bg: '#fff7ed', border: '#fed7aa', text: '#c2410c' }
    ]
  },
  sourceTrustMapping: {
    high: [],
    moderate: [],
    low: []
  }
};

let cachedSettings = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5000;

function cleanText(value) {
  return String(value || '').trim();
}

function normalizeHex(value, fallback) {
  const color = cleanText(value);
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function normalizeTopicColors(value = {}) {
  const defaults = DEFAULT_SETTINGS.dashboardAppearance.topicColors;
  return {
    govt: {
      accent: normalizeHex(value?.govt?.accent, defaults.govt.accent),
      soft: normalizeHex(value?.govt?.soft, defaults.govt.soft),
      border: normalizeHex(value?.govt?.border, defaults.govt.border),
      text: normalizeHex(value?.govt?.text, defaults.govt.text)
    },
    news: {
      accent: normalizeHex(value?.news?.accent, defaults.news.accent),
      soft: normalizeHex(value?.news?.soft, defaults.news.soft),
      border: normalizeHex(value?.news?.border, defaults.news.border),
      text: normalizeHex(value?.news?.text, defaults.news.text)
    },
    evergreen: {
      accent: normalizeHex(value?.evergreen?.accent, defaults.evergreen.accent),
      soft: normalizeHex(value?.evergreen?.soft, defaults.evergreen.soft),
      border: normalizeHex(value?.evergreen?.border, defaults.evergreen.border),
      text: normalizeHex(value?.evergreen?.text, defaults.evergreen.text)
    },
    competitor: {
      accent: normalizeHex(value?.competitor?.accent, defaults.competitor.accent),
      soft: normalizeHex(value?.competitor?.soft, defaults.competitor.soft),
      border: normalizeHex(value?.competitor?.border, defaults.competitor.border),
      text: normalizeHex(value?.competitor?.text, defaults.competitor.text)
    }
  };
}

function normalizeSourceTrustColors(value = {}) {
  const defaults = DEFAULT_SETTINGS.dashboardAppearance.sourceTrustColors;
  const normalizeLevel = (level) => ({
    bg: normalizeHex(value?.[level]?.bg, defaults[level].bg),
    border: normalizeHex(value?.[level]?.border, defaults[level].border),
    text: normalizeHex(value?.[level]?.text, defaults[level].text),
    icon: normalizeHex(value?.[level]?.icon, defaults[level].icon)
  });
  return {
    high: normalizeLevel('high'),
    moderate: normalizeLevel('moderate'),
    low: normalizeLevel('low')
  };
}

function normalizeRelevanceScoreBands(value = []) {
  const defaults = DEFAULT_SETTINGS.dashboardAppearance.relevanceScoreBands;
  const input = Array.isArray(value) ? value : [];
  const byKey = new Map(input.map((item) => [cleanText(item?.key).toLowerCase(), item]));
  return defaults.map((row) => {
    const current = byKey.get(row.key) || {};
    const min = Math.max(0, Math.min(100, Number(current.min ?? row.min) || row.min));
    return {
      key: row.key,
      label: cleanText(current.label) || row.label,
      min,
      bg: normalizeHex(current.bg, row.bg),
      border: normalizeHex(current.border, row.border),
      text: normalizeHex(current.text, row.text)
    };
  }).sort((a, b) => b.min - a.min);
}

function normalizeDashboardAppearance(value = {}) {
  return {
    topicColors: normalizeTopicColors(value.topicColors),
    sourceTrustColors: normalizeSourceTrustColors(value.sourceTrustColors),
    relevanceScoreBands: normalizeRelevanceScoreBands(value.relevanceScoreBands)
  };
}

function normalizeSettings(value = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    maintenanceMode: Boolean(value.maintenanceMode),
    aiSummary: Boolean(value.aiSummary),
    aiCategory: Boolean(value.aiCategory),
    aiModel: String(value.aiModel || DEFAULT_SETTINGS.aiModel),
    dashboardAppearance: normalizeDashboardAppearance(value.dashboardAppearance),
    sourceTrustMapping: normalizeSourceTrustMapping(value.sourceTrustMapping)
  };
}

function publicUiSettings(settings = {}) {
  const normalized = normalizeSettings(settings);
  return {
    dashboardAppearance: normalized.dashboardAppearance
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
  saveSystemSettings,
  publicUiSettings
};
