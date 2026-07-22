const express = require('express');
const mongoose = require('mongoose');
const Joi = require('joi');
const Article = require('../models/Article');
const BlogPost = require('../models/BlogPost');
const SocialPost = require('../models/SocialPost');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { generateBlogPost, reviseBlogPost, generateLinkedInPost, reviseLinkedInPost, suggestBlogSettings } = require('../services/aiService');
const { latestUsageResetAt, effectiveMonthlyStart } = require('../utils/usageReset');
const { publishTenantEvent } = require('../utils/realtime');
const { acquire } = require('../utils/concurrencyGate');
const genProgress = require('../services/generationProgress');
const { getSystemSettings } = require('../services/systemSettings');

const router = express.Router();
const ADMIN_ROLES = ['admin', 'super_admin'];
const AVG_TOKENS_PER_BLOG = Number(process.env.AVG_TOKENS_PER_BLOG || 5000);
const AVG_TOKENS_PER_SOCIAL_POST = Number(process.env.AVG_TOKENS_PER_SOCIAL_POST || 800);

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Escape special regex characters to prevent ReDoS attacks
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function requireBlogAdmin(req, res, next) {
  if (!hasBlogStudioAccess(req.user)) {
    return res.status(403).json({ message: 'Blog Studio access is disabled for this account.' });
  }
  next();
}

function hasContentRepositoryAccess(user) {
  if (user?.role === 'super_admin') return true;
  if (ADMIN_ROLES.includes(user?.role)) return user?.access?.canUseContentRepository !== false;
  return user?.access?.canUseContentRepository === true;
}

function requireContentRepository(req, res, next) {
  if (!hasContentRepositoryAccess(req.user)) {
    return res.status(403).json({ message: 'Content Repository access is disabled for this account.' });
  }
  next();
}

function hasBlogStudioAccess(user) {
  if (user?.role === 'super_admin') return true;
  if (ADMIN_ROLES.includes(user?.role)) return user?.access?.canUseBlogStudio !== false;
  return user?.access?.canUseBlogStudio === true;
}

function isBlogAdmin(user) {
  return hasBlogStudioAccess(user);
}

function tenantAdminId(user) {
  if (user.role === 'super_admin') return user._id;
  if (user.role === 'admin') return user._id;
  return user.tenantAdminId || user._id;
}

function tenantQuery(user) {
  return { tenantAdminId: tenantAdminId(user) };
}

function tenantScopeKey(user) {
  return String(tenantAdminId(user));
}

function articleTenantQuery(user) {
  if (user.role === 'super_admin') return {};
  return {
    $or: [
      { userId: tenantAdminId(user) },
      { userId: { $exists: false } },
      { userId: null },
      { isPublished: true }
    ]
  };
}

function canUseArticleAsSource(user, article) {
  if (!article) return false;
  if (user?.role === 'super_admin') return true;
  if (article.isPublished === true) return true;
  if (!article.userId) return true;
  return String(article.userId) === String(tenantAdminId(user));
}

async function findSourceArticleForBlog(user, articleId) {
  if (!mongoose.Types.ObjectId.isValid(articleId)) return null;
  const article = await Article.findById(articleId).lean();
  return canUseArticleAsSource(user, article) ? article : null;
}

async function resolveSourceArticleForBlog(user, articleId, source = {}) {
  const direct = await findSourceArticleForBlog(user, articleId);
  if (direct) return direct;

  const or = [];
  if (source.urlHash) or.push({ urlHash: source.urlHash });
  if (source.url) or.push({ url: source.url });
  if (source.title) or.push({ title: source.title });
  if (!or.length) return null;

  const candidates = await Article.find({ $or: or }).limit(8).lean();
  return candidates.find((item) => canUseArticleAsSource(user, item)) || null;
}

function slugify(value) {
  return String(value || 'blog-post')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'blog-post';
}

function blogSourceContext(article = {}) {
  return [
    article.rawContent,
    article.rawData?.rawContent,
    article.sourceAnswer,
    article.blogContext,
    article.blog_context,
    article.source_answer,
    article.summary,
    article.aiSummary
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 12000);
}

function compactSeoArticle(article = {}) {
  return {
    title: article.title || '',
    summary: article.summary || '',
    aiSummary: article.aiSummary || '',
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
    publishedAt: article.publishedAt || '',
    relevanceScore: article.relevanceScore || 0,
    relevanceReason: article.relevanceReason || '',
    matchedInterests: Array.isArray(article.matchedInterests) ? article.matchedInterests.slice(0, 8) : [],
    tags: Array.isArray(article.tags) ? article.tags.slice(0, 8) : []
  };
}

function seoSearchQuery({ article = {}, style = {}, country = '' }) {
  const summaryTerms = String(article.summary || article.aiSummary || '')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word.length > 3)
    .slice(0, 12)
    .join(' ');
  return [
    style.primaryKeyword,
    style.topic || article.title,
    article.sourceQuery,
    article.category,
    article.subcategory,
    country || article.country,
    Array.isArray(article.matchedInterests) ? article.matchedInterests.slice(0, 4).join(' ') : '',
    summaryTerms
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 360);
}

function compactSourceSnapshot(snapshot = {}) {
  return {
    title: String(snapshot.title || '').slice(0, 500),
    summary: String(snapshot.summary || '').slice(0, 1000),
    url: String(snapshot.url || '').slice(0, 2000),
    source: String(snapshot.source || '').slice(0, 160),
    articleType: String(snapshot.articleType || snapshot.type || '').slice(0, 80),
    category: String(snapshot.category || '').slice(0, 160),
    subcategory: String(snapshot.subcategory || '').slice(0, 160),
    country: String(snapshot.country || '').slice(0, 80),
    region: String(snapshot.region || '').slice(0, 120),
    sourceQuery: String(snapshot.sourceQuery || '').slice(0, 300),
    relevanceReason: String(snapshot.relevanceReason || '').slice(0, 500),
    matchedInterests: Array.isArray(snapshot.matchedInterests) ? snapshot.matchedInterests.slice(0, 8) : []
  };
}

function blockedTopicMatch({ article = {}, userInput = {}, filtering = {} }) {
  const blockedTopics = Array.isArray(filtering.blockedTopics) ? filtering.blockedTopics : [];
  if (!filtering.blockUnsafeContent || !blockedTopics.length) return '';
  const haystack = [
    article.title,
    article.summary,
    article.aiSummary,
    article.category,
    article.subcategory,
    article.type,
    JSON.stringify(userInput || {})
  ].map((value) => String(value || '').toLowerCase()).join('\n');

  return blockedTopics.find((topic) => {
    const normalized = String(topic || '').trim().toLowerCase();
    return normalized && haystack.includes(normalized);
  }) || '';
}

function limitReachedPayload({ message, limitType, used, limit }) {
  return {
    code: 'LIMIT_REACHED',
    message,
    limitType,
    used: Number(used || 0),
    limit: Number(limit || 0),
    upgradePath: `/premium?limit=${encodeURIComponent(limitType || 'usage')}`
  };
}

async function requireGenerationLimit(req, res, next) {
  if (req.user?.role === 'super_admin') return next();

  let adminUser = req.user;
  if (req.user?.role === 'user' && req.user?.tenantAdminId) {
    const fetchedAdmin = await User.findById(req.user.tenantAdminId);
    if (fetchedAdmin) {
      adminUser = fetchedAdmin;
    }
  }

  const tenantId = adminUser._id;
  const teamUsers = await User.find({ $or: [{ _id: tenantId }, { tenantAdminId: tenantId }] }).select('_id usageResetAt').lean();
  const resetAt = latestUsageResetAt(teamUsers);
  const since = effectiveMonthlyStart(resetAt);
  const blogLimit = Number(adminUser?.limits?.blogGenerationsMonthly ?? 0);
  const socialLimit = Number(adminUser?.limits?.socialPostsMonthly ?? 0);
  const tokenLimit = Number(adminUser?.limits?.tokenBudgetMonthly ?? 0);

  if (req.path === '/generate' && blogLimit > 0) {
    const used = await BlogPost.countDocuments({ tenantAdminId: tenantId, createdAt: { $gte: since } });
    if (used >= blogLimit) {
      return res.status(402).json(limitReachedPayload({
        limitType: 'blogGenerationsMonthly',
        used,
        limit: blogLimit,
        message: `Monthly blog generation limit reached (${used}/${blogLimit}). Upgrade to generate more blogs.`
      }));
    }
  }

  if (req.path === '/linkedin/generate' && socialLimit > 0) {
    const used = await SocialPost.countDocuments({ tenantAdminId: tenantId, createdAt: { $gte: since } });
    if (used >= socialLimit) {
      return res.status(402).json(limitReachedPayload({
        limitType: 'socialPostsMonthly',
        used,
        limit: socialLimit,
        message: `Monthly post generation limit reached (${used}/${socialLimit}). Upgrade to generate more posts.`
      }));
    }
  }

  if (tokenLimit > 0) {
    const [blogCount, socialCount] = await Promise.all([
      BlogPost.countDocuments({ tenantAdminId: tenantId, createdAt: { $gte: since } }),
      SocialPost.countDocuments({ tenantAdminId: tenantId, createdAt: { $gte: since } })
    ]);
    const used = (blogCount * AVG_TOKENS_PER_BLOG) + (socialCount * AVG_TOKENS_PER_SOCIAL_POST);
    const nextCost = req.path === '/generate' ? AVG_TOKENS_PER_BLOG : AVG_TOKENS_PER_SOCIAL_POST;
    if (used + nextCost > tokenLimit) {
      return res.status(402).json(limitReachedPayload({
        limitType: 'tokenBudgetMonthly',
        used,
        limit: tokenLimit,
        message: `Monthly token budget is too low for this generation (${used}/${tokenLimit}). Upgrade to continue.`
      }));
    }
  }

  next();
}

async function uniqueSlug(tenantId, title, excludeId = null) {
  const base = slugify(title);
  let slug = base;
  let counter = 2;
  const query = { tenantAdminId: tenantId, slug };
  if (excludeId) query._id = { $ne: excludeId };
  while (await BlogPost.exists(query)) {
    slug = `${base}-${counter}`;
    query.slug = slug;
    counter += 1;
  }
  return slug;
}

const styleSchema = Joi.object({
  topic: Joi.string().allow('').max(300),
  tone: Joi.string().valid('professional', 'conversational', 'authoritative', 'friendly', 'educational', 'persuasive', 'technical', 'thought_leadership', 'advisory', 'executive', 'sales_enablement').default('professional'),
  format: Joi.string().valid('insight_article', 'how_to_guide', 'case_study', 'news_updates', 'comparison_article', 'beginners_guide', 'editorial', 'service_product_blog', 'faq_article', 'guide', 'client_alert', 'thought_leadership', 'linkedin_article', 'newsletter').default('insight_article'),
  audience: Joi.string().allow('').max(160).default('business decision-makers'),
  length: Joi.string().valid('short', 'medium', 'long', 'custom').default('medium'),
  customLength: Joi.string().allow('').max(80),
  pointOfView: Joi.string().valid('third_person', 'first_person_company').default('third_person'),
  metaTitle: Joi.string().allow('').max(120),
  metaDescription: Joi.string().allow('').max(220),
  primaryKeyword: Joi.string().allow('').max(120),
  searchIntent: Joi.string().valid('informational', 'commercial', 'transactional', 'navigational').default('informational'),
  outlineMode: Joi.string().valid('auto', 'custom').default('auto'),
  customOutline: Joi.string().allow('').max(3000),
  focusPage: Joi.string().allow('').max(200),
  internalLinkPages: Joi.string().allow('').max(1200),
  ctaTitle: Joi.string().allow('').max(160),
  ctaDescription: Joi.string().allow('').max(500),
  ctaButtonText: Joi.string().allow('').max(80),
  ctaUrl: Joi.string().allow('').max(500),
  cta: Joi.string().allow('').max(500).default(''),
  keyPoints: Joi.string().allow('').max(3000),
  competitorUrls: Joi.string().allow('').max(1200),
  referenceUrls: Joi.string().allow('').max(1200),
  includeFaq: Joi.boolean().default(true),
  includeStats: Joi.boolean().default(true)
});

const generateSchema = Joi.object({
  articleId: Joi.string().required(),
  sourceArticle: Joi.object().unknown(true).default({}),
  style: styleSchema.default({}),
  keywords: Joi.array().items(Joi.string().max(80)).default([]),
  status: Joi.string().valid('review', 'published').default('review')
});

const suggestSettingsSchema = Joi.object({
  articleId: Joi.string().required(),
  sourceArticle: Joi.object().unknown(true).default({}),
  style: styleSchema.default({}),
  country: Joi.string().allow('').max(80),
  limit: Joi.number().integer().min(1).max(8).default(5)
});

const linkedinOptionsSchema = Joi.object({
  profileType: Joi.string().valid('company', 'personal').default('company'),
  profileUrl: Joi.string().allow('').max(500),
  postGoal: Joi.string().valid('thought_leadership', 'client_alert', 'market_insight', 'educational', 'lead_generation').default('thought_leadership'),
  tone: Joi.string().valid('professional', 'conversational', 'authoritative', 'friendly', 'educational', 'persuasive', 'technical', 'thought_leadership').default('professional'),
  audience: Joi.string().allow('').max(220).default('business decision-makers'),
  length: Joi.string().valid('short', 'medium', 'long').default('medium'),
  hookStyle: Joi.string().valid('proof', 'warning', 'contrarian', 'personal_story', 'insight', 'question', 'stat', 'story').default('proof'),
  framework: Joi.string().valid('auto', 'SLAY', 'PAS', 'PRA', 'POV', '5-Line Mirror', 'AIDA').default('auto'),
  topicTier: Joi.string().valid('auto', 'Broad', 'Practical', 'Narrow', 'Niche').default('auto'),
  emotionalJob: Joi.string().valid('auto', 'Inspire', 'Educate', 'Urgency', 'Reassure', 'Provoke', 'Convert').default('auto'),
  personaProfile: Joi.string().allow('').max(500),
  icpPainPoints: Joi.string().allow('').max(2000),
  marketReality: Joi.string().allow('').max(2000),
  proofElement: Joi.string().allow('').max(500),
  takeaway: Joi.string().allow('').max(500),
  includeHashtags: Joi.boolean().default(true),
  includeCTA: Joi.boolean().default(true),
  cta: Joi.string().allow('').max(500),
  customInstructions: Joi.string().allow('').max(2500)
});

const generateLinkedInSchema = Joi.object({
  articleId: Joi.string().required(),
  sourceArticle: Joi.object().unknown(true).default({}),
  options: linkedinOptionsSchema.default({})
});

const socialPostCreateSchema = Joi.object({
  sourceArticleId: Joi.string().allow('', null),
  platform: Joi.string().valid('linkedin', 'instagram', 'facebook').default('linkedin'),
  status: Joi.string().valid('review', 'published', 'archived').default('published'),
  selectedTopic: Joi.string().allow('').max(300),
  postText: Joi.string().min(2).max(10000).required(),
  hashtags: Joi.array().items(Joi.string().max(80)).default([]),
  framework: Joi.string().allow('').max(80),
  topicTier: Joi.string().allow('').max(80),
  emotionalJob: Joi.string().allow('').max(80),
  sourceSnapshot: Joi.object().unknown(true).default({}),
  options: Joi.object().unknown(true).default({})
});

const socialPostUpdateSchema = Joi.object({
  selectedTopic: Joi.string().allow('').max(300),
  postText: Joi.string().min(2).max(10000),
  hashtags: Joi.array().items(Joi.string().max(80)),
  status: Joi.string().valid('review', 'published', 'archived')
});

const updateSchema = Joi.object({
  title: Joi.string().min(2).max(220),
  excerpt: Joi.string().allow('').max(600),
  bodyMarkdown: Joi.string().min(10).max(30000),
  status: Joi.string().valid('review', 'published', 'archived'),
  style: styleSchema,
  keywords: Joi.array().items(Joi.string().max(80))
});

const reviseSchema = Joi.object({
  feedback: Joi.string().trim().min(3).max(2500).required(),
  previewOnly: Joi.boolean().default(false)
});

const reviewCommentSchema = Joi.object({
  text: Joi.string().trim().min(2).max(2000).required(),
  selectedText: Joi.string().allow('').trim().max(1000).default(''),
  beforeText: Joi.string().allow('').trim().max(500).default(''),
  afterText: Joi.string().allow('').trim().max(500).default('')
});

const reviewCommentUpdateSchema = Joi.object({
  text: Joi.string().trim().min(2).max(2000),
  resolved: Joi.boolean()
}).min(1);

const bulkDeleteSchema = Joi.object({
  ids: Joi.array().items(Joi.string().required()).min(1).max(100).required()
});

router.get('/', protect, requireContentRepository, asyncHandler(async (req, res) => {
  const q = tenantQuery(req.user);
  if (!isBlogAdmin(req.user)) {
    q.status = 'published';
  } else if (req.query.status) {
    const statuses = String(req.query.status)
      .split(',')
      .map((status) => status.trim())
      .filter((status) => ['review', 'published', 'archived'].includes(status));
    if (statuses.length > 1) {
      q.status = { $in: statuses };
    } else if (statuses.length === 1) {
      q.status = statuses[0];
    }
  }
  if (req.query.type) q.type = req.query.type;
  if (req.query.category) q.category = req.query.category;
  if (req.query.q) q.title = { $regex: escapeRegex(String(req.query.q).trim()), $options: 'i' };

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 60);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    BlogPost.find(q).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    BlogPost.countDocuments(q)
  ]);

  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
}));

// GET /blogs/generation-status — returns the active generation state for the calling tenant
router.get('/generation-status', protect, requireBlogAdmin, asyncHandler(async (req, res) => {
  const tenantId = tenantAdminId(req.user);
  const state = genProgress.getGeneration(String(tenantId));
  res.json(state || { status: 'idle' });
}));

// POST /blogs/generation-clear — clear status after frontend has handled the completed/failed state
router.post('/generation-clear', protect, requireBlogAdmin, asyncHandler(async (req, res) => {
  const tenantId = tenantAdminId(req.user);
  genProgress.finishGeneration(String(tenantId));
  res.json({ ok: true });
}));

// POST /blogs/cancel — cancel any in-flight generation for the calling tenant
router.post('/cancel', protect, requireBlogAdmin, asyncHandler(async (req, res) => {
  const tenantId = tenantAdminId(req.user);
  genProgress.cancelGeneration(String(tenantId));
  res.json({ ok: true, message: 'Generation cancellation requested.' });
}));

router.post('/suggest-settings', protect, requireBlogAdmin, asyncHandler(async (req, res) => {
  const { error, value } = suggestSettingsSchema.validate(req.body || {});
  if (error) return res.status(400).json({ message: error.message });
  if (!mongoose.Types.ObjectId.isValid(value.articleId)) {
    return res.status(400).json({ message: 'Invalid article id' });
  }

  const article = await resolveSourceArticleForBlog(req.user, value.articleId, value.sourceArticle);
  if (!article) return res.status(404).json({ message: 'Source topic not found' });

  const systemSettings = await getSystemSettings();
  const contentStudioAi = systemSettings.contentStudioAi || {};
  if (contentStudioAi.enabled === false) {
    return res.status(503).json({ message: 'Content Studio AI suggestions are currently disabled by the super admin.' });
  }

  const seoArticle = compactSeoArticle(article);
  let research = [];

  const suggestions = await suggestBlogSettings({
    article: seoArticle,
    style: value.style,
    research,
    company: { name: req.user.company || req.user.name },
    aiConfig: contentStudioAi.blog || {}
  });

  res.json({
    item: suggestions,
    researchAvailable: research.length > 0,
    researchProvider: 'article'
  });
}));

router.post('/generate', protect, requireBlogAdmin, requireGenerationLimit, asyncHandler(async (req, res) => {
  const { error, value } = generateSchema.validate(req.body || {});
  if (error) return res.status(400).json({ message: error.message });
  if (!mongoose.Types.ObjectId.isValid(value.articleId)) {
    return res.status(400).json({ message: 'Invalid article id' });
  }

  const article = await resolveSourceArticleForBlog(req.user, value.articleId, value.sourceArticle);
  if (!article) return res.status(404).json({ message: 'Source topic not found' });

  const tenantId = tenantAdminId(req.user);
  const systemSettings = await getSystemSettings();
  const contentStudioAi = systemSettings.contentStudioAi || {};
  if (contentStudioAi.enabled === false) {
    return res.status(503).json({ message: 'Content Studio AI generation is currently disabled by the super admin.' });
  }
  const blockedTopic = blockedTopicMatch({ article, userInput: { style: value.style, keywords: value.keywords }, filtering: contentStudioAi.filtering });
  if (blockedTopic) {
    return res.status(400).json({ message: `This topic is blocked by Content Studio AI policy: ${blockedTopic}` });
  }

  // Reject if a generation is already running for this tenant
  const existing = genProgress.getGeneration(String(tenantId));
  if (existing && existing.status === 'running') {
    return res.status(409).json({ message: 'A generation is already in progress. Please wait for it to finish or cancel it first.' });
  }

  genProgress.startGeneration(String(tenantId), 'blog');
  const release = acquire('blog', tenantScopeKey(req.user));
  const userObj = req.user;

  setImmediate(async () => {
    try {
      // Check for cancellation before the expensive AI call
      if (genProgress.isCancelled(String(tenantId))) {
        return;
      }

      const generated = await generateBlogPost({
        article,
        style: value.style,
        keywords: value.keywords,
        company: { name: userObj.company || userObj.name },
        aiConfig: { ...contentStudioAi.blog, filtering: contentStudioAi.filtering }
      });

      // Check again after the AI call returns
      if (genProgress.isCancelled(String(tenantId))) {
        return;
      }

      const slug = await uniqueSlug(tenantId, generated.title);

      const generatedStatus = contentStudioAi.blog?.requireReview ? 'review' : 'published';
      const item = await BlogPost.create({
        tenantAdminId: tenantId,
        createdBy: userObj._id,
        sourceArticleId: article._id,
        title: generated.title,
        slug,
        excerpt: generated.excerpt,
        bodyMarkdown: generated.bodyMarkdown,
        status: generatedStatus,
        sourceSnapshot: compactSourceSnapshot({
          title: article.title,
          summary: article.summary || article.aiSummary || '',
          url: article.url,
          source: article.source,
          articleType: article.type,
          sourceQuery: article.sourceQuery || '',
          relevanceReason: article.relevanceReason || '',
          matchedInterests: Array.isArray(article.matchedInterests) ? article.matchedInterests : []
        }),
        style: value.style,
        category: article.category || '',
        subcategory: article.subcategory || '',
        type: article.type || 'news',
        country: article.country || '',
        region: article.region || '',
        keywords: generated.suggestedKeywords || value.keywords,
        language: article.language || 'en',
        model: generated.model || '',
        publishedAt: generatedStatus === 'published' ? new Date() : undefined
      });

      publishTenantEvent(String(tenantId), 'content', {
        scope: 'blogs',
        action: 'generated',
        id: String(item._id)
      });

      genProgress.completeGeneration(String(tenantId), String(item._id));
    } catch (err) {
      console.error('[Async Blog Gen Error]', err);
      genProgress.failGeneration(String(tenantId), err.message || 'Blog generation failed');
    } finally {
      release();
    }
  });

  res.status(202).json({ ok: true, status: 'running', message: 'Blog generation started in background' });
}));

router.post('/linkedin/generate', protect, requireBlogAdmin, requireGenerationLimit, asyncHandler(async (req, res) => {
  const { error, value } = generateLinkedInSchema.validate(req.body || {});
  if (error) return res.status(400).json({ message: error.message });
  if (!mongoose.Types.ObjectId.isValid(value.articleId)) {
    return res.status(400).json({ message: 'Invalid article id' });
  }

  const article = await resolveSourceArticleForBlog(req.user, value.articleId, value.sourceArticle);
  if (!article) return res.status(404).json({ message: 'Source topic not found' });

  const tenantId = tenantAdminId(req.user);
  const systemSettings = await getSystemSettings();
  const contentStudioAi = systemSettings.contentStudioAi || {};
  if (contentStudioAi.enabled === false) {
    return res.status(503).json({ message: 'Content Studio AI generation is currently disabled by the super admin.' });
  }
  const blockedTopic = blockedTopicMatch({ article, userInput: value.options, filtering: contentStudioAi.filtering });
  if (blockedTopic) {
    return res.status(400).json({ message: `This topic is blocked by Content Studio AI policy: ${blockedTopic}` });
  }

  // Reject if a generation is already running for this tenant
  const existingGen = genProgress.getGeneration(String(tenantId));
  if (existingGen && existingGen.status === 'running') {
    return res.status(409).json({ message: 'A generation is already in progress. Please wait for it to finish or cancel it first.' });
  }

  genProgress.startGeneration(String(tenantId), 'linkedin');
  const release = acquire('social', tenantScopeKey(req.user));
  const userObj = req.user;

  setImmediate(async () => {
    try {
      if (genProgress.isCancelled(String(tenantId))) {
        return;
      }

      const generated = await generateLinkedInPost({
        article,
        options: value.options,
        company: { name: userObj.company || userObj.name },
        aiConfig: { ...contentStudioAi.linkedin, filtering: contentStudioAi.filtering }
      });

      if (genProgress.isCancelled(String(tenantId))) {
        return;
      }

      const sourceSnapshot = compactSourceSnapshot({
        title: article.title,
        summary: article.summary || article.aiSummary || '',
        url: article.url,
        source: article.source,
        articleType: article.type,
        category: article.category || '',
        subcategory: article.subcategory || '',
        country: article.country || '',
        region: article.region || '',
        relevanceReason: article.relevanceReason || ''
      });

      const resultPayload = {
        ...generated,
        sourceArticleId: article._id,
        status: contentStudioAi.linkedin?.requireReview ? 'review' : 'published',
        platform: 'linkedin',
        saved: false,
        sourceSnapshot,
        options: value.options,
        reviewRequired: Boolean(contentStudioAi.linkedin?.requireReview),
        aiControls: {
          model: contentStudioAi.linkedin?.model || generated.model || '',
          temperature: contentStudioAi.linkedin?.temperature,
          maxWords: contentStudioAi.linkedin?.maxWords,
          filtering: contentStudioAi.filtering || {}
        }
      };

      genProgress.completeGeneration(String(tenantId), null, resultPayload);
      publishTenantEvent(String(tenantId), 'content', {
        scope: 'social',
        action: 'generated',
        data: resultPayload
      });
    } catch (err) {
      console.error('[Async LinkedIn Gen Error]', err);
      genProgress.failGeneration(String(tenantId), err.message || 'LinkedIn post generation failed');
    } finally {
      release();
    }
  });

  res.status(202).json({ ok: true, status: 'running', message: 'LinkedIn post generation started in background' });
}));

router.get('/social-posts', protect, requireBlogAdmin, asyncHandler(async (req, res) => {
  const q = { ...tenantQuery(req.user) };
  if (req.query.platform) q.platform = req.query.platform;
  if (req.query.status) q.status = req.query.status;
  if (req.query.q) q.postText = { $regex: escapeRegex(String(req.query.q).trim()), $options: 'i' };
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    SocialPost.find(q).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    SocialPost.countDocuments(q)
  ]);
  res.json({
    items,
    page,
    limit,
    total,
    pages: Math.ceil(total / limit)
  });
}));

router.post('/social-posts', protect, requireBlogAdmin, asyncHandler(async (req, res) => {
  const { error, value } = socialPostCreateSchema.validate(req.body || {});
  if (error) return res.status(400).json({ message: error.message });

  const item = await SocialPost.create({
    ...value,
    sourceSnapshot: compactSourceSnapshot(value.sourceSnapshot),
    tenantAdminId: tenantAdminId(req.user),
    createdBy: req.user._id,
    sourceArticleId: mongoose.Types.ObjectId.isValid(value.sourceArticleId) ? value.sourceArticleId : undefined,
    publishedAt: value.status === 'published' ? new Date() : undefined
  });
  publishTenantEvent(String(tenantAdminId(req.user)), 'content', {
    scope: 'social',
    action: 'created',
    id: String(item._id)
  });
  res.status(201).json({ item });
}));

router.patch('/social-posts/:id', protect, requireBlogAdmin, asyncHandler(async (req, res) => {
  const { error, value } = socialPostUpdateSchema.validate(req.body || {});
  if (error) return res.status(400).json({ message: error.message });

  const update = { ...value };
  if (value.status === 'published') update.publishedAt = new Date();

  const item = await SocialPost.findOneAndUpdate(
    { _id: req.params.id, ...tenantQuery(req.user) },
    { $set: update },
    { new: true }
  ).lean();
  if (!item) return res.status(404).json({ message: 'Social post not found' });

  publishTenantEvent(String(tenantAdminId(req.user)), 'content', {
    scope: 'social',
    action: 'updated',
    id: String(item._id)
  });
  res.json({ item });
}));

router.post('/social-posts/:id/revise', protect, requireBlogAdmin, asyncHandler(async (req, res) => {
  const { error, value } = reviseSchema.validate(req.body || {});
  if (error) return res.status(400).json({ message: error.message });

  const post = await SocialPost.findOne({ _id: req.params.id, ...tenantQuery(req.user) }).lean();
  if (!post) return res.status(404).json({ message: 'Social post not found' });
  const sourceArticle = post.sourceArticleId
    ? await findSourceArticleForBlog(req.user, post.sourceArticleId)
    : null;

  const systemSettings = await getSystemSettings();
  const contentStudioAi = systemSettings.contentStudioAi || {};
  if (contentStudioAi.enabled === false) {
    return res.status(503).json({ message: 'Content Studio AI revision is currently disabled by the super admin.' });
  }

  const revised = await reviseLinkedInPost({
    post,
    sourceArticle,
    feedback: value.feedback,
    company: { name: req.user.company || req.user.name },
    aiConfig: { ...contentStudioAi.linkedin, filtering: contentStudioAi.filtering }
  });

  if (value.previewOnly) {
    return res.json({
      item: {
        ...post,
        selectedTopic: revised.selectedTopic || post.selectedTopic || '',
        postText: revised.postText || post.postText || '',
        hashtags: revised.hashtags || post.hashtags || [],
        framework: revised.framework || post.framework || '',
        topicTier: revised.topicTier || post.topicTier || '',
        emotionalJob: revised.emotionalJob || post.emotionalJob || ''
      }
    });
  }

  const item = await SocialPost.findOneAndUpdate(
    { _id: req.params.id, ...tenantQuery(req.user) },
    { $set: {
      selectedTopic: revised.selectedTopic || post.selectedTopic || '',
      postText: revised.postText || post.postText || '',
      hashtags: revised.hashtags || post.hashtags || [],
      framework: revised.framework || post.framework || '',
      topicTier: revised.topicTier || post.topicTier || '',
      emotionalJob: revised.emotionalJob || post.emotionalJob || ''
    } },
    { new: true }
  ).lean();
  if (!item) return res.status(404).json({ message: 'Social post not found' });

  publishTenantEvent(String(tenantAdminId(req.user)), 'content', {
    scope: 'social',
    action: 'revised',
    id: String(item._id)
  });
  res.json({ item });
}));

router.delete('/social-posts/bulk', protect, requireBlogAdmin, asyncHandler(async (req, res) => {
  const { error, value } = bulkDeleteSchema.validate(req.body || {});
  if (error) return res.status(400).json({ message: error.message });

  const ids = value.ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (!ids.length) return res.status(400).json({ message: 'No valid social post ids provided' });

  const result = await SocialPost.deleteMany({ _id: { $in: ids }, ...tenantQuery(req.user) });
  publishTenantEvent(String(tenantAdminId(req.user)), 'content', {
    scope: 'social',
    action: 'deleted',
    ids: ids.map(String)
  });
  res.json({ message: 'Deleted', deletedCount: result.deletedCount || 0, ids });
}));

router.delete('/social-posts/:id', protect, requireBlogAdmin, asyncHandler(async (req, res) => {
  const item = await SocialPost.findOneAndDelete({ _id: req.params.id, ...tenantQuery(req.user) });
  if (!item) return res.status(404).json({ message: 'Social post not found' });
  publishTenantEvent(String(tenantAdminId(req.user)), 'content', {
    scope: 'social',
    action: 'deleted',
    id: String(item._id)
  });
  res.json({ message: 'Deleted', id: req.params.id });
}));

router.get('/:id', protect, requireContentRepository, asyncHandler(async (req, res) => {
  const item = await BlogPost.findOne({ _id: req.params.id, ...tenantQuery(req.user) }).lean();
  if (!item) return res.status(404).json({ message: 'Blog not found' });
  if (!isBlogAdmin(req.user) && item.status !== 'published') {
    return res.status(404).json({ message: 'Blog not found' });
  }
  res.json({ item });
}));

router.post('/:id/comments', protect, requireContentRepository, asyncHandler(async (req, res) => {
  const { error, value } = reviewCommentSchema.validate(req.body || {});
  if (error) return res.status(400).json({ message: error.message });

  const blog = await BlogPost.findOne({ _id: req.params.id, ...tenantQuery(req.user) });
  if (!blog) return res.status(404).json({ message: 'Blog not found' });
  if (!isBlogAdmin(req.user) && blog.status !== 'published') {
    return res.status(404).json({ message: 'Blog not found' });
  }

  blog.reviewComments.push({
    text: value.text,
    selectedText: value.selectedText || '',
    beforeText: value.beforeText || '',
    afterText: value.afterText || '',
    authorId: req.user._id,
    authorName: req.user.name || req.user.email || 'Reviewer',
    createdAt: new Date()
  });
  await blog.save();

  const item = blog.toObject();
  publishTenantEvent(String(tenantAdminId(req.user)), 'content', {
    scope: 'blogs',
    action: 'commented',
    id: String(item._id)
  });
  res.status(201).json({ item, comment: item.reviewComments[item.reviewComments.length - 1] });
}));

router.patch('/:id/comments/:commentId', protect, requireContentRepository, asyncHandler(async (req, res) => {
  const { error, value } = reviewCommentUpdateSchema.validate(req.body || {});
  if (error) return res.status(400).json({ message: error.message });

  const blog = await BlogPost.findOne({ _id: req.params.id, ...tenantQuery(req.user) });
  if (!blog) return res.status(404).json({ message: 'Blog not found' });
  if (!isBlogAdmin(req.user) && blog.status !== 'published') {
    return res.status(404).json({ message: 'Blog not found' });
  }

  const comment = blog.reviewComments.id(req.params.commentId);
  if (!comment) return res.status(404).json({ message: 'Comment not found' });

  const canEdit = isBlogAdmin(req.user) || String(comment.authorId || '') === String(req.user._id);
  if (!canEdit) {
    return res.status(403).json({ message: 'You can only update your own comments.' });
  }

  if (typeof value.text === 'string') comment.text = value.text;
  if (typeof value.resolved === 'boolean') {
    comment.resolved = value.resolved;
    comment.resolvedAt = value.resolved ? new Date() : null;
  }
  await blog.save();

  const item = blog.toObject();
  publishTenantEvent(String(tenantAdminId(req.user)), 'content', {
    scope: 'blogs',
    action: 'comment-updated',
    id: String(item._id)
  });
  res.json({ item, comment: item.reviewComments.find((entry) => String(entry._id) === String(req.params.commentId)) });
}));

router.delete('/:id/comments/:commentId', protect, requireContentRepository, asyncHandler(async (req, res) => {
  const blog = await BlogPost.findOne({ _id: req.params.id, ...tenantQuery(req.user) });
  if (!blog) return res.status(404).json({ message: 'Blog not found' });
  if (!isBlogAdmin(req.user) && blog.status !== 'published') {
    return res.status(404).json({ message: 'Blog not found' });
  }

  const comment = blog.reviewComments.id(req.params.commentId);
  if (!comment) return res.status(404).json({ message: 'Comment not found' });

  const canDelete = isBlogAdmin(req.user) || String(comment.authorId || '') === String(req.user._id);
  if (!canDelete) {
    return res.status(403).json({ message: 'You can only delete your own comments.' });
  }

  comment.deleteOne();
  await blog.save();

  const item = blog.toObject();
  publishTenantEvent(String(tenantAdminId(req.user)), 'content', {
    scope: 'blogs',
    action: 'comment-deleted',
    id: String(item._id)
  });
  res.json({ item, deletedCommentId: req.params.commentId });
}));

router.patch('/:id', protect, requireBlogAdmin, asyncHandler(async (req, res) => {
  const { error, value } = updateSchema.validate(req.body || {});
  if (error) return res.status(400).json({ message: error.message });

  const update = { ...value };
  if (value.status === 'published') update.publishedAt = new Date();
  if (value.title) update.slug = await uniqueSlug(tenantAdminId(req.user), value.title, req.params.id);

  const item = await BlogPost.findOneAndUpdate(
    { _id: req.params.id, ...tenantQuery(req.user) },
    { $set: update },
    { new: true }
  ).lean();
  if (!item) return res.status(404).json({ message: 'Blog not found' });
  publishTenantEvent(String(tenantAdminId(req.user)), 'content', {
    scope: 'blogs',
    action: 'updated',
    id: String(item._id)
  });
  res.json({ item });
}));

router.post('/:id/revise', protect, requireBlogAdmin, asyncHandler(async (req, res) => {
  const { error, value } = reviseSchema.validate(req.body || {});
  if (error) return res.status(400).json({ message: error.message });

  const blog = await BlogPost.findOne({ _id: req.params.id, ...tenantQuery(req.user) }).lean();
  if (!blog) return res.status(404).json({ message: 'Blog not found' });
  const sourceArticle = blog.sourceArticleId
    ? await findSourceArticleForBlog(req.user, blog.sourceArticleId)
    : null;

  const systemSettings = await getSystemSettings();
  const contentStudioAi = systemSettings.contentStudioAi || {};
  if (contentStudioAi.enabled === false) {
    return res.status(503).json({ message: 'Content Studio AI revision is currently disabled by the super admin.' });
  }

  const revised = await reviseBlogPost({
    blog,
    sourceArticle,
    feedback: value.feedback,
    company: { name: req.user.company || req.user.name },
    aiConfig: { ...contentStudioAi.blog, filtering: contentStudioAi.filtering }
  });

  const update = {
    title: revised.title,
    excerpt: revised.excerpt,
    bodyMarkdown: revised.bodyMarkdown,
    keywords: revised.suggestedKeywords || blog.keywords || [],
    model: revised.model || blog.model || ''
  };
  update.slug = await uniqueSlug(tenantAdminId(req.user), revised.title, req.params.id);

  if (value.previewOnly) {
    return res.json({
      item: {
        ...blog,
        ...update
      }
    });
  }

  const item = await BlogPost.findOneAndUpdate(
    { _id: req.params.id, ...tenantQuery(req.user) },
    { $set: update },
    { new: true }
  ).lean();
  if (!item) return res.status(404).json({ message: 'Blog not found' });

  publishTenantEvent(String(tenantAdminId(req.user)), 'content', {
    scope: 'blogs',
    action: 'revised',
    id: String(item._id)
  });

  res.json({ item });
}));

router.delete('/bulk', protect, requireBlogAdmin, asyncHandler(async (req, res) => {
  const { error, value } = bulkDeleteSchema.validate(req.body || {});
  if (error) return res.status(400).json({ message: error.message });

  const ids = value.ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (!ids.length) return res.status(400).json({ message: 'No valid blog ids provided' });

  const result = await BlogPost.deleteMany({ _id: { $in: ids }, ...tenantQuery(req.user) });
  publishTenantEvent(String(tenantAdminId(req.user)), 'content', {
    scope: 'blogs',
    action: 'deleted',
    ids: ids.map(String)
  });
  res.json({ message: 'Deleted', deletedCount: result.deletedCount || 0, ids });
}));

router.delete('/:id', protect, requireBlogAdmin, asyncHandler(async (req, res) => {
  const item = await BlogPost.findOneAndDelete({ _id: req.params.id, ...tenantQuery(req.user) });
  if (!item) return res.status(404).json({ message: 'Blog not found' });
  publishTenantEvent(String(tenantAdminId(req.user)), 'content', {
    scope: 'blogs',
    action: 'deleted',
    id: String(item._id)
  });
  res.json({ message: 'Deleted', id: req.params.id });
}));

module.exports = router;
