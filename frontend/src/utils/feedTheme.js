export const DEFAULT_DASHBOARD_APPEARANCE = {
  topicColors: {
    govt: { accent: '#d11243', soft: '#ffffff', border: '#e5e7eb', text: '#d11243' },
    news: { accent: '#d11243', soft: '#ffffff', border: '#e5e7eb', text: '#d11243' },
    evergreen: { accent: '#d11243', soft: '#ffffff', border: '#e5e7eb', text: '#d11243' },
    competitor: { accent: '#d11243', soft: '#ffffff', border: '#e5e7eb', text: '#d11243' }
  },
  sourceTrustColors: {
    high: { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857', icon: '#10b981' },
    moderate: { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c', icon: '#f59e0b' },
    low: { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c', icon: '#ef4444' }
  },
  relevanceScoreBands: [
    { key: 'high', label: 'High Relevance', min: 80, bg: '#ffffff', border: '#d1d5db', text: '#111827' },
    { key: 'medium', label: 'Qualified', min: 60, bg: '#ffffff', border: '#d1d5db', text: '#111827' },
    { key: 'low', label: 'Low Relevance', min: 0, bg: '#ffffff', border: '#d1d5db', text: '#111827' }
  ]
};

export function getDashboardAppearance() {
  return {
    topicColors: {
      govt: { ...DEFAULT_DASHBOARD_APPEARANCE.topicColors.govt },
      news: { ...DEFAULT_DASHBOARD_APPEARANCE.topicColors.news },
      evergreen: { ...DEFAULT_DASHBOARD_APPEARANCE.topicColors.evergreen },
      competitor: { ...DEFAULT_DASHBOARD_APPEARANCE.topicColors.competitor }
    },
    sourceTrustColors: {
      high: { ...DEFAULT_DASHBOARD_APPEARANCE.sourceTrustColors.high },
      moderate: { ...DEFAULT_DASHBOARD_APPEARANCE.sourceTrustColors.moderate },
      low: { ...DEFAULT_DASHBOARD_APPEARANCE.sourceTrustColors.low }
    },
    relevanceScoreBands: DEFAULT_DASHBOARD_APPEARANCE.relevanceScoreBands.map((band) => ({ ...band }))
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
