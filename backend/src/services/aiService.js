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
const PROFILE_RELEVANCE_MIN_SCORE = Math.max(0, Math.min(100, Number(process.env.AI_RELEVANCE_MIN_SCORE || 50) || 50));

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
    hashtags: ['#BusinessIntelligence', '#MarketIntelligence', '#Advisory'],
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
    .slice(0, 3000);
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
  const country = cleanPromptText(profile.country || article.country);
  const region = cleanPromptText(profile.region || article.region);
  const location = cleanPromptText(article.location || profile.location);
  const markets = [country, region ? `${country || location} (${region})` : '', location]
    .filter(Boolean);
  return [...new Set(markets)].slice(0, 4);
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
  const competitors = listPromptValues(profile.competitors || article.competitors);
  const maxAgeDays = Math.max(1, Math.min(365, Number(profile.days || article.days || 30) || 30));
  const selectedCategory = profile.category || article.category || 'General';
  const selectedCategories = listPromptValues(profile.categories || article.categories || selectedCategory);
  const selectedSubcategory = profile.subcategory || article.subcategory || 'All sub-categories';
  const mainCategories = Object.keys(CATEGORIES || {});

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
          content: [
            `You are a news intelligence AI for ${companyName}.`,
            'Analyze this article and decide whether it should be stored for the current fetch profile.',
            'Return ONLY valid JSON.',
            '',
            'MARKETS COVERED',
            marketText,
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
            `Maximum age preference: ${maxAgeDays} days`,
            `Current year: ${currentYear}`,
            '',
            'AVAILABLE CATEGORIES AND SUB-CATEGORIES',
            taxonomyPromptText(),
            '',
            'STEP 1: REJECT IMMEDIATELY WITH SCORE 0',
            `- Any article with no clear connection to ${marketText}.`,
            `- Any jurisdiction outside ${marketText}, unless it mentions or clearly affects businesses, compliance, tax, investment, employment, governance, market entry, trade, economy, or professional services in ${marketText}.`,
            `- Any article that does not fit at least one of the 10 main categories in the taxonomy: ${mainCategories.join(', ')}.`,
            '- Broken pages, directory pages, homepage/listing pages, login/e-service pages, job-only posts, stock-price-only pages, pure product promotions, sports, entertainment, human-interest stories, or generic opinion pieces with no factual update.',
            `- Any update older than ${maxAgeDays} days when the article clearly shows an older effective or publication date.`,
            '- Competitor intelligence should be kept when a tracked competitor is explicitly named or the source/article describes expansion, acquisition, partnership, new office, hiring, senior appointment, service launch, thought leadership, or another market signal in the selected market.',
            '',
            'STEP 2: TOPIC RULE',
            topicFilterInstructions(topic),
            '',
            'STEP 3: SCORING',
            `Give 70-100 when the article has a concrete announcement, policy, regulation, law, compliance requirement, tax change, budget measure, employment/immigration change, AML/KYC/governance change, company registry update, fund/family-office/trust/private-client rule, FDI/market-entry policy, economy/trade update, or competitor signal affecting ${marketText}.`,
            `Give ${PROFILE_RELEVANCE_MIN_SCORE}-69 when it is a useful ${marketText} business, economy, regulatory, tax, employment, market-entry, professional-services, or competitor update that fits any taxonomy category.`,
            'Give 0 when it is unrelated to the country, unrelated to every taxonomy category, too old, broken, or matches a hard reject rule.',
            `STORE only when score is at least ${PROFILE_RELEVANCE_MIN_SCORE}. If the article is not strong enough for ${PROFILE_RELEVANCE_MIN_SCORE}, return IGNORE with score 0.`,
            '',
            'STEP 4: CATEGORY AND SUB-CATEGORY SELECTION',
            `For STORE decisions, the article only needs to match ONE relevant category from the 10 main categories in the taxonomy: ${mainCategories.join(', ')}.`,
            'Do not reject an article only because it does not match the first/profile category. If it is about the selected country and fits any taxonomy category, STORE it.',
            'Use the best exact category name from AVAILABLE CATEGORIES AND SUB-CATEGORIES.',
            `Valid sub-categories for the selected category: ${validSubcategories.join(', ') || 'Use the taxonomy list above.'}`,
            'Use the best exact sub-category under the chosen category. If valid sub-categories are provided for the profile category, prefer them only when they fit; otherwise use the taxonomy list above.',
            '',
            'STEP 5: OUTPUT',
            `summary must explain in 2 short sentences what happened and why it matters for businesses, investors, operators, or compliance teams in ${marketText}.`,
            'relevance_reason must mention the specific law/regulation/policy/announcement/source signal when available, the affected market, and the sub-category fit.',
            '',
            'If not relevant return category IGNORE, subcategory IGNORE, score 0, and a short reason.',
            '',
            'Return JSON shape:',
            '{"decision":"STORE|IGNORE","category":"<exact category or IGNORE>","subcategory":"<exact sub-category or IGNORE>","summary":"<2 short sentences>","relevance_score":0-100,"relevance_reason":"<specific reason>"}',
            '',
            'ARTICLE',
            `Title: ${article.title || ''}`,
            `URL: ${article.url || ''}`,
            `Source: ${article.sourceType || article.source || ''}`,
            `Content/summary/raw excerpt: ${article.summary || article.aiSummary || ''}`
          ].join('\n')
        }
      ]
    });

    const raw = resp.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    return {
      decision: String(parsed.decision || '').toUpperCase() === 'STORE' ? 'STORE' : 'IGNORE',
      category: parsed.category || 'IGNORE',
      subcategory: parsed.subcategory || parsed.sub_category || '',
      summary: parsed.summary || '',
      relevance_score: Math.max(0, Math.min(100, parseInt(parsed.relevance_score, 10) || 0)),
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
  const internalLinkPages = style.internalLinkPages || '';
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
            '',
            'ANTI-GENERIC WRITING RULES',
            '- Avoid empty promotional phrases such as "vibrant market", "remarkable achievement", "unparalleled opportunities", "robust business environment", "game changer", "dynamic landscape", "in today\'s fast-paced world", and similar filler.',
            '- Avoid repeating the title in the first sentence unless it is needed for clarity.',
            '- Avoid paragraphs that only restate the heading.',
            '- Avoid generic advice like "stay informed" unless paired with a concrete action.',
            '- Avoid obvious statements. Every section should add a useful business implication, decision point, caveat, checklist item, or example grounded in the source.',
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
            '1. Start with a specific, editorial introduction that explains the real business signal behind the headline.',
            '2. Include a Table of Contents.',
            '3. Write a structured blog body with meaningful H2/H3 headings. Headings should sound like advisory sections, not generic textbook labels.',
            '4. Explain why the topic matters to the target audience in practical business terms.',
            '5. Use examples where helpful, but do not invent unsupported examples.',
            '6. Include a practical checklist, table, or decision framework when useful.',
            '7. Include internal linking suggestions naturally if focus page or internal pages are provided.',
            '8. Include practical takeaways that a reader can act on or discuss internally.',
            '9. If FAQ is requested, add 3-5 useful FAQs with specific, cautious answers.',
            '10. End with a concise conclusion and CTA.',
            '11. Keep the blog coherent, flowing, and professionally written.',
            '',
            'QUALITY BAR BEFORE RETURNING',
            '- Rewrite any generic paragraph before final output.',
            '- Remove filler adjectives and unsupported claims.',
            '- Ensure each major section answers "so what?" for the target audience.',
            '- Ensure the blog is useful even to a reader who already knows the headline.',
            '- Ensure the CTA is connected to the topic, not a generic sales line.',
            '',
            'OUTPUT FORMAT',
            'Return ONLY valid JSON. No markdown outside JSON.',
            '',
            'JSON shape:',
            '{',
            '  "title": "<SEO-friendly blog title>",',
            '  "excerpt": "<short blog summary, 2-3 sentences>",',
            '  "bodyMarkdown": "<full blog in Markdown with H1, TOC, headings, body, FAQ if requested, conclusion and CTA>",',
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
    return {
      title: String(parsed.title).trim(),
      excerpt: String(parsed.excerpt || '').trim(),
      bodyMarkdown: String(parsed.bodyMarkdown).trim(),
      suggestedKeywords: Array.isArray(parsed.suggestedKeywords) ? parsed.suggestedKeywords.map(String) : keywords,
      metaTitle: String(parsed.metaTitle || parsed.title || '').trim(),
      metaDescription: String(parsed.metaDescription || parsed.excerpt || '').trim(),
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
            '',
            'Never use motivational fluff, corporate filler, or AI-polished phrasing.',
            'Use one clear idea only.',
            'Use I only when the post is written as a lived/operator insight.',
            'Do not invent facts, numbers, timeframes, clients, or results.',
            'If proof is not provided by the user or source, use a cautious proof element from the source only.'
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
            'Generate content topic options based on ICP pain points, market realities, founder/operator experience, industry misconceptions, and buyer psychology.',
            'Each topic must be specific, relevant to ICP + person profile, and capable of triggering engagement or inbound.',
            '',
            'STEP 2 - CLASSIFY EACH TOPIC',
            'For each topic, assign:',
            '- Tier: Broad (reach), Narrow (authority), or Niche (conversion)',
            '- Emotional Job: Inspire, Educate, Provoke, or Convert',
            `Preferred tier: ${topicTier}`,
            `Preferred emotional job: ${emotionalJob}`,
            '',
            'STEP 3 - SELECT BEST TOPIC',
            'Pick the best topic based on highest relevance to ICP, strongest emotional tension, and best fit for authority positioning.',
            '',
            'STEP 4 - SELECT WRITING FRAMEWORK',
            'Choose ONE framework:',
            '- SLAY: story-led authority',
            '- PAS: pain-driven inbound',
            '- POV: high reach',
            '- 5-Line Mirror: authority + relatability',
            '- AIDA: conversion / announcement',
            `Preferred framework: ${framework}`,
            '',
            'STEP 5 - HOOK GENERATION',
            `Hook style preference: ${hookStyle}`,
            'Generate proof-led, contrarian, and personal-story hook options.',
            'Each hook line 1 must be under 8 words, create curiosity or tension, and avoid generic phrasing.',
            'Select the strongest hook.',
            '',
            'STEP 6 - WRITE THE POST',
            'Structure rules:',
            '- First 5 lines must form a slippery slide.',
            '- Max 2 lines per paragraph.',
            '- No paragraph over 30 words.',
            '- Mix short, medium, and punchy sentence lengths.',
            '- Include exactly one proof element.',
            '- Include one soft authority line.',
            '- Include one clear takeaway: Rule of One.',
            '',
            'Voice rules:',
            '- Write like someone who has done the work.',
            '- Use I for lived insights when natural.',
            '- No corporate jargon unless natural.',
            '- No motivational fluff.',
            '- No AI-polished tone.',
            '',
            'STEP 7 - CTA',
            `Include CTA: ${includeCTA ? 'Yes' : 'No'}`,
            'Write one tightly coupled CTA related directly to the topic.',
            'It should feel like a natural next step, preferably curiosity-driven.',
            '',
            'STEP 8 - QUALITY CONTROL',
            'Validate before output:',
            '- Hook is strong and under 8 words.',
            '- No banned phrases used.',
            '- One clear idea only.',
            '- Sounds human, not AI.',
            '- Valuable to a cold reader.',
            '- No generic ending.',
            '',
            `Include hashtags: ${includeHashtags ? 'Yes' : 'No'}`,
            `Length: ${length}`,
            '',
            'OUTPUT JSON SHAPE',
            '{',
            '  "topicOptions": [',
            '    { "topic": "<specific topic>", "tier": "Broad|Narrow|Niche", "emotionalJob": "Inspire|Educate|Provoke|Convert", "reason": "<why it works>" }',
            '  ],',
            '  "selectedTopic": "<best topic>",',
            '  "topicTier": "Broad|Narrow|Niche",',
            '  "emotionalJob": "Inspire|Educate|Provoke|Convert",',
            '  "framework": "SLAY|PAS|POV|5-Line Mirror|AIDA",',
            '  "hookOptions": ["<hook 1>", "<hook 2>", "<hook 3>"],',
            '  "hook": "<selected hook under 8 words>",',
            '  "postText": "<complete LinkedIn post with line breaks>",',
            '  "cta": "<final CTA or empty string>",',
            '  "hashtags": ["<hashtag 1>", "<hashtag 2>"],',
            '  "qualityChecks": {',
            '    "hookUnderEightWords": true,',
            '    "noBannedPhrases": true,',
            '    "oneClearIdea": true,',
            '    "soundsHuman": true,',
            '    "valuableToColdReader": true,',
            '    "noGenericEnding": true',
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
      postText: String(parsed.postText || '').trim(),
      cta: String(parsed.cta || '').trim(),
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map(String) : [],
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
