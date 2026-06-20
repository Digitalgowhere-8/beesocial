/**
 * ASCENTIUM SERVICES TAXONOMY
 * ---------------------------
 * 10 main categories aligned with actual imported data structure.
 * Each sub-category has search keywords used by the scraper / category matcher.
 *
 * This is the single source of truth. Backend uses it for category-matching,
 * the frontend imports the same shape (via API) for filter dropdowns.
 */

const CATEGORIES = {
  'Corporate Services': {
    keywords: ['corporate services', 'corporate', 'company', 'incorporation', 'secretarial', 'entity', 'compliance'],
    subcategories: {
      'Company Incorporation': ['incorporation', 'company formation', 'business formation', 'company registration', 'business registration', 'set up company', 'pte ltd', 'acra registration'],
      'Company Secretarial': ['company secretary', 'corporate secretarial', 'board resolution', 'agm', 'annual return', 'statutory compliance'],
      'Compliance': ['corporate compliance', 'regulatory compliance', 'statutory filing', 'annual filing'],
      'Entity Management': ['entity management', 'subsidiary management', 'holding company', 'group structure', 'corporate structure'],
      'Share Registry': ['share registry', 'shareholder', 'share transfer', 'share allotment', 'cap table', 'share certificate'],
      'Market Entry': ['market entry', 'market expansion', 'new market', 'business expansion', 'market penetration'],
      'Acquisition': ['acquisition', 'takeover', 'buyout', 'corporate acquisition'],
      'Liquidation Services': ['liquidation', 'winding up', 'dissolution', 'strike off', 'deregistration'],
      'Leadership Change': ['leadership change', 'director change', 'management transition', 'board change', 'key personnel'],
      'Advisory & Corporate Services': ['corporate advisory', 'corporate services advisory', 'business advisory'],
      'Compliance Solutions': ['compliance solutions', 'compliance technology', 'regtech', 'compliance framework']
    }
  },
  'Accounting & Tax': {
    keywords: ['accounting', 'tax', 'iras', 'gst', 'income tax', 'bookkeeping'],
    subcategories: {
      'Tax Filing': ['tax filing', 'tax return', 'corporate tax', 'income tax filing', 'iras filing', 'tax compliance', 'estimated chargeable income', 'eci'],
      'Tax Advisory': ['tax advisory', 'tax planning', 'tax structuring', 'tax strategy', 'tax optimization', 'transfer pricing'],
      'Accounting': ['accounting', 'bookkeeping', 'financial statements', 'management accounts', 'xbrl', 'finance outsourcing'],
      'GST/Indirect Tax': ['gst', 'goods and services tax', 'indirect tax', 'vat', 'sales tax', 'gst registration', 'gst return'],
      'Government Incentives': ['government incentive', 'tax incentive', 'edb incentive', 'pioneer status', 'development expansion incentive', 'productivity grant', 'enterprise singapore grant'],
      'Compliance': ['tax compliance', 'filing compliance', 'iras compliance'],
      'Compliance Solutions': ['compliance solutions', 'tax compliance solutions'],
      'Tax Refunds': ['tax refund', 'tax rebate', 'tax credit', 'refund claim']
    }
  },
  'Compliance & Governance': {
    keywords: ['compliance', 'governance', 'risk', 'aml', 'regulatory'],
    subcategories: {
      'Compliance Solutions': ['compliance', 'governance', 'regulatory compliance', 'compliance framework', 'compliance management'],
      'Risk Management': ['risk management', 'enterprise risk', 'operational risk', 'risk assessment', 'business continuity'],
      'AML': ['aml', 'anti-money laundering', 'kyc', 'know your customer', 'due diligence', 'sanctions screening']
    }
  },
  'HR & Employment': {
    keywords: ['hr', 'payroll', 'employment', 'recruitment', 'immigration', 'peo', 'eor'],
    subcategories: {
      'PEO/EOR Services': ['employer of record', 'eor', 'peo', 'professional employer', 'global employment'],
      'Immigration': ['immigration', 'work pass', 'employment pass', 'ep application', 's pass', 'work permit', 'dependant pass'],
      'Recruitment': ['recruitment', 'hiring', 'talent acquisition', 'staffing', 'executive search', 'headhunting'],
      'Payroll': ['payroll', 'salary processing', 'payslip', 'cpf', 'central provident fund', 'payroll services', 'payroll outsourcing'],
      'Compliance Solutions': ['hr compliance', 'employment compliance', 'labour law', 'employment act'],
      'Partnership': ['hr partnership', 'staffing partnership', 'hr outsourcing partnership'],
      'Business Consultancy': ['hr consultancy', 'hr advisory', 'workforce planning'],
      'HR & Employment': ['human resources', 'hr management', 'employee relations', 'hr services']
    }
  },
  'Fund Administration': {
    keywords: ['fund', 'vcc', 'fund administration', 'asset management'],
    subcategories: {
      'Fund Admin': ['fund administration', 'fund admin', 'nav calculation', 'fund accounting', 'investor services', 'vcc', 'variable capital company'],
      'Fund Governance': ['fund governance', 'fund director', 'fund oversight', 'investment committee'],
      'Acquisition': ['fund acquisition', 'portfolio acquisition', 'fund merger']
    }
  },
  'Financial Advisory': {
    keywords: ['financial advisory', 'consulting', 'consultancy', 'm&a', 'advisory'],
    subcategories: {
      'Business Consultancy': ['business consultancy', 'management consulting', 'business advisory', 'strategy consulting'],
      'M&A': ['merger', 'acquisition', 'm&a', 'takeover', 'buyout', 'deal advisory', 'valuation'],
      'Fund Administration': ['fund advisory', 'fund management advisory', 'investment advisory'],
      'Private Client': ['private client advisory', 'wealth advisory', 'high net worth advisory'],
      'Market Analysis': ['market analysis', 'market research', 'market intelligence', 'industry analysis', 'competitive analysis'],
      'Market Entry': ['market entry advisory', 'market expansion advisory', 'new market advisory'],
      'Product Launch': ['product launch', 'go to market', 'new product', 'product strategy'],
      'Leadership Change': ['leadership advisory', 'succession planning', 'executive transition']
    }
  },
  'Fiduciary & Trust Services': {
    keywords: ['fiduciary', 'trust', 'trustee', 'family office', 'private client'],
    subcategories: {
      'Trust Services': ['trust', 'trustee', 'trust fund', 'asset protection', 'family trust', 'trust administration'],
      'Family Office': ['family office', 'single family office', 'multi family office', 'wealth management'],
      'Private Client': ['private client', 'high net worth', 'hnwi', 'uhnwi', 'private wealth']
    }
  },
  'Cross Border & FDI': {
    keywords: ['cross border', 'fdi', 'foreign direct investment', 'foreign investment'],
    subcategories: {
      'Foreign Investment': ['foreign investment', 'fdi', 'foreign direct investment', 'inbound investment', 'outbound investment'],
      'Market Entry': ['cross border market entry', 'international expansion', 'overseas incorporation'],
      'Partnership': ['cross border partnership', 'international partnership', 'joint venture', 'strategic alliance']
    }
  },
  'Economy & Trade': {
    keywords: ['economy', 'trade', 'economic policy', 'regulatory', 'business policy'],
    subcategories: {
      'Policy': ['economic policy', 'government policy', 'budget', 'fiscal policy', 'trade policy'],
      'Regulatory': ['regulatory update', 'regulation change', 'new regulation', 'regulatory framework'],
      'Economy': ['economy', 'gdp', 'economic growth', 'inflation', 'interest rate', 'trade balance'],
      'Tax Authority': ['tax authority', 'inland revenue', 'tax update', 'tax announcement'],
      'Company Registry': ['company registry', 'business registry', 'company registration authority']
    }
  },
  'Competitor Intelligence': {
    keywords: ['competitor', 'competitor intelligence', 'competitive landscape', 'market competitor'],
    subcategories: {
      'Investment Increase': ['investment increase', 'funding round', 'capital raise', 'expansion investment', 'growth investment']
    }
  }
};

/**
 * Returns a flat array: [{ category, subcategory, keywords }]
 * Useful for iterating during scraping.
 */
function flatten() {
  const list = [];
  for (const [cat, val] of Object.entries(CATEGORIES)) {
    for (const [sub, kws] of Object.entries(val.subcategories)) {
      list.push({ category: cat, subcategory: sub, keywords: kws });
    }
  }
  return list;
}

/**
 * Returns the API shape sent to the frontend filter dropdowns.
 */
function asTree() {
  const out = {};
  for (const [cat, val] of Object.entries(CATEGORIES)) {
    out[cat] = Object.keys(val.subcategories);
  }
  return out;
}

/**
 * Rule-based category matcher.
 * Given a piece of text, return { category, subcategory, score }.
 * Score = number of keyword matches.
 */
function matchCategory(text) {
  if (!text || typeof text !== 'string') {
    return { category: 'General', subcategory: null, score: 0 };
  }
  const t = text.toLowerCase();
  let best = { category: 'General', subcategory: null, score: 0 };

  for (const [cat, val] of Object.entries(CATEGORIES)) {
    for (const [sub, kws] of Object.entries(val.subcategories)) {
      let score = 0;
      for (const kw of kws) {
        if (t.includes(kw.toLowerCase())) score++;
      }
      // pillar-level keywords also nudge the score
      for (const kw of val.keywords) {
        if (t.includes(kw.toLowerCase())) score += 0.5;
      }
      if (score > best.score) {
        best = { category: cat, subcategory: sub, score };
      }
    }
  }
  return best;
}

module.exports = { CATEGORIES, flatten, asTree, matchCategory };
