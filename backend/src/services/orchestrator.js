/**
 * SCRAPE ORCHESTRATOR
 * -------------------
 * Single entry point that:
 *   1. Runs all enabled scrapers concurrently.
 *   2. Optionally calls AI service for summary / category enrichment.
 *   3. Bulk-upserts into MongoDB using `urlHash` to avoid duplicates.
 *   4. Records a FetchLog with per-source stats.
 *
 *  - Called by cron job once a day (07:00 IST default)
 *  - Called by Admin Panel "Fetch Now" button
 */
const Article = require('../models/Article');
const FetchLog = require('../models/FetchLog');
const aiService = require('./aiService');
const { getSystemSettings } = require('./systemSettings');
const { pLimit } = require('../utils/pLimit');
const { publishGlobalEvent } = require('../utils/realtime');

const { scrapeAllNews } = require('../scrapers/newsScraper');
const { scrapeAllGovt } = require('../scrapers/govScraper');
const { scrapeAllCompetitors } = require('../scrapers/competitorScraper');
const { scrapeAllEvergreen } = require('../scrapers/evergreenScraper');

const DEFAULT_TYPES = ['news', 'govt', 'competitor', 'evergreen'];

async function maybeEnrich(item, settings = {}) {
  if (!aiService.isEnabled()) return item;
  const aiConfig = { model: settings.aiModel };

  // AI summary
  if (settings.aiSummary) {
    const ai = await aiService.summarizeArticle({ title: item.title, snippet: item.summary, aiConfig });
    if (ai) item.aiSummary = ai;
  }

  // AI category - only if rule-based fell back to General
  if (settings.aiCategory && (item.category === 'General' || !item.category)) {
    const cls = await aiService.classifyCategory({ title: item.title, snippet: item.summary, aiConfig });
    if (cls?.category) {
      item.category = cls.category;
      item.subcategory = cls.subcategory || item.subcategory;
    }
  }
  return item;
}

/**
 * Upsert every item using its urlHash.
 * Returns { inserted, duplicates }.
 */
async function persist(items) {
  let inserted = 0;
  let duplicates = 0;
  if (!items.length) return { inserted, duplicates };

  // Pre-dedupe within the batch
  const map = new Map();
  for (const it of items) {
    if (it.urlHash && !map.has(it.urlHash)) map.set(it.urlHash, it);
  }
  const unique = Array.from(map.values());

  // Find which hashes already exist
  const hashes = unique.map((x) => x.urlHash);
  const existing = await Article.find({ urlHash: { $in: hashes } }).select('urlHash').lean();
  const existingSet = new Set(existing.map((x) => x.urlHash));

  const toInsert = unique.filter((x) => !existingSet.has(x.urlHash));
  duplicates = unique.length - toInsert.length;

  if (toInsert.length) {
    try {
      const res = await Article.insertMany(toInsert, { ordered: false });
      inserted = res.length;
    } catch (err) {
      // Even with `ordered:false`, count successes from err.insertedDocs if available
      if (err.insertedDocs) {
        inserted = err.insertedDocs.length;
        duplicates += toInsert.length - inserted;
      } else {
        throw err;
      }
    }
  }
  return { inserted, duplicates };
}

async function runAll({ triggeredBy = 'manual', triggeredByUser = null, types = null } = {}) {
  const startedAt = new Date();
  const settings = await getSystemSettings();
  const wantedTypes = (Array.isArray(types) && types.length) ? types : DEFAULT_TYPES;
  const concurrency = parseInt(process.env.SCRAPE_CONCURRENCY, 10) || 4;
  const limit = pLimit(concurrency);

  const log = await FetchLog.create({
    triggeredBy,
    triggeredByUser,
    status: 'running',
    startedAt,
    perSource: [],
    totalFetched: 0,
    totalInserted: 0,
    totalDuplicates: 0,
    totalErrors: 0
  });

  let allItems = [];
  const perSourceStats = [];
  const scrapers = [];

  if (wantedTypes.includes('news'))       scrapers.push({ name: 'news',       fn: scrapeAllNews });
  if (wantedTypes.includes('govt'))       scrapers.push({ name: 'govt',       fn: scrapeAllGovt });
  if (wantedTypes.includes('competitor')) scrapers.push({ name: 'competitor', fn: scrapeAllCompetitors });
  if (wantedTypes.includes('evergreen'))  scrapers.push({ name: 'evergreen',  fn: scrapeAllEvergreen });

  for (const s of scrapers) {
    try {
      const { items, perSource } = await s.fn({ pLimit: limit });
      allItems = allItems.concat(items);
      perSourceStats.push(...perSource);
      console.log(`[orchestrator] ${s.name}: scraped ${items.length} items`);
    } catch (err) {
      console.error(`[orchestrator] ${s.name} failed:`, err.message);
      perSourceStats.push({
        sourceId: s.name, sourceName: s.name, type: s.name,
        attempted: 1, fetched: 0, errors: 1, errorMessages: [err.message]
      });
    }
  }

  // Optionally enrich with AI - run in parallel with a low concurrency
  if (aiService.isEnabled() && (settings.aiSummary || settings.aiCategory)) {
    const aiLimit = pLimit(3);
    await Promise.all(allItems.map((it) => aiLimit(() => maybeEnrich(it, settings))));
  }

  // Persist
  let totalInserted = 0;
  let totalDuplicates = 0;
  try {
    const { inserted, duplicates } = await persist(allItems);
    totalInserted = inserted;
    totalDuplicates = duplicates;
  } catch (err) {
    console.error('[orchestrator] persist failed:', err);
  }

  const finishedAt = new Date();
  log.status = perSourceStats.some((s) => s.errors > 0 && s.fetched === 0)
    ? (totalInserted > 0 ? 'partial' : 'failed')
    : 'success';
  log.finishedAt = finishedAt;
  log.durationMs = finishedAt - startedAt;
  log.perSource = perSourceStats;
  log.totalFetched   = allItems.length;
  log.totalInserted  = totalInserted;
  log.totalDuplicates = totalDuplicates;
  log.totalErrors    = perSourceStats.reduce((a, x) => a + (x.errors || 0), 0);
  await log.save();

  if (totalInserted > 0) {
    publishGlobalEvent('content', {
      scope: 'articles',
      action: 'fetched',
      count: totalInserted
    });
  }

  return {
    logId: log._id,
    totalFetched: allItems.length,
    totalInserted,
    totalDuplicates,
    totalErrors: log.totalErrors,
    durationMs: log.durationMs
  };
}

module.exports = { runAll };
