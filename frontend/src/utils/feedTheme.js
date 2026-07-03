export const DEFAULT_DASHBOARD_APPEARANCE = {
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
};

export function getDashboardAppearance(uiSettings = {}) {
  const incoming = uiSettings?.dashboardAppearance || {};
  return {
    topicColors: {
      govt: { ...DEFAULT_DASHBOARD_APPEARANCE.topicColors.govt, ...(incoming.topicColors?.govt || {}) },
      news: { ...DEFAULT_DASHBOARD_APPEARANCE.topicColors.news, ...(incoming.topicColors?.news || {}) },
      evergreen: { ...DEFAULT_DASHBOARD_APPEARANCE.topicColors.evergreen, ...(incoming.topicColors?.evergreen || {}) },
      competitor: { ...DEFAULT_DASHBOARD_APPEARANCE.topicColors.competitor, ...(incoming.topicColors?.competitor || {}) }
    },
    sourceTrustColors: {
      high: { ...DEFAULT_DASHBOARD_APPEARANCE.sourceTrustColors.high, ...(incoming.sourceTrustColors?.high || {}) },
      moderate: { ...DEFAULT_DASHBOARD_APPEARANCE.sourceTrustColors.moderate, ...(incoming.sourceTrustColors?.moderate || {}) },
      low: { ...DEFAULT_DASHBOARD_APPEARANCE.sourceTrustColors.low, ...(incoming.sourceTrustColors?.low || {}) }
    },
    relevanceScoreBands: Array.isArray(incoming.relevanceScoreBands) && incoming.relevanceScoreBands.length
      ? [...incoming.relevanceScoreBands].sort((a, b) => Number(b.min || 0) - Number(a.min || 0))
      : DEFAULT_DASHBOARD_APPEARANCE.relevanceScoreBands
  };
}

export function scoreBandForValue(score = 0, appearance = DEFAULT_DASHBOARD_APPEARANCE) {
  const value = Math.max(0, Math.min(100, Number(score) || 0));
  return appearance.relevanceScoreBands.find((band) => value >= Number(band.min || 0))
    || appearance.relevanceScoreBands.at(-1)
    || DEFAULT_DASHBOARD_APPEARANCE.relevanceScoreBands.at(-1);
}

export function sourceTrustTone(credibility = 'moderate', appearance = DEFAULT_DASHBOARD_APPEARANCE) {
  return appearance.sourceTrustColors[credibility] || appearance.sourceTrustColors.moderate;
}
