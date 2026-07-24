/**
 * SOURCES CONFIGURATION
 * ---------------------
 * Central list of every source we scrape.  To add a new source, just push to
 * one of the arrays below; nothing else in the codebase changes.
 *
 *  type     = 'news' | 'govt' | 'competitor' | 'evergreen'
 *  id       = stable kebab-case slug (used in DB & filters)
 *  name     = human-readable label
 *  origin   = the base host (used in dedup / display)
 *  searchUrl(query) = builder that returns a full URL for a given keyword
 *  feedUrl  = static listing URL (govt newsrooms, competitor insight pages)
 */

const NEWS_SOURCES = [
  {
    id: 'business-times',
    name: 'The Business Times',
    origin: 'businesstimes.com.sg',
    searchUrl: (q) => `https://www.businesstimes.com.sg/search?query=${encodeURIComponent(q)}`
  },
  {
    id: 'channel-news-asia',
    name: 'Channel News Asia',
    origin: 'channelnewsasia.com',
    searchUrl: (q) => `https://www.channelnewsasia.com/search?q=${encodeURIComponent(q)}`
  },
  {
    id: 'straits-times',
    name: 'The Straits Times',
    origin: 'straitstimes.com',
    searchUrl: (q) => `https://www.straitstimes.com/search?searchkey=${encodeURIComponent(q)}`
  },
  {
    id: 'asean-briefing',
    name: 'ASEAN Briefing',
    origin: 'aseanbriefing.com',
    searchUrl: (q) => `https://www.aseanbriefing.com/?s=${encodeURIComponent(q)}`
  }
];

const GOVT_SOURCES = [
  {
    id: 'acra',
    name: 'ACRA - Accounting & Corporate Regulatory Authority',
    origin: 'acra.gov.sg',
    feedUrl: 'https://www.acra.gov.sg/news-events/news-announcements'
  },
  {
    id: 'iras',
    name: 'IRAS - Inland Revenue Authority of Singapore',
    origin: 'iras.gov.sg',
    feedUrl: 'https://www.iras.gov.sg/news-events/newsroom'
  },
  {
    id: 'mom',
    name: 'MOM - Ministry of Manpower',
    origin: 'mom.gov.sg',
    feedUrl: 'https://www.mom.gov.sg/newsroom/press-releases'
  },
  {
    id: 'edb',
    name: 'EDB - Economic Development Board',
    origin: 'edb.gov.sg',
    feedUrl: 'https://www.edb.gov.sg/en/about-edb/media-releases-publications/press-releases.html'
  },
  {
    id: 'mas',
    name: 'MAS - Monetary Authority of Singapore',
    origin: 'mas.gov.sg',
    feedUrl: 'https://www.mas.gov.sg/news'
  }
];

const COMPETITOR_SOURCES = [
  {
    id: 'vistra',
    name: 'Vistra',
    origin: 'vistra.com',
    feedUrl: 'https://www.vistra.com/insights'
  },
  {
    id: 'tmf-group',
    name: 'TMF Group',
    origin: 'tmf-group.com',
    feedUrl: 'https://www.tmf-group.com/en/news-insights/'
  },
  {
    id: 'tricor',
    name: 'Tricor Group',
    origin: 'tricorglobal.com',
    feedUrl: 'https://www.tricorglobal.com/insights'
  },
  {
    id: 'acclime',
    name: 'Acclime',
    origin: 'acclime.com',
    feedUrl: 'https://acclime.com/news/'
  },
  {
    id: 'kpmg',
    name: 'KPMG International',
    origin: 'kpmg.com',
    feedUrl: 'https://kpmg.com/sg/en/home/insights.html'
  },
  {
    id: 'pwc',
    name: 'PwC Global',
    origin: 'pwc.com',
    feedUrl: 'https://www.pwc.com/sg/en/publications.html'
  },
  {
    id: 'boardroom',
    name: 'BoardRoom',
    origin: 'boardroomlimited.com',
    feedUrl: 'https://www.boardroomlimited.com/insights/'
  },
  {
    id: 'hawksford',
    name: 'Hawksford',
    origin: 'hawksford.com',
    feedUrl: 'https://www.hawksford.com/knowledge-hub'
  },
  {
    id: 'sovereign-group',
    name: 'Sovereign Group',
    origin: 'sovereigngroup.com',
    feedUrl: 'https://www.sovereigngroup.com/news-and-views/'
  },
  {
    id: 'pro-partner-group',
    name: 'PRO Partner Group',
    origin: 'propartnergroup.com',
    feedUrl: 'https://www.propartnergroup.com/blog/'
  },
  {
    id: 'amicorp',
    name: 'Amicorp',
    origin: 'amicorp.com',
    feedUrl: 'https://www.amicorp.com/news/'
  },
  {
    id: 'bgl-uruguay',
    name: 'BGL Uruguay',
    origin: 'bgl.com.uy',
    feedUrl: 'https://bgl.com.uy/'
  },
  {
    id: 'bdo-brazil',
    name: 'BDO Brazil',
    origin: 'bdobrazil.com.br',
    feedUrl: 'https://www.bdobrazil.com.br/'
  },
  {
    id: 'trident-trust',
    name: 'Trident Trust',
    origin: 'tridenttrust.com',
    feedUrl: 'https://www.tridenttrust.com/news-and-insights/'
  },
  {
    id: 'dixcart',
    name: 'Dixcart',
    origin: 'dixcart.com',
    feedUrl: 'https://www.dixcart.com/articles/'
  },
  {
    id: 'maples',
    name: 'Maples Group',
    origin: 'maples.com',
    feedUrl: 'https://maples.com/news/'
  },
  {
    id: 'cogency-global',
    name: 'Cogency Global',
    origin: 'cogencyglobal.com',
    feedUrl: 'https://www.cogencyglobal.com/blog'
  }
];

/**
 * Evergreen topics - we DON'T scrape these from a single feed.
 * Instead we use the news/govt sources + master database search to find lasting
 * "how to do X in Singapore" guides.  Each entry is a topic + keyword set.
 */
const EVERGREEN_TOPICS = [
  { id: 'incorporation-guide',  topic: 'Singapore Incorporation Guide',   query: 'how to incorporate company singapore guide' },
  { id: 'tax-cpf-guide',        topic: 'Tax & CPF Guide',                 query: 'singapore corporate tax cpf contribution guide' },
  { id: 'employment-pass',      topic: 'Employment Pass Guide',           query: 'singapore employment pass application guide' },
  { id: 'vcc-fund-guide',       topic: 'VCC Fund Setup Guide',            query: 'singapore vcc variable capital company setup guide' },
  { id: 'esg-reporting',        topic: 'ESG Reporting Guide',             query: 'singapore esg sustainability reporting guide sgx' },
  { id: 'gst-guide',            topic: 'GST Guide',                       query: 'singapore gst registration filing guide' },
  { id: 'transfer-pricing',     topic: 'Transfer Pricing Guide',          query: 'singapore transfer pricing documentation guide' },
  { id: 'trust-formation',      topic: 'Trust Formation Guide',           query: 'singapore trust formation private wealth guide' }
];

module.exports = {
  NEWS_SOURCES,
  GOVT_SOURCES,
  COMPETITOR_SOURCES,
  EVERGREEN_TOPICS,
  ALL_SOURCES: [...NEWS_SOURCES, ...GOVT_SOURCES, ...COMPETITOR_SOURCES]
};
