/**
 * NEWS SCRAPER
 * ------------
 * For each configured news source and opportunity keyword pair, hit the site's
 * search URL and extract result links from the HTML.  We use Cheerio
 * (a server-side jQuery-like parser) which handles even the messy markup
 * the four target sites emit.
 *
 *  - source: businesstimes.com.sg / straitstimes.com / channelnewsasia.com / aseanbriefing.com
 *  - query: pulled from CATEGORIES (sub-category keywords)
 *  - output: array of { title, url, source, sourceId, sourceType, category, subcategory, ... }
 *
 * Note: news sites change their HTML every few months.  The selectors below
 * cast a wide net (looking for any <a> with a substantive title) so the
 * scraper degrades gracefully when a site is redesigned.
 */
const axios = require('axios');
const cheerio = require('cheerio');
const { NEWS_SOURCES } = require('../config/sources');
const { CATEGORIES, matchCategory } = require('../config/categories');
const { hashUrl } = require('../utils/hash');

const TIMEOUT = parseInt(process.env.SCRAPE_TIMEOUT_MS, 10) || 20000;
const UA = process.env.SCRAPE_USER_AGENT || 'Mozilla/5.0 (compatible; BeeSocialBot/1.0)';

// Reasonable, generic link extractor.  We collect every <a> whose visible
// text looks like a headline (>= 20 chars) and whose href lives on the
// source's own host.
function extractArticles(html, source) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const items = [];

  $('a').each((_i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.length < 20 || text.length > 300) return;
    let absUrl;
    try {
      absUrl = new URL(href, `https://${source.origin}`).toString();
    } catch (_e) {
      return;
    }
    if (!absUrl.includes(source.origin)) return;
    if (/\/(search|tag|category|author|topic|page|subscribe|login)\//i.test(absUrl)) return;
    if (seen.has(absUrl)) return;
    seen.add(absUrl);
    items.push({ title: text.slice(0, 300), url: absUrl });
  });

  return items.slice(0, 15); // cap per query
}

async function searchSourceForQuery(source, queryString, { category, subcategory }) {
  const url = source.searchUrl(queryString);
  const { data: html } = await axios.get(url, {
    timeout: TIMEOUT,
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-SG,en;q=0.9' },
    validateStatus: (s) => s >= 200 && s < 400
  });
  const links = extractArticles(html, source);
  return links.map((l) => ({
    title: l.title,
    url: l.url,
    urlHash: hashUrl(l.url),
    type: 'news',
    source: source.name,
    sourceId: source.id,
    sourceType: source.origin,
    category,
    subcategory,
    summary: `Found via "${queryString}" search on ${source.name}.`,
    country: 'Singapore',
    fetchedAt: new Date(),
    publishedAt: null
  }));
}

/**
 * Iterate through every (source × sub-category) combination.
 * `onProgress({ sourceId, fetched, errors })` is called per source.
 */
async function scrapeAllNews({ pLimit, onProgress } = {}) {
  const limit = pLimit || ((fn) => fn());
  const perSource = {};
  NEWS_SOURCES.forEach((s) => {
    perSource[s.id] = { sourceId: s.id, sourceName: s.name, type: 'news', attempted: 0, fetched: 0, errors: 0, errorMessages: [] };
  });

  const all = [];
  const jobs = [];

  for (const source of NEWS_SOURCES) {
    for (const [category, val] of Object.entries(CATEGORIES)) {
      for (const [subcategory, keywords] of Object.entries(val.subcategories)) {
        // Use the *first* keyword as the search query — it's the canonical phrase.
        const q = keywords[0];
        jobs.push(
          limit(async () => {
            perSource[source.id].attempted++;
            try {
              const items = await searchSourceForQuery(source, q, { category, subcategory });
              // Re-tag using the matcher on the actual title — sometimes a different category fits better.
              for (const it of items) {
                const m = matchCategory(it.title);
                if (m.score >= 1) {
                  it.category = m.category;
                  it.subcategory = m.subcategory || it.subcategory;
                }
                all.push(it);
              }
              perSource[source.id].fetched += items.length;
            } catch (err) {
              perSource[source.id].errors++;
              perSource[source.id].errorMessages.push(`[${subcategory}] ${err.message}`);
            }
            if (onProgress) onProgress(perSource[source.id]);
          })
        );
      }
    }
  }

  await Promise.all(jobs);

  return { items: all, perSource: Object.values(perSource) };
}

module.exports = { scrapeAllNews };
