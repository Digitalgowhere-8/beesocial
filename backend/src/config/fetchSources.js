function cleanText(value) {
  return String(value || '').trim();
}

function cleanList(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map(cleanText).filter(Boolean);
  return [];
}

function cleanDomain(value) {
  return cleanText(value)
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .toLowerCase();
}

const NEWS_SOURCE_DOMAINS_BY_COUNTRY = {
  Singapore: [
    'mas.gov.sg',
    'acra.gov.sg',
    'iras.gov.sg',
    'mom.gov.sg',
    'edb.gov.sg',
    'mti.gov.sg',
    'businesstimes.com.sg',
    'straitstimes.com',
    'channelnewsasia.com'
  ],
  India: [
    'economictimes.indiatimes.com',
    'livemint.com',
    'financialexpress.com'
  ],
  Vietnam: [
    'vir.com.vn',
    'vietnamnews.vn',
    'e.vnexpress.net',
    'thesaigontimes.vn'
  ],
  'Hong Kong': [
    'sfc.hk',
    'hkma.gov.hk',
    'cr.gov.hk',
    'ird.gov.hk',
    'scmp.com'
  ],
  China: [
    'csrc.gov.cn',
    'mofcom.gov.cn',
    'caixinglobal.com',
    'chinaeconomicreview.com',
    'yicaiglobal.com',
    'chinadaily.com.cn'
  ],
  Philippines: [
    'bworldonline.com',
    'business.inquirer.net',
    'philstar.com',
    'mb.com.ph'
  ],
  Malaysia: [
    'theedgemalaysia.com',
    'nst.com.my',
    'malaymail.com'
  ],
  Indonesia: [
    'thejakartapost.com',
    'english.kontan.co.id',
    'bisnis.com',
    'indonesiabusinesspost.com'
  ],
  Australia: [
    'afr.com',
    'theaustralian.com.au',
    'businessnewsaustralia.com',
    'smartcompany.com.au'
  ],
  Cyprus: [
    'financialmirror.com',
    'cyprus-mail.com',
    'en.philenews.com',
    'cbn.com.cy'
  ],
  'United Kingdom': [
    'ft.com',
    'economist.com',
    'cityam.com',
    'bloomberg.com',
    'bbc.com'
  ],
  'Dubai (UAE)': [
    'arabianbusiness.com',
    'thenationalnews.com',
    'gulfbusiness.com',
    'khaleejtimes.com',
    'emirates247.com'
  ],
  'Abu Dhabi (UAE)': [
    'arabianbusiness.com',
    'thenationalnews.com',
    'gulfbusiness.com'
  ],
  'Montevideo (Uruguay)': [
    'bbc.com',
    'en.mercopress.com',
    'montevideo.com.uy',
    'elpais.com.uy',
    'elobservador.com.uy',
    'ambito.com',
    'busqueda.com.uy'
  ],
  'Sao Paulo (Brazil)': [
    'valor.globo.com',
    'exame.com',
    'infomoney.com.br',
    'braziljournal.com',
    'agenciabrasil.ebc.com.br',
    'bbc.com'
  ],
  'Saint Kitts & Nevis': [
    'thestkittsnevisobserver.com',
    'sknvibes.com',
    'caribbeannewsglobal.com',
    'zizonline.com',
    'nevistvonline.com'
  ],
  'Cayman Islands': [
    'caymancompass.com',
    'caymannewsservice.com',
    'mondaq.com',
    'caymaniantimes.ky',
    'cnbc.com'
  ],
  'Miami (United States)': [
    'miamiherald.com',
    'bizjournals.com',
    'floridatrend.com',
    'miamitodaynews.com'
  ],
  'British Virgin Islands': [
    'bvibeacon.com',
    'bvinews.com',
    'virginislandsnewsonline.com',
    'mondaq.com'
  ]
};

const GOVT_SOURCE_DOMAINS_BY_COUNTRY = {
  Singapore: [
    'mas.gov.sg',
    'acra.gov.sg',
    'iras.gov.sg',
    'mom.gov.sg',
    'edb.gov.sg',
    'mti.gov.sg',
    'gov.sg',
    'mfa.gov.sg'
  ],
  India: [
    'mca.gov.in',
    'incometax.gov.in',
    'investindia.gov.in',
    'sebi.gov.in',
    'india.gov.in',
    'mygov.in',
    'mea.gov.in'
  ],
  Vietnam: [
    'dangkykinhdoanh.gov.vn',
    'gdt.gov.vn',
    'molisa.gov.vn',
    'fia.mof.gov.vn',
    'vietnam.gov.vn'
  ],
  'Hong Kong': [
    'sfc.hk',
    'hkma.gov.hk',
    'cr.gov.hk',
    'ird.gov.hk',
    'labour.gov.hk',
    'investhk.gov.hk',
    'gov.hk',
    'immd.gov.hk',
  ],
  China: [
    'mofcom.gov.cn',
    'samr.gov.cn',
    'csrc.gov.cn',
    'pboc.gov.cn',
    'chinatax.gov.cn',
    'mohrss.gov.cn'
  ],
  Philippines: [
    'sec.gov.ph',
    'bir.gov.ph',
    'dole.gov.ph',
    'peza.gov.ph',
    'gov.ph',
    'immigration.gov.ph'
  ],
  Malaysia: [
    'ssm.com.my',
    'hasil.gov.my',
    'mohr.gov.my',
    'mida.gov.my',
    'malaysia.gov.my'
  ],
  Indonesia: [
    'oss.go.id',
    'pajak.go.id',
    'kemnaker.go.id',
    'ahu.go.id'
  ],
  Australia: [
    'asic.gov.au',
    'ato.gov.au',
    'fairwork.gov.au',
    'austrade.gov.au',
    'dfat.gov.au',
    'my.gov.au'
  ],
  Cyprus: [
    'companies.gov.cy',
    'mof.gov.cy',
    'gov.cy',
    'investcyprus.org.cy'
  ],
  'United Kingdom': [
    'gov.uk',
    'legislation.gov.uk'
  ],
  'Dubai (UAE)': [
    'dubaidet.gov.ae',
    'tax.gov.ae',
    'mohre.gov.ae',
    'difc.com',
    'dubai.ae',
    'u.ae'
  ],
  'Abu Dhabi (UAE)': [
    'added.gov.ae',
    'abudhabi.gov.ae',
    'tax.gov.ae',
    'mohre.gov.ae'
  ],
  'Montevideo (Uruguay)': [
    'montevideo.gub.uy',
    'gub.uy',
    'efactura.dgi.gub.uy',
    'dgi.gub.uy',
    'uruguayxxi.gub.uy'
  ],
  'Sao Paulo (Brazil)': [
    'institucional.jucesp.sp.gov.br',
    'gov.br',
    'sp.gov.br'
  ],
  'Saint Kitts & Nevis': [
    'gov.kn',
    'fsrc.kn',
    'sknird.com',
    'ciu.gov.kn'
  ],
  'Cayman Islands': [
    'gov.ky',
    'ciregistry.ky',
    'cima.ky',
    'ditc.ky',
    'dlp.jk.gov.in'
  ],
  'Miami (United States)': [
    'miami.gov',
    'dos.fl.gov',
    'irs.gov',
    'floridarevenue.com',
    'dol.gov'
  ],
  'British Virgin Islands': [
    'bvi.gov.vg',
    'bvifsc.vg',
    'bviita.vg'
  ]
};

const DEFAULT_COMPETITOR_SOURCE_DOMAINS = [
  'vistra.com',
  'tricorglobal.com',
  'acclime.com',
  'kpmg.com',
  'pwc.com',
  'boardroomlimited.com',
  'hawksford.com',
  'tmf-group.com'
];

const COMPETITOR_SOURCE_DOMAINS_BY_COUNTRY = {
  India: DEFAULT_COMPETITOR_SOURCE_DOMAINS,
  Vietnam: DEFAULT_COMPETITOR_SOURCE_DOMAINS,
  China: DEFAULT_COMPETITOR_SOURCE_DOMAINS,
  Philippines: DEFAULT_COMPETITOR_SOURCE_DOMAINS,
  Malaysia: DEFAULT_COMPETITOR_SOURCE_DOMAINS,
  Indonesia: DEFAULT_COMPETITOR_SOURCE_DOMAINS,
  Australia: DEFAULT_COMPETITOR_SOURCE_DOMAINS,
  Cyprus: DEFAULT_COMPETITOR_SOURCE_DOMAINS,
  'United Kingdom': DEFAULT_COMPETITOR_SOURCE_DOMAINS,
  'Dubai (UAE)': [
    'sovereigngroup.com',
    'propartnergroup.com',
    ...DEFAULT_COMPETITOR_SOURCE_DOMAINS
  ],
  'Abu Dhabi (UAE)': DEFAULT_COMPETITOR_SOURCE_DOMAINS
  ,
  'Montevideo (Uruguay)': [
    'amicorp.com',
    'bgl.com.uy',
    ...DEFAULT_COMPETITOR_SOURCE_DOMAINS
  ],
  'Sao Paulo (Brazil)': [
    'bdobrazil.com.br',
    'amicorp.com',
    ...DEFAULT_COMPETITOR_SOURCE_DOMAINS
  ],
  'Saint Kitts & Nevis': [
    'tridenttrust.com',
    'dixcart.com',
    ...DEFAULT_COMPETITOR_SOURCE_DOMAINS
  ],
  'Cayman Islands': [
    'maples.com',
    ...DEFAULT_COMPETITOR_SOURCE_DOMAINS
  ],
  'Miami (United States)': [
    'cogencyglobal.com',
    ...DEFAULT_COMPETITOR_SOURCE_DOMAINS
  ],
  'British Virgin Islands': DEFAULT_COMPETITOR_SOURCE_DOMAINS
};

const GLOBAL_NEWS_SOURCE_DOMAINS = [
  'mondaq.com',
  'lexology.com',
  'conventuslaw.com',
  'asia.nikkei.com'
];

const TRUSTED_INTELLIGENCE_DOMAINS = [
  'mas.gov.sg',
  'acra.gov.sg',
  'iras.gov.sg',
  'mom.gov.sg',
  'edb.gov.sg',
  'mti.gov.sg',
  'sfc.hk',
  'hkma.gov.hk',
  'cr.gov.hk',
  'ird.gov.hk',
  'csrc.gov.cn',
  'mofcom.gov.cn',
  'businesstimes.com.sg',
  'straitstimes.com',
  'channelnewsasia.com',
  'mondaq.com',
  'lexology.com',
  'conventuslaw.com',
  'asia.nikkei.com',
  'scmp.com'
];

const COUNTRY_ALIASES = {
  singapore: 'Singapore',
  india: 'India',
  bharat: 'India',
  vietnam: 'Vietnam',
  'viet nam': 'Vietnam',
  'hong kong': 'Hong Kong',
  hk: 'Hong Kong',
  china: 'China',
  prc: 'China',
  'mainland china': 'China',
  philippines: 'Philippines',
  malaysia: 'Malaysia',
  indonesia: 'Indonesia',
  australia: 'Australia',
  cyprus: 'Cyprus',
  uk: 'United Kingdom',
  'u.k.': 'United Kingdom',
  britain: 'United Kingdom',
  'great britain': 'United Kingdom',
  'united kingdom': 'United Kingdom',
  dubai: 'Dubai (UAE)',
  'dubai uae': 'Dubai (UAE)',
  'dubai (uae)': 'Dubai (UAE)',
  uae: 'Dubai (UAE)',
  'united arab emirates': 'Dubai (UAE)',
  'abu dhabi': 'Abu Dhabi (UAE)',
  'abu dhabi uae': 'Abu Dhabi (UAE)',
  'abu dhabi (uae)': 'Abu Dhabi (UAE)',
  montevideo: 'Montevideo (Uruguay)',
  'montevideo uruguay': 'Montevideo (Uruguay)',
  'montevideo (uruguay)': 'Montevideo (Uruguay)',
  uruguay: 'Montevideo (Uruguay)',
  'sao paulo': 'Sao Paulo (Brazil)',
  'são paulo': 'Sao Paulo (Brazil)',
  'sao paulo brazil': 'Sao Paulo (Brazil)',
  'são paulo brazil': 'Sao Paulo (Brazil)',
  'sao paulo (brazil)': 'Sao Paulo (Brazil)',
  'são paulo (brazil)': 'Sao Paulo (Brazil)',
  brazil: 'Sao Paulo (Brazil)',
  'saint kitts': 'Saint Kitts & Nevis',
  'saint kitts and nevis': 'Saint Kitts & Nevis',
  'saint kitts & nevis': 'Saint Kitts & Nevis',
  'st kitts': 'Saint Kitts & Nevis',
  'st kitts and nevis': 'Saint Kitts & Nevis',
  'st kitts & nevis': 'Saint Kitts & Nevis',
  'cayman islands': 'Cayman Islands',
  cayman: 'Cayman Islands',
  miami: 'Miami (United States)',
  'miami united states': 'Miami (United States)',
  'miami (united states)': 'Miami (United States)',
  'miami usa': 'Miami (United States)',
  'miami us': 'Miami (United States)',
  'united states': 'Miami (United States)',
  usa: 'Miami (United States)',
  us: 'Miami (United States)',
  'british virgin islands': 'British Virgin Islands',
  bvi: 'British Virgin Islands'
};

function canonicalCountry(country) {
  const selected = cleanText(country);
  return COUNTRY_ALIASES[selected.toLowerCase()] || selected;
}

function defaultSourceDomainsForCountry(country, type = 'news') {
  const selected = canonicalCountry(country);
  if (type === 'govt') return GOVT_SOURCE_DOMAINS_BY_COUNTRY[selected] || [];
  if (type === 'competitor') return COMPETITOR_SOURCE_DOMAINS_BY_COUNTRY[selected] || DEFAULT_COMPETITOR_SOURCE_DOMAINS;
  return [...new Set([...(NEWS_SOURCE_DOMAINS_BY_COUNTRY[selected] || []), ...GLOBAL_NEWS_SOURCE_DOMAINS])];
}

function configuredFetchCountries() {
  return Object.keys(NEWS_SOURCE_DOMAINS_BY_COUNTRY).sort();
}

function fetchSourceCatalog() {
  return configuredFetchCountries().reduce((out, country) => {
    out[country] = {
      news: defaultSourceDomainsForCountry(country, 'news'),
      govt: defaultSourceDomainsForCountry(country, 'govt'),
      competitor: defaultSourceDomainsForCountry(country, 'competitor'),
      evergreen: defaultSourceDomainsForCountry(country, 'news')
    };
    return out;
  }, {});
}

function mergeSourceDomains({ country, type = 'news', userSources = [], strictSources = false }) {
  const defaults = defaultSourceDomainsForCountry(country, type);
  const defaultDomains = [...new Set(defaults.map(cleanDomain).filter(Boolean))];
  const userDomains = cleanList(userSources).map(cleanDomain).filter(Boolean);
  const includeDomains = [...new Set([...defaultDomains, ...userDomains])];

  return {
    includeDomains,
    strictSources: true,
    defaultDomains: defaultDomains,
    userDomains
  };
}

module.exports = {
  NEWS_SOURCE_DOMAINS_BY_COUNTRY,
  GOVT_SOURCE_DOMAINS_BY_COUNTRY,
  COMPETITOR_SOURCE_DOMAINS_BY_COUNTRY,
  DEFAULT_COMPETITOR_SOURCE_DOMAINS,
  GLOBAL_NEWS_SOURCE_DOMAINS,
  TRUSTED_INTELLIGENCE_DOMAINS,
  canonicalCountry,
  configuredFetchCountries,
  defaultSourceDomainsForCountry,
  fetchSourceCatalog,
  mergeSourceDomains
};
