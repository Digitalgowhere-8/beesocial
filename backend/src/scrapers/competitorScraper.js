/**
 * COMPETITOR SCRAPER
 * ------------------
 * Pulls latest "insights" / "news" pages from each competitor's site.
 * Same generic link-extraction strategy as the govt scraper.
 */
const axios = require('axios');
const cheerio = require('cheerio');
const { COMPETITOR_SOURCES } = require('../config/sources');
const { matchCategory } = require('../config/categories');
const { hashUrl } = require('../utils/hash');

const TIMEOUT = parseInt(process.env.SCRAPE_TIMEOUT_MS, 10) || 20000;
const UA = process.env.SCRAPE_USER_AGENT || 'Mozilla/5.0 (compatible; OpportunityOSBot/1.0)';

function extractLinks(html, source) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const items = [];

  $('a').each((_i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.length < 20 || text.length > 280) return;
    let absUrl;
    try {
      absUrl = new URL(href, `https://${source.origin}`).toString();
    } catch (_e) {
      return;
    }
    if (!absUrl.includes(source.origin)) return;
    if (/\/(careers|contact|about|search|login|en-us\/contact|sitemap|privacy|terms|cookie)\b/i.test(absUrl)) return;
    if (seen.has(absUrl)) return;
    seen.add(absUrl);
    items.push({ title: text.slice(0, 300), url: absUrl });
  });

  return items.slice(0, 20);
}

async function scrapeSource(source) {
  const { data: html } = await axios.get(source.feedUrl, {
    timeout: TIMEOUT,
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-SG,en;q=0.9' },
    validateStatus: (s) => s >= 200 && s < 400
  });
  const links = extractLinks(html, source);

  return links
    // Keep only Singapore-related items where we can detect it
    .filter((l) => {
      const t = l.title.toLowerCase();
      const u = l.url.toLowerCase();
      return (
        t.includes('singapore') ||
        t.includes('asean') ||
        t.includes('asia') ||
        u.includes('/singapore') ||
        u.includes('/sg/') ||
        u.includes('asia')
      );
    })
    .map((l) => {
      const m = matchCategory(l.title);
      return {
        title: l.title,
        url: l.url,
        urlHash: hashUrl(l.url),
        type: 'competitor',
        source: source.name,
        sourceId: source.id,
        sourceType: source.origin,
        category: m.category,
        subcategory: m.subcategory || '',
        summary: `Insights from competitor ${source.name}.`,
        country: 'Singapore',
        fetchedAt: new Date(),
        publishedAt: null
      };
    });
}

async function scrapeAllCompetitors({ pLimit, onProgress } = {}) {
  const limit = pLimit || ((fn) => fn());
  const perSource = {};
  const all = [];

  const jobs = COMPETITOR_SOURCES.map((source) =>
    limit(async () => {
      const stat = { sourceId: source.id, sourceName: source.name, type: 'competitor', attempted: 1, fetched: 0, errors: 0, errorMessages: [] };
      perSource[source.id] = stat;
      try {
        const items = await scrapeSource(source);
        all.push(...items);
        stat.fetched = items.length;
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

module.exports = { scrapeAllCompetitors };
