/**
 * Tavily search service.
 * Docs: https://docs.tavily.com
 *
 * If TAVILY_API_KEY is not set, `isEnabled()` returns false and callers
 * should fall back to whatever default they prefer.
 */
const axios = require('axios');

function isEnabled() {
  return !!process.env.TAVILY_API_KEY;
}

/**
 * Run a Tavily search.
 *
 * @param {string} query
 * @param {object} opts { maxResults, includeDomains, excludeDomains, topic, searchDepth, timeRange, includeRawContent }
 * @returns {Promise<Array<{ title, url, snippet, score }>>}
 */
async function search(query, opts = {}) {
  if (!isEnabled()) throw new Error('Tavily not configured');

  const body = {
    api_key: process.env.TAVILY_API_KEY,
    query,
    topic: opts.topic || 'news',
    search_depth: opts.searchDepth || 'basic',
    max_results: opts.maxResults || 5,
    include_answer: false,
    include_raw_content: Boolean(opts.includeRawContent),
    include_domains: opts.includeDomains || [],
    exclude_domains: opts.excludeDomains || []
  };
  if (opts.timeRange) body.time_range = opts.timeRange;

  let data;
  try {
    const response = await axios.post('https://api.tavily.com/search', body, {
      timeout: opts.timeoutMs || 30000,
      headers: { 'Content-Type': 'application/json' }
    });
    data = response.data;
  } catch (error) {
    const status = error.response?.status;
    const details = error.response?.data?.detail || error.response?.data?.message || error.response?.data?.error;
    const detailText = typeof details === 'object' && details !== null ? JSON.stringify(details) : details;
    const message = [
      status ? `Tavily status ${status}` : 'Tavily request failed',
      detailText ? String(detailText) : error.message
    ].filter(Boolean).join(': ');
    throw new Error(message);
  }

  return (data.results || []).map((r) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.content || '',
    rawContent: r.raw_content || r.rawContent || '',
    publishedAt: r.published_date || r.publishedAt || '',
    score: typeof r.score === 'number' ? Math.round(r.score * 100) : 0
  }));
}

/**
 * Score how relevant a given title/snippet is to opportunity intelligence.
 * Returns a 0-100 score.
 *
 * If Tavily is disabled, returns 0 (relevance simply unknown).
 */
async function relevanceScore(text) {
  if (!isEnabled() || !text) return 0;
  try {
    const results = await search(`government schemes grants policy tenders startup opportunities ${text.slice(0, 80)}`, {
      maxResults: 1
    });
    return results[0]?.score || 0;
  } catch (_e) {
    return 0;
  }
}

module.exports = { isEnabled, search, relevanceScore };
