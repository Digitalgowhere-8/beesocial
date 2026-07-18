export const DEFAULT_DASHBOARD_APPEARANCE = {
  topicColors: {
    govt: { accent: '#10B981', soft: '#ECFDF5', border: '#A7F3D0', text: '#064E3B' },
    news: { accent: '#F4B60B', soft: '#FFF8DF', border: '#F4B60B', text: '#5F4700' },
    evergreen: { accent: '#8B5CF6', soft: '#F5F3FF', border: '#DDD6FE', text: '#5B21B6' },
    competitor: { accent: '#F59E0B', soft: '#FFF7ED', border: '#FED7AA', text: '#92400E' }
  },
  sourceTrustColors: {
    high: { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857', icon: '#10b981' },
    moderate: { bg: '#FFF9E8', border: '#F6D365', text: '#B7791F', icon: '#EAB308' },
    low: { bg: '#FEF2F2', border: '#F87171', text: '#B91C1C', icon: '#DC2626' }
  },
  relevanceScoreBands: [
    { key: 'high', label: 'High Relevance', min: 80, bg: '#ffffff', border: '#E3E7DC', text: '#111827' },
    { key: 'medium', label: 'Qualified', min: 60, bg: '#ffffff', border: '#E3E7DC', text: '#111827' },
    { key: 'low', label: 'Low Relevance', min: 0, bg: '#ffffff', border: '#E3E7DC', text: '#111827' }
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
