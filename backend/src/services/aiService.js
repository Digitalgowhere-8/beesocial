/**
 * AI Service - OpenAI (optional)
 * -------------------------------
 * Used for two enhancements:
 *   1. AI-generated short summary of an article
 *   2. Smart category classification when keyword matching is ambiguous
 *
 * EVERYTHING is opt-in:
 *   - If OPENAI_API_KEY is not set, every function is a no-op.
 *   - Summary/category enrichment is controlled by System Settings.
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

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function generationConfig(config = {}, fallback = {}) {
  return {
    model: String(config.model || fallback.model || MODEL),
    temperature: clampNumber(config.temperature, fallback.temperature ?? 0.4, 0, 1),
    maxWords: Math.round(clampNumber(config.maxWords, fallback.maxWords ?? 1000, fallback.minWords ?? 80, fallback.maxAllowedWords ?? 3000))
  };
}

function runtimeAiModel(config = {}) {
  return String(config.model || config.aiModel || MODEL);
}

function wordsToMaxTokens(words, fallbackTokens) {
  const normalizedWords = Number(words);
  if (!Number.isFinite(normalizedWords) || normalizedWords <= 0) return fallbackTokens;
  return Math.max(500, Math.min(6000, Math.ceil(normalizedWords * 1.7)));
}

const BEESOCIAL_BRAND_GUIDELINES = [
  'Client brand positioning: write like a senior professional-services advisor helping companies make confident cross-border, compliance, accounting, tax, corporate services, payroll, HR, and market-entry decisions.',
  'Voice: clear, practical, commercially aware, credible, calm, and advisory. The content should feel premium and expert, not casual, hype-led, or generic.',
  'Audience: founders, CFOs, finance leaders, boards, investors, regional expansion teams, and business owners who need actionable guidance, not academic explanation.',
  'Point of view: translate policy, tax, regulatory, market, or operational updates into business implications, decision points, risks, and next steps.',
  'Style: use plain English, short-to-medium paragraphs, concrete examples, structured lists, and careful advisory caveats where law, tax, employment, immigration, or compliance is involved.',
  'Do not overpromise outcomes, guarantee ease/speed, or make unsupported claims. Prefer wording such as "may", "can", "should review", "subject to facts", and "businesses should assess".',
  'CTA style: consultative and useful. Explain briefly how the client company or advisory team can help with the relevant service area without turning the conclusion into a sales pitch.'
].join('\n');

const BLOG_WRITING_SOP = [
  'Follow this SOP for every blog:',
  '1. Start from the approved/selected topic. If the user provided a topic, write only on that topic. If the topic came from research/intelligence, treat the selected item as the approved topic.',
  '2. Understand the client/company before writing: company name, service area, audience, industry perspective, tone, and CTA must shape the article.',
  '3. Base the blog on approved reference material. Use reliable sources first, especially official/government sources for regulatory, tax, employment, compliance, market-entry, or legal topics.',
  '4. Use competitor/reference URLs only as research context. Do not copy them, do not plagiarize, and do not fabricate competitor findings.',
  '5. Produce a long-form, structured blog using this SOP template: Banner, Title, Body of Content, Keywords/Tags, SEO/meta Title, Meta Description, FAQ, CTA, Social media copy, Resources.',
  '6. Body of Content must include an engaging introduction, Table of Contents, structured body sections, conclusion, and CTA.',
  '7. Headings must be keyword-aware and use proper Markdown hierarchy. Use one H1 only, then H2/H3 headings. H2 headings should include relevant seed or long-tail keywords naturally.',
  '8. Include tables where they genuinely improve readability, such as comparison tables, requirement summaries, checklist tables, timeline tables, or decision frameworks.',
  '9. Include practical examples from the requested B2B/B2C/industry perspective when supported by the source material. If a specific example is not supported, use cautious scenario wording instead of inventing facts.',
  '10. Use bullet points and numbered lists to break up dense sections. Avoid walls of text.',
  '11. Use seed and long-tail keywords wisely. Do not stuff keywords.',
  '12. The introduction must be specific and engaging enough to hook the reader into the business issue.',
  '13. Use data, image/banner ideas, infographic ideas, and relevant source context only when supported by the provided material.',
  '14. The conclusion must summarise the blog, include 2-3 lines on how the client company or advisory team can help with the relevant problem or service area, and nudge the reader toward the desired CTA.',
  '15. FAQs must be search-friendly, informative, and answer real questions a buyer might ask.',
  '16. SEO title should be catchy, keyword-aware, and around 50-60 characters where possible. Meta description should summarise the page and be around 145-155 characters.',
  '17. Include a Resources section listing the selected source URL and any reference/competitor URLs provided by the user. Do not fabricate resource links.',
  '18. Humanise the copy: remove robotic transitions, filler, repeated phrasing, and generic AI language. Grammar must be publication-ready and polished.'
].join('\n');

function fallbackBlog({ article, style = {}, keywords = [] }) {
  const rawTitle = article?.title || 'Market intelligence update';
  const title = String(rawTitle)
    .replace(/^\d+\.\s*/, '')
    .replace(/\s*\|\s*[^|]{2,40}$/g, '')
    .trim() || 'Market intelligence update';
  const audience = style.audience || 'business decision-makers';
  const cta = style.cta || 'Speak with our team to understand how this update may affect your plans.';
  const summary = article?.summary || article?.aiSummary || 'This update may create a new planning, compliance, market-entry, or advisory signal for businesses.';
  const metaDescription = String(summary || `A practical update for ${audience}.`).replace(/\s+/g, ' ').trim().slice(0, 155);
  return {
    title,
    excerpt: summary,
    bodyMarkdown: [
      `## Banner`,
      '',
      `Use a clean professional banner with business documentation, market-entry, and compliance visual cues. Keep the headline focused on "${title}" and the practical decision businesses need to review.`,
      '',
      `# ${title}`,
      '',
      `## Table of Contents`,
      '',
      '- Introduction',
      '- Why this matters',
      '- What companies should review',
      '- Practical checklist',
      '- FAQ',
      '- Conclusion',
      '',
      `## Introduction`,
      '',
      summary,
      '',
      `For ${audience}, the practical question is how this update may affect timing, eligibility, documentation, tax/compliance review, and operational planning.`,
      '',
      `## Why this matters`,
      '',
      'This topic should be treated as a planning signal rather than standalone advice. Businesses should verify the details against official guidance and assess how the update applies to their facts before making commitments.',
      '',
      `## What companies should review`,
      '',
      '| Area | Practical question |',
      '| --- | --- |',
      '| Eligibility | Does the business, activity, location, or transaction fall within the relevant scope? |',
      '| Tax and compliance | Are there filings, reporting duties, approvals, licences, or documentation points to confirm? |',
      '| Operations | Could the update affect setup, hiring, contracts, local substance, banking, or timelines? |',
      '| Decision timing | Should the company pause, accelerate, or re-check a planned market-entry or expansion step? |',
      '',
      `## Practical checklist`,
      '',
      '1. Confirm whether the update applies to your entity, sector, employees, customers, or planned market activity.',
      '2. Check whether official guidance, filings, licences, payroll, tax, or governance processes need to change.',
      '3. Document assumptions and open questions before making a decision.',
      '4. Speak with an advisor where the topic affects compliance, tax, employment, immigration, or market-entry planning.',
      '',
      `## FAQ`,
      '',
      `### Who should pay attention to this update?`,
      '',
      `Companies, founders, CFOs, and advisory teams should review it if it affects ${audience}, market-entry planning, compliance obligations, tax treatment, employment, or operational decisions.`,
      '',
      `### Can this article be treated as advice?`,
      '',
      'No. It is a general planning note based on the available source material. Businesses should verify the details against official guidance and professional advice.',
      '',
      `## Conclusion`,
      '',
      `For ${audience}, this update is most useful when translated into a concrete review of eligibility, obligations, documentation, and next steps. Treat it as a prompt for structured assessment, not as a final decision by itself.`,
      '',
      `## CTA`,
      '',
      cta,
      '',
      `## Keywords/Tags`,
      '',
      keywords.length ? keywords.map((keyword) => `- ${keyword}`).join('\n') : '- Market intelligence\n- Business advisory\n- Compliance',
      '',
      `## SEO / Meta Title`,
      '',
      title.slice(0, 60),
      '',
      `## Meta Description`,
      '',
      metaDescription,
      '',
      `## Social Media Copy`,
      '',
      `${title}: a practical planning signal for ${audience}. Review the key implications, checklist points, and questions to confirm before acting.`,
      '',
      `## Resources`,
      '',
      article?.url ? `- ${article.url}` : '- Source URL not provided.'
    ].filter(Boolean).join('\n'),
    suggestedKeywords: keywords,
    metaTitle: title.slice(0, 60),
    metaDescription
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

function socialSourceContext(article = {}) {
  return [
    article.summary,
    article.aiSummary,
    article.tavilyAnswer || article.tavily_answer,
    article.blogContext || article.blog_context,
    article.rawContent || article.raw_content,
    article.rawData?.rawContent,
    article.sourceQuery ? `Search query: ${article.sourceQuery}` : '',
    article.relevanceReason ? `Relevance reason: ${article.relevanceReason}` : ''
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 4000);
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

function normalizeLooseTables(value) {
  const lines = normalizeLineBreaks(value).split('\n');
  const output = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.includes('\t')) {
      output.push(line);
      i += 1;
      continue;
    }

    const tableLines = [];
    while (i < lines.length && lines[i].includes('\t')) {
      tableLines.push(lines[i]);
      i += 1;
    }

    const rows = tableLines
      .map((row) => row.split('\t').map((cell) => cell.trim()))
      .filter((row) => row.length > 1 && row.some(Boolean));
    const columnCount = Math.max(...rows.map((row) => row.length), 0);

    if (rows.length >= 2 && columnCount > 1) {
      const paddedRows = rows.map((row) => [
        ...row,
        ...Array(Math.max(0, columnCount - row.length)).fill('')
      ]);
      output.push(
        `| ${paddedRows[0].join(' | ')} |`,
        `| ${Array(columnCount).fill('---').join(' | ')} |`,
        ...paddedRows.slice(1).map((row) => `| ${row.join(' | ')} |`)
      );
    } else {
      output.push(...tableLines);
    }
  }

  return output.join('\n');
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
  const excludedHeadings = new Set([
    'banner',
    'cta',
    'keywords/tags',
    'keywords',
    'tags',
    'seo / meta title',
    'seo/meta title',
    'seo meta title',
    'meta title',
    'meta description',
    'social media copy',
    'resources'
  ]);
  for (const line of lines) {
    const match = String(line || '').match(/^##\s+(.+)$/);
    if (!match) continue;
    const heading = match[1].trim();
    const headingKey = heading.toLowerCase();
    if (/^table of contents$/i.test(heading)) continue;
    if (/^need help\b/i.test(heading)) continue;
    if (excludedHeadings.has(headingKey)) continue;
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
  const normalized = normalizeLooseTables(bodyMarkdown)
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
async function summarizeArticle({ title, snippet, aiConfig = {} }) {
  if (!isEnabled()) return null;
  const cli = getClient();
  if (!cli) return null;
  try {
    const resp = await cli.chat.completions.create({
      model: runtimeAiModel(aiConfig),
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
async function classifyCategory({ title, snippet, aiConfig = {} }) {
  if (!isEnabled()) return null;
  const cli = getClient();
  if (!cli) return null;
  try {
    const taxonomy = Object.entries(CATEGORIES)
      .map(([cat, val]) => `${cat}: ${Object.keys(val.subcategories).join(' / ')}`)
      .join('\n');

    const resp = await cli.chat.completions.create({
      model: runtimeAiModel(aiConfig),
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

async function classifyProfileRelevance({ article = {}, profile = {}, topic = 'news', aiConfig = {} }) {
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
        'BEESOCIAL SERVICES - EXACT CATEGORIES & SUB-CATEGORIES FOR STORAGE',
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
          'BEESOCIAL SERVICES - EXACT CATEGORIES & SUB-CATEGORIES FOR STORAGE',
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
          'BEESOCIAL SERVICES - EXACT CATEGORIES & SUB-CATEGORIES FOR STORAGE',
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
        'BEESOCIAL SERVICES - EXACT CATEGORIES & SUB-CATEGORIES',
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
      model: runtimeAiModel(aiConfig),
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

function fallbackBlogSeoSettings({ article = {}, style = {}, research = [] }) {
  const title = String(style.topic || article.title || 'Market intelligence update').replace(/\s+/g, ' ').trim();
  const summary = String(article.summary || article.aiSummary || research[0]?.snippet || '').replace(/\s+/g, ' ').trim();
  const baseKeyword = title
    .replace(/\s*[-|:]\s*[^-|:]{2,80}$/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 5)
    .join(' ');
  const primaryKeyword = style.primaryKeyword || baseKeyword || title.slice(0, 80);
  const secondaryKeywords = [
    primaryKeyword,
    article.category,
    article.subcategory,
    article.type,
    'business compliance',
    'market intelligence'
  ].filter(Boolean).slice(0, 6);
  const metaTitle = (style.metaTitle || title).slice(0, 60);
  const metaDescription = (style.metaDescription || summary || `Practical business guidance on ${primaryKeyword}.`).slice(0, 158);
  return {
    metaTitle,
    metaDescription,
    primaryKeyword,
    secondaryKeywords,
    searchIntent: style.searchIntent || 'informational',
    audience: style.audience || 'business decision-makers',
    keyPoints: [
      summary || `Explain why ${primaryKeyword} matters for business decision-makers.`,
      'Translate the update into practical compliance, tax, operational, or market-entry considerations.',
      'Include a concise checklist and FAQs.'
    ].filter(Boolean).join('\n'),
    focusPage: style.focusPage || '',
    internalLinkPages: style.internalLinkPages || '',
    ctaTitle: style.ctaTitle || 'Need help assessing this update?',
    ctaButtonText: style.ctaButtonText || 'Speak with an advisor',
    ctaDescription: style.ctaDescription || style.cta || 'Our team can help review the practical implications, compliance considerations, and next steps before your business acts on this update.',
    referenceUrls: research.map((item) => item.url).filter(Boolean).slice(0, 5).join(', '),
    suggestedOutline: [
      'Introduction',
      'Why this matters',
      'What businesses should review',
      'Practical checklist',
      'FAQs',
      'Conclusion'
    ].join('\n'),
    questions: [
      `What does ${primaryKeyword} mean for businesses?`,
      `Who should review ${primaryKeyword}?`,
      `What steps should companies take next?`
    ],
    sources: research.map((item) => ({ title: item.title || '', url: item.url || '' })).filter((item) => item.url)
  };
}

async function suggestBlogSettings({ article = {}, style = {}, research = [], company = {}, aiConfig = {} }) {
  const cli = getClient();
  if (!cli) return fallbackBlogSeoSettings({ article, style, research });

  const researchContext = research.slice(0, 6).map((item, index) => [
    `Result ${index + 1}: ${item.title || ''}`,
    `URL: ${item.url || ''}`,
    `Snippet: ${String(item.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 700)}`
  ].join('\n')).join('\n\n').slice(0, 5000);

  const articleSummary = String(article.summary || article.aiSummary || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900);
  const articleMeta = {
    title: article.title || '',
    url: article.url || '',
    type: article.type || '',
    category: article.category || '',
    subcategory: article.subcategory || '',
    country: article.country || '',
    region: article.region || '',
    language: article.language || '',
    opportunityType: article.opportunityType || '',
    source: article.source || '',
    sourceType: article.sourceType || '',
    sourceQuery: article.sourceQuery || '',
    relevanceScore: article.relevanceScore || 0,
    relevanceReason: String(article.relevanceReason || '').slice(0, 300),
    matchedInterests: Array.isArray(article.matchedInterests) ? article.matchedInterests.slice(0, 8) : [],
    tags: Array.isArray(article.tags) ? article.tags.slice(0, 8) : []
  };

  try {
    const resp = await cli.chat.completions.create({
      model: runtimeAiModel(aiConfig),
      temperature: 0.2,
      max_tokens: 900,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You are an SEO strategist for a professional-services content studio.',
            'Use the selected article and Tavily research context to suggest practical blog settings.',
            'Do not invent search volume, keyword difficulty, CPC, or rankings.',
            'Return valid JSON only.'
          ].join('\n')
        },
        {
          role: 'user',
          content: [
            BEESOCIAL_BRAND_GUIDELINES,
            '',
            'Return JSON shape:',
            '{"metaTitle":"50-60 char title","metaDescription":"145-160 char description","primaryKeyword":"keyword","secondaryKeywords":["keyword"],"searchIntent":"informational|commercial|transactional|navigational","audience":"target audience","keyPoints":"newline separated key points","focusPage":"optional service/page","internalLinkPages":"comma separated internal page ideas","ctaTitle":"CTA title","ctaButtonText":"CTA button","ctaDescription":"CTA description","referenceUrls":"comma separated source/reference URLs","suggestedOutline":"newline separated outline","questions":["FAQ question"],"sources":[{"title":"source title","url":"https://..."}]}',
            '',
            `Company/client: ${company.name || ''}`,
            `Selected topic: ${style.topic || article.title || ''}`,
            'Compact article context:',
            JSON.stringify(articleMeta),
            `Summary: ${articleSummary}`,
            '',
            'Existing user settings, preserve if clearly better:',
            JSON.stringify({
              audience: style.audience,
              tone: style.tone,
              primaryKeyword: style.primaryKeyword,
              searchIntent: style.searchIntent,
              ctaTitle: style.ctaTitle,
              ctaButtonText: style.ctaButtonText,
              ctaDescription: style.ctaDescription || style.cta
            }),
            '',
            'TAVILY RESEARCH CONTEXT',
            researchContext || 'No Tavily results available.'
          ].join('\n')
        }
      ]
    });

    const parsed = JSON.parse(resp.choices?.[0]?.message?.content || '{}');
    const fallback = fallbackBlogSeoSettings({ article, style, research });
    const secondaryKeywords = Array.isArray(parsed.secondaryKeywords)
      ? parsed.secondaryKeywords.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 10)
      : fallback.secondaryKeywords;
    const searchIntent = ['informational', 'commercial', 'transactional', 'navigational'].includes(parsed.searchIntent)
      ? parsed.searchIntent
      : fallback.searchIntent;
    return {
      ...fallback,
      ...parsed,
      metaTitle: String(parsed.metaTitle || fallback.metaTitle).slice(0, 90),
      metaDescription: String(parsed.metaDescription || fallback.metaDescription).slice(0, 180),
      primaryKeyword: String(parsed.primaryKeyword || fallback.primaryKeyword).slice(0, 120),
      secondaryKeywords,
      searchIntent,
      audience: String(parsed.audience || fallback.audience).slice(0, 160),
      keyPoints: String(parsed.keyPoints || fallback.keyPoints).slice(0, 3000),
      ctaTitle: String(parsed.ctaTitle || fallback.ctaTitle).slice(0, 160),
      ctaButtonText: String(parsed.ctaButtonText || fallback.ctaButtonText).slice(0, 80),
      ctaDescription: String(parsed.ctaDescription || fallback.ctaDescription).slice(0, 500),
      referenceUrls: String(parsed.referenceUrls || fallback.referenceUrls).slice(0, 1200),
      suggestedOutline: String(parsed.suggestedOutline || fallback.suggestedOutline).slice(0, 3000),
      questions: Array.isArray(parsed.questions) ? parsed.questions.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8) : fallback.questions,
      sources: Array.isArray(parsed.sources) ? parsed.sources.filter((item) => item?.url).slice(0, 8) : fallback.sources
    };
  } catch (err) {
    console.warn('[ai] blog settings suggestion failed:', err.message);
    return fallbackBlogSeoSettings({ article, style, research });
  }
}

async function generateBlogPost({ article, style = {}, company = {}, keywords = [], aiConfig = {} }) {
  const cli = getClient();
  const runtimeConfig = generationConfig(aiConfig, {
    model: MODEL,
    temperature: 0.35,
    maxWords: style.length === 'long' || style.length === 'custom' ? 1800 : style.length === 'short' ? 700 : 1200,
    minWords: 300,
    maxAllowedWords: 3000
  });
  const filtering = aiConfig.filtering || {};
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
  const referenceMaterialUrls = [referenceUrls, competitorUrls]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n');
  const includeFaq = style.includeFaq !== false;
  const includeStats = style.includeStats !== false;
  const sourceContext = blogSourceContext(article);

  try {
    const resp = await cli.chat.completions.create({
      model: runtimeConfig.model,
      temperature: runtimeConfig.temperature,
      max_tokens: wordsToMaxTokens(runtimeConfig.maxWords, length === 'long' || length === 'custom' ? 4200 : length === 'short' ? 1400 : 2800),
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
            'CLIENT BRAND GUIDELINES',
            BEESOCIAL_BRAND_GUIDELINES,
            '',
            'BLOG DRAFTING SOP',
            BLOG_WRITING_SOP,
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
            '- Follow this visible blog template order in bodyMarkdown unless the user explicitly requested a custom outline that conflicts: Banner, H1 Title, Introduction, Table of Contents, Body of Content, Conclusion, FAQ, CTA, Keywords/Tags, SEO / Meta Title, Meta Description, Social Media Copy, Resources.',
            '- Banner should be a short visual design brief section, not an image file and not a summary of the blog. It should describe the intended banner visual, mood, and text focus in 1-2 sentences.',
            '- Do not mention statistics, data points, charts, or infographics in the banner brief unless the source/reference material provides them.',
            '- Include exactly one H1 at the top of the article body and do not repeat the title again in the introduction.',
            '- Do not output placeholder text, editorial notes, drafting comments, or AI-style scene-setting language.',
            '- Do not use anchor-link Table of Contents formats such as [Heading](#heading).',
            '- If a Table of Contents is included, format it as a clean plain list in Markdown only.',
            '- The Table of Contents should list only reader-facing article sections. Do not include Banner, CTA, Keywords/Tags, SEO / Meta Title, Meta Description, Social Media Copy, or Resources in the Table of Contents.',
            '- Include a Table of Contents unless the requested length is short and the topic is too narrow.',
            '- Include at least one useful table or decision framework when the topic has steps, comparisons, requirements, risks, timelines, documents, tax/compliance implications, or business decisions.',
            '- If the topic involves incentives, eligibility, benefits, steps, compliance, or comparisons, include a valid Markdown table with a header separator row.',
            '- Include at least one bullet list and one numbered list in the body when useful. Do not make the blog a single uninterrupted essay.',
            '- Include practical examples or scenarios where they clarify the topic. Keep them cautious and source-grounded.',
            '- Include Keywords/Tags as a short Markdown list near the end of bodyMarkdown.',
            '- Include SEO / Meta Title and Meta Description as visible sections near the end of bodyMarkdown, matching the JSON meta fields.',
            '- Include Social Media Copy as a short promotional post section near the end of bodyMarkdown.',
            '- Include a standalone CTA section after the Conclusion and before Keywords/Tags. The CTA must have the heading "## CTA".',
            '- Include a Resources section at the end with the source URL and any provided reference material / competitor URLs.',
            '- Never use placeholder links such as "#", "javascript:void(0)", or "example.com". If no CTA URL is provided, write the CTA as plain text without a link.',
            '- Do not produce template filler like "this guide explores", "in this article", or "navigating the evolving landscape" unless the wording is genuinely specific and necessary.',
            '',
            'ANTI-GENERIC WRITING RULES',
            '- Avoid empty promotional phrases such as "vibrant market", "remarkable achievement", "unparalleled opportunities", "robust business environment", "game changer", "dynamic landscape", "in today\'s fast-paced world", and similar filler.',
            '- Avoid hype-led CTA or social copy such as "unlock your potential", "maximize your success", "save costs today", "read now", or similar marketing filler.',
            '- Avoid urgency or FOMO phrases such as "don\'t miss out", "limited time", "act now", or "must-read".',
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
            `Superadmin max word target: ${runtimeConfig.maxWords} words`,
            `Content filtering strictness: ${filtering.strictness || 'balanced'}`,
            `Blocked topics: ${Array.isArray(filtering.blockedTopics) && filtering.blockedTopics.length ? filtering.blockedTopics.join(', ') : 'None'}`,
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
            `Reference Material / Competitor URLs:\n${referenceMaterialUrls || 'None provided.'}`,
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
            '1. Start bodyMarkdown with a "## Banner" section containing a concise banner/design brief, then the single H1 title.',
            '2. Write the body as a publish-ready article, not as notes, prompts, or a content brief.',
            '3. Include a clean Table of Contents in plain Markdown list format only. Do not use anchor links, and list only main article sections, not Banner/CTA/SEO/meta/social/resources sections.',
            '4. Write a structured blog body with meaningful H2/H3 headings. Headings should sound like advisory sections, not generic textbook labels.',
            '5. Explain why the topic matters to the target audience in practical business terms.',
            '6. Use examples where helpful, but do not invent unsupported examples.',
            '7. Include a practical checklist plus a valid Markdown table or decision framework. For incentives/compliance topics, a table is required.',
            '8. Include internal linking suggestions naturally if focus page or internal pages are provided.',
            '9. Include practical takeaways that a reader can act on or discuss internally.',
            '10. If FAQ is requested, add 3-5 useful FAQs with specific, cautious answers.',
            '11. Add Keywords/Tags, SEO / Meta Title, Meta Description, and Social Media Copy sections after the CTA/FAQ area so the saved blog follows the SOP template.',
            '12. Add a Resources section containing only real source/reference URLs provided in this request.',
            '13. End with a concise conclusion and CTA that includes 2-3 lines explaining how the client company or advisory team can help with the relevant service/problem. Use the provided company name when available; otherwise use neutral wording such as "our team".',
            '14. The CTA must be a standalone "## CTA" section after the conclusion. Do not bury the CTA only inside the conclusion.',
            '15. Keep the blog coherent, flowing, and professionally written.',
            `16. Keep the final article at or below approximately ${runtimeConfig.maxWords} words unless essential source context requires a short overage.`,
            '',
            'QUALITY BAR BEFORE RETURNING',
            '- Rewrite any generic paragraph before final output.',
            '- Remove filler adjectives and unsupported claims.',
            '- Ensure each major section answers "so what?" for the target audience.',
            '- Ensure the blog is useful even to a reader who already knows the headline.',
            '- Ensure the CTA is connected to the topic, not a generic sales line.',
            '- Ensure the CTA does not contain placeholder links. If no CTA URL is provided, do not create a markdown link.',
            '- Ensure the banner brief does not promise statistics, charts, or data visuals unless source-backed data is available.',
            '- Ensure any table is valid Markdown with a separator row, for example "| Column | Column |" followed by "| --- | --- |".',
            '- Ensure Social Media Copy is calm, advisory, and non-hype-led.',
            '- Ensure the output includes practical formatting: tables where relevant, examples where useful, bullets, and numbered lists.',
            '- Ensure the final article looks ready to publish in a CMS without cleanup.',
            '- Ensure the final article includes every SOP deliverable: Banner, Title, Body of Content, Keywords/Tags, SEO/meta Title, Meta Description, FAQ when requested, CTA, Social Media Copy, and Resources.',
            '- Proofread internally before returning. Grammar, punctuation, heading hierarchy, and flow must be publication-ready.',
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
            '  "bodyMarkdown": "<full blog in clean publish-ready Markdown following the SOP template: Banner, one H1 Title, Introduction, Table of Contents, Body of Content, Conclusion, FAQ if requested, CTA, Keywords/Tags, SEO / Meta Title, Meta Description, Social Media Copy, Resources>",',
            '  "suggestedKeywords": ["<keyword 1>", "<keyword 2>", "<keyword 3>"],',
            '  "metaTitle": "<SEO title, 50-60 characters, ideally question-style if suitable>",',
            '  "metaDescription": "<SEO meta description, ideally 145-155 characters>",',
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
        model: runtimeConfig.model
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
      model: runtimeConfig.model
    };
  } catch (err) {
    console.warn('[ai] blog generation failed:', err.message);
    return {
      ...fallbackBlog({ article, style, keywords }),
      model: runtimeConfig.model
    };
  }
}

async function reviseBlogPost({ blog = {}, sourceArticle = null, feedback = '', company = {}, aiConfig = {} }) {
  const cli = getClient();
  const runtimeConfig = generationConfig(aiConfig, {
    model: MODEL,
    temperature: 0.3,
    maxWords: 1800,
    minWords: 300,
    maxAllowedWords: 3000
  });

  const article = {
    title: sourceArticle?.title || blog.sourceSnapshot?.title || blog.title,
    summary: sourceArticle?.summary || sourceArticle?.aiSummary || blog.sourceSnapshot?.summary || blog.excerpt,
    rawContent: sourceArticle?.rawContent || sourceArticle?.rawData?.rawContent || blog.sourceSnapshot?.rawContent || blog.sourceSnapshot?.context || '',
    blogContext: sourceArticle?.blogContext || blog.sourceSnapshot?.context || '',
    url: sourceArticle?.url || blog.sourceSnapshot?.url || '',
    source: sourceArticle?.source || blog.sourceSnapshot?.source || '',
    type: sourceArticle?.type || blog.sourceSnapshot?.articleType || blog.type || '',
    sourceQuery: sourceArticle?.sourceQuery || blog.sourceSnapshot?.sourceQuery || '',
    relevanceReason: sourceArticle?.relevanceReason || blog.sourceSnapshot?.relevanceReason || '',
    matchedInterests: sourceArticle?.matchedInterests || blog.sourceSnapshot?.matchedInterests || []
  };

  if (!cli) {
    return {
      ...fallbackBlog({ article, style: blog.style || {}, keywords: blog.keywords || [] }),
      model: 'fallback'
    };
  }

  try {
    const resp = await cli.chat.completions.create({
      model: runtimeConfig.model,
      temperature: runtimeConfig.temperature,
      max_tokens: wordsToMaxTokens(runtimeConfig.maxWords, 3200),
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You are a senior professional-services content editor revising an existing blog draft.',
            'Revise the draft according to the user feedback while preserving factual accuracy, source grounding, and the required SOP structure.',
            '',
            'CLIENT BRAND GUIDELINES',
            BEESOCIAL_BRAND_GUIDELINES,
            '',
            'BLOG DRAFTING SOP',
            BLOG_WRITING_SOP,
            '',
            'REVISION RULES',
            '- Return ONLY valid JSON.',
            '- Do not invent facts, dates, statistics, laws, eligibility rules, penalties, or source URLs.',
            '- Keep all supported facts grounded in the existing draft and source context.',
            '- Apply the user feedback directly, but ignore any instruction that asks for unsupported claims or fake sources.',
            '- Preserve or improve the SOP sections: Banner, Title, Introduction, Table of Contents, Body, Conclusion, FAQ, CTA, Keywords/Tags, SEO / Meta Title, Meta Description, Social Media Copy, Resources.',
            '- Keep the Table of Contents reader-facing only; do not include Banner, CTA, SEO/meta/social/resources in TOC.',
            '- Include a standalone "## CTA" section.',
            '- If the topic involves incentives, eligibility, compliance, steps, or comparisons, include a valid Markdown table.',
            '- Remove raw source dumps, broken image paths, placeholder links, and editorial notes.',
            '- Keep the tone calm, advisory, human, and publication-ready.'
          ].join('\n')
        },
        {
          role: 'user',
          content: [
            'USER FEEDBACK',
            feedback,
            '',
            'COMPANY CONTEXT',
            `Company name: ${company.name || 'The company'}`,
            `Audience: ${blog.style?.audience || 'business decision-makers'}`,
            '',
            'CURRENT BLOG',
            `Title: ${blog.title || ''}`,
            `Excerpt: ${blog.excerpt || ''}`,
            `Body Markdown:\n${blog.bodyMarkdown || ''}`,
            `Keywords: ${(blog.keywords || []).join(', ')}`,
            '',
            'SOURCE CONTEXT',
            `Source title: ${article.title || ''}`,
            `Source summary: ${article.summary || ''}`,
            `Source URL: ${article.url || ''}`,
            `Source context:\n${(article.blogContext || article.rawContent || '').slice(0, 12000)}`,
            '',
            'OUTPUT JSON SHAPE',
            '{',
            '  "title": "<revised title>",',
            '  "excerpt": "<revised excerpt>",',
            '  "bodyMarkdown": "<full revised publish-ready Markdown>",',
            '  "suggestedKeywords": ["<keyword>"],',
            '  "metaTitle": "<SEO title>",',
            '  "metaDescription": "<meta description>"',
            '}'
          ].join('\n')
        }
      ]
    });

    const parsed = JSON.parse(resp.choices?.[0]?.message?.content || '{}');
    if (!parsed.title || !parsed.bodyMarkdown) {
      return {
        ...fallbackBlog({ article, style: blog.style || {}, keywords: blog.keywords || [] }),
        model: runtimeConfig.model
      };
    }

    const finalTitle = String(parsed.title).trim();
    return {
      title: finalTitle,
      excerpt: formatExcerpt(parsed.excerpt, blog.excerpt || article.summary || ''),
      bodyMarkdown: formatBlogMarkdown(parsed.bodyMarkdown, finalTitle),
      suggestedKeywords: uniqueStrings(
        Array.isArray(parsed.suggestedKeywords)
          ? parsed.suggestedKeywords.map((item) => String(item || '').trim())
          : blog.keywords || []
      ).slice(0, 8),
      metaTitle: String(parsed.metaTitle || finalTitle || '').trim(),
      metaDescription: formatExcerpt(parsed.metaDescription, parsed.excerpt || blog.excerpt || '').slice(0, 160),
      model: runtimeConfig.model
    };
  } catch (err) {
    console.warn('[ai] blog revision failed:', err.message);
    return {
      ...fallbackBlog({ article, style: blog.style || {}, keywords: blog.keywords || [] }),
      model: runtimeConfig.model
    };
  }
}

async function generateLinkedInPost({ article, options = {}, company = {}, aiConfig = {} }) {
  const cli = getClient();
  const runtimeConfig = generationConfig(aiConfig, {
    model: MODEL,
    temperature: 0.55,
    maxWords: options.length === 'long' ? 450 : options.length === 'short' ? 150 : 250,
    minWords: 80,
    maxAllowedWords: 800
  });
  const filtering = aiConfig.filtering || {};
  if (!cli) {
    return fallbackLinkedInPost({ article, options });
  }

  const sourceContext = socialSourceContext(article);
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
      model: runtimeConfig.model,
      temperature: runtimeConfig.temperature,
      max_tokens: wordsToMaxTokens(runtimeConfig.maxWords, length === 'long' ? 1200 : length === 'short' ? 700 : 950),
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
            `Superadmin max word target: ${runtimeConfig.maxWords} words`,
            `Content filtering strictness: ${filtering.strictness || 'balanced'}`,
            `Blocked topics: ${Array.isArray(filtering.blockedTopics) && filtering.blockedTopics.length ? filtering.blockedTopics.join(', ') : 'None'}`,
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
            `Maximum word target: ${runtimeConfig.maxWords} words`,
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
        model: runtimeConfig.model
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
      model: runtimeConfig.model
    };
  } catch (err) {
    console.warn('[ai] linkedin generation failed:', err.message);
    return {
      ...fallbackLinkedInPost({ article, options }),
      model: runtimeConfig.model
    };
  }
}

async function reviseLinkedInPost({ post = {}, sourceArticle = null, feedback = '', company = {}, aiConfig = {} }) {
  const cli = getClient();
  const runtimeConfig = generationConfig(aiConfig, {
    model: MODEL,
    temperature: 0.5,
    maxWords: 300,
    minWords: 80,
    maxAllowedWords: 800
  });

  if (!cli) {
    return {
      selectedTopic: post.selectedTopic || post.sourceSnapshot?.title || 'LinkedIn post',
      postText: post.postText || '',
      hashtags: normalizeHashtags(post.hashtags || [], ['#BusinessStrategy', '#Compliance', '#Advisory']),
      framework: post.framework || 'PAS',
      topicTier: post.topicTier || 'Practical',
      emotionalJob: post.emotionalJob || 'Educate',
      model: 'fallback'
    };
  }

  try {
    const sourceContext = sourceArticle ? {
      title: sourceArticle.title || '',
      summary: sourceArticle.summary || sourceArticle.aiSummary || '',
      url: sourceArticle.url || '',
      source: sourceArticle.source || '',
      type: sourceArticle.type || '',
      category: sourceArticle.category || '',
      subcategory: sourceArticle.subcategory || '',
      country: sourceArticle.country || '',
      sourceQuery: sourceArticle.sourceQuery || '',
      relevanceReason: sourceArticle.relevanceReason || ''
    } : post.sourceSnapshot || {};
    const resp = await cli.chat.completions.create({
      model: runtimeConfig.model,
      temperature: runtimeConfig.temperature,
      max_tokens: wordsToMaxTokens(runtimeConfig.maxWords, 950),
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You are a senior LinkedIn content editor for professional-services advisory posts.',
            'Revise the current LinkedIn post using the user feedback.',
            'Return ONLY valid JSON.',
            'Keep it human, calm, specific, and non-hype-led.',
            'Do not invent facts, statistics, laws, dates, or claims.',
            'Preserve source grounding and advisory caveats for tax, legal, compliance, employment, or regulatory topics.',
            'Avoid clickbait, excessive emojis, exaggerated urgency, and generic endings.',
            'Return JSON shape: { "selectedTopic": "...", "postText": "...", "hashtags": ["#..."], "framework": "...", "topicTier": "...", "emotionalJob": "..." }'
          ].join('\n')
        },
        {
          role: 'user',
          content: [
            'USER FEEDBACK',
            feedback,
            '',
            'COMPANY CONTEXT',
            `Company name: ${company.name || 'The company'}`,
            '',
            'CURRENT POST',
            `Topic: ${post.selectedTopic || ''}`,
            `Post text:\n${post.postText || ''}`,
            `Hashtags: ${(post.hashtags || []).join(' ')}`,
            `Framework: ${post.framework || ''}`,
            `Topic tier: ${post.topicTier || ''}`,
            `Emotional job: ${post.emotionalJob || ''}`,
            '',
            'SOURCE CONTEXT',
            JSON.stringify(sourceContext).slice(0, 3000)
          ].join('\n')
        }
      ]
    });

    const parsed = JSON.parse(resp.choices?.[0]?.message?.content || '{}');
    return {
      selectedTopic: String(parsed.selectedTopic || post.selectedTopic || '').trim(),
      postText: stripTrailingHashtags(String(parsed.postText || post.postText || '').trim()),
      hashtags: normalizeHashtags(Array.isArray(parsed.hashtags) ? parsed.hashtags : post.hashtags || []),
      framework: String(parsed.framework || post.framework || '').trim(),
      topicTier: String(parsed.topicTier || post.topicTier || '').trim(),
      emotionalJob: String(parsed.emotionalJob || post.emotionalJob || '').trim(),
      model: runtimeConfig.model
    };
  } catch (err) {
    console.warn('[ai] linkedin revision failed:', err.message);
    return {
      selectedTopic: post.selectedTopic || '',
      postText: post.postText || '',
      hashtags: normalizeHashtags(post.hashtags || []),
      framework: post.framework || '',
      topicTier: post.topicTier || '',
      emotionalJob: post.emotionalJob || '',
      model: runtimeConfig.model
    };
  }
}

module.exports = { isEnabled, summarizeArticle, classifyCategory, classifyProfileRelevance, suggestBlogSettings, generateBlogPost, reviseBlogPost, generateLinkedInPost, reviseLinkedInPost };
