/**
 * EVERGREEN SCRAPER
 * -----------------
 * "Evergreen" = lasting how-to / guide content about opportunity and compliance topics.
 * We hit Tavily (https://tavily.com) for relevance-ranked search.
 *
 *  - If TAVILY_API_KEY is set, we use Tavily search API.
 *  - Otherwise we degrade to a simple DuckDuckGo HTML search so the
 *    column isn't empty.  Set the env to get high-quality results.
 */
const axios = require('axios');
const cheerio = require('cheerio');
const { EVERGREEN_TOPICS } = require('../config/sources');
const { matchCategory } = require('../config/categories');
const { hashUrl } = require('../utils/hash');
const tavilyService = require('../services/tavilyService');

const TIMEOUT = parseInt(process.env.SCRAPE_TIMEOUT_MS, 10) || 20000;
const UA = process.env.SCRAPE_USER_AGENT || 'Mozilla/5.0 (compatible; OpportunityOSBot/1.0)';

async function ddgSearch(query) {
  // DuckDuckGo HTML endpoint (no API key required, light-weight fallback).
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query + ' singapore')}`;
  const { data: html } = await axios.get(url, {
    timeout: TIMEOUT,
    headers: { 'User-Agent': UA },
    validateStatus: (s) => s >= 200 && s < 400
  });
  const $ = cheerio.load(html);
  const out = [];
  $('a.result__a').slice(0, 6).each((_i, el) => {
    const title = $(el).text().trim();
    const href = $(el).attr('href') || '';
    if (title && href.startsWith('http')) out.push({ title, url: href, snippet: '' });
  });
  return out;
}

async function searchOne(topic) {
  if (tavilyService.isEnabled()) {
    try {
      return await tavilyService.search(topic.query, { maxResults: 6, includeDomains: [] });
    } catch (err) {
      console.warn('[evergreen] tavily failed, falling back:', err.message);
    }
  }
  return ddgSearch(topic.query);
}

async function scrapeAllEvergreen({ pLimit, onProgress } = {}) {
  const limit = pLimit || ((fn) => fn());
  const perSource = {};
  const all = [];

  const jobs = EVERGREEN_TOPICS.map((topic) =>
    limit(async () => {
      const stat = { sourceId: topic.id, sourceName: topic.topic, type: 'evergreen', attempted: 1, fetched: 0, errors: 0, errorMessages: [] };
      perSource[topic.id] = stat;
      try {
        const results = await searchOne(topic);
        for (const r of results) {
          if (!r.url || !r.title) continue;
          const m = matchCategory(r.title + ' ' + (r.snippet || ''));
          all.push({
            title: r.title.slice(0, 300),
            url: r.url,
            urlHash: hashUrl(r.url),
            type: 'evergreen',
            source: topic.topic,
            sourceId: topic.id,
            sourceType: (() => { try { return new URL(r.url).hostname; } catch (_e) { return ''; } })(),
            category: m.category,
            subcategory: m.subcategory || '',
            summary: r.snippet || `Evergreen reference: ${topic.topic}`,
            country: 'Singapore',
            fetchedAt: new Date(),
            publishedAt: null,
            relevanceScore: r.score || 0
          });
          stat.fetched++;
        }
      } catch (err) {
        stat.errors = 1;
        stat.errorMessages.push(err.message);
      }
      if (onProgress) onProgress(stat);
    })
  );

  await Promise.all(jobs);
  return { items: all, perSource: Object.values(perSource) };
}

module.exports = { scrapeAllEvergreen };
