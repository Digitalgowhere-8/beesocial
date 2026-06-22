const express = require('express');
const mongoose = require('mongoose');
const Joi = require('joi');
const Article = require('../models/Article');
const BlogPost = require('../models/BlogPost');
const SocialPost = require('../models/SocialPost');
const { protect } = require('../middleware/auth');
const { generateBlogPost, generateLinkedInPost } = require('../services/aiService');

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

function articleTenantQuery(user) {
  if (user.role === 'super_admin') return {};
  return {
    $or: [
      { userId: tenantAdminId(user) },
      { userId: { $exists: false } },
      { userId: null }
    ]
  };
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
    article.tavilyAnswer,
    article.blogContext,
    article.blog_context,
    article.tavily_answer,
    article.summary,
    article.aiSummary
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 7000);
}

function monthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
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
  const tenantId = tenantAdminId(req.user);
  const since = monthStart();
  const blogLimit = Number(req.user?.limits?.blogGenerationsMonthly ?? 0);
  const socialLimit = Number(req.user?.limits?.socialPostsMonthly ?? 0);
  const tokenLimit = Number(req.user?.limits?.tokenBudgetMonthly ?? 0);

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
  style: styleSchema.default({}),
  keywords: Joi.array().items(Joi.string().max(80)).default([]),
  status: Joi.string().valid('draft', 'review').default('draft')
});

const linkedinOptionsSchema = Joi.object({
  postGoal: Joi.string().valid('thought_leadership', 'client_alert', 'market_insight', 'educational', 'lead_generation').default('thought_leadership'),
  tone: Joi.string().valid('professional', 'conversational', 'authoritative', 'friendly', 'educational', 'persuasive', 'technical', 'thought_leadership').default('professional'),
  audience: Joi.string().allow('').max(220).default('business decision-makers'),
  length: Joi.string().valid('short', 'medium', 'long').default('medium'),
  hookStyle: Joi.string().valid('proof', 'contrarian', 'personal_story', 'insight', 'question', 'stat', 'story').default('proof'),
  framework: Joi.string().valid('auto', 'SLAY', 'PAS', 'POV', '5-Line Mirror', 'AIDA').default('auto'),
  topicTier: Joi.string().valid('auto', 'Broad', 'Narrow', 'Niche').default('auto'),
  emotionalJob: Joi.string().valid('auto', 'Inspire', 'Educate', 'Provoke', 'Convert').default('auto'),
  personaProfile: Joi.string().allow('').max(500),
  icpPainPoints: Joi.string().allow('').max(2000),
  marketReality: Joi.string().allow('').max(2000),
  proofElement: Joi.string().allow('').max(500),
  authorityLine: Joi.string().allow('').max(500),
  takeaway: Joi.string().allow('').max(500),
  includeHashtags: Joi.boolean().default(true),
  includeCTA: Joi.boolean().default(true),
  cta: Joi.string().allow('').max(500),
  customInstructions: Joi.string().allow('').max(2500)
});

const generateLinkedInSchema = Joi.object({
  articleId: Joi.string().required(),
  options: linkedinOptionsSchema.default({})
});

const socialPostCreateSchema = Joi.object({
  sourceArticleId: Joi.string().allow('', null),
  platform: Joi.string().valid('linkedin', 'instagram', 'facebook').default('linkedin'),
  status: Joi.string().valid('draft', 'published', 'archived').default('draft'),
  selectedTopic: Joi.string().allow('').max(300),
  postText: Joi.string().min(2).max(10000).required(),
  hashtags: Joi.array().items(Joi.string().max(80)).default([]),
  framework: Joi.string().allow('').max(80),
  topicTier: Joi.string().allow('').max(80),
  emotionalJob: Joi.string().allow('').max(80),
  sourceSnapshot: Joi.object().unknown(true).default({}),
  options: Joi.object().unknown(true).default({})
});

const updateSchema = Joi.object({
  title: Joi.string().min(2).max(220),
  excerpt: Joi.string().allow('').max(600),
  bodyMarkdown: Joi.string().min(10).max(30000),
  status: Joi.string().valid('draft', 'review', 'published', 'archived'),
  style: styleSchema,
  keywords: Joi.array().items(Joi.string().max(80))
});

const bulkDeleteSchema = Joi.object({
  ids: Joi.array().items(Joi.string().required()).min(1).max(100).required()
});

router.get('/', protect, asyncHandler(async (req, res) => {
  const q = tenantQuery(req.user);
  if (!isBlogAdmin(req.user)) {
    q.status = 'published';
  } else if (req.query.status) {
    q.status = req.query.status;
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

router.post('/generate', protect, requireBlogAdmin, requireGenerationLimit, asyncHandler(async (req, res) => {
  const { error, value } = generateSchema.validate(req.body || {});
  if (error) return res.status(400).json({ message: error.message });
  if (!mongoose.Types.ObjectId.isValid(value.articleId)) {
    return res.status(400).json({ message: 'Invalid article id' });
  }

  const article = await Article.findOne({ _id: value.articleId, ...articleTenantQuery(req.user) }).lean();
  if (!article) return res.status(404).json({ message: 'Source topic not found' });

  const tenantId = tenantAdminId(req.user);
  const sourceContext = blogSourceContext(article);
  const generated = await generateBlogPost({
    article,
    style: value.style,
    keywords: value.keywords,
    company: { name: req.user.company || req.user.name }
  });
  const slug = await uniqueSlug(tenantId, generated.title);

  const item = await BlogPost.create({
    tenantAdminId: tenantId,
    createdBy: req.user._id,
    sourceArticleId: article._id,
    title: generated.title,
    slug,
    excerpt: generated.excerpt,
    bodyMarkdown: generated.bodyMarkdown,
    status: value.status,
    sourceSnapshot: {
      title: article.title,
      summary: article.summary || article.aiSummary || '',
      context: sourceContext,
      url: article.url,
      source: article.source,
      articleType: article.type,
      sourceQuery: article.sourceQuery || '',
      relevanceReason: article.relevanceReason || '',
      matchedInterests: Array.isArray(article.matchedInterests) ? article.matchedInterests : []
    },
    style: value.style,
    category: article.category || '',
    subcategory: article.subcategory || '',
    type: article.type || 'news',
    country: article.country || '',
    region: article.region || '',
    keywords: generated.suggestedKeywords || value.keywords,
    language: article.language || 'en',
    model: generated.model || '',
    generationPrompt: JSON.stringify({ style: value.style, keywords: value.keywords }),
    publishedAt: value.status === 'published' ? new Date() : undefined
  });

  res.status(201).json({ item });
}));

router.post('/linkedin/generate', protect, requireBlogAdmin, requireGenerationLimit, asyncHandler(async (req, res) => {
  const { error, value } = generateLinkedInSchema.validate(req.body || {});
  if (error) return res.status(400).json({ message: error.message });
  if (!mongoose.Types.ObjectId.isValid(value.articleId)) {
    return res.status(400).json({ message: 'Invalid article id' });
  }

  const article = await Article.findOne({ _id: value.articleId, ...articleTenantQuery(req.user) }).lean();
  if (!article) return res.status(404).json({ message: 'Source topic not found' });

  const generated = await generateLinkedInPost({
    article,
    options: value.options,
    company: { name: req.user.company || req.user.name }
  });

  const sourceSnapshot = {
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
  };

  const saved = await SocialPost.create({
    tenantAdminId: tenantAdminId(req.user),
    createdBy: req.user._id,
    sourceArticleId: article._id,
    platform: 'linkedin',
    status: 'draft',
    selectedTopic: generated.selectedTopic || article.title || '',
    postText: generated.postText,
    hashtags: generated.hashtags || [],
    framework: generated.framework || '',
    topicTier: generated.topicTier || '',
    emotionalJob: generated.emotionalJob || '',
    sourceSnapshot,
    options: value.options
  });

  res.status(201).json({
    item: {
      ...generated,
      _id: saved._id,
      status: saved.status,
      platform: saved.platform,
      saved: true,
      sourceSnapshot,
      options: value.options,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt
    }
  });
}));

router.get('/social-posts', protect, requireBlogAdmin, asyncHandler(async (req, res) => {
  const q = { ...tenantQuery(req.user) };
  if (req.query.platform) q.platform = req.query.platform;
  if (req.query.status) q.status = req.query.status;
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
  const items = await SocialPost.find(q).sort({ updatedAt: -1 }).limit(limit).lean();
  res.json({ items });
}));

router.post('/social-posts', protect, requireBlogAdmin, asyncHandler(async (req, res) => {
  const { error, value } = socialPostCreateSchema.validate(req.body || {});
  if (error) return res.status(400).json({ message: error.message });

  const item = await SocialPost.create({
    ...value,
    tenantAdminId: tenantAdminId(req.user),
    createdBy: req.user._id,
    sourceArticleId: mongoose.Types.ObjectId.isValid(value.sourceArticleId) ? value.sourceArticleId : undefined,
    publishedAt: value.status === 'published' ? new Date() : undefined
  });
  res.status(201).json({ item });
}));

router.get('/:id', protect, asyncHandler(async (req, res) => {
  const item = await BlogPost.findOne({ _id: req.params.id, ...tenantQuery(req.user) }).lean();
  if (!item) return res.status(404).json({ message: 'Blog not found' });
  if (!isBlogAdmin(req.user) && item.status !== 'published') {
    return res.status(404).json({ message: 'Blog not found' });
  }
  res.json({ item });
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
  res.json({ item });
}));

router.delete('/bulk', protect, requireBlogAdmin, asyncHandler(async (req, res) => {
  const { error, value } = bulkDeleteSchema.validate(req.body || {});
  if (error) return res.status(400).json({ message: error.message });

  const ids = value.ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (!ids.length) return res.status(400).json({ message: 'No valid blog ids provided' });

  const result = await BlogPost.deleteMany({ _id: { $in: ids }, ...tenantQuery(req.user) });
  res.json({ message: 'Deleted', deletedCount: result.deletedCount || 0, ids });
}));

router.delete('/:id', protect, requireBlogAdmin, asyncHandler(async (req, res) => {
  const item = await BlogPost.findOneAndDelete({ _id: req.params.id, ...tenantQuery(req.user) });
  if (!item) return res.status(404).json({ message: 'Blog not found' });
  res.json({ message: 'Deleted', id: req.params.id });
}));

module.exports = router;
