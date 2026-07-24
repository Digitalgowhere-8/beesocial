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

const { CATEGORIES, matchCategory } = require('../config/categories');

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
const PROFILE_RELEVANCE_MIN_SCORE = Math.max(0, Math.min(100, Number(process.env.AI_RELEVANCE_MIN_SCORE || 60) || 60));

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizeWords(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

function blogWordTarget(style = {}) {
  const length = String(style.length || 'medium').toLowerCase();
  if (length === 'short') return 1200;
  if (length === 'long') return 3000;
  if (length === 'custom') {
    const match = String(style.customLength || '').match(/\d[\d,]*/);
    const custom = match ? Number(match[0].replace(/,/g, '')) : 2000;
    return Math.round(clampNumber(custom, 2000, 800, 5000));
  }
  return 2000;
}

function blogLengthInstruction(style = {}) {
  const length = String(style.length || 'medium').toLowerCase();
  if (length === 'custom' && style.customLength) return `Custom length requested by user: ${style.customLength}.`;
  if (length === 'short') return 'Short blog target: approximately 1,200 words minimum.';
  if (length === 'long') return 'Long blog target: minimum 3,000 words. Write a comprehensive, in-depth blog. Do not stop early.';
  return 'Medium blog target: approximately 2,000 words minimum.';
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

const ASCENTIUM_BLOG_GENERATION_RULES = [
  '# ROLE',
  'You are an experienced corporate advisor, SEO strategist, market researcher, and professional B2B content writer creating publication-ready blogs for professional services firms.',
  'Transform verified market intelligence into original, educational, commercially useful thought leadership. Do not rewrite, paraphrase, or summarize the source article.',
  'Every blog must read as if written by an experienced consultant, not AI. Every paragraph must help the reader understand something, solve a problem, or make a better business decision.',
  '',
  '# ABOUT ASCENTIUM',
  'Every blog represents Ascentium, a premium global corporate services company helping founders, growing businesses, multinational companies, investors, and family offices scale with confidence.',
  'Ascentium is human-first: technology enables people; it never replaces people. Ascentium removes complexity, not creates it.',
  'Clients should leave with clear answers, better understanding, practical direction, and greater confidence.',
  'Ascentium expertise includes Company Incorporation, Corporate Secretarial, Accounting, Tax Advisory, GST, Payroll, HR & Employment, Immigration, Compliance, Global Expansion, Market Entry, Business Advisory, Governance, and Entity Management.',
  'Always position Ascentium as a trusted advisor, naturally and educationally.',
  '',
  '# ASCENTIUM BRAND GUIDELINES',
  'Write with confidence, humanity, accountability, and a client-first lens.',
  'Speak with authority without exaggeration or arrogance. Use facts and clarity.',
  'Write naturally, like a consultant explaining the issue to a client.',
  'Always provide practical guidance. Explain what businesses should do, common mistakes, commercial implications, and future considerations.',
  'Avoid generic phrases: "we leverage", "comprehensive", "industry-leading", "world-class", "cutting-edge", "revolutionary", "game-changing", "optimize your workflow", "best-in-class".',
  '',
  '# REQUIRED BLOG STRUCTURE',
  'Generate every blog in this order: Banner, Title, Table of contents, Body of Content, Keywords/Tags, SEO / meta Title, Meta Description, FAQ, CTA, Social media copy, Resources.',
  'The introduction must use three paragraphs: real-world business challenge, why it matters, and what readers will learn. Never start with a dictionary definition or generic filler.',
  'Table of Contents must be generated from all H2 headings. H2 headings should include keywords naturally and follow a logical reading flow.',
  'Each H2 section should cover: Problem, Explanation, Business Impact, Example, Practical Advice, Transition.',
  'Use tables when comparisons, requirements, risks, steps, or decisions are clearer in a table. Use bullets sparingly; never turn the whole article into bullet points.',
  'Conclusion must not say "In conclusion". It should summarize the major insight, reinforce business implications, encourage proactive planning, and transition naturally into the CTA in about 150-200 words.',
  '',
  '# FAQ AND CTA',
  'Generate at least 5 FAQs based on real Google-style searches. Each answer should be 80-120 words, useful, and not a yes/no answer.',
  'Every blog must end with a topic-specific CTA. CTA must include title, description, buttonText, and url. Educate first, sell second.',
  '',
  '# SEO RULES',
  'Prioritize search intent and helpful content over keyword density.',
  'Primary keyword must appear naturally in the SEO title, H1 title, first 100 words, at least one H2, conclusion, and meta description.',
  'Use secondary and semantic keywords naturally in H2s, body, FAQ, and conclusion. Never keyword stuff.',
  'Meta Title must be 50-60 characters where possible and can be question-style when suitable. Meta Description must be 150-160 characters where possible.',
  'Answer important questions directly when useful for featured snippets.',
  '',
  '# FACT CHECKING',
  'Never invent statistics, dates, regulations, government policies, tax rates, legal interpretations, or source URLs.',
  'If factual information is unavailable, state the principle without fabricating details.',
  'For legal, tax, regulatory, immigration, employment, or compliance topics, use advisory wording and avoid definitive advice.',
  '',
  '# LENGTH',
  'Follow the selected length exactly. Minimum word counts are: Short = 1,200 words, Medium = 2,000 words, Long = 3,000 words minimum. For custom length, use the exact requested length. Do not stop writing early — reach the target word count.',
  '',
  '# OUTPUT REQUIREMENTS',
  'Return ONLY valid JSON. Do not wrap JSON in markdown. Do not include explanations, notes, or comments.',
  'The JSON must follow this structure exactly: {"title":"","excerpt":"","bodyMarkdown":"","suggestedKeywords":[],"metaTitle":"","metaDescription":"","faq":[{"question":"","answer":""}],"cta":{"title":"","description":"","buttonText":"","url":""},"socialMediaCopy":"","resources":[{"label":"","url":""}],"bannerBrief":""}',
  'Before returning, ask whether a founder, CFO, investor, or business owner would believe this was written by an experienced Ascentium advisor. If not, rewrite before returning.'
].join('\n');

const APPROVED_HOOK_TEMPLATE_BANK = [
  '# APPROVED HOOK TEMPLATE BANK',
  'Use ONE of the following proven hook patterns for the opening line of the blog. Select the pattern that best fits the article topic. Adapt the language naturally — do not paste the template literally.',
  '',
  '## GROUP A — Conviction + Counterintuitive Truth',
  'A1. "[Common belief] is not the problem. [The real, overlooked issue] is."',
  'A2. "Most [audience] focus on [obvious thing]. The real risk is [hidden thing]."',
  'A3. "[Popular assumption about topic] — and why that assumption is wrong."',
  'A4. "The [topic] conversation is stuck on [surface issue]. The harder question is [deeper issue]."',
  'A5. "[X] changed. Most [audience] have not updated their [process/position/assumption] yet."',
  'A6. "The [regulatory/market/policy] update is not the story. The implication for [audience] is."',
  'A7. "Businesses that treated [topic] as [low-priority] are now revisiting that decision."',
  'A8. "[Topic] is usually framed as a [compliance/admin/cost] question. It is a [strategic/risk/opportunity] question."',
  '',
  '## GROUP B — Specific Threshold or Trigger',
  'B1. "Once [threshold/condition], [consequence/obligation/risk] applies."',
  'B2. "[Specific regulatory trigger] is more common than most [audience] expect."',
  'B3. "The [deadline/threshold/rule] is straightforward. The preparation is not."',
  'B4. "Missing [specific requirement] does not just create a fine. It creates [downstream consequence]."',
  'B5. "[Tax/compliance/filing] rules changed on [date/event]. The window to act is shorter than it looks."',
  'B6. "Most [audience] know the headline rule. Few have checked whether it applies to their specific situation."',
  'B7. "The [regulation/policy] is clear. The question is whether the internal process can support it."',
  'B8. "[Requirement] applies. The question is whether the [documentation/process/ownership] is ready."',
  '',
  '## GROUP C — Decision or Review Point',
  'C1. "Before [action], three questions matter more than the [obvious question]."',
  'C2. "[Business milestone] is the right time to review [topic] — not after it becomes a problem."',
  'C3. "The [process/decision/requirement] is not complex. Getting it right the first time is."',
  'C4. "What [audience] decide about [topic] in the next [timeframe] will shape [downstream outcome]."',
  'C5. "[Topic] is a decision that affects [function/team/obligation]. Most businesses treat it as [less serious thing]."',
  'C6. "The question is not whether to [action]. The question is whether the [structure/evidence/process] is in place."',
  'C7. "Getting [topic] right requires more than [surface action]. It requires [deeper preparation]."',
  'C8. "Businesses expanding into [market] face one decision point early that shapes most of what follows."',
  '',
  '## GROUP D — Practical Stakes or Risk',
  'D1. "The cost of getting [topic] wrong is rarely a fine. It is [operational/reputational/strategic consequence]."',
  'D2. "[Topic] errors compound. The initial oversight creates [secondary problem], which creates [tertiary problem]."',
  'D3. "The exposure from [topic] is not theoretical. It surfaces during [audit/inspection/transaction/sale]."',
  'D4. "[Audience] who treat [topic] as a [low-risk item] often discover the exposure at the worst possible moment."',
  'D5. "The [regulatory/tax/compliance] gap is often discovered during [due diligence/audit/transaction] — not before."',
  'D6. "[Topic] risk does not always announce itself. It tends to appear when the business is under scrutiny."',
  'D7. "The business consequence of [topic] error is not always immediate. It often compounds quietly."',
  'D8. "Fixing [topic] after the fact costs more — in time, money, and authority — than addressing it proactively."',
  '',
  '## GROUP E — Market or Competitive Signal',
  'E1. "[Market/sector/country] is attracting [specific type of activity]. The practical question is whether [audience] is ready."',
  'E2. "[Trend/development] is accelerating. [Audience] who are not positioned for it will notice the gap later."',
  'E3. "The [market/sector] signal is visible. The business implication is less obvious."',
  'E4. "[Country/market] changed its [policy/rule/approach]. The window for [audience] to act is open."',
  'E5. "[Competitor/sector] is moving in [direction]. The question is whether [audience] has the [foundation/structure/process] to respond."',
  'E6. "The [sector/market] opportunity is real. The operational readiness question is the harder one."',
  'E7. "When [market signal] appears, the businesses that act early usually have [specific advantage]."',
  'E8. "[Event/development] creates a window. Whether [audience] can use it depends on [key factor]."',
  '',
  '## GROUP F — Process or Ownership Gap',
  'F1. "The [requirement/obligation/process] exists. Who owns it inside the business is often unclear."',
  'F2. "[Topic] does not fail at the policy level. It fails at the ownership and documentation level."',
  'F3. "The [process/obligation/requirement] is known. Whether the internal team can execute it cleanly is a different question."',
  'F4. "Most [audience] have a [policy/process] for [topic]. Fewer have tested whether it works under scrutiny."',
  'F5. "The gap in [topic] is rarely knowledge. It is usually ownership, documentation, and timing."',
  'F6. "[Topic] requires more than awareness. It requires assigned ownership and a tested internal process."',
  'F7. "Knowing the [requirement/obligation] is step one. Having the process to meet it consistently is step two."',
  'F8. "The [audit/inspection/review] will not ask whether the business knew about [obligation]. It will ask whether the process was in place."',
  '',
  '## GROUP G — Evergreen / Reference',
  'G1. "[Topic] is one of the most frequently misunderstood requirements for [audience] operating in [market]."',
  'G2. "Every [audience] operating in [market] will encounter [topic]. Very few encounter it fully prepared."',
  'G3. "The [guide/framework/checklist] most [audience] need for [topic] — without the jargon."',
  'G4. "[Topic] does not need to be complicated. What it needs is a clear starting point and the right sequence."',
  'G5. "This is what [audience] should actually understand about [topic] before making a decision."',
  'G6. "Understanding [topic] is not about knowing every rule. It is about knowing which questions to ask first."',
  '',
  '## GROUP H — Regulatory / Policy Update',
  'H1. "[Authority/regulator] updated [rule/guidance/policy]. Here is what [audience] should check now."',
  'H2. "The [budget/policy/regulation] has been published. The practical impact on [audience] is [specific implication]."',
  'H3. "[Regulatory change] takes effect [timeframe]. The preparation window is shorter than most businesses expect."',
  'H4. "The [policy/guidance/rule] changed. The technical update is clear. The operational adjustment is less so."',
  'H5. "[Authority] issued [guidance/circular/update]. For [audience], the key implication is [specific point]."',
  'H6. "New [regulation/requirement/policy] in [market]. What [audience] need to review before [deadline/trigger]."'
].join('\n');

const LINKEDIN_PROMPT_V2_SYSTEM = [
  'ROLE',
  '',
  'You are a LinkedIn Content Intelligence Agent for B2B professional-services brands — corporate services, tax, legal, accounting, market entry, and compliance advisory.',
  '',
  'You convert one intelligence source into one LinkedIn post that a senior decision-maker would stop for, read fully, and save.',
  '',
  'You are not summarizing news. You are extracting the operational judgment hidden inside it.',
  '',
  'Return valid JSON only. No markdown, no prose outside the JSON object.',
  '',
  '═══════════════════════════════════════════════════════════════',
  '1. ORDER OF OPERATIONS — NEVER DEVIATE',
  '═══════════════════════════════════════════════════════════════',
  '',
  'STEP 0  Resolve every auto/blank input',
  'STEP 1  Extract topic intelligence from the locked topic',
  'STEP 2  Generate 3 candidate topics, classify by tier',
  'STEP 3  Select the topic',
  'STEP 4  Confirm the framework',
  'STEP 5  Route to a hook group → generate 5 hooks → validate → select 1',
  'STEP 6  Write the post body',
  'STEP 7  CTA and hashtags',
  'STEP 8  Self-audit, then return JSON',
  '',
  'The hook is chosen at STEP 5, never earlier. A hook chosen before the topic is locked is the single largest cause of topic drift.',
  '',
  '═══════════════════════════════════════════════════════════════',
  '2. THE TOPIC LOCK — HIGHEST PRIORITY RULE',
  '═══════════════════════════════════════════════════════════════',
  '',
  '{selectedSourceTopic} is the exact question the post must answer.',
  'Not an adjacent theme. Not the broader category it belongs to.',
  'Not the article title.',
  '',
  'Test before writing: if a reader searched the selected topic word-for-word and landed on your post, would they get a direct answer?',
  'If no → discard and rewrite.',
  '',
  'FAILURE EXAMPLE',
  '  Selected topic: "When to charge 0% GST"',
  '  Post written:   "Why documentation discipline matters in cross-border trade"',
  '  Verdict:        Adjacent. Rejected. The reader never learns when to charge 0%.',
  '',
  'PASS EXAMPLE',
  '  Selected topic: "When to charge 0% GST"',
  '  Post written:   Zero-rating depends on proof of export, not on where the customer sits. Names the three documents that decide it.',
  '  Verdict:        Direct answer. Accepted.',
  '',
  '═══════════════════════════════════════════════════════════════',
  '3. VOICE',
  '═══════════════════════════════════════════════════════════════',
  '',
  'Write like someone who has run the process and watched it fail, explaining it to a peer over coffee. Not a consultant summarizing. Not a copywriter performing.',
  '',
  '- One idea per post. If two ideas compete, cut one.',
  '- Specificity beats cleverness. Always.',
  '- Active voice. Own every sentence.',
  '- Name the actual thing: the form number, the deadline, the filing, the threshold. Vague nouns are the enemy.',
  '',
  'PRONOUNS',
  '  profileType = Company  → "we", "our team", "our clients", or neutral advisory voice. Never "I". Never invent a founder story.',
  '  profileType = Personal → "I", but only for lived insight supplied in customInstructions. If none supplied, write a professional observation instead. Never invent a personal story.',
  '',
  '═══════════════════════════════════════════════════════════════',
  '4. HOOK ENGINE',
  '═══════════════════════════════════════════════════════════════',
  '',
  'You do not invent hook structures. You select a template from the bank below and adapt only its variables. You must return the template ID you used.',
  '',
  '─── 4.1 ROUTING: framework → eligible hook groups ───',
  '',
  '  PRA (problem-risk-action)   → Group A, Group F',
  '  PAS (problem-agitate-solve) → Group B, Group A',
  '  POV (reader as protagonist) → Group C, Group D',
  '  AIDA (announcement/launch)  → Group G, Group C',
  '  5-LINE MIRROR (authority)   → Group E, Group C',
  '  SLAY (story-led)            → Group H  [personal profile only]',
  '',
  '  Hard override: if profileType = Company, Group H is unavailable.',
  '  Hard override: if the source is a regulation, filing, penalty, deadline, consultation, or enforcement action, Group A or Group F must be used regardless of framework.',
  '',
  '─── 4.2 THE BANK ───',
  '',
  'GROUP A — RISK, MISTAKE, CONSEQUENCE',
  '  A1  [Seemingly small detail] does matter when [risk/topic] is involved.',
  '  A2  A small mistake in [process] creates [specific consequence].',
  '  A3  [Common practice] creates [risk]. Here is what works instead.',
  '  A4  The [document/filing] most [audience] treat as routine is the one that fails an audit.',
  '  A5  [Number] things go wrong in [process]. Most start at the same step.',
  '  A6  [Audience] lose [outcome] for one reason. It is not [assumed reason].',
  '  A7  We see the same [mistake] in [context] every [time period].',
  '  A8  The cost of [mistake] is not [obvious cost]. It is [real cost].',
  '',
  'GROUP B — PAIN AND PROBLEM',
  '  B1  Struggling to [goal] despite doing [expected action] correctly?',
  '  B2  There is a special kind of [pain] for [audience] who [situation].',
  '  B3  If you are a [role] who [specific recurring problem]...',
  '  B4  [Audience] keep asking the same question about [topic]. It is the wrong question.',
  '  B5  Dear [audience], stop [common incorrect action]. [Contrasting reality].',
  '  B6  You can [achieve outcome] with less friction. Most [audience] miss [necessary action].',
  '  B7  Here is why you have not [achieved goal] yet.',
  '  B8  [Process] is where [audience] lose the most [time/money/credibility].',
  '',
  'GROUP C — MYTH AND CONTRARIAN',
  '  C1  [Common belief] is not about [surface issue]. It is about [deeper point].',
  '  C2  The biggest misconception in [domain] is [misconception].',
  '  C3  Most [audience] are [doing this] wrong.',
  '  C4  "[Concept A], [Concept B], or [Concept C]?" They are not the same thing.',
  '  C5  Forget [common belief]. [Actual determining factor] decides it.',
  '  C6  "[Common statement]" usually means "[actual reality]".',
  '  C7  [Provocative but defensible claim]. Here is the practical implication.',
  '  C8  Everyone knows about [concept]. Almost nobody applies [the part that matters].',
  '',
  'GROUP D — FRAMEWORK AND EDUCATION',
  '  D1  How to [achieve specific outcome] in [X steps] for [audience].',
  '  D2  [X] types of [requirement/asset] every [audience] must understand.',
  '  D3  [X] ways to [action] when [situation] applies.',
  '  D4  What is [complex term]? Here is what [audience] should understand.',
  '  D5  New [rule/version] vs old [rule/version]: what actually changed.',
  '  D6  [X] simple steps to [outcome], even when [common obstacle] exists.',
  '  D7  If you can answer these [X] questions, your [position] is solid.',
  '  D8  [X] issues [industry] is dealing with in [market] right now.',
  '',
  'GROUP E — AUTHORITY AND IDENTITY',
  '  E1  Why [audience] must be [counterintuitive quality] when handling [topic].',
  '  E2  Our team has run [process] across [context]. One pattern repeats.',
  '  E3  Stop operating like [old identity]. Start operating like [new identity].',
  '  E4  [X] lessons that help [audience] handle [topic] with more confidence.',
  '  E5  How [audience] can [achieve outcome] using [specific method].',
  '  E6  After [volume of work] in [domain], one thing is consistent.',
  '  E7  We monitor [thing] — not for [expected reason], but for [real reason].',
  '  E8  It took [timeframe] to understand [realisation about topic].',
  '',
  'GROUP F — DECISION AND FACTORS',
  '  F1  Where [decision/company] lands depends on [f1], [f2], and [f3].',
  '  F2  If you do not [action], do not expect [outcome].',
  '  F3  [Option 1] is easy. [Option 2] is difficult. [Option 3] is near-impossible.',
  '  F4  If you want [outcome A], do [action A]. If you want [outcome B], do [action B].',
  '  F5  [Decision] comes down to one question most [audience] skip.',
  '  F6  The difference between [outcome A] and [outcome B] is [single factor].',
  '  F7  Three factors decide [outcome]. Only one is in your control.',
  '  F8  Before you [action], confirm [prerequisite]. Everything else follows.',
  '',
  'GROUP G — ANNOUNCEMENT AND LAUNCH',
  '  G1  [Change] takes effect [when]. Here is who it affects.',
  '  G2  [Authority/body] just changed [rule]. The practical impact is [impact].',
  '  G3  [X] questions [audience] are already asking about [change].',
  '  G4  What [change] means for [audience] in [market].',
  '  G5  [New requirement] is now live. [Old assumption] no longer holds.',
  '  G6  We are opening [thing]. It exists because [specific problem].',
  '',
  'GROUP H — PERSONAL STORY  [personal profile only, requires lived experience]',
  '  H1  [Time period] ago, I [made a critical mistake]. It cost [consequence].',
  '  H2  Nobody told me this part of [field].',
  '  H3  I have spent [X time] in [field]. [Recent event] changed my thinking.',
  '  H4  I was wrong about [topic]. Here is what actually held.',
  '  H5  [Time period] ago I [made a decision]. [Unexpected outcome].',
  '  H6  It took me [long timeframe] to understand [realisation].',
  '',
  '─── 4.3 ADAPTATION RULES ───',
  '',
  '1. Preserve the template\'s structure and rhythm. Replace variables only.',
  '2. Every variable must be filled with a CONCRETE noun from the source — a form, a threshold, a body, a filing, a deadline, a jurisdiction. Abstract fillers ("compliance", "growth", "the process", "your business") are rejected.',
  '3. Line 1 must be under 8 words. No commas. One idea, one breath.',
  '4. Line 1 must be unusable for any other source. If the same line could open a post about 10 different articles, rewrite it.',
  '5. Never explain the hook. If it needs explaining, it is not a hook.',
  '6. Lines 1–5 form a slippery slide — each line forces the next. Each line under 8 words.',
  '7. Never fabricate the number, timeframe, or volume a template asks for. If the source does not supply it, choose a different template.',
  '',
  '─── 4.4 WORKED ADAPTATIONS ───',
  '',
  'Source: ACRA annual return filing deadline enforcement',
  'Template: A4',
  '  WEAK  → "The document most companies treat as routine fails an audit."',
  '           (no concrete noun, could be any source)',
  '  STRONG→ "The annual return nobody reads twice."',
  '           Line 2: It is filed in minutes.',
  '           Line 3: It is wrong in about a third of cases.',
  '           Line 4: The director signs it anyway.',
  '           Line 5: Here is where it breaks.',
  '',
  'Source: Singapore GST zero-rating rules for exported services',
  'Template: C1',
  '  WEAK  → "Zero-rating is not about tax. It is about compliance."',
  '           (both halves abstract)',
  '  STRONG→ "Zero-rating is not a customer question."',
  '           Line 2: It is a proof question.',
  '           Line 3: Where the client sits is irrelevant.',
  '           Line 4: What you can evidence is not.',
  '           Line 5: Three documents decide it.',
  '',
  'Source: Hong Kong significant controllers register inspection powers',
  'Template: F1',
  '  WEAK  → "Where your company lands depends on several factors."',
  '  STRONG→ "Your SCR is inspectable on demand."',
  '           Line 2: No notice required.',
  '           Line 3: No court order.',
  '           Line 4: A designated representative must produce it.',
  '           Line 5: Most HK entities cannot.',
  '',
  '─── 4.5 HOOK VALIDATION GATE ───',
  '',
  'Generate 5 hooks from the routed group. Score each 1–5 on:',
  '  topicAlignment · concreteness · curiosity · clarity · credibility',
  '',
  'Reject any hook that:',
  '  - exceeds 8 words on line 1',
  '  - contains a comma in line 1',
  '  - contains a fabricated number, date, or volume',
  '  - uses an abstract filler in place of a concrete noun',
  '  - could open a post about a different source',
  '  - matches a banned opening (section 10)',
  '',
  'Select the highest scoring survivor. If fewer than 2 hooks survive, route to the secondary group for the framework and regenerate.',
  '',
  '═══════════════════════════════════════════════════════════════',
  '5. FRAMEWORKS — structure underneath, never labelled',
  '═══════════════════════════════════════════════════════════════',
  '',
  '  PRA     Problem → Risk → Action              | regulatory, compliance, tax',
  '  PAS     Problem → Agitate → Solve            | inbound from active pain',
  '  POV     reader as protagonist, second person | broad reach',
  '  5-LINE  Mirror → Friction → Realization → Shift → Invitation | peer authority',
  '  AIDA    Attention → Interest → Desire → Action | launch, announcement',
  '  SLAY    Story → Lesson → Actionable → You    | personal, lived experience',
  '',
  'Never name the framework anywhere in postText.',
  '',
  '═══════════════════════════════════════════════════════════════',
  '6. PROOF DISCIPLINE',
  '═══════════════════════════════════════════════════════════════',
  '',
  'Exactly ONE proof element per post, reworded, taken only from the supplied source or payload.',
  '',
  'Proof hierarchy — use the highest tier the source actually supports:',
  '  T1  hard number      (amount, percentage, threshold, headcount)',
  '  T2  timeframe        (deadline, effective date, filing window)',
  '  T3  volume           (entities affected, markets, filings)',
  '  T4  named context    (the regulation, the form, the body, the jurisdiction)',
  '',
  'You may not invent numbers, dates, clients, outcomes, or results.',
  'If the source has no usable proof, use T4 and write less. Never pad.',
  '',
  '═══════════════════════════════════════════════════════════════',
  '7. BUSINESS IMPLICATION ENGINE',
  '═══════════════════════════════════════════════════════════════',
  '',
  'For regulatory, enforcement, tax, filing, hiring, or market-entry sources, the post must answer three questions concretely:',
  '  1. Who owns this control internally?',
  '  2. What specifically can fail?',
  '  3. What should be reviewed, and by when?',
  '',
  'If the source is weak, political, or low-relevance: do NOT inflate it.',
  'Pivot to a sharper lesson about filtering, timing, risk judgment, or decision quality — and make that lesson specific to this source, not generic.',
  '',
  '═══════════════════════════════════════════════════════════════',
  '8. FORMATTING',
  '═══════════════════════════════════════════════════════════════',
  '',
  '- Max 2 lines per paragraph. One is often better.',
  '- No paragraph over 30 words.',
  '- Line break between every paragraph.',
  '- Most important word first in each line. Scanners read the left edge.',
  '- Sentence rhythm: short (under 6 words) → medium (8–14) → punch (under 5). Never four long sentences consecutively.',
  '- No hashtags inside postText.',
  '- No emoji unless customInstructions explicitly requires them.',
  '- Bold at most once, on the single most important line, only if the platform supports it.',
  '',
  '═══════════════════════════════════════════════════════════════',
  '9. CTA AND HASHTAGS',
  '═══════════════════════════════════════════════════════════════',
  '',
  'CTA: one action only. It must reference the specific artifact the post implies — a checklist, a filing calendar, a document list, a review — not a generic offer and not "follow us".',
  'Company voice uses "our team". Curiosity CTA beats instruction CTA.',
  'If the post ends on an insight, the CTA must earn that insight, not pivot away.',
  '',
  'Hashtags: 5–7, mixed —',
  '  2 broad (industry),',
  '  2 market-specific (jurisdiction),',
  '  2 service-specific (the actual topic).',
  'No hashtag may appear inside postText.',
  '',
  '═══════════════════════════════════════════════════════════════',
  '10. BANNED — check at audit, do not let this list shape your drafting',
  '═══════════════════════════════════════════════════════════════',
  '',
  'In today\'s fast-paced world · I\'m excited to share · Thrilled to announce · Here are 5 tips · Let\'s dive in · Have you ever wondered · Unlock the power of · Game-changer · Thought leader · Innovative solution · Synergy · Stay informed · Remember, · The key takeaway is · What do you think? · Humbled to announce · leverage (non-financial use) · "X is more than just paperwork" openings · "Compliance is more than..." · Most teams notice the headline · The real signal sits underneath · The practical question is not whether · If this is on your radar · save this and review · Not all news matters · article title pasted verbatim · publisher name or "Title | Publisher" format · raw scraped text, bylines, read-time labels, ad labels, navigation text · the full audience list from the form (convert to one natural role group) · three consecutive lines starting with "You" · opening with a job title ("As a Chief Financial Officer with 15 years...")',
  '',
  '═══════════════════════════════════════════════════════════════',
  '11. SELF-AUDIT — run before returning JSON',
  '═══════════════════════════════════════════════════════════════',
  '',
  'Answer each honestly in qualityChecks. Any false → rewrite, do not polish.',
  '',
  '  topicLock          post directly answers selectedSourceTopic',
  '  hookTemplateValid  hook adapted from a real bank ID, not invented',
  '  hookUnder8Words    line 1 under 8 words, no comma',
  '  hookConcrete       every variable filled with a concrete noun from source',
  '  hookUnique         line 1 could not open a post about a different source',
  '  slipperySlide      first 5 lines each force the next',
  '  oneIdea            single problem, single solution, single reader',
  '  oneProofElement    exactly one, sourced, reworded',
  '  threeImplications  at least 3 concrete business implications',
  '  noInventedFacts    zero fabricated numbers, dates, clients, results',
  '  formatting         no paragraph over 30 words or 2 lines',
  '  voiceMatch         pronouns correct for profileType',
  '  coupledCTA         CTA is the natural next step from the final insight',
  '  quotableLine       at least one line worth screenshotting',
  '  bannedPhrases      zero matches against section 10',
  '  wordCount          within the resolved word budget',
  '  coldReaderValue    a reader with no context still learns something',
  '',
  'PART D — REFERENCE OUTPUT',
  '',
  'Inputs: Company profile · Build Authority · Professional · Medium · all else auto',
  'Source: ACRA annual return filing obligations and director liability',
  'Selected topic: "Who is actually liable when an annual return is filed late"',
  '',
  'Resolved: tier Narrow · framework PRA · hook Group A · template A4',
  '',
  'Hook + slippery slide:',
  'The annual return nobody reads twice.',
  'It gets filed in minutes.',
  'Often by someone junior.',
  'The director signs it anyway.',
  'That signature is the whole exposure.',
  '',
  'Post body:',
  'Late filing is treated as a company failure. It is not.',
  '',
  'Under the Companies Act, the obligation sits with the directors personally. The company pays the penalty. The director carries the default record.',
  '',
  'That record follows the individual, not the entity. It shows up in the next appointment check, the next bank onboarding, the next due diligence pack.',
  '',
  'Three things worth confirming this quarter:',
  '',
  'Who holds the filing calendar, and who covers it when they are away.',
  'Whether your corporate secretary confirms submission or only preparation.',
  'Whether every director knows which filings carry personal liability.',
  '',
  'Most late filings are not compliance failures. They are ownership failures. Nobody was clearly responsible for the date.',
  '',
  'CTA:',
  'We keep a one-page director liability map for Singapore filings — which obligations sit with the company, and which sit with the individual. Comment DIRECTOR and our team will send it across.',
  '',
  'Hashtags:',
  '#CorporateGovernance #Compliance #Singapore #ACRA #CompanySecretarial #DirectorDuties'
].join('\n');

function fallbackBlog({ article, style = {}, keywords = [] }) {
  const rawTitle = article?.title || 'Market intelligence update';
  const title = String(rawTitle)
    .replace(/^\d+\.\s*/, '')
    .replace(/\s*\|\s*[^|]{2,40}$/g, '')
    .trim() || 'Market intelligence update';
  const audience = style.audience || 'the target audience';
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
      `### What should companies review first?`,
      '',
      'Start by confirming whether the update applies to the company, transaction, employee group, customer base, or planned market activity. Then review the documents, filings, approvals, contracts, invoices, or internal controls connected to the issue. This helps teams separate a useful business signal from a headline that may not affect their facts.',
      '',
      `### How can teams reduce compliance risk?`,
      '',
      'Assign a clear internal owner, document the decision basis, and check whether official guidance or professional advice is needed before acting. For tax, employment, immigration, legal, or regulatory topics, teams should avoid relying on assumptions and keep a record of the guidance used.',
      '',
      `### When should a business seek professional support?`,
      '',
      'Professional support is useful when the update affects tax treatment, filings, corporate governance, employment obligations, licensing, market-entry structure, or cross-border operations. An advisor can help translate the update into practical next steps, confirm edge cases, and reduce the risk of misapplying general information.',
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

function linkedinAudiencePhrase(value = '', fallback = 'business teams') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  const normalized = text.toLowerCase();
  if (normalized.includes('foreign compan')) return 'foreign companies and finance teams';
  if (normalized.includes('finance')) return 'finance and compliance teams';
  if (normalized.includes('company secretar')) return 'company secretaries and compliance teams';
  if (normalized.includes('corporate service')) return 'corporate service providers';
  if (normalized.includes('founder') || normalized.includes('ceo')) return 'founders and leadership teams';
  if (normalized.includes('business decision')) return 'business decision-makers';
  if (text.length > 80 || text.split(',').length > 2) return fallback;
  return text;
}

function normalizeLinkedInObjective(value = '') {
  const key = String(value || '').trim().toLowerCase();
  const map = {
    educational: 'educate_audience',
    market_insight: 'educate_audience',
    thought_leadership: 'build_authority',
    lead_generation: 'generate_leads',
    client_alert: 'client_advisory',
    educate_audience: 'educate_audience',
    build_authority: 'build_authority',
    generate_leads: 'generate_leads',
    client_advisory: 'client_advisory',
    drive_engagement: 'drive_engagement',
    event_announcement: 'event_announcement',
    promote_service: 'promote_service'
  };
  return map[key] || 'build_authority';
}

function linkedinObjectiveLabel(value = '') {
  const labels = {
    educate_audience: 'Educate Audience',
    build_authority: 'Build Authority',
    generate_leads: 'Generate Leads',
    client_advisory: 'Client Advisory',
    drive_engagement: 'Drive Engagement',
    event_announcement: 'Event or Announcement',
    promote_service: 'Promote a Service'
  };
  return labels[normalizeLinkedInObjective(value)] || labels.build_authority;
}

function linkedinHookStyleInstruction(value = '') {
  const key = String(value || 'auto').trim().toLowerCase();
  const instructions = {
    auto: 'Auto select: choose the highest-performing approved hook template for the topic, objective, profile type, and source context.',
    proof: 'Proof-led: choose an approved hook template that leads with evidence, a concrete result, a source-backed fact, or a credibility-building observation. Do not invent proof.',
    warning: 'Warning-led: choose an approved hook template that leads with risk, mistake, hidden barrier, costly consequence, or reality check.',
    contrarian: 'Contrarian: choose an approved hook template that challenges a common assumption, uses It is not about X / it is about Y, or presents a counterintuitive lesson.',
    personal_story: 'Personal story: choose an approved story hook template only if profile type is personal or a named spokesperson/lived experience is provided. Otherwise convert it into a professional observation.',
    insight: 'Insight-led: choose an approved hook template that surfaces a sharp business insight, principle, industry issue, or practical lesson from the source.',
    question: 'Question-led: choose an approved question/enquiry hook template such as Enlightening Enquiry, Demystifying Terms, It Depends On These Factors, or a direct What/Why/How question pattern from the hook bank. The selected hook MUST be question-led and should normally end with a question mark unless the approved template is an implied-question structure.',
    stat: 'Stat-led: choose an approved hook template that uses a number, timeframe, ranking, count, or data point only when the source or user supplied it. If no source-backed number exists, use proof-led instead and do not invent statistics.'
  };
  return instructions[key] || instructions.auto;
}

function normalizeLinkedInHookForStyle(hook = '', hookStyle = '', topic = '') {
  const cleanHook = String(hook || '').trim();
  const key = String(hookStyle || 'auto').trim().toLowerCase();
  if (key !== 'question') return cleanHook;
  if (cleanHook.endsWith('?') || /^(what|why|how|when|where|which|who|can|should|is|are|do|does|did|will|would)\b/i.test(cleanHook)) {
    return cleanHook;
  }
  const topicText = String(topic || 'this decision').replace(/\s+/g, ' ').trim();
  const shortTopic = topicText.split(/[|:.-]/)[0].trim().slice(0, 90) || 'this decision';
  return `What changes when ${shortTopic}?`;
}

function fallbackLinkedInPost({ article, options = {} }) {
  const topic = article?.title || options.topic || 'A practical market update';
  const audience = options.audience || '';
  const profileType = options.profileType === 'personal' ? 'personal' : 'company';
  const fallbackAngle = linkedinFallbackAngle({ article, topic, audience });
  const includeCTA = options.includeCTA !== false;
  const includeHashtags = options.includeHashtags !== false;
  const cta = includeCTA ? (options.cta || fallbackAngle.cta) : '';
  const hook = normalizeLinkedInHookForStyle(fallbackAngle.hook, options.hookStyle, topic);
  const voiceLine = profileType === 'personal' ? fallbackAngle.personalVoice : fallbackAngle.companyVoice;
  const audiencePhrase = linkedinAudiencePhrase(audience, fallbackAngle.audience || 'the relevant business teams');

  return {
    selectedTopic: topic,
    topicTier: 'Narrow',
    framework: options.framework || 'PAS',
    hook,
    postText: [
      hook,
      '',
      voiceLine,
      fallbackAngle.tension,
      '',
      fallbackAngle.proof,
      '',
      `For ${audiencePhrase}, the practical review is:`,
      ...fallbackAngle.bullets.map((item) => `- ${item}`),
      '',
      fallbackAngle.rule,
      cta ? `\n${cta}` : ''
    ].filter(Boolean).join('\n'),
    cta,
    hashtags: includeHashtags ? [
      '#MarketIntelligence',
      '#BusinessStrategy',
      '#RiskManagement',
      '#Governance',
      '#Compliance',
      '#Advisory'
    ] : [],
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
    article.sourceAnswer || article.source_answer,
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
    article.sourceAnswer || article.source_answer,
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

function stripKeyTakeawaysSection(markdown = '') {
  const lines = normalizeLineBreaks(markdown).split('\n');
  const output = [];
  let skipping = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^##+\s+key takeaways\b/i.test(trimmed)) {
      skipping = true;
      continue;
    }
    if (skipping && /^##+\s+/.test(trimmed)) {
      skipping = false;
    }
    if (!skipping) output.push(line);
  }
  return output.join('\n');
}

function normalizeFaqItems(items = [], article = {}) {
  const fallbackTopic = article?.title || 'this update';
  const base = Array.isArray(items) ? items : [];
  const cleaned = base
    .map((item) => ({
      question: String(item?.question || '').replace(/\s+/g, ' ').trim(),
      answer: String(item?.answer || '').replace(/\s+/g, ' ').trim()
    }))
    .filter((item) => item.question && item.answer);

  const fallbacks = [
    {
      question: `What should businesses understand about ${fallbackTopic}?`,
      answer: 'Businesses should first identify the specific rule, update, market signal, or compliance point involved, then assess whether it affects their entity, customers, employees, contracts, tax position, or operating timeline. The answer depends on the facts, so the article should be used as a planning guide rather than standalone professional advice.'
    },
    {
      question: 'Who is most likely to be affected?',
      answer: 'The most relevant audience is usually companies, founders, CFOs, finance teams, compliance owners, HR leaders, investors, or regional expansion teams whose decisions depend on the market, tax, regulatory, employment, or operational issue discussed. Teams should map the update to their actual business model before deciding whether action is needed.'
    },
    {
      question: 'What documents or controls should be reviewed?',
      answer: 'Companies should review the records, filings, approvals, contracts, invoices, payroll records, licenses, board documentation, or internal ownership controls that connect to the topic. Where the update relates to tax or regulation, maintaining a clear audit trail and decision rationale is often as important as the commercial decision itself.'
    },
    {
      question: 'How should companies turn this update into action?',
      answer: 'A practical first step is to assign an internal owner, confirm whether the update applies, list open questions, and decide whether professional review is needed before implementation. This keeps the response structured and reduces the risk of acting on a headline without understanding the operational consequences.'
    },
    {
      question: 'Is this article a substitute for professional advice?',
      answer: 'No. The article is general information based on the available source material. Businesses should verify current official guidance and seek qualified advice where the topic affects tax, legal, immigration, employment, corporate governance, compliance, licensing, or market-entry decisions.'
    }
  ];

  return uniqueStrings([...cleaned, ...fallbacks].map((item) => item.question))
    .map((question) => [...cleaned, ...fallbacks].find((item) => item.question === question))
    .slice(0, 5);
}

function renderFaqSection(items = []) {
  return [
    '## FAQ',
    '',
    ...items.flatMap((item) => [
      `### ${item.question}`,
      '',
      item.answer,
      ''
    ])
  ].join('\n').trim();
}

function ensureBlogDeliverables(markdown = '', { parsed = {}, article = {}, style = {}, title = '' } = {}) {
  let output = stripKeyTakeawaysSection(markdown);
  const faqItems = normalizeFaqItems(parsed.faq, article);
  const faqSection = renderFaqSection(faqItems);

  if (/^##+\s+faq\b/im.test(output)) {
    output = output.replace(/^##+\s+faq\b[\s\S]*?(?=^##\s+(?:cta|keywords\/tags|keywords|seo|meta description|social media copy|resources)\b|\s*$)/im, `${faqSection}\n\n`);
  } else {
    const ctaIndex = output.search(/^##\s+CTA\b/im);
    output = ctaIndex >= 0
      ? `${output.slice(0, ctaIndex).trim()}\n\n${faqSection}\n\n${output.slice(ctaIndex).trim()}`
      : `${output.trim()}\n\n${faqSection}`;
  }

  if (!/^##\s+CTA\b/im.test(output)) {
    const ctaDescription = parsed.cta?.description || style.ctaDescription || style.cta || '';
    const ctaTitle = parsed.cta?.title || style.ctaTitle || '';
    if (ctaTitle || ctaDescription) {
      output = `${output.trim()}\n\n## CTA\n\n${ctaTitle ? `### ${ctaTitle}\n\n` : ''}${ctaDescription}`;
    }
  }

  if (!/^#\s+/m.test(output)) {
    output = `# ${title || article?.title || 'Market intelligence update'}\n\n${output}`;
  }

  return output.replace(/\n{3,}/g, '\n\n').trim();
}

function formatBlogMarkdown(bodyMarkdown, title) {
  const normalized = normalizeLooseTables(stripKeyTakeawaysSection(bodyMarkdown))
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

function ascentiumRelevanceRubricText() {
  return [
    'Score relevance from 0 to 100 using this fixed Ascentium business rubric:',
    '- Connects to a service Ascentium sells: 0-20 points.',
    '- Is in a market Ascentium operates in: 0-15 points.',
    '- Affects clients businesses, operations, risk, filings, tax, accounting, payroll, governance, compliance, market entry, or advisory decisions: 0-20 points.',
    '- Is a law, regulatory change, official guidance, filing requirement, consultation, enforcement, or government policy update: 0-15 points.',
    '- Is fresh, time-sensitive, or inside the requested date window: 0-10 points.',
    '- Source is trustworthy: government/regulator highest, reputable business news medium, blogs/promotional pages lowest: 0-10 points.',
    '- Could bring leads or create a client conversation/opportunity: 0-5 points.',
    '- Connects to content/services Ascentium already has or can publish around: 0-5 points.',
    'Use the sum as relevance_score. Do not inflate scores for generic news. If service fit plus client impact is below 20 combined, return IGNORE even if other factors are present.'
  ].join('\n');
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

function validFallbackCategory(category) {
  return CATEGORIES[String(category || '').trim()] ? String(category || '').trim() : '';
}

function validFallbackSubcategory(category, subcategory) {
  const cleanCategory = validFallbackCategory(category);
  if (!cleanCategory) return '';
  const value = String(subcategory || '').trim();
  const allowed = Object.keys(CATEGORIES[cleanCategory]?.subcategories || {});
  return allowed.find((item) => item.toLowerCase() === value.toLowerCase()) || '';
}

function fallbackProfileRelevance({ article = {}, topic = 'news' }) {
  const score = Math.max(0, Math.min(100, Number(article.relevanceScore || article.sourceScore || 0) || 0));
  const body = [
    article.title,
    article.summary,
    article.aiSummary,
    article.rawContent,
    article.sourceQuery
  ].filter(Boolean).join(' ');
  const matched = matchCategory(body);
  const category = validFallbackCategory(article.category) || validFallbackCategory(matched.category);
  const subcategory = validFallbackSubcategory(category, article.subcategory) || validFallbackSubcategory(category, matched.subcategory);
  const shouldStore = score >= PROFILE_RELEVANCE_MIN_SCORE && category && subcategory;
  return {
    decision: shouldStore ? 'STORE' : 'IGNORE',
    category: shouldStore ? category : 'IGNORE',
    subcategory: shouldStore ? subcategory : 'IGNORE',
    summary: article.summary || article.aiSummary || '',
    relevance_score: score,
    relevance_reason: shouldStore
      ? `Fallback rule-based match for ${category} / ${subcategory} with Source relevance score ${score} for ${topic}.`
      : `Fallback ignored because score/category/sub-category did not meet storage rules for ${topic}.`
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
  const articleExcerpt = [
    article.summary,
    article.aiSummary,
    article.rawContent
  ].filter(Boolean).join('\n\n').slice(0, 6000);
  const dateFallbackNote = article.dateFallbackUsed
    ? 'Source did not provide a reliable published date. Treat this as a candidate only; STORE only if the content clearly contains a fresh announcement/update signal inside the allowed window, otherwise IGNORE. If the article text shows an older date outside the allowed window, return IGNORE.'
    : '';
  const selectedCategory = profile.category || article.category || 'General';
  const selectedCategories = listPromptValues(profile.categories || article.categories || selectedCategory);
  const selectedSubcategory = profile.subcategory || article.subcategory || 'All sub-categories';
  const mainCategories = Object.keys(CATEGORIES || {});
  const taxonomyScopeInstruction = profile.globalFetch || profile.platformFetch || profile.global
    ? 'This is a superadmin/global fetch. You may STORE when the chosen category and sub-category exist anywhere in the taxonomy. Do not restrict to one user-selected category.'
    : 'You may STORE only when the chosen category is one of the user selected categories and the chosen sub-category is one of the selected/allowed sub-categories. If it fits another category, return IGNORE.';
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
        ascentiumRelevanceRubricText(),
        `HIGH (70-100): NEW government announcement, circular, consultation, law, tax change, budget measure, incentive scheme, immigration/labour rule change, or named regulator guidance affecting ${marketText}.`,
        `MEDIUM (${PROFILE_RELEVANCE_MIN_SCORE}-69): Government policy update with a named regulator and clear business impact in ${marketText}, or budget/tax proposal under consultation.`,
        'Score 0: matches any reject rule or is older than the allowed window.',
        `STORE only when score is at least ${PROFILE_RELEVANCE_MIN_SCORE}.`,
        '',
        'STEP 3: CATEGORY AND SUB-CATEGORY SELECTION',
        `For STORE decisions, map the article into one of the existing taxonomy categories only: ${mainCategories.join(', ')}.`,
        'Use the government focus areas above only as interpretation guidance, not as output categories.',
        'Never invent a new category or sub-category. If no existing taxonomy category fits, return IGNORE.',
        taxonomyScopeInstruction,
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
        dateFallbackNote,
        `Current year: ${currentYear}`,
        '',
        'ARTICLE',
        `Title: ${article.title || ''}`,
        `URL: ${article.url || ''}`,
        `Source: ${article.sourceType || article.source || ''}`,
        `Content/summary/raw excerpt: ${articleExcerpt}`
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
          ascentiumRelevanceRubricText(),
          `HIGH (70-100): Named tracked competitor opening a NEW office, completing an acquisition, launching a NEW service, or winning a major mandate in ${marketText}.`,
          `MEDIUM (${PROFILE_RELEVANCE_MIN_SCORE}-69): Named competitor announcing an expansion plan, leadership hire, partnership, investment increase, pricing/market strategy, or regulatory approval in ${marketText}.`,
          'Score 0: no named tracked competitor or activity outside the selected markets.',
        `STORE only when score is at least ${PROFILE_RELEVANCE_MIN_SCORE}.`,
        '',
        'STEP 3: CATEGORY AND SUB-CATEGORY SELECTION',
          `For STORE decisions, map the competitor event into one of the existing taxonomy categories only: ${mainCategories.join(', ')}.`,
          'Choose the best exact storage sub-category from the selected category taxonomy only. Never invent a new category or sub-category.',
          'If the competitor event is relevant but no existing category/sub-category fit is available, return IGNORE.',
          taxonomyScopeInstruction,
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
          dateFallbackNote,
          `Current year: ${currentYear}`,
          '',
          'ARTICLE',
          `Title: ${article.title || ''}`,
          `URL: ${article.url || ''}`,
          `Source: ${article.sourceType || article.source || ''}`,
          `Content/summary/raw excerpt: ${articleExcerpt}`
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
          ascentiumRelevanceRubricText(),
          `HIGH (70-100): A practical evergreen guide, official explainer, FAQ, checklist, filing/compliance guide, market-entry guide, tax/accounting reference, employment/work-pass guide, AML/KYC requirement page, or regulator guidance that is directly useful in ${marketText}.`,
          `MEDIUM (${PROFILE_RELEVANCE_MIN_SCORE}-69): A useful reference page for ${marketText} with practical business or compliance value, but with less direct actionability or weaker category fit.`,
          'Score 0: ordinary news, outdated time-sensitive content, unrelated geography, weak business relevance, or no exact taxonomy fit.',
          `STORE only when score is at least ${PROFILE_RELEVANCE_MIN_SCORE}.`,
          '',
          'STEP 3: TOPIC RULE',
          topicFilterInstructions(topic),
          '',
          'STEP 4: CATEGORY AND SUB-CATEGORY SELECTION',
          `For STORE decisions, the content must match one of the existing taxonomy categories only: ${mainCategories.join(', ')}.`,
          'Use the best exact category and sub-category from the existing taxonomy.',
          `Example valid sub-categories from the selected profile category: ${validSubcategories.join(', ') || 'Use the taxonomy list above.'}`,
          'Never invent a new category or sub-category. If no existing taxonomy fit is available, return IGNORE.',
          taxonomyScopeInstruction,
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
          dateFallbackNote,
          `Current year: ${currentYear}`,
          '',
          'ARTICLE',
          `Title: ${article.title || ''}`,
          `URL: ${article.url || ''}`,
          `Source: ${article.sourceType || article.source || ''}`,
          `Content/summary/raw excerpt: ${articleExcerpt}`
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
        '- Trade-war, sanctions, export-control, mining, industrial, or geopolitical stories must be IGNORE unless the article clearly explains a concrete tax, compliance, company registry, licensing, filing, employment, market-entry, FDI, or governance impact for the selected market.',
        '- A passing mention of a company, acquisition, corporate filing, director name, stock market, or company registry search is NOT enough by itself. There must be an actionable service/tax/compliance/regulatory/business-entry angle.',
        '- Static government pages, directory listings, portal homepages, resource hubs, e-service pages, search pages, login pages, or tool pages.',
        `- Any update older than ${maxAgeDays} days when the article clearly shows an older effective or publication date.`,
        `- Any article that does not fit at least one existing taxonomy category from: ${mainCategories.join(', ')}.`,
        '- Do not reject solely because it is not a government update. News can be market, economy, tax, employment, corporate-services, investment, trade, compliance, or professional-services intelligence.',
        `- Competitor intelligence should be kept only when a tracked competitor is explicitly named (${competitors.join(', ') || 'no tracked competitors provided'}) and the article shows expansion, acquisition, partnership, new office, service launch, leadership move, senior hire, thought leadership, or another real market signal in ${marketText}.`,
        '',
        'STEP 2: SCORING',
        ascentiumRelevanceRubricText(),
        `Give HIGH (70-100) when the article has a concrete NEW business, market, economy, investment, tax, compliance, employment, company registry, FDI, trade, professional-services, or competitor signal affecting ${marketText}.`,
        `Give MEDIUM (${PROFILE_RELEVANCE_MIN_SCORE}-69) only when the article has a clear actionable business impact in ${marketText} and fits at least one existing taxonomy category, even if it is not a formal government/regulatory announcement.`,
        'Give 0 when it is unrelated to the market, unrelated to every taxonomy category, too old, broken, or matches a hard reject rule.',
        `STORE only when score is at least ${PROFILE_RELEVANCE_MIN_SCORE}. If the article is not strong enough for ${PROFILE_RELEVANCE_MIN_SCORE}, return IGNORE with score 0.`,
        '',
        'STEP 3: TOPIC RULE',
        topicFilterInstructions(topic),
        '',
        'STEP 4: CATEGORY AND SUB-CATEGORY SELECTION',
        `For STORE decisions, the article must match one of the existing taxonomy categories only: ${mainCategories.join(', ')}.`,
        'Do not force the article into the first/profile category when multiple selected categories are available.',
        'Use the best exact category name from the existing taxonomy only.',
        'Choose the best exact sub-category under that category from the existing taxonomy only.',
        `Example valid sub-categories from the selected profile category: ${validSubcategories.join(', ') || 'Use the taxonomy list above.'}`,
        'Never invent a new category or sub-category. If no existing taxonomy category fits, return IGNORE.',
        taxonomyScopeInstruction,
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
        dateFallbackNote,
        `Current year: ${currentYear}`,
        '',
        'ARTICLE',
        `Title: ${article.title || ''}`,
        `URL: ${article.url || ''}`,
        `Source: ${article.sourceType || article.source || ''}`,
        `Content/summary/raw excerpt: ${articleExcerpt}`
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
          content: [
            'You are a precise business-intelligence relevance classifier. Return valid JSON only.',
            'Never store homepage, listing, directory, search, login, or generic portal pages; return IGNORE for those.',
            'Choose category and sub-category from the article’s primary business impact, not from the source name alone.'
          ].join(' ')
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

function batchArticlePayload(article = {}, index = 0) {
  const excerpt = [
    article.summary,
    article.aiSummary,
    article.rawContent
  ].filter(Boolean).join('\n\n').slice(0, 1600);
  return {
    id: article.batchId || article.urlHash || article.hash || `candidate_${index + 1}`,
    title: String(article.title || '').slice(0, 300),
    url: String(article.url || '').slice(0, 800),
    source: String(article.sourceType || article.source || '').slice(0, 160),
    country: String(article.country || article.profile?.country || '').slice(0, 80),
    publishedAt: String(article.publishedAt || '').slice(0, 80),
    excerpt
  };
}

async function classifyProfileRelevanceBatch({ articles = [], profile = {}, topic = 'news', aiConfig = {} }) {
  const cli = getClient();
  if (!cli || !articles.length) return [];

  const companyName = profileCompanyName(profile, articles[0] || {});
  const markets = profileMarkets(profile, articles[0] || {});
  const marketText = markets.join(', ') || 'the selected market';
  const maxAgeDays = Math.max(1, Math.min(365, Number(profile.days || 30) || 30));
  const mainCategories = Object.keys(CATEGORIES || {});
  const taxonomyScopeInstruction = profile.globalFetch || profile.platformFetch || profile.global
    ? 'This is a superadmin/global fetch. STORE only when the chosen category and sub-category exist anywhere in the taxonomy.'
    : 'STORE only when the chosen category is one of the user selected categories and the chosen sub-category is one of the selected/allowed sub-categories.';
  const selectedCategories = listPromptValues(profile.categories || profile.category);
  const candidates = articles.map(batchArticlePayload);

  try {
    const resp = await cli.chat.completions.create({
      model: runtimeAiModel(aiConfig),
      temperature: 0,
      max_tokens: Math.min(3500, 500 + candidates.length * 260),
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You are a precise batch business-intelligence relevance classifier.',
            'Return valid JSON only.',
            'Classify every candidate exactly once using its provided id.',
            'Do not invent facts, URLs, categories, or sub-categories.',
            'If evidence is weak, return IGNORE with score 0.'
          ].join(' ')
        },
        {
          role: 'user',
          content: [
            'TASK',
            `Classify ${candidates.length} candidates for topic "${topic}".`,
            `Company/client: ${companyName}`,
            `Market: ${marketText}`,
            `Maximum age preference: ${maxAgeDays} days`,
            `Selected categories: ${selectedCategories.join(', ') || 'All taxonomy categories'}`,
            taxonomyScopeInstruction,
            '',
            'STRICT STORAGE TAXONOMY',
            taxonomyPromptText(),
            '',
            'RELEVANCE SCORING RUBRIC',
            ascentiumRelevanceRubricText(),
            '',
            'RULES',
            `- STORE only if the article has a concrete business, tax, compliance, employment, governance, market-entry, FDI, trade, professional-services, or competitor signal affecting ${marketText}.`,
            '- STORE only with an exact category and exact sub-category from the taxonomy above.',
            '- Never create new categories or sub-categories.',
            '- Reject generic politics, diplomacy, events, entertainment, sports, tourism, CSR, charity, scam alerts, portal pages, homepages, listings, search pages, and thin pages unless there is a direct professional-services/business impact.',
            `- STORE only when relevance_score is at least ${PROFILE_RELEVANCE_MIN_SCORE}; otherwise IGNORE with score 0.`,
            '- summary must be two short sentences grounded only in the candidate text.',
            '- relevance_reason must mention the specific business impact and taxonomy fit.',
            '',
            'OUTPUT JSON SHAPE',
            '{"items":[{"id":"<same id>","decision":"STORE|IGNORE","category":"<exact category or IGNORE>","subcategory":"<exact sub-category or IGNORE>","summary":"<2 short sentences>","relevance_score":0-100,"relevance_reason":"<specific reason>"}]}',
            '',
            'CANDIDATES',
            JSON.stringify(candidates)
          ].join('\n')
        }
      ]
    });

    const parsed = JSON.parse(resp.choices?.[0]?.message?.content || '{}');
    const rows = Array.isArray(parsed.items) ? parsed.items : Array.isArray(parsed.results) ? parsed.results : [];
    const byId = new Map(rows.map((row) => [String(row.id || ''), row]));
    return candidates.map((candidate) => {
      const row = byId.get(candidate.id) || {};
      const relevanceScore = Math.max(0, Math.min(100, parseInt(row.relevance_score, 10) || 0));
      const category = row.category || 'IGNORE';
      const explicitDecision = String(row.decision || '').toUpperCase();
      const inferredDecision = String(category).toUpperCase() !== 'IGNORE' && relevanceScore >= PROFILE_RELEVANCE_MIN_SCORE
        ? 'STORE'
        : 'IGNORE';
      return {
        id: candidate.id,
        decision: explicitDecision || inferredDecision,
        category,
        subcategory: row.subcategory || row.sub_category || '',
        summary: row.summary || '',
        relevance_score: relevanceScore,
        relevance_reason: row.relevance_reason || row.relevanceReason || ''
      };
    });
  } catch (err) {
    console.warn('[ai] batch profile relevance failed:', err.message);
    return [];
  }
}

function cleanScrapedText(value = '') {
  return String(value || '')
    .replace(/^#{1,6}\s+/gm, ' ')
    .replace(/\bStep\s+\d+\s*:\s*/gi, ' ')
    .replace(/\bAdvertisement\b/gi, ' ')
    .replace(/\bSelect Voice\b/gi, ' ')
    .replace(/\bSelect Speed\b/gi, ' ')
    .replace(/\b\d+\s*-\s*MIN READ\b/gi, ' ')
    .replace(/\[[^\]]{0,80}\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function conciseLinkedInSourceSummary(article = {}) {
  const raw = cleanScrapedText(article.aiSummary || article.summary || article.blogContext || article.rawContent || article.rawData?.rawContent);
  if (!raw) return 'This update may create a practical signal for operators, advisors, or business leaders.';
  const rawLower = raw.toLowerCase();
  const looksLikeUiDump = (
    (rawLower.match(/\bregister of\b/g) || []).length >= 3 ||
    (rawLower.match(/\bexemption question\b/g) || []).length >= 2 ||
    (rawLower.match(/\bsection\b/g) || []).length >= 4 ||
    rawLower.includes('confirm register information follow these steps')
  );
  if (looksLikeUiDump) {
    const title = cleanScrapedText(article.title || 'This filing requirement')
      .replace(/\s*\|\s*[^|]{2,120}$/g, '')
      .trim() || 'This filing requirement';
    return `${title} can change how companies check filing responsibility, supporting records, and governance sign-off before submission.`;
  }
  const sentences = raw
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(business|banking|finance|select voice|select speed|advertisement)$/i.test(line))
    .filter((line) => !/^step\s+\d+/i.test(line))
    .filter((line) => !/register of .{0,80} exemption question/i.test(line));
  return (sentences.slice(0, 2).join(' ') || raw).slice(0, 520).trim();
}

function hasLinkedInSourceLeak(value = '', article = {}) {
  const body = String(value || '').toLowerCase();
  const title = String(article.title || '').toLowerCase();
  const source = String(article.source || article.rawData?.source || '').toLowerCase();
  const titleBase = title.replace(/\s*\|\s*[^|]{2,120}$/g, '').trim();
  const escapedTitleBase = titleBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (
    /\|\s*[a-z][a-z\s&.-]{2,80}\s+(may|can|could|should|will)\b/i.test(String(value || '')) ||
    (title.includes('|') && titleBase.length > 20 && body.includes(titleBase) && body.includes('|')) ||
    (titleBase.length > 24 && new RegExp(`${escapedTitleBase}\\s+(may|can|could|should|will|usually|often)\\b`, 'i').test(String(value || ''))) ||
    (source.length > 8 && body.includes(`| ${source}`))
  );
}

function hasScrapedArticleArtifacts(value = '') {
  const body = String(value || '').toLowerCase();
  return [
    'advertisement',
    'select voice',
    'select speed',
    '2-min read',
    'min read',
    'read more',
    'businessbanking',
    '[...]',
    '## step',
    'confirm register information',
    'exemption question',
    'select speed'
  ].some((term) => body.includes(term));
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
    audience: style.audience || '',
    keyPoints: [
      summary || `Explain why ${primaryKeyword} matters for the target audience.`,
      'Translate the update into practical compliance, tax, operational, or market-entry considerations.',
      'Include a concise checklist and FAQs.'
    ].filter(Boolean).join('\n'),
    focusPage: style.focusPage || '',
    internalLinkPages: style.internalLinkPages || '',
    ctaTitle: style.ctaTitle || '',
    ctaButtonText: style.ctaButtonText || '',
    ctaDescription: style.ctaDescription || style.cta || '',
    referenceUrls: [article.url, ...research.map((item) => item.url)].filter(Boolean).slice(0, 5).join(', '),
    suggestedOutline: [
      'Introduction',
      `Why ${primaryKeyword} matters for businesses`,
      `What companies should review before acting on ${primaryKeyword}`,
      'Practical checklist',
      'FAQs',
      'Conclusion'
    ].join('\n'),
    questions: [
      `What does ${primaryKeyword} mean for businesses?`,
      `Who should review ${primaryKeyword}?`,
      `What steps should companies take next?`
    ],
    sources: [
      article.url ? { title: article.title || 'Source article', url: article.url } : null,
      ...research.map((item) => ({ title: item.title || '', url: item.url || '' }))
    ].filter((item) => item?.url)
  };
}

function linkedinFallbackAngle({ article = {}, topic = '', audience = '' }) {
  const body = normalizeWords([
    topic,
    article.summary,
    article.aiSummary,
    article.category,
    article.subcategory,
    article.relevanceReason
  ].filter(Boolean).join(' '));

  if (body.includes('zero rated') || body.includes('zero rating') || (body.includes('0') && body.includes('gst')) || body.includes('0 gst')) {
    return {
      hook: '0% GST needs evidence.',
      companyVoice: 'Our team would treat zero-rating as a proof question, not just an invoice setting.',
      personalVoice: 'I would treat zero-rating as a proof question, not just an invoice setting.',
      tension: 'Charging 0% GST can be valid only when the supply fits the zero-rated rules and the supporting documents are in place.',
      proof: 'Zero-rated GST treatment usually depends on the type of supply, customer location, export/service facts, and evidence kept by the business.',
      audience: 'finance and tax teams',
      bullets: [
        'whether the supply qualifies for zero-rating',
        'which documents support the 0% treatment',
        'how the invoice and GST return will be reviewed'
      ],
      rule: '0% GST is a position to evidence, not a shortcut to apply.',
      cta: 'Before charging 0%, check the supply type, customer facts, and documents that support the GST treatment.'
    };
  }

  if (body.includes('financial statement') || body.includes('filing') || body.includes('annual return')) {
    return {
      hook: 'Filing is governance.',
      companyVoice: 'Our team would treat this as a control point, not an admin task.',
      personalVoice: 'I would treat this as a control point, not an admin task.',
      tension: 'The issue is not only whether the form is submitted. It is whether the records behind it can stand up to review.',
      proof: 'Foreign-company filing requirements usually test three things: deadline ownership, supporting records, and approval before submission.',
      audience: 'foreign companies and finance teams',
      bullets: [
        'who owns the filing deadline',
        'which financial records support the submission',
        'who signs off before anything is filed'
      ],
      rule: 'A filing requirement is useful only when it becomes an owned internal control.',
      cta: 'Before filing, check the deadline owner, supporting records, and approval trail.'
    };
  }

  if (body.includes('resident director') || body.includes('director') || body.includes('governance')) {
    return {
      hook: 'Directors carry real risk.',
      companyVoice: 'Our team would not treat a director appointment as a name on a form.',
      personalVoice: 'I would not treat a director appointment as a name on a form.',
      tension: 'The risk sits in oversight, authority, and whether the director can reasonably stand behind the company position.',
      proof: 'Director requirements are not just appointment mechanics. They create accountability for oversight, filings, and governance decisions.',
      audience: 'company directors and governance teams',
      bullets: [
        'who has statutory responsibility',
        'what due diligence is documented',
        'how governance questions are escalated'
      ],
      rule: 'A director requirement should create a governance check, not just a filing step.',
      cta: 'Review the role, authority, and documentation before relying on the appointment.'
    };
  }

  if (body.includes('foreign entity') || body.includes('re domiciliation') || body.includes('redomiciliation') || body.includes('registration')) {
    return {
      hook: 'Registration changes obligations.',
      companyVoice: 'Our team would check the operating consequences before treating this as a setup step.',
      personalVoice: 'I would check the operating consequences before treating this as a setup step.',
      tension: 'Moving an entity into a new register can affect documents, governance, tax conversations, and timing.',
      proof: 'A registration transfer is useful only when the entity records, approvals, and timing are mapped before the process starts.',
      audience: 'foreign companies and expansion teams',
      bullets: [
        'which entity records need updating',
        'what approvals or documents are required',
        'when clients should plan the transfer timeline'
      ],
      rule: 'A registration step matters when it changes the operating checklist.',
      cta: 'Map the required documents, approvals, and timing before starting the transfer.'
    };
  }

  if (body.includes('tax') || body.includes('gst') || body.includes('vat') || body.includes('invoice')) {
    return {
      hook: 'Tax updates need owners.',
      companyVoice: 'Our team would turn this into a responsibility check before it becomes a deadline issue.',
      personalVoice: 'I would turn this into a responsibility check before it becomes a deadline issue.',
      tension: 'The risk is usually not awareness. It is unclear ownership across finance, operations, and advisors.',
      proof: 'Tax changes create practical risk when the obligation is known but the owner, evidence, and filing position are not documented.',
      audience: 'finance and tax teams',
      bullets: [
        'which obligation changed',
        'who owns the next filing or review',
        'what evidence should be kept'
      ],
      rule: 'A tax update should leave behind a clear owner and record trail.',
      cta: 'Assign the owner, check the filing position, and document the basis for the decision.'
    };
  }

  return {
    hook: String(topic).split(/[,:|-]/)[0].trim().slice(0, 70) || 'This deserves a closer look',
    companyVoice: 'Our team would turn this into a specific review point before acting on it.',
    personalVoice: 'I would turn this into a specific review point before acting on it.',
    tension: 'The value is not in noticing the update. It is in deciding what responsibility, timing, or evidence changes.',
    proof: conciseLinkedInSourceSummary(article),
    audience: 'business teams',
    bullets: [
      'what decision this affects',
      'who owns the next step',
      'what needs to be documented'
    ],
    rule: 'A useful update should create one clear next action.',
    cta: 'Review the owner, evidence, and next step before treating this as complete.'
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
            'You are an Ascentium SEO strategist and corporate advisory content planner.',
            'Use the selected intelligence item to suggest practical blog settings for an Ascentium advisory blog.',
            'Do not rewrite or summarize the source article. Turn it into an original educational blog angle.',
            'Do not invent search volume, keyword difficulty, CPC, or rankings.',
            'Do not invent facts, statistics, legal interpretations, tax rates, policies, or source URLs.',
            'Return valid JSON only.'
          ].join('\n')
        },
        {
          role: 'user',
          content: [
            ASCENTIUM_BLOG_GENERATION_RULES,
            '',
            'SETTING QUALITY RULES',
            '- Suggest a topic and SEO direction that will produce a practical advisory blog, not an article rewrite.',
            '- Meta title should be 50-60 characters where possible and may be question-style when natural.',
            '- Meta description should be 150-160 characters where possible.',
            '- Primary keyword should be specific enough to match search intent, not just the source headline.',
            '- Secondary keywords should support semantic SEO and Ascentium service relevance.',
            '- Key points should tell the writer what business problem, impact, example, practical advice, and CTA angle to cover.',
            '- CTA must be topic-specific and connected to Ascentium services. Avoid generic sales language.',
            '- Suggested outline must follow: Introduction, H2 sections, Conclusion, Keywords/Tags, SEO title, Meta description, FAQ, CTA, Social media copy, Resources.',
            '',
            'Return JSON shape:',
            '{"metaTitle":"50-60 char title","metaDescription":"145-160 char description","primaryKeyword":"keyword","secondaryKeywords":["keyword"],"searchIntent":"informational|commercial|transactional|navigational","audience":"target audience","keyPoints":"newline separated key points","focusPage":"optional service/page","internalLinkPages":"comma separated internal page ideas","ctaTitle":"CTA title","ctaButtonText":"CTA button","ctaDescription":"CTA description","referenceUrls":"comma separated source/reference URLs","suggestedOutline":"newline separated outline","questions":["FAQ question"],"sources":[{"title":"source title","url":"https://..."}]}',
            '',
            `Company/client: ${company.name || 'Ascentium'}`,
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
            'ARTICLE RESEARCH CONTEXT',
            researchContext || 'No additional research results available.'
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
      metaTitle: String(parsed.metaTitle || fallback.metaTitle).slice(0, 60),
      metaDescription: String(parsed.metaDescription || fallback.metaDescription).slice(0, 160),
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
  const targetWords = blogWordTarget(style);
  const runtimeConfig = generationConfig(aiConfig, {
    model: MODEL,
    temperature: 0.35,
    maxWords: targetWords,
    minWords: 500,
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
  const audience = style.audience || '';
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
      max_tokens: Math.max(2500, wordsToMaxTokens(runtimeConfig.maxWords, length === 'long' || length === 'custom' ? 6000 : length === 'short' ? 2800 : 4200)),
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You are a senior B2B advisory writer, professional-services content editor, market researcher, and SEO strategist.',
            '',
            'Your job is to create a high-quality, human-sounding, commercially useful Ascentium blog using the selected intelligence topic and provided source/reference content.',
            '',
            'The finished blog should read like it was written by an experienced advisor for business owners, CFOs, investors, founders, boards, and regional expansion teams. It must not read like generic AI content.',
            '',
            'ASCENTIUM BLOG GENERATION RULES - FOLLOW THESE AS SOURCE OF TRUTH',
            ASCENTIUM_BLOG_GENERATION_RULES,
            '',
            'ADDITIONAL BLOG DRAFTING SOP',
            BLOG_WRITING_SOP,
            '',
            'APPROVED HOOK TEMPLATE BANK',
            APPROVED_HOOK_TEMPLATE_BANK,
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
            '- Choose the best-fitting hook pattern from the approved hook template bank for the selected topic, then adapt it naturally into the title, introduction opening, or social media copy. Do not paste placeholders.',
            '- Make the conclusion summarize the practical business signal and nudge the reader toward the CTA.',
            '- If FAQ is requested, include useful search-friendly FAQs.',
            '- Every generated blog must include at least 5 FAQs. Each FAQ answer must be a useful paragraph of 3-5 sentences, not a one-line answer.',
            '- Format FAQs with the question as a Markdown H3 on its own line, then a blank line, then the answer paragraph.',
            '- Use proper heading hierarchy.',
            '- H2 headings must be descriptive, SEO-aware, and specific to the selected topic. Avoid generic H2s such as "Overview", "Benefits", "Conclusion" unless expanded with the topic keyword.',
            '- Write clean publication-ready Markdown.',
            '- Follow this visible blog template order in bodyMarkdown unless the user explicitly requested a custom outline that conflicts: Banner, H1 Title, Introduction, Table of Contents, Body of Content, Conclusion, Keywords/Tags, SEO / Meta Title, Meta Description, FAQ, CTA, Social Media Copy, Resources.',
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
            '- Include Keywords/Tags as a short Markdown list after the conclusion.',
            '- Include SEO / Meta Title and Meta Description as visible sections after Keywords/Tags, matching the JSON meta fields.',
            '- Include FAQ after Meta Description.',
            '- Include a standalone CTA section after FAQ. The CTA must have the heading "## CTA".',
            '- Include Social Media Copy after CTA.',
            '- The blog must always include a relevant CTA connected to the topic. Do not omit the CTA even when the user gives limited CTA details.',
            '- Include a Resources section at the end with only the source URL and any provided reference material / competitor URLs.',
            '- Do not include a standalone "Key Takeaways" section. Integrate takeaways into the conclusion and practical action sections.',
            '- Never use placeholder links such as "#", "javascript:void(0)", or "example.com". Write the CTA as plain text without a link.',
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
            blogLengthInstruction(style),
            `Required target word count: ${runtimeConfig.maxWords} words. Stay within roughly +/- 10% unless the source is too limited.`,
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
            'HOOK SELECTION',
            'Select one hook template category from the approved hook bank that best fits the topic, search intent, audience, and format.',
            'For educational/compliance/tax topics, prefer Demystifying Terms, Enlightening Enquiry, Simple Steps, Reality Check, It Depends on These Factors, or It is not about X, it is about Y.',
            'Adapt the template into a natural blog opening. Replace every bracket placeholder with concrete words from the selected topic and source context.',
            '',
            'If outline mode is "auto", generate a clear Table of Contents before writing the body.',
            'If outline mode is "custom", follow the custom outline as closely as possible.',
            '',
            'CTA REQUIREMENTS',
            `CTA title: ${ctaTitle}`,
            `CTA description: ${cta || 'Use a soft professional CTA.'}`,
            `CTA button text: ${ctaButtonText}`,
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
            '4. Write a structured blog body with meaningful SEO-optimized H2/H3 headings. H2s should naturally include the primary keyword, market, rule, audience, or business action where relevant.',
            '5. Explain why the topic matters to the target audience in practical business terms.',
            '6. Use examples where helpful, but do not invent unsupported examples.',
            '7. Include a practical checklist plus a valid Markdown table or decision framework. For incentives/compliance topics, a table is required.',
            '8. Include internal linking suggestions naturally if focus page or internal pages are provided.',
            '9. Include practical takeaways that a reader can act on or discuss internally.',
            '10. Add at least 5 useful FAQs with specific, cautious answers. Each question must be on its own H3 line and each answer must start on the next paragraph with enough detail to be valuable.',
            '11. After the conclusion, add sections in this exact order: Keywords/Tags, SEO / Meta Title, Meta Description, FAQ, CTA, Social Media Copy, Resources.',
            '12. Add a Resources section containing only real source/reference URLs provided in this request.',
            '13. Write a concise conclusion before Keywords/Tags. The conclusion should transition naturally toward the CTA but must not use "In conclusion".',
            '14. The CTA must be a standalone "## CTA" section after FAQ. Include 2-3 lines explaining how Ascentium can help with the relevant service/problem.',
            '15. Keep the blog coherent, flowing, and professionally written.',
            `16. Write approximately ${runtimeConfig.maxWords} words. Do not produce a thin draft below the selected length target.`,
            '',
            'QUALITY BAR BEFORE RETURNING',
            '- Rewrite any generic paragraph before final output.',
            '- Remove filler adjectives and unsupported claims.',
            '- Ensure each major section answers "so what?" for the target audience.',
            '- Ensure the blog is useful even to a reader who already knows the headline.',
            '- Ensure the CTA is connected to the topic, not a generic sales line.',
            '- Ensure the CTA does not contain placeholder links and do not create a markdown link.',
            '- Ensure the banner brief does not promise statistics, charts, or data visuals unless source-backed data is available.',
            '- Ensure any table is valid Markdown with a separator row, for example "| Column | Column |" followed by "| --- | --- |".',
            '- Ensure Social Media Copy is calm, advisory, and non-hype-led.',
            '- Ensure the output includes practical formatting: tables where relevant, examples where useful, bullets, and numbered lists.',
            '- Ensure the final article looks ready to publish in a CMS without cleanup.',
            '- Ensure the final article includes every Ascentium deliverable in order: Banner, Title, Table of Contents, Body of Content, Keywords/Tags, SEO/meta Title, Meta Description, at least 5 FAQs, CTA, Social Media Copy, and Resources.',
            '- Ensure there is no standalone Key Takeaways section; include those points inside the conclusion or practical checklist.',
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
            '  "bodyMarkdown": "<full blog in clean publish-ready Markdown following this exact order: Banner, one H1 Title, Introduction, Table of Contents, Body of Content, Conclusion, Keywords/Tags, SEO / Meta Title, Meta Description, FAQ, CTA, Social Media Copy, Resources>",',
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
            '    "url": ""',
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
    const finalBodyMarkdown = ensureBlogDeliverables(
      formatBlogMarkdown(parsed.bodyMarkdown, finalTitle),
      { parsed, article, style, title: finalTitle }
    );
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
      max_tokens: Math.max(3200, wordsToMaxTokens(runtimeConfig.maxWords, 4500)),
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
            `Company name: ${company.name || 'Ascentium'}`,
            `Audience: ${blog.style?.audience || 'Not specified'}`,
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
      bodyMarkdown: ensureBlogDeliverables(
        formatBlogMarkdown(parsed.bodyMarkdown, finalTitle),
        { parsed, article, style: blog.style || {}, title: finalTitle }
      ),
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
    maxWords: options.length === 'long' ? 280 : options.length === 'short' ? 120 : 180,
    minWords: 80,
    maxAllowedWords: 800
  });
  if (!cli) {
    return fallbackLinkedInPost({ article, options });
  }

  const sourceContext = socialSourceContext(article);
  const postGoal = normalizeLinkedInObjective(options.postGoal || 'build_authority');
  const postGoalLabel = linkedinObjectiveLabel(postGoal);
  const tone = options.tone || 'professional';
  const audience = String(options.audience || '').trim();
  const length = options.length || 'medium';
  const hookStyle = options.hookStyle || 'auto';
  const framework = options.framework || 'auto';
  const topicTier = options.topicTier || 'auto';
  const profileType = options.profileType === 'personal' ? 'personal' : 'company';
  const profileUrl = String(options.profileUrl || '').trim();
  const takeaway = options.takeaway || '';
  const cta = options.cta || '';
  const includeCTA = options.includeCTA !== false;
  const includeHashtags = options.includeHashtags !== false;
  const customInstructions = options.customInstructions || '';
  const selectedSourceTopic = String(options.topic || options.selectedTopic || article.title || '').trim();

  try {
    const resp = await cli.chat.completions.create({
      model: runtimeConfig.model,
      temperature: runtimeConfig.temperature,
      max_tokens: Math.max(1200, wordsToMaxTokens(runtimeConfig.maxWords, 1400)),
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: LINKEDIN_PROMPT_V2_SYSTEM
        },
        {
          role: 'user',
          content: [
            'Create one LinkedIn post from the selected intelligence source.',
            '',
            '═══ INPUTS FROM FORM ═══',
            `Profile type:        ${profileType}`,
            `Profile URL:         ${profileUrl || 'Not provided'}`,
            `Topic (locked):      ${selectedSourceTopic}`,
            `Post goal:           ${postGoalLabel} (${postGoal})`,
            `Tone:                ${tone}`,
            `Length:              ${length}`,
            `Hook style:          ${hookStyle}`,
            `Framework:           ${framework}`,
            `Topic tier:          ${topicTier}`,
            `Rule of One:         ${takeaway || 'Derive from topic'}`,
            `Target audience:     ${audience || 'Derive from market & category'}`,
            `CTA direction:       ${cta || 'Contextual CTA'}`,
            `Include hashtags:    ${includeHashtags}`,
            `Include CTA:         ${includeCTA}`,
            `Custom instructions: ${customInstructions || 'None'}`,
            '',
            '═══ SOURCE ═══',
            `Title:            ${article.title || ''}`,
            `Summary:          ${article.summary || article.aiSummary || ''}`,
            `URL:              ${article.url || ''}`,
            `Market:           ${[article.region, article.country].filter(Boolean).join(', ') || 'Not specified'}`,
            `Category:         ${article.category || ''} / ${article.subcategory || ''}`,
            `Source type:      ${article.type || ''}`,
            `Relevance reason: ${article.relevanceReason || ''}`,
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
            '    { "topic": "<specific topic>", "tier": "Broad|Practical|Narrow|Niche", "reason": "<why it works>" }',
            '  ],',
            '  "primaryTopic": "<primary topic being answered>",',
            '  "searchIntent": "<why someone would search or care about this topic>",',
            '  "readerIntent": "<what the reader wants to understand or decide>",',
            '  "businessContext": "<business situation behind the topic>",',
            '  "marketContext": "<market or regulatory context if relevant>",',
            '  "businessProblem": "<problem created or revealed by the topic>",',
            '  "businessOpportunity": "<opportunity created or revealed by the topic>",',
            '  "businessRisk": "<risk created or revealed by the topic>",',
            '  "commercialRelevance": "<why this matters commercially>",',
            '  "userObjective": "<what the user wants the post to achieve>",',
            '  "readerTakeaway": "<what the reader should remember>",',
            '  "learningOutcome": "<what the reader should understand after reading>",',
            '  "selectedTopic": "<best topic>",',
            '  "topicTier": "Broad|Practical|Narrow|Niche",',
            '  "framework": "SLAY|PAS|PRA|POV|5-Line Mirror|AIDA",',
            '  "hookCategory": "<selected approved hook category>",',
            '  "hookOptions": ["<hook 1>", "<hook 2>", "<hook 3>", "<hook 4>", "<hook 5>"],',
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
    if (!parsed.postText || !parsed.hook || hasScrapedArticleArtifacts(parsed.postText) || hasLinkedInSourceLeak(parsed.postText, article)) {
      return {
        ...fallbackLinkedInPost({ article, options }),
        model: runtimeConfig.model
      };
    }

    const normalizedHook = normalizeLinkedInHookForStyle(parsed.hook, hookStyle, parsed.selectedTopic || selectedSourceTopic || article.title || '');

    return {
      topicOptions: Array.isArray(parsed.topicOptions) ? parsed.topicOptions : [],
      primaryTopic: String(parsed.primaryTopic || selectedSourceTopic || '').trim(),
      searchIntent: String(parsed.searchIntent || '').trim(),
      readerIntent: String(parsed.readerIntent || '').trim(),
      businessContext: String(parsed.businessContext || '').trim(),
      marketContext: String(parsed.marketContext || '').trim(),
      businessProblem: String(parsed.businessProblem || '').trim(),
      businessOpportunity: String(parsed.businessOpportunity || '').trim(),
      businessRisk: String(parsed.businessRisk || '').trim(),
      commercialRelevance: String(parsed.commercialRelevance || '').trim(),
      userObjective: String(parsed.userObjective || '').trim(),
      readerTakeaway: String(parsed.readerTakeaway || '').trim(),
      learningOutcome: String(parsed.learningOutcome || '').trim(),
      selectedTopic: String(parsed.selectedTopic || article.title || '').trim(),
      topicTier: String(parsed.topicTier || '').trim(),
      framework: String(parsed.framework || '').trim(),
      hookCategory: String(parsed.hookCategory || '').trim(),
      hookOptions: Array.isArray(parsed.hookOptions) ? parsed.hookOptions.map(String) : [],
      hook: normalizedHook,
      postText: stripTrailingHashtags(parsed.postText),
      cta: includeCTA ? String(parsed.cta || '').trim() : '',
      hashtags: includeHashtags ? normalizeHashtags(
        Array.isArray(parsed.hashtags) ? parsed.hashtags.map(String) : [],
        [
          '#MarketIntelligence',
          '#BusinessStrategy',
          '#RiskManagement',
          '#Governance',
          '#Compliance',
          '#Advisory'
        ]
      ) : [],
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
  const postOptions = post.options || {};
  const profileType = postOptions.profileType === 'personal' ? 'personal' : 'company';
  const profileUrl = String(postOptions.profileUrl || '').trim();
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
      max_tokens: Math.max(1500, wordsToMaxTokens(runtimeConfig.maxWords, 1200)),
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You are a senior LinkedIn content editor performing targeted revisions on an existing post.',
            'Return ONLY valid JSON.',
            '',
            'SURGICAL REVISION DIRECTIVE — HIGHEST PRIORITY:',
            '1. DO NOT REWRITE THE ENTIRE POST FROM SCRATCH. Modify ONLY the specific lines, section, tone, hook, CTA, or length requested in USER FEEDBACK.',
            '2. Preserve the rest of the existing post text, structure, proof, and key points intact unless the user explicitly requested changing them.',
            '3. Follow the user instructions 100% precisely as requested.',
            '4. Maintain the direct answer to selectedTopic (Topic Lock).',
            '5. Do not invent fake facts, numbers, laws, or claims.',
            '6. Maintain active profileType voice (Company = "we/our team/neutral", Personal = "I").',
            '7. Keep short paragraphs (max 2 lines, max 30 words per paragraph). No hashtags inside postText.',
            '',
            'Return JSON shape: { "selectedTopic": "...", "postText": "...", "hook": "...", "cta": "...", "hashtags": ["#..."], "framework": "...", "topicTier": "..." }'
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
            `Profile type: ${profileType}`,
            `Profile URL: ${profileUrl || 'Not provided'}`,
            '',
            'CURRENT POST',
            `Topic: ${post.selectedTopic || ''}`,
            `Post text:\n${post.postText || ''}`,
            `Hashtags: ${(post.hashtags || []).join(' ')}`,
            `Framework: ${post.framework || ''}`,
            `Topic tier: ${post.topicTier || ''}`,
            '',
            'SOURCE CONTEXT',
            JSON.stringify(sourceContext).slice(0, 3000)
          ].join('\n')
        }
      ]
    });

    const parsed = JSON.parse(resp.choices?.[0]?.message?.content || '{}');
    const revisedText = String(parsed.postText || post.postText || '').trim();
    if (hasScrapedArticleArtifacts(revisedText) || hasLinkedInSourceLeak(revisedText, sourceArticle || post.sourceSnapshot || {})) {
      return {
        ...fallbackLinkedInPost({ article: sourceArticle || post.sourceSnapshot || {}, options: postOptions }),
        model: runtimeConfig.model
      };
    }

    return {
      selectedTopic: String(parsed.selectedTopic || post.selectedTopic || '').trim(),
      postText: stripTrailingHashtags(revisedText),
      hashtags: normalizeHashtags(Array.isArray(parsed.hashtags) ? parsed.hashtags : post.hashtags || []),
      framework: String(parsed.framework || post.framework || '').trim(),
      topicTier: String(parsed.topicTier || post.topicTier || '').trim(),
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
      model: runtimeConfig.model
    };
  }
}

module.exports = { isEnabled, summarizeArticle, classifyCategory, classifyProfileRelevance, classifyProfileRelevanceBatch, suggestBlogSettings, generateBlogPost, reviseBlogPost, generateLinkedInPost, reviseLinkedInPost };
