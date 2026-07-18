const mongoose = require('mongoose');

const blogPostSchema = new mongoose.Schema(
  {
    tenantAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sourceArticleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', index: true },

    title: { type: String, required: true, trim: true, maxlength: 220 },
    slug: { type: String, required: true, trim: true, maxlength: 260 },
    excerpt: { type: String, default: '', trim: true, maxlength: 600 },
    bodyMarkdown: { type: String, required: true, maxlength: 30000 },

    status: {
      type: String,
      enum: ['draft', 'review', 'published', 'archived'],
      default: 'review',
      index: true
    },

    sourceSnapshot: {
      type: new mongoose.Schema(
        {
          title: { type: String, default: '' },
          summary: { type: String, default: '' },
          context: { type: String, default: '' },
          url: { type: String, default: '' },
          source: { type: String, default: '' },
          articleType: { type: String, default: '' },
          sourceQuery: { type: String, default: '' },
          relevanceReason: { type: String, default: '' },
          matchedInterests: [{ type: String }]
        },
        { _id: false }
      ),
      default: () => ({})
    },

    style: {
      tone: { type: String, default: 'professional' },
      format: { type: String, default: 'insight_article' },
      audience: { type: String, default: 'business decision-makers' },
      length: { type: String, default: 'medium' },
      cta: { type: String, default: '' },
      pointOfView: { type: String, default: 'third_person' }
    },

    category: { type: String, default: '', index: true },
    subcategory: { type: String, default: '', index: true },
    type: { type: String, enum: ['news', 'govt', 'competitor', 'evergreen'], default: 'news', index: true },
    country: { type: String, default: '', index: true },
    region: { type: String, default: '', index: true },
    keywords: [{ type: String, trim: true }],
    reviewComments: [{
      text: { type: String, required: true, trim: true, maxlength: 2000 },
      authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      authorName: { type: String, default: '', trim: true, maxlength: 120 },
      createdAt: { type: Date, default: Date.now }
    }],
    language: { type: String, default: 'en' },
    model: { type: String, default: '' },
    publishedAt: { type: Date }
  },
  { timestamps: true }
);

blogPostSchema.index({ tenantAdminId: 1, status: 1, updatedAt: -1 });
blogPostSchema.index({ tenantAdminId: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model('BlogPost', blogPostSchema);
