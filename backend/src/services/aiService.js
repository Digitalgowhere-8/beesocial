/**
 * AI Service - OpenAI (optional)
 * -------------------------------
 * Used for two enhancements:
 *   1. AI-generated short summary of an article
 *   2. Smart category classification when keyword matching is ambiguous
 *
 * EVERYTHING is opt-in:
 *   - If OPENAI_API_KEY is not set, every function is a no-op.
 *   - If OPENAI_USE_FOR_SUMMARY=false, summary stays as the raw scrape value.
 *   - If OPENAI_USE_FOR_CATEGORY=false, only rule-based matching is used.
 *
 * This keeps the system free-tier friendly by default.
 */
let OpenAI;
try {
  OpenAI = require('openai');
} catch (_e) {
  OpenAI = null;
}

const { CATEGORIES } = require('../config/categories');

let client = null;
function getClient() {
  if (!process.env.OPENAI_API_KEY || !OpenAI) return null;
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

function isEnabled() {
  return !!process.env.OPENAI_API_KEY && !!OpenAI;
}

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const PROFILE_RELEVANCE_MIN_SCORE = Math.max(0, Math.min(100, Number(process.env.AI_RELEVANCE_MIN_SCORE || 30) || 30));

function fallbackBlog({ article, style = {}, keywords = [] }) {
  const title = article?.title || 'Market intelligence update';
  const audience = style.audience || 'business decision-makers';
  const cta = style.cta || 'Speak with our team to understand how this update may affect your plans.';
  const keywordLine = keywords.length ? `\n\nFocus keywords: ${keywords.join(', ')}` : '';
  const context = blogSourceContext(article);
  return {
    title,
    excerpt: article?.summary || `A practical update for ${audience}.`,
    bodyMarkdown: [
      `# ${title}`,
      '',
      `## Why this matters`,
      '',
      article?.summary || 'This update may create a new planning, compliance, market-entry, or advisory signal for businesses.',
      context ? `\nAdditional source context: ${context.slice(0, 900)}` : '',
      '',
      `## What companies should watch`,
      '',
      '| Area | Practical question |',
      '| --- | --- |',
      '| Market relevance | Does this change the timing or attractiveness of an expansion, investment, or client conversation? |',
      '| Tax and compliance | Are there filing, reporting, licensing, governance, payroll, or tax points to confirm before acting? |',
      '| Operations | Would banking, entity setup, hiring, contracts, or local vendor requirements affect execution? |',
      '',
      `## Practical takeaways`,
      '',
      `For ${audience}, the useful question is not whether the headline is positive or negative. It is whether the update changes a business decision, a compliance checklist, or the timing of market entry.`,
      '',
      'Treat this as a planning signal, then verify the details against official guidance and professional advice before making commitments.',
      '',
      `## Recommended next step`,
      '',
      cta,
      keywordLine
    ].filter(Boolean).join('\n'),
    suggestedKeywords: keywords,
    metaTitle: title.slice(0, 70),
    metaDescription: (article?.summary || '').slice(0, 155)
  };
}

function fallbackLinkedInPost({ article, options = {} }) {
  const topic = article?.title || options.topic || 'A practical market update';
  const audience = options.audience || 'business decision-makers';
  const cta = options.cta || 'If this is on your radar, save this and review how it affects your next decision.';
  const summary = article?.summary || article?.aiSummary || 'This update may create a practical signal for operators, advisors, or business leaders.';
  const hook = String(topic).split(/[,:|-]/)[0].trim().slice(0, 70) || 'This deserves a closer look';

  return {
    selectedTopic: topic,
    topicTier: 'Narrow',
    emotionalJob: 'Educate',
    framework: options.framework || 'PAS',
    hook,
    postText: [
      hook,
      '',
      'Most teams notice the headline.',
      'The real signal sits underneath it.',
      '',
      summary,
      '',
      `For ${audience}, the practical question is not whether this matters.`,
      'It is where it changes timing, risk, or client conversations.',
      '',
      'The rule I use: if it changes a decision, it deserves a clear note.',
      '',
      cta
    ].join('\n'),
    cta,
    hashtags: [
      '#MarketIntelligence',
      '#BusinessStrategy',
      '#RiskManagement',
      '#Governance',
      '#Compliance',
      '#Advisory'
    ],
    qualityChecks: {
      hookUnderEightWords: hook.split(/\s+/).length <= 8,
      oneClearIdea: true,
      noGenericEnding: true,
      soundsHuman: true
    },
    model: 'fallback'
  };
}

function blogSourceContext(article = {}) {
  return [
    article.rawContent || article.raw_content,
    article.rawData?.rawContent,
    article.tavilyAnswer || article.tavily_answer,
    article.blogContext || article.blog_context,
    article.summary,
    article.sourceQuery ? `Search query: ${article.sourceQuery}` : '',
    article.relevanceReason ? `Relevance reason: ${article.relevanceReason}` : '',
    Array.isArray(article.matchedInterests) && article.matchedInterests.length
      ? `Matched interests: ${article.matchedInterests.join(', ')}`
      : ''
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 12000);
}

function uniqueStrings(values = []) {
  const seen = new Set();
  return values.filter((value) => {
    const key = String(value || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeHashtags(values = [], fallback = []) {
  const normalized = uniqueStrings(
    values.map((value) => {
      const tag = String(value || '').trim().replace(/\s+/g, '');
      if (!tag) return '';
      return tag.startsWith('#') ? tag : `#${tag}`;
    })
  ).filter(Boolean);

  if (normalized.length >= 5) return normalized.slice(0, 7);
  return uniqueStrings([
    ...normalized,
    ...fallback
  ]).slice(0, 7);
}

function normalizeLineBreaks(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function stripTrailingHashtags(value) {
  const lines = normalizeLineBreaks(value).trim().split('\n');
  while (lines.length) {
    const line = String(lines[lines.length - 1] || '').trim();
    if (!line || (line.includes('#') && /^(\s*#[A-Za-z0-9_]+\s*)+$/.test(line))) {
      lines.pop();
      continue;
    }
    break;
  }
  return lines.join('\n').trim();
}

function buildPlainToc(lines = []) {
  const headings = [];
  for (const line of lines) {
    const match = String(line || '').match(/^##\s+(.+)$/);
    if (!match) continue;
    const heading = match[1].trim();
    if (/^table of contents$/i.test(heading)) continue;
    if (/^need help\b/i.test(heading)) continue;
    if (/^cta\b/i.test(heading)) continue;
    headings.push(heading);
  }
  const uniqueHeadings = uniqueStrings(headings);
  if (!uniqueHeadings.length) return [];
  return [
    '## Table of Contents',
    '',
    ...uniqueHeadings.map((heading) => `- ${heading}`),
    ''
  ];
}

function formatBlogMarkdown(bodyMarkdown, title) {
  const normalized = normalizeLineBreaks(bodyMarkdown)
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, "'")
    .replace(/\u201c/g, '"')
    .replace(/\u201d/g, '"')
    .replace(/â€™/g, "'")
    .replace(/â€œ|â€/g, '"')
    .replace(/\t/g, '  ')
    .trim();

  const rawLines = normalized
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''));

  const firstH1Index = rawLines.findIndex((line) => /^#\s+/.test(String(line || '').trim()));
  const prefixLines = firstH1Index > 0
    ? rawLines.slice(0, firstH1Index)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => line.toLowerCase() !== String(title || '').trim().toLowerCase())
    : [];
  const workingLines = firstH1Index > 0 ? rawLines.slice(firstH1Index) : rawLines;

  const cleaned = [];
  let hasH1 = false;
  let lastHeadingKey = '';
  let skipTocBlock = false;

  for (let i = 0; i < workingLines.length; i += 1) {
    let line = workingLines[i].trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      if (cleaned.at(-1) !== '') cleaned.push('');
      continue;
    }

    if (/^##?\s*table of contents\b/i.test(trimmed)) {
      skipTocBlock = true;
      continue;
    }

    if (skipTocBlock) {
      if (/^(-|\*|\d+\.)\s+/.test(trimmed)) continue;
      if (/^\[[^\]]+\]\(#.+\)$/.test(trimmed)) continue;
      skipTocBlock = false;
    }

    if (/^\[[^\]]+\]\(#.+\)$/.test(trimmed)) continue;

    if (/^#\s+/.test(trimmed)) {
      if (hasH1) continue;
      line = `# ${title}`.trim();
      hasH1 = true;
      lastHeadingKey = `h1:${line.toLowerCase()}`;
      cleaned.push(line, '');
      continue;
    }

    if (/^##+\s+/.test(trimmed)) {
      const normalizedHeading = trimmed.replace(/^#+\s*/, '').trim();
      const headingKey = normalizedHeading.toLowerCase();
      if (headingKey === lastHeadingKey || headingKey === String(title || '').trim().toLowerCase()) continue;
      lastHeadingKey = headingKey;
      if (cleaned.at(-1) !== '') cleaned.push('');
      cleaned.push(`${trimmed.match(/^#+/)?.[0] || '##'} ${normalizedHeading}`, '');
      continue;
    }

    cleaned.push(trimmed);
  }

  while (cleaned[0] === '') cleaned.shift();
  while (cleaned.at(-1) === '') cleaned.pop();

  const withoutExtraBlanks = [];
  for (const line of cleaned) {
    if (line === '' && withoutExtraBlanks.at(-1) === '') continue;
    withoutExtraBlanks.push(line);
  }

  const h1 = hasH1 ? [] : [`# ${title}`, ''];
  const introLines = prefixLines.length ? [...prefixLines, ''] : [];
  const bodyWithH1 = [...h1, ...introLines, ...withoutExtraBlanks];
  const hasToc = bodyWithH1.some((line) => /^##\s+table of contents$/i.test(line.trim()));
  const toc = hasToc ? [] : buildPlainToc(bodyWithH1);

  const finalLines = [];
  let insertedToc = false;
  for (let i = 0; i < bodyWithH1.length; i += 1) {
    const line = bodyWithH1[i];
    finalLines.push(line);
    if (!insertedToc && /^#\s+/.test(String(line || '').trim())) {
      finalLines.push('');
      if (toc.length) finalLines.push(...toc);
      insertedToc = true;
    }
  }

  return finalLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatExcerpt(value, fallback) {
  const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
  return text;
}

function blogFormatBlueprint(format = 'insight_article') {
  const map = {
    how_to_guide: [
      '- Use a guide-style layout that reads like a practical compliance or advisory handbook.',
      '- Prefer question-led or obligation-led H2s such as "What...", "Why...", "How...", "Which...", or "Key requirements...".',
      '- Move from definition or context to obligations, process, risks, checklist, and FAQ.',
      '- Include a practical checklist or action framework near the end.'
    ],
    guide: [
      '- Use a guide-style layout that reads like a practical compliance or advisory handbook.',
      '- Prefer question-led or obligation-led H2s such as "What...", "Why...", "How...", "Which...", or "Key requirements...".',
      '- Move from definition or context to obligations, process, risks, checklist, and FAQ.',
      '- Include a practical checklist or action framework near the end.'
    ],
    beginners_guide: [
      '- Write as a structured beginner-friendly advisory guide.',
      '- Start with what the concept means, then explain why it matters, what steps are involved, and common mistakes.',
      '- Keep headings simple, direct, and educational without sounding generic.',
      '- End with a practical checklist and FAQ.'
    ],
    news_updates: [
      '- Use a current-awareness advisory format.',
      '- Structure the article around: what changed, who may be affected, why it matters now, what companies should review, and what remains uncertain.',
      '- Keep the flow sharp and decision-oriented rather than educational or textbook-like.'
    ],
    client_alert: [
      '- Format the article like a client alert.',
      '- Move quickly from the triggering development to business implications, affected parties, immediate actions, and next steps.',
      '- Keep headings concise and action-oriented.'
    ],
    insight_article: [
      '- Use an executive advisory article structure.',
      '- Organize around signal, implications, decisions, risks, and practical takeaways.',
      '- The article should feel analytical, commercial, and useful for leadership teams.'
    ],
    thought_leadership: [
      '- Use a sharp editorial-advisory structure.',
      '- Present a clear thesis, support it with grounded business implications, and end with a perspective readers can act on.',
      '- Avoid sounding promotional or abstract.'
    ],
    faq_article: [
      '- Build the article around clear question-led sections.',
      '- Each major section should answer a direct business or compliance question.',
      '- End with a standalone FAQ block that feels distinct from the main body.'
    ],
    case_study: [
      '- Structure the piece as situation, challenge, response, lessons, and implications.',
      '- Keep examples grounded in the source and do not invent unsupported outcomes.'
    ]
  };

  return (map[format] || map.insight_article).join('\n');
}

/**
 * Generate a 1-2 sentence summary of an article.
 * Returns null on any failure (caller should keep the existing summary).
 */
async function summarizeArticle({ title, snippet }) {
  if (!isEnabled() || process.env.OPENAI_USE_FOR_SUMMARY !== 'true') return null;
  const cli = getClient();
  if (!cli) return null;
  try {
    const resp = await cli.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      max_tokens: 120,
      messages: [
        {
          role: 'system',
          content:
            'You are an opportunity intelligence analyst. Write a one-sentence summary (max 30 words) relevant to grants, policy, tenders, startup funding, compliance, markets, or competitors. Output only the summary, no preamble.'
        },
        { role: 'user', content: `Title: ${title}\nSnippet: ${snippet || '(none)'}` }
      ]
    });
    return (resp.choices?.[0]?.message?.content || '').trim() || null;
  } catch (err) {
    console.warn('[ai] summarize failed:', err.message);
    return null;
  }
}

/**
 * Pick a category/subcategory using the LLM when rule-based matching
 * is weak (score 0).  Returns null on failure.
 */
async function classifyCategory({ title, snippet }) {
  if (!isEnabled() || process.env.OPENAI_USE_FOR_CATEGORY !== 'true') return null;
  const cli = getClient();
  if (!cli) return null;
  try {
    const taxonomy = Object.entries(CATEGORIES)
      .map(([cat, val]) => `${cat}: ${Object.keys(val.subcategories).join(' / ')}`)
      .join('\n');

    const resp = await cli.chat.completions.create({
      model: MODEL,
      temperature: 0.0,
      max_tokens: 80,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            `You classify an opportunity intelligence article into one of the categories below. ` +
            `Return strict JSON: { "category": "...", "subcategory": "..." } using EXACT names from this taxonomy:\n${taxonomy}` +
            `\nIf none fit, return { "category": "General", "subcategory": "" }.`
        },
        { role: 'user', content: `Title: ${title}\nSnippet: ${snippet || '(none)'}` }
      ]
    });
    const raw = resp.choices?.[0]?.message?.content || '{}';
    const obj = JSON.parse(raw);
    if (!obj.category) return null;
    return { category: obj.category, subcategory: obj.subcategory || '' };
  } catch (err) {
    console.warn('[ai] classify failed:', err.message);
    return null;
  }
}

function cleanPromptText(value) {
  return String(value || '').trim();
}

function listPromptValues(value) {
  if (Array.isArray(value)) return value.map(cleanPromptText).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map(cleanPromptText).filter(Boolean);
  return [];
}

function profileCompanyName(profile = {}, article = {}) {
  return cleanPromptText(
    profile.companyName ||
    profile.comanyName ||
    profile.company ||
    profile.businessName ||
    profile.organization ||
    article.companyName ||
    article.company ||
    ''
  ) || 'the selected company';
}

function profileMarkets(profile = {}, article = {}) {
  const explicitMarkets = [
    ...listPromptValues(profile.markets),
    ...listPromptValues(article.markets),
    ...listPromptValues(profile.countries),
    ...listPromptValues(article.countries)
  ];
  const country = cleanPromptText(profile.country || article.country);
  const region = cleanPromptText(profile.region || article.region);
  const location = cleanPromptText(article.location || profile.location);
  const market = cleanPromptText(profile.market || article.market);
  const markets = [...explicitMarkets, country, market, region ? `${country || market || location} (${region})` : '', location]
    .filter(Boolean);
  return [...new Set(markets)].slice(0, 4);
}

function profileSourceDomains(profile = {}, article = {}, topic = 'news') {
  return [
    ...listPromptValues(profile.sourceDomainsByTopic?.[topic]),
    ...listPromptValues(article.sourceDomainsByTopic?.[topic]),
    ...listPromptValues(profile.preferredDomains),
    ...listPromptValues(article.preferredDomains),
    ...listPromptValues(profile.includeDomains),
    ...listPromptValues(article.includeDomains),
    ...listPromptValues(profile.sources),
    ...listPromptValues(article.sources),
    ...listPromptValues(profile.userDomains),
    ...listPromptValues(article.userDomains)
  ]
    .map((value) => cleanPromptText(value).replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 12);
}

function taxonomyPromptText() {
  return Object.entries(CATEGORIES)
    .map(([category, value], index) => {
      const subcategories = Object.keys(value.subcategories || {})
        .map((subcategory) => `   - ${subcategory}`)
        .join('\n');
      return `${index + 1}. ${category}\n${subcategories}`;
    })
    .join('\n\n');
}

function topicFilterInstructions(topic) {
  const map = {
    govt:
      'STORE government, regulatory, policy, tax, compliance, grant, scheme, subsidy, procurement, tender, court, filing, licensing, budget, immigration, employment, infrastructure, public spending, economic-development, industry-policy, or official guidance updates when they may affect business obligations, advisory work, market entry, operations, accounting, tax, payroll, governance, funding, sector growth, or professional-services clients.',
    news:
      'STORE country-relevant business news, market updates, regulatory developments, investment, expansion, funding, M&A, partnerships, sector trends, workforce changes, operational signals, or advisory opportunities relevant to companies or professional-services clients.',
    competitor:
      'STORE tracked competitor activity, acquisitions, partnerships, new offices, service launches, hiring, senior appointments, funding, client wins, market entry, expansion, thought leadership, or other competitive intelligence with a real business signal.',
    evergreen:
      'STORE only true evergreen reference content: guides, explainers, checklists, official guidance, compliance requirements, how-to resources, filing guides, market-entry guides, tax/accounting guides, FAQs, handbooks, manuals, or practical resources that remain useful for clients or advisors beyond the current news cycle. REJECT ordinary blogs, blog posts, latest-news articles, press releases, opinion pieces, event/webinar pages, promotional thought-leadership, and time-sensitive announcements even if they mention a relevant category.'
  };
  return map[topic] || map.news;
}

function govtCategoryPromptText() {
  return [
    '1. Government Policy',
    '   - New Policy',
    '   - Policy Amendment',
    '   - Consultation Paper',
    '   - Budget Announcement',
    '   - Government Statement',
    '',
    '2. Regulatory Update',
    '   - Central bank / financial regulator guidance',
    '   - Company registry / corporate regulator update',
    '   - Tax authority update',
    '   - Labour / employment regulator update',
    '   - Investment promotion / economic development update',
    '   - Securities / competition / trade regulator update',
    '',
    '3. Tax & Budget',
    '   - Tax Rate Change',
    '   - Budget Measure',
    '   - GST/VAT Update',
    '   - Tax Incentive',
    '   - Tax Treaty',
    '',
    '4. Immigration & Labour',
    '   - Work Pass / Visa',
    '   - Employment Pass',
    '   - Labour Law',
    '   - Minimum Wage',
    '   - Foreign Worker Quota',
    '',
    '5. Trade & FDI',
    '   - FDI Policy',
    '   - Trade Agreement',
    '   - Import/Export Rule',
    '   - Investment Incentive',
    '   - Free Trade Zone'
  ].join('\n');
}

function competitorCategoryPromptText() {
  return [
    '1. Competitor Intelligence',
    '   - Office Expansion',
    '   - Acquisition',
    '   - New Service Launch',
    '   - Leadership Change',
    '   - Partnership',
    '   - Pricing / Market Strategy',
    '   - Investment Increase',
    '   - Regulatory Win / Loss'
  ].join('\n');
}

function evergreenCategoryPromptText() {
  return [
    '1. Compliance & Filing Guides',
    '   - Filing deadlines and recurring obligations',
    '   - Statutory registers, annual returns, beneficial ownership, AML/KYC, licensing, payroll, tax, or company-secretarial requirements',
    '',
    '2. Tax, Accounting & Advisory References',
    '   - Tax guides, GST/VAT explainers, withholding tax, transfer pricing, audit/accounting rules, bookkeeping, payroll, or practical business compliance references',
    '',
    '3. Market Entry & Business Setup',
    '   - Incorporation, branch registration, foreign investment, visa/work-pass setup, employment onboarding, cross-border setup, or operating requirements',
    '',
    '4. Official Guidance & Practical Handbooks',
    '   - Regulator FAQs, official manuals, compliance checklists, procedural explainers, reference pages, or evergreen requirements pages',
    '',
    '5. Professional Services Reference Content',
    '   - Practical resources useful for advisory, accounting, payroll, tax, governance, funds, private clients, corporate services, or operating teams'
  ].join('\n');
}

function fallbackProfileRelevance({ article = {}, topic = 'news' }) {
  const score = Math.max(0, Math.min(100, Number(article.relevanceScore || article.tavilyScore || 0) || 0));
  return {
    decision: score >= PROFILE_RELEVANCE_MIN_SCORE ? 'STORE' : 'IGNORE',
    category: score >= PROFILE_RELEVANCE_MIN_SCORE ? (article.category || 'General') : 'IGNORE',
    subcategory: article.subcategory || '',
    summary: article.summary || article.aiSummary || '',
    relevance_score: score,
    relevance_reason: `Fallback Tavily relevance score ${score} for ${topic}.`
  };
}

async function classifyProfileRelevance({ article = {}, profile = {}, topic = 'news' }) {
  const cli = getClient();
  if (!cli) return fallbackProfileRelevance({ article, topic });
  const currentYear = Math.min(2100, Number(profile.year || profile.currentYear || new Date().getFullYear()) || new Date().getFullYear());

  const validSubcategories = Array.isArray(article.subcategoryOptions)
    ? article.subcategoryOptions
    : Array.isArray(profile.subcategoryOptions)
      ? profile.subcategoryOptions
      : [];
  const companyName = profileCompanyName(profile, article);
  const markets = profileMarkets(profile, article);
  const marketText = markets.join(', ') || 'the selected market';
  const sourceDomains = profileSourceDomains(profile, article, topic);
  const competitors = listPromptValues(profile.competitors || article.competitors);
  const maxAgeDays = Math.max(1, Math.min(365, Number(profile.days || article.days || 30) || 30));
  const selectedCategory = profile.category || article.category || 'General';
  const selectedCategories = listPromptValues(profile.categories || article.categories || selectedCategory);
  const selectedSubcategory = profile.subcategory || article.subcategory || 'All sub-categories';
  const mainCategories = Object.keys(CATEGORIES || {});
  const isGovtTopic = topic === 'govt';
  const isCompetitorTopic = topic === 'competitor';
  const isEvergreenTopic = topic === 'evergreen';
  const promptLines = isGovtTopic
    ? [
        `You are a government intelligence AI for ${companyName}.`,
        'Analyze this article and decide whether it should be stored for the current fetch profile.',
        'Return ONLY valid JSON.',
        '',
        'MARKETS COVERED',
        marketText,
        '',
        'GOVERNMENT UPDATE FOCUS AREAS',
        govtCategoryPromptText(),
        '',
        'ASCENTIUM SERVICES - EXACT CATEGORIES & SUB-CATEGORIES FOR STORAGE',
        taxonomyPromptText(),
        '',
        'STEP 1: REJECT IMMEDIATELY WITH SCORE 0',
        `- Any article NOT about ${marketText}.`,
        '- Non-governmental corporate news, earnings, fundraising, M&A without regulation, real estate, property, construction, entertainment, sports, tourism, CSR, military, defence, conflict, geopolitical news, scam alerts, or social welfare.',
        '- Generic opinion pieces with no regulatory announcement or no clear business/compliance impact.',
        '- Static government portal pages, directories, e-service tool listings, or reference pages with no fresh update.',
        `- Any regulatory change older than ${maxAgeDays} days.`,
        '',
        'STEP 2: SCORING',
        `HIGH (70-100): NEW government announcement, circular, consultation, law, tax change, budget measure, incentive scheme, immigration/labour rule change, or named regulator guidance affecting ${marketText}.`,
        `MEDIUM (${PROFILE_RELEVANCE_MIN_SCORE}-69): Government policy update with a named regulator and clear business impact in ${marketText}, or budget/tax proposal under consultation.`,
        'Score 0: matches any reject rule or is older than the allowed window.',
        `STORE only when score is at least ${PROFILE_RELEVANCE_MIN_SCORE}.`,
        '',
        'STEP 3: CATEGORY AND SUB-CATEGORY SELECTION',
        `For STORE decisions, map the article into ONE exact storage category from this taxonomy only: ${mainCategories.join(', ')}.`,
        'Use the government focus areas above only as interpretation guidance, not as output categories.',
        'Never invent a new category or sub-category. If no existing taxonomy category fits, return IGNORE.',
        '',
        'STEP 4: OUTPUT',
        `summary must explain in 2 short sentences what was announced and why it matters to businesses or compliance teams in ${marketText}.`,
        'relevance_reason must mention the exact regulation, law, policy, consultation, circular, or named regulator guidance and which market it affects.',
        '',
        'Return JSON shape:',
        '{"decision":"STORE|IGNORE","category":"<exact category or IGNORE>","subcategory":"<exact sub-category or IGNORE>","summary":"<2 short sentences>","relevance_score":0-100,"relevance_reason":"<specific reason>"}',
        '',
        'PROFILE CONTEXT',
        `Company/client: ${companyName}`,
        `Country: ${profile.country || article.country || ''}`,
        `Region/state: ${profile.region || article.region || 'All regions'}`,
        `Category selected by user: ${selectedCategory}`,
        `All selected categories: ${selectedCategories.join(', ') || selectedCategory}`,
        `Sub-category selected by user: ${selectedSubcategory}`,
        `Topic/type: ${topic}`,
        `Preferred source domains: ${sourceDomains.join(', ') || 'None provided'}`,
        `Maximum age preference: ${maxAgeDays} days`,
        `Current year: ${currentYear}`,
        '',
        'ARTICLE',
        `Title: ${article.title || ''}`,
        `URL: ${article.url || ''}`,
        `Source: ${article.sourceType || article.source || ''}`,
        `Content/summary/raw excerpt: ${article.summary || article.aiSummary || ''}`
      ]
    : isCompetitorTopic
      ? [
          `You are a competitor intelligence AI for ${companyName}.`,
          'Analyze this article and decide whether it should be stored for the current fetch profile.',
          'Return ONLY valid JSON.',
          '',
          'MARKETS COVERED',
          marketText,
          '',
          'COMPETITOR INTELLIGENCE FOCUS AREAS',
          competitorCategoryPromptText(),
          '',
          'TRACKED COMPETITORS (ONLY these qualify - verify by exact name)',
          competitors.join(', ') || 'No tracked competitors provided',
          '',
          'ASCENTIUM SERVICES - EXACT CATEGORIES & SUB-CATEGORIES FOR STORAGE',
          taxonomyPromptText(),
          '',
          'STEP 1: REJECT IMMEDIATELY (score 0)',
          `- Article does NOT mention any tracked competitor by exact name: ${competitors.join(', ') || 'None provided'}.`,
          `- Named competitor activity is NOT in ${marketText}.`,
          '- Generic industry news with no specific named competitor action.',
          '- Real estate, property, construction companies.',
          '- Banks, insurance companies, fintech, tech companies, e-commerce, or consumer brands unless they are in the tracked competitor list.',
          '- Awards, rankings, conference recaps, CSR, human-interest, charity.',
          `- Any jurisdiction outside ${marketText}.`,
          `- Any update older than ${maxAgeDays} days.`,
          '',
          'STEP 2: SCORING',
          `HIGH (70-100): Named tracked competitor opening a NEW office, completing an acquisition, launching a NEW service, or winning a major mandate in ${marketText}.`,
          `MEDIUM (${PROFILE_RELEVANCE_MIN_SCORE}-69): Named competitor announcing an expansion plan, leadership hire, partnership, investment increase, pricing/market strategy, or regulatory approval in ${marketText}.`,
          'Score 0: no named tracked competitor or activity outside the selected markets.',
          `STORE only when score is at least ${PROFILE_RELEVANCE_MIN_SCORE}.`,
          '',
          'STEP 3: CATEGORY AND SUB-CATEGORY SELECTION',
          'For STORE decisions, use category "Competitor Intelligence" only if that exact category exists in the storage taxonomy.',
          'Choose the best exact storage sub-category from the existing taxonomy only. Never invent a new category or sub-category.',
          'If the competitor event is relevant but no exact existing taxonomy fit is available, use the closest valid existing Competitor Intelligence sub-category from the taxonomy. If there is no valid fit, return IGNORE.',
          '',
          'STEP 4: OUTPUT',
          `summary must explain in 2 short sentences what the competitor did and why it matters to ${companyName} in ${marketText}.`,
          'relevance_reason must mention the exact competitor name, specific action, and which market is affected.',
          '',
          'Return JSON shape:',
          '{"decision":"STORE|IGNORE","category":"<exact category or IGNORE>","subcategory":"<exact sub-category or IGNORE>","summary":"<2 short sentences>","relevance_score":0-100,"relevance_reason":"<specific reason>","competitor_name":"<exact competitor name or empty>"}',
          '',
          'PROFILE CONTEXT',
          `Company/client: ${companyName}`,
          `Country: ${profile.country || article.country || ''}`,
          `Region/state: ${profile.region || article.region || 'All regions'}`,
          `Category selected by user: ${selectedCategory}`,
          `All selected categories: ${selectedCategories.join(', ') || selectedCategory}`,
          `Sub-category selected by user: ${selectedSubcategory}`,
          `Topic/type: ${topic}`,
          `Tracked competitors: ${competitors.join(', ') || 'None'}`,
          `Preferred source domains: ${sourceDomains.join(', ') || 'None provided'}`,
          `Maximum age preference: ${maxAgeDays} days`,
          `Current year: ${currentYear}`,
          '',
          'ARTICLE',
          `Title: ${article.title || ''}`,
          `URL: ${article.url || ''}`,
          `Source: ${article.sourceType || article.source || ''}`,
          `Content/summary/raw excerpt: ${article.summary || article.aiSummary || ''}`
        ]
    : isEvergreenTopic
      ? [
          `You are an evergreen intelligence AI for ${companyName}.`,
          'Analyze this article and decide whether it should be stored for the current fetch profile.',
          'Return ONLY valid JSON.',
          '',
          'MARKETS COVERED',
          marketText,
          '',
          'EVERGREEN CONTENT FOCUS AREAS',
          evergreenCategoryPromptText(),
          '',
          'ASCENTIUM SERVICES - EXACT CATEGORIES & SUB-CATEGORIES FOR STORAGE',
          taxonomyPromptText(),
          '',
          'STEP 1: REJECT IMMEDIATELY WITH SCORE 0',
          `- Any article with no clear connection to ${marketText}.`,
          `- Any jurisdiction outside ${marketText}, unless the content is directly useful for doing business, compliance, tax, payroll, employment, governance, licensing, market entry, or advisory work in ${marketText}.`,
          '- Ordinary news articles, breaking updates, press releases, event/webinar pages, rankings, awards, CSR, generic blogs, opinion pieces, promotional thought-leadership, or time-sensitive announcements.',
          '- Pages that are mainly homepage listings, directories, login pages, search pages, broken pages, or thin promotional landing pages.',
          `- Any page older than ${maxAgeDays} days when the content is clearly outdated, replaced, no longer applicable, or tied to a past news event rather than an evergreen requirement or guide.`,
          '- Pages that do not fit at least one existing storage taxonomy category/sub-category.',
          '',
          'STEP 2: SCORING',
          `HIGH (70-100): A practical evergreen guide, official explainer, FAQ, checklist, filing/compliance guide, market-entry guide, tax/accounting reference, employment/work-pass guide, AML/KYC requirement page, or regulator guidance that is directly useful in ${marketText}.`,
          `MEDIUM (${PROFILE_RELEVANCE_MIN_SCORE}-69): A useful reference page for ${marketText} with practical business or compliance value, but with less direct actionability or weaker category fit.`,
          'Score 0: ordinary news, outdated time-sensitive content, unrelated geography, weak business relevance, or no exact taxonomy fit.',
          `STORE only when score is at least ${PROFILE_RELEVANCE_MIN_SCORE}.`,
          '',
          'STEP 3: TOPIC RULE',
          topicFilterInstructions(topic),
          '',
          'STEP 4: CATEGORY AND SUB-CATEGORY SELECTION',
          `For STORE decisions, the content only needs to match ONE relevant category from the taxonomy: ${mainCategories.join(', ')}.`,
          'The selected/profile category is only a hint. Do not force the page into that category if another existing taxonomy category fits better.',
          'Use the best exact category and sub-category from the existing taxonomy only.',
          `Example valid sub-categories from the selected profile category: ${validSubcategories.join(', ') || 'Use the taxonomy list above.'}`,
          'Never invent a new category or sub-category. If no existing taxonomy fit is available, return IGNORE.',
          '',
          'STEP 5: OUTPUT',
          `summary must explain in 2 short sentences what the guide/reference covers and why it is practically useful for businesses, operators, or compliance teams in ${marketText}.`,
          'relevance_reason must mention the exact filing rule, compliance requirement, tax rule, official guidance, or practical business obligation when available, plus the market and the taxonomy fit.',
          '',
          'If not relevant return category IGNORE, subcategory IGNORE, score 0, and a short reason.',
          '',
          'Return JSON shape:',
          '{"decision":"STORE|IGNORE","category":"<exact category or IGNORE>","subcategory":"<exact sub-category or IGNORE>","summary":"<2 short sentences>","relevance_score":0-100,"relevance_reason":"<specific reason>"}',
          '',
          'PROFILE CONTEXT',
          `Company/client: ${companyName}`,
          `Country: ${profile.country || article.country || ''}`,
          `Region/state: ${profile.region || article.region || 'All regions'}`,
          `Category selected by user: ${selectedCategory}`,
          `All selected categories: ${selectedCategories.join(', ') || selectedCategory}`,
          `Sub-category selected by user: ${selectedSubcategory}`,
          `Topic/type: ${topic}`,
          `Preferred source domains: ${sourceDomains.join(', ') || 'None provided'}`,
          `Maximum age preference: ${maxAgeDays} days`,
          `Current year: ${currentYear}`,
          '',
          'ARTICLE',
          `Title: ${article.title || ''}`,
          `URL: ${article.url || ''}`,
          `Source: ${article.sourceType || article.source || ''}`,
          `Content/summary/raw excerpt: ${article.summary || article.aiSummary || ''}`
        ]
    : [
        `You are a news intelligence AI for ${companyName}.`,
        'Analyze this article and decide whether it should be stored for the current fetch profile.',
        'Return ONLY valid JSON.',
        '',
        'MARKETS COVERED',
        ...markets.length ? markets.map((market, index) => `${index + 1}. ${market}`) : ['1. the selected market'],
        '',
        'ASCENTIUM SERVICES - EXACT CATEGORIES & SUB-CATEGORIES',
        taxonomyPromptText(),
        '',
        'STEP 1: REJECT IMMEDIATELY WITH SCORE 0',
        `- News with no clear connection to ${marketText}.`,
        `- Any jurisdiction outside ${marketText}, unless the article explicitly affects businesses, compliance, tax, investment, employment, governance, market entry, trade, economy, or professional services in ${marketText}.`,
        '- Conference recaps, event summaries, webinars, podcasts, awards, rankings, earnings-only reports, generic fundraising, human-interest stories, CSR, charity, tourism, sports, or entertainment.',
        '- Opinion/editorial pieces with no factual regulatory, policy, market, or business update.',
        '- Real estate, property market, construction, housing, consumer retail, food and beverage, infrastructure, transport, logistics, energy, mining, manufacturing, or insurance news without a direct business, compliance, market-entry, tax, employment, investment, or professional-services angle.',
        '- Technology, AI, cybersecurity, fraud, scam alerts, litigation, arbitration, defence, geopolitical, child protection, social welfare, or patent/IP stories without a direct advisory, regulatory, or compliance angle.',
        '- Static government pages, directory listings, portal homepages, resource hubs, e-service pages, search pages, login pages, or tool pages.',
        `- Any update older than ${maxAgeDays} days when the article clearly shows an older effective or publication date.`,
        `- Any article that does not fit at least one existing taxonomy category from: ${mainCategories.join(', ')}.`,
        '- Do not reject solely because it is not a government update. News can be market, economy, tax, employment, corporate-services, investment, trade, compliance, or professional-services intelligence.',
        `- Competitor intelligence should be kept only when a tracked competitor is explicitly named (${competitors.join(', ') || 'no tracked competitors provided'}) and the article shows expansion, acquisition, partnership, new office, service launch, leadership move, senior hire, thought leadership, or another real market signal in ${marketText}.`,
        '',
        'STEP 2: SCORING',
        `Give HIGH (70-100) when the article has a concrete NEW business, market, economy, investment, tax, compliance, employment, company registry, FDI, trade, professional-services, or competitor signal affecting ${marketText}.`,
        `Give MEDIUM (${PROFILE_RELEVANCE_MIN_SCORE}-69) when the article has a clear business impact in ${marketText} and fits at least one taxonomy category, even if it is not a formal government/regulatory announcement.`,
        'Give 0 when it is unrelated to the market, unrelated to every taxonomy category, too old, broken, or matches a hard reject rule.',
        `STORE only when score is at least ${PROFILE_RELEVANCE_MIN_SCORE}. If the article is not strong enough for ${PROFILE_RELEVANCE_MIN_SCORE}, return IGNORE with score 0.`,
        '',
        'STEP 3: TOPIC RULE',
        topicFilterInstructions(topic),
        '',
        'STEP 4: CATEGORY AND SUB-CATEGORY SELECTION',
        `For STORE decisions, the article only needs to match ONE relevant category from the 10 main categories in the taxonomy: ${mainCategories.join(', ')}.`,
        'The selected/profile category is only a hint. Do not force the article into that category.',
        'Do not reject an article only because it does not match the first/profile category. If it is about the selected market and fits any taxonomy category, STORE it.',
        'Use the best exact category name from the existing taxonomy only.',
        'Choose the best exact sub-category under that category from the existing taxonomy only.',
        `Example valid sub-categories from the selected profile category: ${validSubcategories.join(', ') || 'Use the taxonomy list above.'}`,
        'Never invent a new category or sub-category. If no existing taxonomy category fits, return IGNORE.',
        '',
        'STEP 5: OUTPUT',
        `summary must explain in 2 short sentences what happened and why it matters for businesses, investors, operators, or compliance teams in ${marketText}.`,
        'relevance_reason must mention the specific announcement, market signal, business impact, affected market, and why it fits the chosen taxonomy category/sub-category.',
        '',
        'If not relevant return category IGNORE, subcategory IGNORE, score 0, and a short reason.',
        '',
        'Return JSON shape:',
        '{"decision":"STORE|IGNORE","category":"<exact category or IGNORE>","subcategory":"<exact sub-category or IGNORE>","summary":"<2 short sentences>","relevance_score":0-100,"relevance_reason":"<specific reason>"}',
        '',
        'PROFILE CONTEXT',
        `Company/client: ${companyName}`,
        `Country: ${profile.country || article.country || ''}`,
        `Region/state: ${profile.region || article.region || 'All regions'}`,
        `Category selected by user: ${selectedCategory}`,
        `All selected categories: ${selectedCategories.join(', ') || selectedCategory}`,
        `Sub-category selected by user: ${selectedSubcategory}`,
        `Topic/type: ${topic}`,
        `Tracked competitors: ${competitors.join(', ') || 'None'}`,
        `Preferred source domains: ${sourceDomains.join(', ') || 'None provided'}`,
        `Maximum age preference: ${maxAgeDays} days`,
        `Current year: ${currentYear}`,
        '',
        'ARTICLE',
        `Title: ${article.title || ''}`,
        `URL: ${article.url || ''}`,
        `Source: ${article.sourceType || article.source || ''}`,
        `Content/summary/raw excerpt: ${article.summary || article.aiSummary || ''}`
      ];

  try {
    const resp = await cli.chat.completions.create({
      model: MODEL,
      temperature: 0,
      max_tokens: 420,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a precise business-intelligence relevance classifier. Return valid JSON only.'
        },
        {
          role: 'user',
          content: promptLines.join('\n')
        }
      ]
    });

    const raw = resp.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    const relevanceScore = Math.max(0, Math.min(100, parseInt(parsed.relevance_score, 10) || 0));
    const category = parsed.category || 'IGNORE';
    const explicitDecision = String(parsed.decision || '').toUpperCase();
    const inferredDecision = String(category).toUpperCase() !== 'IGNORE' && relevanceScore >= PROFILE_RELEVANCE_MIN_SCORE
      ? 'STORE'
      : 'IGNORE';
    return {
      decision: explicitDecision || inferredDecision,
      category,
      subcategory: parsed.subcategory || parsed.sub_category || '',
      summary: parsed.summary || parsed.ai_summary || parsed.aiSummary || '',
      relevance_score: relevanceScore,
      relevance_reason: parsed.relevance_reason || parsed.relevanceReason || ''
    };
  } catch (err) {
    console.warn('[ai] profile relevance failed:', err.message);
    return fallbackProfileRelevance({ article, topic });
  }
}

async function generateBlogPost({ article, style = {}, company = {}, keywords = [] }) {
  const cli = getClient();
  if (!cli) {
    return {
      ...fallbackBlog({ article, style, keywords }),
      model: 'fallback'
    };
  }

  const tone = style.tone || 'professional';
  const format = style.format || 'insight_article';
  const audience = style.audience || 'business decision-makers';
  const length = style.length || 'medium';
  const cta = style.ctaDescription || style.cta || '';
  const pointOfView = style.pointOfView || 'third_person';
  const requestedTopic = style.topic || article.title || '';
  const customLength = style.customLength || '';
  const metaTitle = style.metaTitle || '';
  const metaDescription = style.metaDescription || '';
  const primaryKeyword = style.primaryKeyword || '';
  const searchIntent = style.searchIntent || 'informational';
  const outlineMode = style.outlineMode || 'auto';
  const customOutline = style.customOutline || '';
  const focusPage = style.focusPage || '';
  const ctaTitle = style.ctaTitle || '';
  const ctaButtonText = style.ctaButtonText || '';
  const ctaUrl = style.ctaUrl || '';
  const keyPoints = style.keyPoints || '';
  const competitorUrls = style.competitorUrls || '';
  const referenceUrls = style.referenceUrls || '';
  const includeFaq = style.includeFaq !== false;
  const includeStats = style.includeStats !== false;
  const sourceContext = blogSourceContext(article);

  try {
    const resp = await cli.chat.completions.create({
      model: MODEL,
      temperature: 0.35,
      max_tokens: length === 'long' || length === 'custom' ? 4200 : length === 'short' ? 1400 : 2800,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You are a senior B2B advisory writer, professional-services content editor, and SEO strategist.',
            '',
            'Your job is to create a high-quality, human-sounding, commercially useful blog for a professional-services company website using the selected intelligence topic and provided source/reference content.',
            '',
            'The finished blog should read like it was written by an experienced advisor for business owners, CFOs, investors, founders, boards, and regional expansion teams. It must not read like generic AI content.',
            '',
            'IMPORTANT RULES',
            '- Return ONLY valid JSON. No markdown outside JSON.',
            '- Do not plagiarize.',
            '- Do not copy source text verbatim.',
            '- Do not invent facts, data, laws, statistics, dates, names, or claims.',
            '- Use the selected article/source URL and provided source context as the primary reference.',
            '- If additional reference URLs are provided, use them only as supporting context.',
            '- If data/statistics are requested, include them only when supported by the source/reference material.',
            '- Never present assumptions as facts. Qualify uncertain points with careful language such as "may", "can", "could", "companies should assess", or "subject to the facts".',
            '- Do not make broad claims about tax, regulation, setup speed, banking, incentives, market access, or compliance unless the source material supports them.',
            '- For legal, tax, regulatory, immigration, employment, or compliance topics, use advisory wording and avoid giving definitive advice.',
            '- Write in clear, logical, natural language with varied sentence rhythm.',
            '- The blog must feel human-written, specific, and editorially reviewed.',
            '- Use SEO best practices, but avoid keyword stuffing.',
            '- Make the introduction sharp and specific. Do not start with generic setup lines.',
            '- Make the conclusion summarize the practical business signal and nudge the reader toward the CTA.',
            '- If FAQ is requested, include useful search-friendly FAQs.',
            '- Use proper heading hierarchy.',
            '- Write clean publication-ready Markdown.',
            '- Include exactly one H1 at the top of the article body and do not repeat the title again in the introduction.',
            '- Do not output placeholder text, editorial notes, drafting comments, or AI-style scene-setting language.',
            '- Do not use anchor-link Table of Contents formats such as [Heading](#heading).',
            '- If a Table of Contents is included, format it as a clean plain list in Markdown only.',
            '- Do not produce template filler like "this guide explores", "in this article", or "navigating the evolving landscape" unless the wording is genuinely specific and necessary.',
            '',
            'ANTI-GENERIC WRITING RULES',
            '- Avoid empty promotional phrases such as "vibrant market", "remarkable achievement", "unparalleled opportunities", "robust business environment", "game changer", "dynamic landscape", "in today\'s fast-paced world", and similar filler.',
            '- Avoid repeating the title in the first sentence unless it is needed for clarity.',
            '- Avoid paragraphs that only restate the heading.',
            '- Avoid generic advice like "stay informed" unless paired with a concrete action.',
            '- Avoid obvious statements. Every section should add a useful business implication, decision point, caveat, checklist item, or example grounded in the source.',
            '- Avoid weak intros that simply define the topic. Start with the concrete compliance, business, or operational issue the reader must act on.',
            '',
            'ADVISORY DEPTH RULES',
            '- For news or market-ranking topics, separate: what changed, why it matters, what companies should review, and what remains uncertain.',
            '- For tax/regulatory/compliance topics, separate: rule or guidance, who may be affected, deductible/actionable points, documentation or filing implications, and limitations.',
            '- For market-entry topics, discuss entity setup, tax position, banking, payroll/employment, licensing, governance, contracts, local substance, and timelines only where relevant and with careful wording.',
            '- Include one practical checklist, table, or decision framework when it improves usefulness.',
            '- Mention the source or report context naturally when relevant, but do not over-cite or over-quote.'
          ].join('\n')
        },
        {
          role: 'user',
          content: [
            'CLIENT / COMPANY CONTEXT',
            `Company name: ${company.name || 'The company'}`,
            `Service / focus page: ${focusPage || 'Not provided'}`,
            `Target audience: ${audience}`,
            `Tone: ${tone}`,
            `Point of view: ${pointOfView}`,
            '',
            'BLOG REQUIREMENTS',
            `Topic: ${requestedTopic}`,
            `Format: ${format}`,
            `Length: ${length}${length === 'custom' && customLength ? ` (${customLength})` : ''}`,
            `Target search intent: ${searchIntent}`,
            '',
            'FORMAT BLUEPRINT',
            blogFormatBlueprint(format),
            '',
            'SEO REQUIREMENTS',
            `Primary SEO keyword: ${primaryKeyword || keywords[0] || ''}`,
            `Secondary SEO keywords: ${keywords.filter((item) => item !== primaryKeyword).join(', ') || 'Use relevant category and market keywords.'}`,
            `Meta title preference: ${metaTitle || 'Generate a concise SEO meta title.'}`,
            `Meta description preference: ${metaDescription || 'Generate a concise SEO meta description.'}`,
            '',
            'CONTENT STRUCTURE',
            `Outline mode: ${outlineMode}`,
            `Custom outline:\n${outlineMode === 'custom' ? customOutline : 'Auto-generate a clear Table of Contents.'}`,
            '',
            'If outline mode is "auto", generate a clear Table of Contents before writing the body.',
            'If outline mode is "custom", follow the custom outline as closely as possible.',
            '',
            'CTA REQUIREMENTS',
            `CTA title: ${ctaTitle}`,
            `CTA description: ${cta || 'Use a soft professional CTA.'}`,
            `CTA button text: ${ctaButtonText}`,
            `CTA URL: ${ctaUrl}`,
            '',
            'ADDITIONAL CONTEXT',
            `Key points to cover:\n${keyPoints}`,
            `Competitor URLs:\n${competitorUrls}`,
            `Additional reference/source URLs:\n${referenceUrls}`,
            `Include FAQ section: ${includeFaq ? 'Yes' : 'No'}`,
            `Include statistics and data: ${includeStats ? 'Yes' : 'No'}`,
            '',
            'SOURCE INTELLIGENCE ITEM',
            `Source title: ${article.title || ''}`,
            `Source summary: ${article.summary || article.aiSummary || ''}`,
            `Source context / raw material:\n${sourceContext || 'No additional context stored.'}`,
            `Source URL: ${article.url || ''}`,
            `Source query: ${article.sourceQuery || ''}`,
            `Relevance reason: ${article.relevanceReason || ''}`,
            `Market: ${[article.region, article.country].filter(Boolean).join(', ') || 'Not specified'}`,
            `Category: ${article.category || ''}`,
            `Sub-category: ${article.subcategory || ''}`,
            `Source type: ${article.type || ''}`,
            `Matched interests: ${Array.isArray(article.matchedInterests) ? article.matchedInterests.join(', ') : ''}`,
            '',
            'BLOG WRITING INSTRUCTIONS',
            '1. Start with a specific editorial introduction that explains the real business signal behind the headline.',
            '2. Write the body as a publish-ready article, not as notes, prompts, or a content brief.',
            '3. Include a clean Table of Contents in plain Markdown list format only. Do not use anchor links.',
            '4. Write a structured blog body with meaningful H2/H3 headings. Headings should sound like advisory sections, not generic textbook labels.',
            '5. Explain why the topic matters to the target audience in practical business terms.',
            '6. Use examples where helpful, but do not invent unsupported examples.',
            '7. Include a practical checklist, table, or decision framework when useful.',
            '8. Include internal linking suggestions naturally if focus page or internal pages are provided.',
            '9. Include practical takeaways that a reader can act on or discuss internally.',
            '10. If FAQ is requested, add 3-5 useful FAQs with specific, cautious answers.',
            '11. End with a concise conclusion and CTA.',
            '12. Keep the blog coherent, flowing, and professionally written.',
            '',
            'QUALITY BAR BEFORE RETURNING',
            '- Rewrite any generic paragraph before final output.',
            '- Remove filler adjectives and unsupported claims.',
            '- Ensure each major section answers "so what?" for the target audience.',
            '- Ensure the blog is useful even to a reader who already knows the headline.',
            '- Ensure the CTA is connected to the topic, not a generic sales line.',
            '- Ensure the final article looks ready to publish in a CMS without cleanup.',
            '- Ensure the opening paragraph does not merely define the topic or repeat the title.',
            '- Ensure the Markdown has one H1, clean H2/H3 structure, no duplicate headings, and no broken link syntax.',
            '',
            'OUTPUT FORMAT',
            'Return ONLY valid JSON. No markdown outside JSON.',
            '',
            'JSON shape:',
            '{',
            '  "title": "<SEO-friendly blog title>",',
            '  "excerpt": "<short blog summary, 2-3 sentences>",',
            '  "bodyMarkdown": "<full blog in clean publish-ready Markdown with one H1, plain-list TOC, headings, body, FAQ if requested, conclusion and CTA>",',
            '  "suggestedKeywords": ["<keyword 1>", "<keyword 2>", "<keyword 3>"],',
            '  "metaTitle": "<SEO title, 50-60 characters, ideally question-style if suitable>",',
            '  "metaDescription": "<SEO meta description, 150-160 characters>",',
            '  "faq": [',
            '    { "question": "<FAQ question>", "answer": "<FAQ answer>" }',
            '  ],',
            '  "cta": {',
            '    "title": "<CTA title>",',
            '    "description": "<CTA description>",',
            '    "buttonText": "<CTA button text>",',
            '    "url": "<CTA URL or empty string>"',
            '  },',
            '  "socialMediaCopy": "<short LinkedIn/social copy for promoting the blog>",',
            '  "resources": [',
            '    { "label": "<source/resource name>", "url": "<source/resource URL>" }',
            '  ],',
            '  "bannerBrief": "<short design brief for blog banner image>"',
            '}'
          ].join('\n')
        }
      ]
    });

    const raw = resp.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    if (!parsed.title || !parsed.bodyMarkdown) {
      return {
        ...fallbackBlog({ article, style, keywords }),
        model: MODEL
      };
    }
    const finalTitle = String(parsed.title).trim();
    const finalBodyMarkdown = formatBlogMarkdown(parsed.bodyMarkdown, finalTitle);
    return {
      title: finalTitle,
      excerpt: formatExcerpt(parsed.excerpt, article?.summary || article?.aiSummary || ''),
      bodyMarkdown: finalBodyMarkdown,
      suggestedKeywords: uniqueStrings(
        Array.isArray(parsed.suggestedKeywords)
          ? parsed.suggestedKeywords.map((item) => String(item || '').trim())
          : keywords
      ).slice(0, 8),
      metaTitle: String(parsed.metaTitle || finalTitle || '').trim(),
      metaDescription: formatExcerpt(parsed.metaDescription, parsed.excerpt || article?.summary || '').slice(0, 160),
      model: MODEL
    };
  } catch (err) {
    console.warn('[ai] blog generation failed:', err.message);
    return {
      ...fallbackBlog({ article, style, keywords }),
      model: MODEL
    };
  }
}

async function generateLinkedInPost({ article, options = {}, company = {} }) {
  const cli = getClient();
  if (!cli) {
    return fallbackLinkedInPost({ article, options });
  }

  const sourceContext = blogSourceContext(article);
  const postGoal = options.postGoal || 'thought_leadership';
  const tone = options.tone || 'professional';
  const audience = options.audience || 'business decision-makers';
  const length = options.length || 'medium';
  const hookStyle = options.hookStyle || 'proof';
  const framework = options.framework || 'auto';
  const topicTier = options.topicTier || 'auto';
  const emotionalJob = options.emotionalJob || 'auto';
  const icpPainPoints = options.icpPainPoints || '';
  const marketReality = options.marketReality || '';
  const personaProfile = options.personaProfile || '';
  const proofElement = options.proofElement || '';
  const authorityLine = options.authorityLine || '';
  const takeaway = options.takeaway || '';
  const cta = options.cta || '';
  const includeCTA = options.includeCTA !== false;
  const includeHashtags = options.includeHashtags !== false;
  const customInstructions = options.customInstructions || '';

  try {
    const resp = await cli.chat.completions.create({
      model: MODEL,
      temperature: 0.55,
      max_tokens: length === 'long' ? 1200 : length === 'short' ? 700 : 950,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You are a founder/operator/advisor LinkedIn ghostwriter.',
            'You do not sound like a content writer or AI.',
            'You write like someone who has done the work, learned the lesson, and can explain it plainly.',
            'You optimize for sharpness, specificity, and memorability over safe generic phrasing.',
            '',
            'Return ONLY valid JSON. No markdown outside JSON.',
            '',
            'HARD CONSTRAINTS',
            'Never use these phrases:',
            '- In today’s fast-paced world',
            '- Thrilled to announce',
            '- Game-changer',
            '- Thought leader',
            '- Leverage, unless used in a financial context',
            '- Generic CTAs like What do you think?',
            '- Remember,',
            '- Stay informed',
            '- The key takeaway is',
            '',
            'Never use motivational fluff, corporate filler, or AI-polished phrasing.',
            'Use one clear idea only.',
            'Use I only when the post is written as a lived/operator insight.',
            'Do not invent facts, numbers, timeframes, clients, or results.',
            'If proof is not provided by the user or source, use a cautious proof element from the source only.'
            ,
            'If the source is weak, indirect, or low-relevance, do NOT fake importance.',
            'Instead, turn it into a sharper lesson about filtering, risk judgment, governance, timing, or decision quality.',
            'If the source contains an enforcement action, penalty, regulatory filing, fine, deadline, consultation, or official notice, make the business implication concrete.',
            'Turn compliance updates into operational judgment: who owns the control, what can fail, what should be reviewed, and why it matters.',
            'Avoid generic lines like "not all news matters" unless made more specific and original.',
            'Every post should contain at least one line that feels quotable or worth saving.',
            'Do not write a summary. Write a point of view built from the source.'
          ].join('\n')
        },
        {
          role: 'user',
          content: [
            'Create a LinkedIn post from the selected intelligence source.',
            '',
            'COMPANY / AUTHOR CONTEXT',
            `Company/author: ${company.name || 'The company'}`,
            `Audience / ICP: ${audience}`,
            `Person profile: ${personaProfile || 'Founder/operator/advisor/consultant'}`,
            `Tone: ${tone}`,
            `Post goal: ${postGoal}`,
            '',
            'SOURCE INTELLIGENCE',
            `Title: ${article.title || ''}`,
            `Summary: ${article.summary || article.aiSummary || ''}`,
            `URL: ${article.url || ''}`,
            `Market: ${[article.region, article.country].filter(Boolean).join(', ') || 'Not specified'}`,
            `Category: ${article.category || ''}`,
            `Sub-category: ${article.subcategory || ''}`,
            `Source type: ${article.type || ''}`,
            `Relevance reason: ${article.relevanceReason || ''}`,
            `Source context:\n${sourceContext || 'No extra source context stored.'}`,
            '',
            'USER STRATEGY INPUTS',
            `ICP pain points:\n${icpPainPoints}`,
            `Market realities:\n${marketReality}`,
            `Proof element to use:\n${proofElement}`,
            `Soft authority line to use:\n${authorityLine}`,
            `Preferred takeaway:\n${takeaway}`,
            `CTA direction:\n${cta}`,
            `Custom instructions:\n${customInstructions}`,
            '',
            'STEP 1 - TOPIC INTELLIGENCE',
            'Generate 3 content topic options based on the source, ICP pain points, market realities, founder/operator experience, industry misconceptions, and buyer psychology.',
            'Each topic must be specific, relevant to ICP + person profile, and useful enough that a busy operator would save it.',
            'Do not choose the article title as the topic unless it is already a strong business lesson.',
            '',
            'STEP 2 - CLASSIFY EACH TOPIC',
            'For each topic, assign:',
            '- Tier: Broad (reach), Practical (decision-useful), Narrow (authority), or Niche (conversion)',
            '- Emotional Job: Inspire, Educate, Urgency, Reassure, Provoke, or Convert',
            `Preferred tier: ${topicTier}`,
            `Preferred emotional job: ${emotionalJob}`,
            '',
            'STEP 3 - SELECT BEST TOPIC',
            'Pick the best topic based on decision value, emotional tension, proof strength, and authority positioning.',
            'If the source is weak or political/noisy, select a filtering/judgment topic instead of pretending it is a direct market signal.',
            'If the source is about enforcement, filings, compliance, governance, tax, hiring, market entry, or regulation, select a practical risk/control topic.',
            '',
            'STEP 4 - SELECT WRITING FRAMEWORK',
            'Choose ONE framework:',
            '- SLAY: story-led authority',
            '- PAS: pain-driven inbound',
            '- PRA: problem-risk-action',
            '- POV: high reach',
            '- 5-Line Mirror: authority + relatability',
            '- AIDA: conversion / announcement',
            `Preferred framework: ${framework}`,
            '',
            'STEP 5 - HOOK GENERATION',
            `Hook style preference: ${hookStyle}`,
            'Generate proof-led, warning-led, contrarian, and personal-story hook options.',
            'Each hook line 1 must be under 8 words, create curiosity or tension, and avoid generic phrasing.',
            'Prefer hooks that are concrete, pointed, and slightly uncomfortable over bland summary hooks.',
            'Select the strongest hook.',
            '',
            'STEP 6 - WRITE THE POST',
            'Structure rules:',
            '- First 5 lines must form a slippery slide.',
            '- Max 2 lines per paragraph.',
            '- No paragraph over 30 words.',
            '- Mix short, medium, and punchy sentence lengths.',
            '- Include exactly one proof element.',
            '- Include one soft authority line only if it adds credibility without sounding promotional.',
            '- Include one clear takeaway: Rule of One.',
            '- Do not include hashtags inside postText. Return hashtags only in the hashtags array.',
            '- Do not restate the source summary. Convert it into a practical lesson, decision rule, or operating question.',
            '',
            'Voice rules:',
            '- Write like someone who has done the work.',
            '- Use I for lived insights when natural.',
            '- No corporate jargon unless natural.',
            '- No motivational fluff.',
            '- No AI-polished tone.',
            '- No textbook summary voice.',
            '- No repeating the same idea in different wording.',
            '- Every paragraph should move the idea forward.',
            '- Prefer concrete nouns and business consequences over broad phrases like market-relevant intelligence.',
            '',
            'STEP 7 - CTA',
            `Include CTA: ${includeCTA ? 'Yes' : 'No'}`,
            'Write one tightly coupled CTA related directly to the topic, even if the user CTA direction is generic.',
            'It should feel like a natural next step, preferably a useful operator question.',
            'Do not use a generic CTA if the topic does not support one.',
            'If the user provided a generic CTA like "Follow us", turn it into a contextual CTA and keep the promotional wording out of the post.',
            '',
            'STEP 7B - HASHTAGS',
            `Include hashtags: ${includeHashtags ? 'Yes' : 'No'}`,
            'If hashtags are included, return 5 to 7 hashtags only.',
            'Use a balanced mix: 2 broad discovery hashtags, 2 category hashtags, 1 to 3 article-specific hashtags.',
            'Make them specific to market intelligence, risk, compliance, governance, business strategy, regulation, tax, corporate services, hiring, market entry, or the article theme.',
            'Do not use vague filler hashtags.',
            '',
            'STEP 8 - QUALITY CONTROL',
            'Validate before output:',
            '- Hook is strong and under 8 words.',
            '- No banned phrases used.',
            '- One clear idea only.',
            '- Sounds human, not AI.',
            '- Valuable to a cold reader.',
            '- No generic ending.',
            '- CTA is contextual, not promotional filler.',
            '- Hashtags are outside postText and count is 5 to 7 when enabled.',
            `Length: ${length}`,
            '',
            'OUTPUT JSON SHAPE',
            '{',
            '  "topicOptions": [',
            '    { "topic": "<specific topic>", "tier": "Broad|Practical|Narrow|Niche", "emotionalJob": "Inspire|Educate|Urgency|Reassure|Provoke|Convert", "reason": "<why it works>" }',
            '  ],',
            '  "selectedTopic": "<best topic>",',
            '  "topicTier": "Broad|Practical|Narrow|Niche",',
            '  "emotionalJob": "Inspire|Educate|Urgency|Reassure|Provoke|Convert",',
            '  "framework": "SLAY|PAS|PRA|POV|5-Line Mirror|AIDA",',
            '  "hookOptions": ["<hook 1>", "<hook 2>", "<hook 3>"],',
            '  "hook": "<selected hook under 8 words>",',
            '  "postText": "<complete LinkedIn post with line breaks>",',
            '  "cta": "<final CTA or empty string>",',
            '  "hashtags": ["<hashtag 1>", "<hashtag 2>", "<hashtag 3>", "<hashtag 4>", "<hashtag 5>", "<optional hashtag 6>", "<optional hashtag 7>"],',
            '  "qualityChecks": {',
            '    "hookUnderEightWords": true,',
            '    "noBannedPhrases": true,',
            '    "oneClearIdea": true,',
            '    "soundsHuman": true,',
            '    "valuableToColdReader": true,',
            '    "noGenericEnding": true,',
            '    "hashtagsOutsidePostText": true',
            '  }',
            '}'
          ].join('\n')
        }
      ]
    });

    const raw = resp.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    if (!parsed.postText || !parsed.hook) {
      return {
        ...fallbackLinkedInPost({ article, options }),
        model: MODEL
      };
    }

    return {
      topicOptions: Array.isArray(parsed.topicOptions) ? parsed.topicOptions : [],
      selectedTopic: String(parsed.selectedTopic || article.title || '').trim(),
      topicTier: String(parsed.topicTier || '').trim(),
      emotionalJob: String(parsed.emotionalJob || '').trim(),
      framework: String(parsed.framework || '').trim(),
      hookOptions: Array.isArray(parsed.hookOptions) ? parsed.hookOptions.map(String) : [],
      hook: String(parsed.hook || '').trim(),
      postText: stripTrailingHashtags(parsed.postText),
      cta: String(parsed.cta || '').trim(),
      hashtags: normalizeHashtags(
        Array.isArray(parsed.hashtags) ? parsed.hashtags.map(String) : [],
        [
          '#MarketIntelligence',
          '#BusinessStrategy',
          '#RiskManagement',
          '#Governance',
          '#Compliance',
          '#Advisory'
        ]
      ),
      qualityChecks: parsed.qualityChecks || {},
      model: MODEL
    };
  } catch (err) {
    console.warn('[ai] linkedin generation failed:', err.message);
    return {
      ...fallbackLinkedInPost({ article, options }),
      model: MODEL
    };
  }
}

module.exports = { isEnabled, summarizeArticle, classifyCategory, classifyProfileRelevance, generateBlogPost, generateLinkedInPost };
