/**
 * GOVERNMENT SCRAPER
 * ------------------
 * Each gov body publishes a "newsroom" / "news & announcements" page.
 * We fetch that page and extract the links to individual announcements.
 *
 *  - ACRA: news-events/news-announcements
 *  - IRAS: news-events/newsroom
 *  - MOM:  newsroom/press-releases
 *  - EDB:  media-releases-publications/press-releases
 *  - MAS:  /news
 */
const axios = require('axios');
const cheerio = require('cheerio');
const { GOVT_SOURCES } = require('../config/sources');
const { matchCategory } = require('../config/categories');
const { hashUrl } = require('../utils/hash');

const TIMEOUT = parseInt(process.env.SCRAPE_TIMEOUT_MS, 10) || 20000;
const UA = process.env.SCRAPE_USER_AGENT || 'Mozilla/5.0 (compatible; OpportunityOSBot/1.0)';

function extractGovLinks(html, source) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const items = [];

  $('a').each((_i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.length < 18 || text.length > 280) return;

    let absUrl;
    try {
      absUrl = new URL(href, `https://${source.origin}`).toString();
    } catch (_e) {
      return;
    }
    if (!absUrl.includes(source.origin)) return;
    // Filter out menu / static pages
    if (/\/(about|contact|careers|search|login|register|sitemap|privacy|terms)\b/i.test(absUrl)) return;
    if (seen.has(absUrl)) return;
    seen.add(absUrl);
    items.push({ title: text.slice(0, 300), url: absUrl });
  });

  return items.slice(0, 25);
}

async function scrapeSource(source) {
  const { data: html } = await axios.get(source.feedUrl, {
    timeout: TIMEOUT,
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-SG,en;q=0.9' },
    validateStatus: (s) => s >= 200 && s < 400
  });
  const links = extractGovLinks(html, source);
  return links.map((l) => {
    const m = matchCategory(l.title);
    return {
      title: l.title,
      url: l.url,
      urlHash: hashUrl(l.url),
      type: 'govt',
      source: source.name,
      sourceId: source.id,
      sourceType: source.origin,
      category: m.category !== 'General' ? m.category : 'Government Update',
      subcategory: m.subcategory || '',
      summary: `Latest announcement from ${source.name}.`,
      country: 'Singapore',
      fetchedAt: new Date(),
      publishedAt: null
    };
  });
}

async function scrapeAllGovt({ pLimit, onProgress } = {}) {
  const limit = pLimit || ((fn) => fn());
  const perSource = {};
  const all = [];

  const jobs = GOVT_SOURCES.map((source) =>
    limit(async () => {
      const stat = { sourceId: source.id, sourceName: source.name, type: 'govt', attempted: 1, fetched: 0, errors: 0, errorMessages: [] };
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

module.exports = { scrapeAllGovt };
