import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';
import ArticleCard from '../components/ArticleCard';
import { useAuth } from '../context/AuthContext';
import { APP_EVENT_CONTENT_CHANGED, emitAppEvent } from '../utils/appEvents';
import useInfiniteScroll from '../hooks/useInfiniteScroll';
import { ArrowLeft, Ban, BookOpenText, Check, ChevronDown, Copy, FileText, GripVertical, Loader2, MessageSquareText, MoreHorizontal, MousePointer2, PenLine, RefreshCw, Search, Settings2, Sparkles, Layers, Square, CheckSquare, X } from 'lucide-react';

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'news', label: 'News Articles' },
  { value: 'govt', label: 'Government Updates' },
  { value: 'competitor', label: 'Competitor Intel' },
  { value: 'evergreen', label: 'Evergreen Guides' }
];

const CONTENT_TYPE_TABS = [
  { key: 'blog', label: 'Blog', desktopLabel: 'Blog', icon: BookOpenText },
  { key: 'social', label: 'Social', desktopLabel: 'Social Media Post', icon: MessageSquareText },
];

const EMPTY_META = { categories: {}, dataCategories: {}, countries: [], types: TYPE_OPTIONS.slice(1).map(({ value, label }) => ({ id: value, label })) };
const CONTENT_STUDIO_UPCOMING_MODE = false;
const CONTENT_STUDIO_CACHE_VERSION = 'v1';
const STUDIO_PAGE_SIZE = 12;
const GENERATED_DRAFT_RETRY_COUNT = 10;
const GENERATED_DRAFT_RETRY_DELAY_MS = 500;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function safeSessionGet(key, fallback) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeSessionSet(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore cache write failures.
  }
}

const STYLE_OPTIONS = {
  tone: [
    ['professional', 'Professional'],
    ['conversational', 'Conversational'],
    ['authoritative', 'Authoritative'],
    ['friendly', 'Friendly'],
    ['educational', 'Educational'],
    ['persuasive', 'Persuasive'],
    ['technical', 'Technical'],
    ['thought_leadership', 'Thought Leadership']
  ],
  format: [
    ['insight_article', 'Insight Article'],
    ['how_to_guide', 'How-to Guide'],
    ['case_study', 'Case Study'],
    ['news_updates', 'News & Updates'],
    ['comparison_article', 'Comparison Article'],
    ['beginners_guide', "Beginner's Guide"],
    ['editorial', 'Editorial'],
    ['service_product_blog', 'Service / Product-Focused Blog'],
    ['faq_article', 'FAQ Article'],
    ['guide', 'Guide']
  ],
  length: [
    ['short', 'Short (500-800 words)'],
    ['medium', 'Medium (800-1,500 words)'],
    ['long', 'Long (1,500-3,000 words)'],
    ['custom', 'Custom']
  ],
  searchIntent: [
    ['informational', 'Informational'],
    ['commercial', 'Commercial'],
    ['transactional', 'Transactional'],
    ['navigational', 'Navigational']
  ],
  outlineMode: [
    ['auto', 'Auto Generate'],
    ['custom', 'Custom Outline']
  ],
  pointOfView: [
    ['third_person', 'Third person'],
    ['first_person_company', 'First person company']
  ]
};

const DEFAULT_STYLE = {
  tone: 'professional',
  format: 'insight_article',
  audience: 'business decision-makers',
  length: 'medium',
  customLength: '',
  pointOfView: 'third_person',
  metaTitle: '',
  metaDescription: '',
  primaryKeyword: '',
  searchIntent: 'informational',
  outlineMode: 'auto',
  customOutline: '',
  focusPage: '',
  internalLinkPages: '',
  ctaTitle: '',
  ctaDescription: '',
  ctaButtonText: 'Contact us',
  ctaUrl: '',
  cta: 'Contact us to discuss this update.',
  keyPoints: '',
  competitorUrls: '',
  referenceUrls: '',
  includeFaq: true,
  includeStats: true
};

const DEFAULT_LINKEDIN_FORM = {
  postGoal: 'thought_leadership',
  tone: 'professional',
  audience: 'business decision-makers',
  length: 'medium',
  hookStyle: 'proof',
  framework: 'auto',
  topicTier: 'auto',
  emotionalJob: 'auto',
  personaProfile: 'founder/operator/advisor',
  icpPainPoints: '',
  marketReality: '',
  proofElement: '',
  authorityLine: '',
  takeaway: '',
  includeHashtags: true,
  includeCTA: true,
  cta: '',
  customInstructions: ''
};

const BLOG_STEPS = [
  'Analyzing source topic & context...',
  'Synthesizing intelligence & key takeaways...',
  'Structuring outline & SEO heading layout...',
  'Drafting blog sections & content blocks...',
  'Optimizing meta tags & target keywords...',
  'Polishing brand voice & readability...'
];

const LINKEDIN_STEPS = [
  'Analyzing source topic intelligence...',
  'Extracting core points & statistics...',
  'Structuring post hook & template layout...',
  'Drafting post paragraphs & tone...',
  'Applying spacing constraints & readability...',
  'Refining soft authority line & CTA details...'
];

export default function BlogStudio() {
  const { user, refreshMe, genProgress, setGenProgress } = useAuth();
  const location = useLocation();
  const inboundState = location.state || {};
  const canUseBlogStudio = user?.access?.canUseBlogStudio !== false;
  const studioCacheKey = useMemo(
    () => `content_studio_cache:${CONTENT_STUDIO_CACHE_VERSION}:${user?._id || 'guest'}`,
    [user?._id]
  );
  const cachedStudioState = useMemo(
    () => safeSessionGet(studioCacheKey, null),
    [studioCacheKey]
  );

  if (!canUseBlogStudio) {
    return (
      <Layout>
        <div className="flex h-full min-h-0 items-center justify-center -m-6 p-4">
          <div className="glass-panel p-8 text-center text-sm font-semibold text-gray-500 max-w-lg flex flex-col items-center justify-center gap-4">
            <Sparkles size={48} className="text-brand-crimson animate-pulse" />
            <h2 className="text-xl font-black text-gray-900">Content Studio is Locked</h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              AI content creation, blogging, and social media posting are not included in your current subscription plan. Contact your organization administrator or upgrade to a higher tier plan to unlock this feature.
            </p>
          </div>
        </div>
      </Layout>
    );
  }
  const [contentType, setContentType] = useState(() => cachedStudioState?.contentType || inboundState.contentType || 'blog');
  const [socialPlatform, setSocialPlatform] = useState(() => cachedStudioState?.socialPlatform || inboundState.socialPlatform || 'linkedin');
  const [articles, setArticles] = useState(cachedStudioState?.articles || []);
  const [blogs, setBlogs] = useState(cachedStudioState?.blogs || []);
  const [selectedArticle, setSelectedArticle] = useState(() => inboundState.article || cachedStudioState?.selectedArticle || null);
  const [selectedBlog, setSelectedBlog] = useState(cachedStudioState?.selectedBlog || null);
  const [socialPosts, setSocialPosts] = useState(cachedStudioState?.socialPosts || []);
  const [style, setStyle] = useState(cachedStudioState?.style || DEFAULT_STYLE);
  const [keywords, setKeywords] = useState(cachedStudioState?.keywords || '');
  const [topicMeta, setTopicMeta] = useState(cachedStudioState?.topicMeta || EMPTY_META);
  const [topicFilters, setTopicFilters] = useState(cachedStudioState?.topicFilters || {
    q: '',
    type: '',
    category: '',
    subcategory: '',
    country: '',
    saved: ''
  });
  const [blogQuery, setBlogQuery] = useState(cachedStudioState?.blogQuery || '');
  const [articlesPage, setArticlesPage] = useState(cachedStudioState?.articlesPage || 1);
  const [articlesHasMore, setArticlesHasMore] = useState(cachedStudioState?.articlesHasMore ?? true);
  const [blogsPage, setBlogsPage] = useState(cachedStudioState?.blogsPage || 1);
  const [blogsHasMore, setBlogsHasMore] = useState(cachedStudioState?.blogsHasMore ?? true);
  const [loadingArticles, setLoadingArticles] = useState(() => !cachedStudioState?.articles?.length);
  const [loadingBlogs, setLoadingBlogs] = useState(() => !cachedStudioState?.blogs?.length);
  const [loadingSocialPosts, setLoadingSocialPosts] = useState(() => !cachedStudioState?.socialPosts?.length);
  const isRefreshing = loadingArticles || (contentType === 'blog' ? loadingBlogs : loadingSocialPosts);
  const [socialPreviewOpen, setSocialPreviewOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingLinkedin, setGeneratingLinkedin] = useState(false);
  const [generationFinalizing, setGenerationFinalizing] = useState(false);

  // Derive generating flags from global genProgress so they survive tab switches
  const isGenerating = generating || (genProgress?.status === 'running' && genProgress?.type === 'blog');
  const isGeneratingLinkedin = generatingLinkedin || (genProgress?.status === 'running' && genProgress?.type === 'linkedin');
  const generationLocked = isGenerating || isGeneratingLinkedin || generationFinalizing;

  const [generationStepIndex, setGenerationStepIndex] = useState(0);

  useEffect(() => {
    if (!generationLocked) {
      setGenerationStepIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setGenerationStepIndex((prev) => {
        if (prev < 5) return prev + 1;
        return prev;
      });
    }, 6000);

    return () => clearInterval(interval);
  }, [generationLocked]);

  const cancelGeneration = async () => {
    try {
      await api.post('/blogs/cancel');
    } catch { /* ignore */ }
    setGenProgress(null);
    setGenerating(false);
    setGeneratingLinkedin(false);
  };
  const [savingLinkedinPost, setSavingLinkedinPost] = useState(false);
  const [deletingBlogs, setDeletingBlogs] = useState(false);
  const [savingStatus, setSavingStatus] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);
  const [mobileHeaderMenuOpen, setMobileHeaderMenuOpen] = useState(false);
  const [draftForm, setDraftForm] = useState({ title: '', excerpt: '', bodyMarkdown: '' });
  const [draftEditorOpen, setDraftEditorOpen] = useState(false);
  const [draftDrawerOpen, setDraftDrawerOpen] = useState(false);
  const [selectedBlogIds, setSelectedBlogIds] = useState([]);
  const [error, setError] = useState('');
  const [draggingArticleId, setDraggingArticleId] = useState('');
  const [dropActive, setDropActive] = useState(false);
  const [pendingDraftId, setPendingDraftId] = useState('');
  const [linkedinForm, setLinkedinForm] = useState(DEFAULT_LINKEDIN_FORM);
  const [linkedinOutput, setLinkedinOutput] = useState(null);
  const selectedArticleRef = useRef(selectedArticle);
  const focusComposerMode = Boolean(inboundState.focusComposer && inboundState.article?._id);
  const hasTopicFilters = useMemo(
    () => Object.values(topicFilters || {}).some(Boolean),
    [topicFilters]
  );
  const hasBlogSearch = Boolean(String(blogQuery || '').trim());

  const showGenerationLockMessage = useCallback(() => {
    setError('Generation is running. Please wait until it finishes before changing sections or refreshing.');
  }, []);

  const keywordList = useMemo(() => cleanList(keywords), [keywords]);
  const categoryTree = useMemo(() => {
    const dataCategories = topicMeta.dataCategories || {};
    return Object.keys(dataCategories).length ? dataCategories : topicMeta.categories || {};
  }, [topicMeta]);
  const categoryOptions = useMemo(() => Object.keys(categoryTree), [categoryTree]);
  const countryOptions = useMemo(() => {
    const directCountries = Array.isArray(topicMeta.countries)
      ? topicMeta.countries.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
    if (directCountries.length) {
      return [...new Set(directCountries)].sort((a, b) => a.localeCompare(b));
    }

    const fallbackCountries = Object.values(topicMeta.sources || {})
      .flatMap((sources) => (sources || []).flatMap((source) => source?.countries || []))
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    return [...new Set(fallbackCountries)].sort((a, b) => a.localeCompare(b));
  }, [topicMeta]);
  const subcategoryOptions = useMemo(() => (
    topicFilters.category ? categoryTree[topicFilters.category] || [] : []
  ), [categoryTree, topicFilters.category]);
  const updateTopicFilter = useCallback((key, value) => {
    setTopicFilters((prev) => ({
      ...prev,
      [key]: value,
      ...(key === 'category' ? { subcategory: '' } : {})
    }));
  }, []);

  useEffect(() => {
    selectedArticleRef.current = selectedArticle;
  }, [selectedArticle]);

  const selectedBlogRef = useRef(selectedBlog);
  useEffect(() => {
    selectedBlogRef.current = selectedBlog;
  }, [selectedBlog]);

  const stampLinkedinOutput = useCallback((value) => (
    value ? { ...value, previewToken: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` } : value
  ), []);

  const generatingRef = useRef(generating);
  useEffect(() => {
    generatingRef.current = generating;
  }, [generating]);

  const genProgressRef = useRef(genProgress);
  useEffect(() => {
    genProgressRef.current = genProgress;
  }, [genProgress]);
  const generationOwnerRef = useRef('');


  const selectArticleById = useCallback((articleId) => {
    const article = articles.find((item) => item._id === articleId);
    if (article) setSelectedArticle(article);
  }, [articles]);

  const loadArticles = useCallback(async ({ page = 1, reset = false } = {}) => {
    setLoadingArticles(true);
    try {
      const params = { limit: STUDIO_PAGE_SIZE, page, personalized: 'true' };
      Object.entries(topicFilters).forEach(([key, value]) => {
        if (value) params[key] = value;
      });
      const { data } = await api.get('/articles', { params });
      const items = data.items || [];
      setArticles((prevArticles) => {
        const pinned = selectedArticleRef.current || prevArticles.find((item) => item._id === inboundState.articleId);
        const baseItems = reset ? items : [...prevArticles, ...items.filter((item) => !prevArticles.some((existing) => existing._id === item._id))];
        if (pinned?._id && !baseItems.some((item) => item._id === pinned._id)) return [pinned, ...baseItems];
        return baseItems;
      });
      setArticlesPage(page);
      setArticlesHasMore(page < Number(data.pages || page));
    } catch (err) {
      setError(err.message || 'Could not load topics');
    } finally {
      setLoadingArticles(false);
    }
  }, [inboundState.articleId, topicFilters]);

  const loadBlogs = useCallback(async ({ page = 1, reset = false, q = blogQuery } = {}) => {
    setLoadingBlogs(true);
    try {
      const params = { limit: STUDIO_PAGE_SIZE, page };
      if (q) params.q = q;
      const { data } = await api.get('/blogs', { params });
      const nextBlogs = data.items || [];
      setBlogs((prev) => reset ? nextBlogs : [...prev, ...nextBlogs.filter((item) => !prev.some((existing) => existing._id === item._id))]);
      if (nextBlogs.length) setSelectedBlog((prev) => prev || nextBlogs[0]);
      setBlogsPage(page);
      setBlogsHasMore(page < Number(data.pages || page));
    } catch (err) {
      setError(err.message || 'Could not load blogs');
    } finally {
      setLoadingBlogs(false);
    }
  }, [blogQuery]);

  const loadSocialPosts = useCallback(async () => {
    setLoadingSocialPosts(true);
    try {
      const { data } = await api.get('/blogs/social-posts', { params: { platform: 'linkedin', limit: 30 } });
      setSocialPosts(data.items || []);
    } catch (err) {
      setError(err.message || 'Could not load saved social posts');
    } finally {
      setLoadingSocialPosts(false);
    }
  }, []);

  const loadBlogsRef = useRef(null);
  useEffect(() => {
    loadBlogsRef.current = loadBlogs;
  }, [loadBlogs]);

  const loadSocialPostsRef = useRef(null);
  useEffect(() => {
    loadSocialPostsRef.current = loadSocialPosts;
  }, [loadSocialPosts]);

  const openGeneratedDraft = useCallback(async (draftId) => {
    if (!draftId) return null;
    let item = null;
    let lastError = null;

    setBlogQuery('');
    setDraftDrawerOpen(true);
    setDraftEditorOpen(false);

    for (let attempt = 0; attempt < GENERATED_DRAFT_RETRY_COUNT; attempt += 1) {
      try {
        const { data } = await api.get(`/blogs/${draftId}`);
        item = data.item || null;
        if (item) break;
      } catch (err) {
        lastError = err;
      }
      await delay(GENERATED_DRAFT_RETRY_DELAY_MS);
    }

    if (!item) {
      if (lastError) throw lastError;
      throw new Error('Generated draft is not ready yet. Please open Drafts & Publishing again.');
    }

    setContentType('blog');
    setBlogQuery('');
    setSelectedBlog(item);
    setDraftForm({
      title: item.title || '',
      excerpt: item.excerpt || '',
      bodyMarkdown: item.bodyMarkdown || ''
    });
    setPendingDraftId('');
    setDraftDrawerOpen(true);
    setDraftEditorOpen(true);
    setBlogs((prev) => [item, ...prev.filter((blog) => blog._id !== item._id)]);
    setSelectedBlog(item);
    setDraftEditorOpen(true);
    setDraftDrawerOpen(true);
    loadBlogs({ page: 1, reset: true, q: '' }); // background refresh
    return item;
  }, [loadBlogs]);

  const waitForGenerationCompletion = useCallback(async (expectedType, ownerKey) => {
    const maxAttempts = 160;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (generationOwnerRef.current !== ownerKey) {
        throw new Error('Generation tracking was interrupted.');
      }

      const { data } = await api.get('/blogs/generation-status');
      if (data) {
        setGenProgress(data);
        if (data.type === expectedType) {
          if (data.status === 'completed') return data;
          if (data.status === 'failed') throw new Error(data.error || 'Generation failed');
          if (data.status === 'cancelled') throw new Error('Generation was cancelled');
        }
      }

      await delay(750);
    }

    throw new Error('Generation is taking too long. Please check Drafts & Publishing.');
  }, [setGenProgress]);

  // Listen to global generation progress updates to handle background success, failure or cancellation
  useEffect(() => {
    if (generationOwnerRef.current) return;
    if (!genProgress) return;

    if (genProgress.status === 'completed') {
      const handleCompleted = async () => {
        setGenerationFinalizing(true);
        try {
          if (genProgress.type === 'blog') {
            const item = await openGeneratedDraft(genProgress.resultId);
            emitAppEvent(APP_EVENT_CONTENT_CHANGED, { scope: 'blogs', action: 'generated', id: item?._id || genProgress.resultId || '' });
          } else if (genProgress.type === 'linkedin') {
            setLinkedinOutput(stampLinkedinOutput(genProgress.data));
            setContentType('social');
            loadSocialPosts();
          }
        } catch (err) {
          setError(err.response?.data?.message || err.message || 'Failed to retrieve generated content');
        } finally {
          api.post('/blogs/generation-clear').catch(() => {});
          setGenerating(false);
          setGeneratingLinkedin(false);
          setGenProgress(null);
          setGenerationFinalizing(false);
        }
      };
      handleCompleted();
    } else if (genProgress.status === 'failed') {
      setError(genProgress.error || 'Generation failed');
      api.post('/blogs/generation-clear').catch(() => {});
      setGenerationFinalizing(false);
      setGenerating(false);
      setGeneratingLinkedin(false);
      setGenProgress(null);
    } else if (genProgress.status === 'cancelled') {
      setError('Generation was cancelled');
      api.post('/blogs/generation-clear').catch(() => {});
      setGenerationFinalizing(false);
      setGenerating(false);
      setGeneratingLinkedin(false);
      setGenProgress(null);
    }
  }, [genProgress, setGenProgress, loadSocialPosts, openGeneratedDraft, setLinkedinOutput, stampLinkedinOutput]);

  // Real-time listener: handles updates pushed to other tabs/users in real-time
  useEffect(() => {
    const handleContentChanged = (event) => {
      const detail = event?.detail || {};
      if (!detail.scope || detail.scope === 'blogs') {
        if (detail.id) {
          const isActivelyGenerating = generatingRef.current || (genProgressRef.current?.status === 'running' && genProgressRef.current?.type === 'blog');
          if (detail.action === 'generated' && isActivelyGenerating) {
            setGenerationFinalizing(true);
            openGeneratedDraft(detail.id)
              .then(() => {
                setGenerating(false);
                setGeneratingLinkedin(false);
                setGenProgress(null);
                api.post('/blogs/generation-clear').catch(() => {});
              })
              .catch((err) => {
                setError(err.response?.data?.message || err.message || 'Failed to open generated draft');
              })
              .finally(() => {
                setGenerationFinalizing(false);
              });
            return;
          }

          // Fetch the updated blog post
          api.get(`/blogs/${detail.id}`).then(({ data }) => {
            if (data.item) {
              // Prepend or update in local state in-memory
              setBlogs((prev) => {
                const exists = prev.some((b) => b._id === data.item._id);
                if (exists) {
                  return prev.map((b) => b._id === data.item._id ? data.item : b);
                }
                return [data.item, ...prev]; // PREPEND new drafts!
              });
              
              // Also update selected blog if it matches
              if (selectedBlogRef.current?._id === data.item._id) {
                if (selectedBlogRef.current.status !== data.item.status || 
                    selectedBlogRef.current.updatedAt !== data.item.updatedAt) {
                  setSelectedBlog(data.item);
                }
              }
            }
          }).catch((err) => {
            // If it returns 404 (deleted), remove it from list
            if (err.response?.status === 404) {
              setBlogs((prev) => prev.filter((b) => b._id !== detail.id));
              if (selectedBlogRef.current?._id === detail.id) {
                setSelectedBlog(null);
              }
            }
          });
        } else {
          // Fallback to full load if no specific ID is provided
          loadBlogsRef.current?.({ page: 1, reset: true });
        }
      }
      if (!detail.scope || detail.scope === 'social') {
        loadSocialPostsRef.current?.();
        
        const isActivelyGenerating = generatingRef.current || (genProgressRef.current?.status === 'running' && genProgressRef.current?.type === 'linkedin');
        if (detail.action === 'generated' && isActivelyGenerating && detail.data) {
          // Instantly close the overlay
          setGenerating(false);
          setGeneratingLinkedin(false);
          setGenProgress(null);
          api.post('/blogs/generation-clear').catch(() => {});

          // Set output and open preview drawer
          setLinkedinOutput(stampLinkedinOutput(detail.data));
          setContentType('social');
        }
      }
    };

    window.addEventListener(APP_EVENT_CONTENT_CHANGED, handleContentChanged);
    return () => {
      window.removeEventListener(APP_EVENT_CONTENT_CHANGED, handleContentChanged);
    };
  }, [stampLinkedinOutput]);

  useEffect(() => {
    if (cachedStudioState?.articles?.length && !hasTopicFilters) return;
    loadArticles({ page: 1, reset: true });
  }, [cachedStudioState?.articles?.length, hasTopicFilters, loadArticles]);
  useEffect(() => {
    if (cachedStudioState?.blogs?.length && !hasBlogSearch) return;
    loadBlogs({ page: 1, reset: true });
  }, [cachedStudioState?.blogs?.length, hasBlogSearch, loadBlogs]);
  useEffect(() => {
    if (!cachedStudioState?.socialPosts?.length) loadSocialPosts();
  }, [cachedStudioState?.socialPosts?.length, loadSocialPosts]);
  useEffect(() => {
    const cachedCategoryCount = Object.keys(cachedStudioState?.topicMeta?.dataCategories || cachedStudioState?.topicMeta?.categories || {}).length;
    const cachedCountryCount = Array.isArray(cachedStudioState?.topicMeta?.countries) ? cachedStudioState.topicMeta.countries.length : 0;
    if (cachedStudioState?.topicMeta && cachedCategoryCount > 0 && cachedCountryCount > 0) return;
    api.get('/articles/meta/filters')
      .then(({ data }) => setTopicMeta({ ...EMPTY_META, ...data }))
      .catch(() => setTopicMeta(EMPTY_META));
  }, [cachedStudioState?.topicMeta]);
  useEffect(() => {
    if (inboundState.contentType) setContentType(inboundState.contentType);
    if (inboundState.socialPlatform) setSocialPlatform(inboundState.socialPlatform);
    if (inboundState.article?._id) {
      setSelectedArticle(inboundState.article);
      setArticles((prev) => (
        prev.some((item) => item._id === inboundState.article._id)
          ? prev
          : [inboundState.article, ...prev]
      ));
      setStyle((prev) => ({ ...prev, topic: prev.topic || inboundState.article.title || '' }));
    }
  }, [inboundState.article, inboundState.contentType, inboundState.socialPlatform]);
  useEffect(() => {
    setDraftForm({
      title: selectedBlog?.title || '',
      excerpt: selectedBlog?.excerpt || '',
      bodyMarkdown: selectedBlog?.bodyMarkdown || ''
    });
  }, [selectedBlog]);

  useEffect(() => {
    safeSessionSet(studioCacheKey, {
      contentType,
      socialPlatform,
      articles,
      blogs,
      articlesPage,
      articlesHasMore,
      blogsPage,
      blogsHasMore,
      selectedArticle,
      selectedBlog,
      socialPosts,
      style,
      keywords,
      topicMeta,
      topicFilters,
    blogQuery
  });
  }, [
    articles,
    articlesHasMore,
    articlesPage,
    blogQuery,
    blogs,
    blogsHasMore,
    blogsPage,
    contentType,
    keywords,
    selectedArticle,
    selectedBlog,
    socialPlatform,
    socialPosts,
    studioCacheKey,
    style,
    topicFilters,
    topicMeta
  ]);

  const articleLoadMoreRef = useInfiniteScroll({
    enabled: contentType === 'blog' || contentType === 'social',
    hasMore: articlesHasMore,
    loading: loadingArticles,
    onLoadMore: () => loadArticles({ page: articlesPage + 1 })
  });

  const blogLoadMoreRef = useInfiniteScroll({
    enabled: contentType === 'blog' && draftDrawerOpen,
    hasMore: blogsHasMore,
    loading: loadingBlogs,
    onLoadMore: () => loadBlogs({ page: blogsPage + 1 })
  });

  const deleteBlogsInternal = useCallback(async (ids) => {
    const targetIds = ids.filter(Boolean);
    if (!targetIds.length) return;

    if (targetIds.length === 1) {
      await api.delete(`/blogs/${targetIds[0]}`);
    } else {
      await api.delete('/blogs/bulk', { data: { ids: targetIds } });
    }

    setSelectedBlogIds((prev) => prev.filter((id) => !targetIds.includes(id)));
    if (targetIds.includes(selectedBlog?._id)) {
      setSelectedBlog(null);
      setDraftEditorOpen(false);
    }
    if (targetIds.includes(pendingDraftId)) {
      setPendingDraftId('');
    }
    await loadBlogs({ page: 1, reset: true });
    emitAppEvent(APP_EVENT_CONTENT_CHANGED, { scope: 'blogs', action: 'deleted', ids: targetIds });
  }, [loadBlogs, pendingDraftId, selectedBlog?._id]);

  const closeDraftDrawer = useCallback(async () => {
    const draftId = pendingDraftId;
    const shouldDeletePendingDraft = draftId && selectedBlog?._id === draftId && selectedBlog?.status === 'draft';

    if (shouldDeletePendingDraft) {
      const confirmSave = window.confirm("You have unsaved changes. Do you want to save this blog draft before closing?");
      if (confirmSave) {
        // Keeping the draft is as simple as clearing pendingDraftId so it doesn't get deleted!
        setPendingDraftId('');
        setDraftDrawerOpen(false);
        setDraftEditorOpen(false);
        return;
      }
    }

    setDraftDrawerOpen(false);
    setDraftEditorOpen(false);

    if (!shouldDeletePendingDraft) return;

    try {
      await deleteBlogsInternal([draftId]);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Could not clear temporary draft');
    }
  }, [deleteBlogsInternal, pendingDraftId, selectedBlog?._id, selectedBlog?.status]);

  const generate = async () => {
    if (!selectedArticle?._id) {
      setError('Select or drag a topic first.');
      return;
    }
    setError('');
    setGenerating(true);
    setGenProgress({ type: 'blog', status: 'running', startedAt: new Date().toISOString() });
    const ownerKey = `blog:${Date.now()}`;
    generationOwnerRef.current = ownerKey;
    try {
      await api.post('/blogs/generate', {
        articleId: selectedArticle._id,
        style,
        keywords: [style.primaryKeyword, ...keywordList].filter(Boolean),
        status: 'draft'
      });

      const completed = await waitForGenerationCompletion('blog', ownerKey);
      setGenerationFinalizing(true);
      const item = await openGeneratedDraft(completed.resultId);
      emitAppEvent(APP_EVENT_CONTENT_CHANGED, { scope: 'blogs', action: 'generated', id: item?._id || completed.resultId || '' });
      api.post('/blogs/generation-clear').catch(() => {});
      setGenProgress(null);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Blog generation failed');
      api.post('/blogs/generation-clear').catch(() => {});
      setGenProgress(null);
    } finally {
      generationOwnerRef.current = '';
      setGenerationFinalizing(false);
      setGenerating(false);
    }
  };

  const updateBlogStatus = async (status) => {
    if (!selectedBlog?._id) return;
    setSavingStatus(status);
    try {
      const { data } = await api.patch(`/blogs/${selectedBlog._id}`, { status });
      setSelectedBlog(data.item);
      setPendingDraftId('');
      setBlogs((prev) => prev.map((blog) => blog._id === data.item._id ? data.item : blog));
      emitAppEvent(APP_EVENT_CONTENT_CHANGED, { scope: 'blogs', action: 'status', id: data.item?._id || '' });
    } catch (err) {
      setError(err.message || 'Status update failed');
    } finally {
      setSavingStatus('');
    }
  };

  const saveDraftEdits = async () => {
    if (!selectedBlog?._id) return;
    setSavingDraft(true);
    setError('');
    try {
      const { data } = await api.patch(`/blogs/${selectedBlog._id}`, draftForm);
      setSelectedBlog(data.item);
      setPendingDraftId('');
      setBlogs((prev) => prev.map((blog) => blog._id === data.item._id ? data.item : blog));
      emitAppEvent(APP_EVENT_CONTENT_CHANGED, { scope: 'blogs', action: 'updated', id: data.item?._id || '' });
    } catch (err) {
      setError(err.message || 'Draft save failed');
    } finally {
      setSavingDraft(false);
    }
  };

  const toggleBlogSelection = (blogId) => {
    setSelectedBlogIds((prev) => (
      prev.includes(blogId) ? prev.filter((id) => id !== blogId) : [...prev, blogId]
    ));
  };

  const toggleSelectAllBlogs = useCallback(() => {
    setSelectedBlogIds((prev) => (
      prev.length === blogs.length ? [] : blogs.map((blog) => blog._id).filter(Boolean)
    ));
  }, [blogs]);

  const deleteBlogs = useCallback(async (ids) => {
    const targetIds = ids.filter(Boolean);
    if (!targetIds.length) return;
    const confirmed = window.confirm(targetIds.length === 1 ? 'Delete this post?' : `Delete ${targetIds.length} posts?`);
    if (!confirmed) return;

    setDeletingBlogs(true);
    setError('');
    try {
      await deleteBlogsInternal(targetIds);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Delete failed');
    } finally {
      setDeletingBlogs(false);
    }
  }, [deleteBlogsInternal]);

  const generateLinkedinPost = async () => {
    try {
      const latestUser = await refreshMe();
      if (latestUser?.access?.canUseBlogStudio === false) {
        setError('Content Studio access has been turned off by the super admin.');
        return;
      }
    } catch (err) {
      setError(err.message || 'Could not verify Content Studio access');
      return;
    }

    if (!selectedArticle?._id) {
      setError('Select an intelligence topic first.');
      return;
    }
    setError('');
    setGeneratingLinkedin(true);
    setGenProgress({ type: 'linkedin', status: 'running', startedAt: new Date().toISOString() });
    const ownerKey = `linkedin:${Date.now()}`;
    generationOwnerRef.current = ownerKey;
    try {
      await api.post('/blogs/linkedin/generate', {
        articleId: selectedArticle._id,
        options: linkedinForm
      });

      const completed = await waitForGenerationCompletion('linkedin', ownerKey);
      setGenerationFinalizing(true);
      setLinkedinOutput(stampLinkedinOutput(completed.data));
      setContentType('social');
      loadSocialPosts();
      api.post('/blogs/generation-clear').catch(() => {});
      setGenProgress(null);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'LinkedIn post generation failed');
      api.post('/blogs/generation-clear').catch(() => {});
      setGenProgress(null);
    } finally {
      generationOwnerRef.current = '';
      setGenerationFinalizing(false);
      setGeneratingLinkedin(false);
    }
  };

  const saveLinkedinPost = async () => {
    if (!linkedinOutput?.postText) return;
    setSavingLinkedinPost(true);
    setError('');
    try {
      const payload = {
        sourceArticleId: linkedinOutput.sourceArticleId || selectedArticle?._id || '',
        platform: 'linkedin',
        status: 'draft',
        selectedTopic: linkedinOutput.selectedTopic || selectedArticle?.title || '',
        postText: linkedinOutput.postText,
        hashtags: Array.isArray(linkedinOutput.hashtags) ? linkedinOutput.hashtags : [],
        framework: linkedinOutput.framework || '',
        topicTier: linkedinOutput.topicTier || '',
        emotionalJob: linkedinOutput.emotionalJob || '',
        sourceSnapshot: linkedinOutput.sourceSnapshot || {},
        options: linkedinOutput.options || linkedinForm
      };
      const { data } = await api.post('/blogs/social-posts', payload);
      const savedItem = { ...data.item, saved: true };
      setLinkedinOutput(savedItem);
      await loadSocialPosts();
      emitAppEvent(APP_EVENT_CONTENT_CHANGED, { scope: 'social', action: 'created', id: savedItem?._id || '' });
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Could not save social post');
    } finally {
      setSavingLinkedinPost(false);
    }
  };

  const refreshStudio = useCallback(() => {
    if (contentType === 'blog') {
      loadArticles({ page: 1, reset: true });
      loadBlogs({ page: 1, reset: true });
      return;
    }
    loadArticles({ page: 1, reset: true });
    loadSocialPosts();
  }, [contentType, loadArticles, loadBlogs, loadSocialPosts]);

  const switchContentType = useCallback((nextType) => {
    if (nextType === contentType) return true;
    if (generationLocked) {
      showGenerationLockMessage();
      return false;
    }
    setContentType(nextType);
    return true;
  }, [contentType, generationLocked, showGenerationLockMessage]);

  const refreshStudioSafely = useCallback(() => {
    if (generationLocked) {
      showGenerationLockMessage();
      return;
    }
    refreshStudio();
  }, [generationLocked, refreshStudio, showGenerationLockMessage]);

  useEffect(() => {
    setMobileHeaderMenuOpen(false);
  }, [contentType, socialPreviewOpen]);

  const activeContentTab = CONTENT_TYPE_TABS.find((tab) => tab.key === contentType) || CONTENT_TYPE_TABS[0];
  const ActiveContentIcon = activeContentTab.icon;
  const generationOverlayTitle = generationFinalizing
    ? (genProgress?.type === 'linkedin' ? 'Opening LinkedIn Preview' : 'Opening Blog Draft')
    : (isGeneratingLinkedin ? 'Generating LinkedIn Post' : 'Generating Blog Draft');
  const generationOverlaySubtitle = generationFinalizing
    ? 'Finalizing your content. It will open automatically in a moment.'
    : (isGeneratingLinkedin
      ? 'Please wait here. The post preview will open automatically as soon as generation finishes.'
      : 'Please wait here. Drafts & Publishing will refresh and open the new draft automatically.');
  const generationOverlayTopic = selectedArticle?.title || style.topic || 'Selected intelligence topic';

  const headerActions = contentType === 'social' && socialPreviewOpen ? null : (
    <>
    <div className="flex w-full items-center justify-between gap-3 xl:flex-row xl:items-center">
      <div className="flex items-center gap-2 xl:hidden">
        <button
          type="button"
          onClick={() => setMobileHeaderMenuOpen((value) => !value)}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-[13px] font-black text-gray-900 shadow-sm transition-all hover:border-brand-crimson/20 hover:text-brand-crimson"
        >
          <ActiveContentIcon size={14} />
          {activeContentTab.label}
        </button>
      </div>
      <div className="ml-auto flex items-center gap-2 xl:hidden">
        <button
          type="button"
          onClick={refreshStudioSafely}
          className={`inline-flex h-[42px] min-w-[42px] items-center justify-center gap-2 rounded-2xl border border-brand-crimson/20 bg-brand-pink/10 px-3 text-brand-crimson shadow-sm transition-all hover:bg-brand-pink/20 hover:border-brand-crimson/30 ${generationLocked ? 'cursor-not-allowed opacity-60' : ''}`}
          aria-label="Refresh content studio"
          title={generationLocked ? 'Generation is running. Please wait before refreshing.' : 'Refresh content studio'}
        >
          <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
        </button>
        <button
          type="button"
          onClick={() => setMobileHeaderMenuOpen((value) => !value)}
          className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-600 shadow-sm transition-all hover:border-brand-crimson/20 hover:text-brand-crimson"
          aria-label="Open content menu"
        >
          <MoreHorizontal size={16} />
        </button>
      </div>
      <div className="hidden w-full xl:flex xl:flex-row xl:items-center xl:gap-2">
        <div className="grid w-full grid-cols-2 rounded-2xl border border-gray-200 bg-white p-1 shadow-sm xl:w-auto xl:min-w-[360px]">
          {CONTENT_TYPE_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = contentType === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => switchContentType(tab.key)}
                aria-disabled={generationLocked && !active}
                className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-black transition-all xl:min-h-[40px] xl:px-5 ${active ? 'bg-brand-crimson text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'} ${generationLocked && !active ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <Icon size={14} />
                <span className="xl:hidden">{tab.label}</span>
                <span className="hidden xl:inline">{tab.desktopLabel}</span>
              </button>
            );
          })}
        </div>
        <button type="button" onClick={refreshStudioSafely} title={generationLocked ? 'Generation is running. Please wait before refreshing.' : 'Refresh'} className={`inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 text-[13px] font-black text-gray-900 shadow-sm transition-all hover:border-brand-crimson/20 hover:bg-gray-50 xl:w-auto ${generationLocked ? 'cursor-not-allowed opacity-60' : ''}`}>
          <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>
    </div>
    {mobileHeaderMenuOpen ? (
      <>
        <button
          type="button"
          aria-label="Close content menu"
          onClick={() => setMobileHeaderMenuOpen(false)}
          className="fixed inset-0 z-40 bg-gray-950/20 backdrop-blur-[1px] xl:hidden"
        />
        <div className="fixed right-3 top-[76px] z-50 w-[min(290px,calc(100vw-24px))] overflow-hidden rounded-[24px] border border-gray-200 bg-white shadow-[0_24px_48px_rgba(15,23,42,0.18)] xl:hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Content Studio</div>
              <div className="mt-1 text-sm font-black text-gray-900">Quick Actions</div>
            </div>
            <button
              type="button"
              onClick={() => setMobileHeaderMenuOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition-all hover:border-brand-crimson/20 hover:text-brand-crimson"
              aria-label="Close content menu"
            >
              <X size={15} />
            </button>
          </div>
          <div className="space-y-2 p-3">
            {CONTENT_TYPE_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = contentType === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    const switched = switchContentType(tab.key);
                    if (switched || active) setMobileHeaderMenuOpen(false);
                  }}
                  aria-disabled={generationLocked && !active}
                  className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition-all ${active ? 'border border-brand-crimson/15 bg-brand-pink/20 text-brand-crimson' : 'border border-gray-200 bg-gray-50 text-gray-700'} ${generationLocked && !active ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <span className="flex items-center gap-3 text-sm font-black">
                    <Icon size={15} />
                    {tab.label}
                  </span>
                  {active ? <Check size={15} /> : null}
                </button>
              );
            })}
          </div>
        </div>
      </>
    ) : null}
    </>
  );

  return (
    <Layout headerActions={headerActions}>
      <div className="relative flex min-h-full -m-3 flex-col gap-3 p-3 mesh-bg sm:-m-5 sm:p-4 lg:-m-6 lg:p-4">
        <div className={(CONTENT_STUDIO_UPCOMING_MODE || generationLocked) ? 'pointer-events-none select-none blur-[5px] saturate-[0.82] transition-all duration-300' : 'transition-all duration-300'}>
        {error && (
          <div className="mb-3 rounded-xl border border-red-200/50 bg-red-50/80 px-5 py-4 text-sm font-semibold text-red-700 shadow-sm backdrop-blur-md animate-fade-in-up stagger-2">
            {error}
          </div>
        )}

        {contentType === 'social' && (
          <div className="flex min-h-0 flex-1 flex-col animate-fade-in-up stagger-2">
            {socialPlatform === 'linkedin' && (
              <LinkedInStudio
                socialPlatform={socialPlatform}
                setSocialPlatform={setSocialPlatform}
                articles={articles}
                articlesHasMore={articlesHasMore}
                articleLoadMoreRef={articleLoadMoreRef}
                selectedArticle={selectedArticle}
                setSelectedArticle={setSelectedArticle}
                loadingArticles={loadingArticles}
                topicFilters={topicFilters}
                updateTopicFilter={updateTopicFilter}
                categoryOptions={categoryOptions}
                subcategoryOptions={subcategoryOptions}
                countries={countryOptions}
                types={topicMeta.types || EMPTY_META.types}
                linkedinForm={linkedinForm}
                setLinkedinForm={setLinkedinForm}
                generatingLinkedin={isGeneratingLinkedin}
                generateLinkedinPost={generateLinkedinPost}
                cancelGeneration={cancelGeneration}
                saveLinkedinPost={saveLinkedinPost}
                canUseBlogStudio={canUseBlogStudio}
                linkedinOutput={linkedinOutput}
                setLinkedinOutput={setLinkedinOutput}
                savingLinkedinPost={savingLinkedinPost}
                socialPosts={socialPosts}
                loadingSocialPosts={loadingSocialPosts}
                focusComposerMode={focusComposerMode}
                onPreviewOpenChange={setSocialPreviewOpen}
              />
            )}
          </div>
        )}

        {contentType === 'blog' && (
        <>
        <div className="grid grid-cols-1 gap-4 animate-fade-in-up stagger-2 xl:grid-cols-2">
          
          {/* Panel 1: Topics */}
          <section className={`${focusComposerMode ? 'hidden xl:flex' : 'flex'} min-h-[520px] flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm group/panel xl:h-[calc(100vh-96px)]`}>
            <PanelHeader icon={Layers} title="Intelligence Topics" />
            <TopicFilterBar
              filters={topicFilters}
              onChange={updateTopicFilter}
              categoryOptions={categoryOptions}
              subcategoryOptions={subcategoryOptions}
              countries={countryOptions}
              types={topicMeta.types || EMPTY_META.types}
            />
            
            <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50/30 p-3 custom-scrollbar">
              {loadingArticles && !articles.length ? (
                <LoadingRows label="Loading intelligence topics..." />
              ) : articles.length ? (
                <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
                  {articles.map((item) => {
                    const isSelected = selectedArticle?._id === item._id;
                    return (
                      <div
                        key={item._id}
                        role="button"
                        tabIndex={0}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData('text/plain', item._id);
                          setDraggingArticleId(item._id);
                        }}
                        onDragEnd={() => setDraggingArticleId('')}
                        onClick={() => setSelectedArticle(item)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') setSelectedArticle(item);
                        }}
                        className={`group/topic relative w-full cursor-grab rounded-[26px] text-left active:cursor-grabbing transition-all duration-300 ${draggingArticleId === item._id ? 'scale-[0.985] opacity-50' : 'hover:-translate-y-1'} ${isSelected ? 'ring-2 ring-brand-crimson/70 ring-offset-2 ring-offset-rose-50/70' : ''}`}
                      >
                        <ArticleCard
                          item={item}
                          compact
                          selected={isSelected}
                          compactFooter={(
                            <TopicSelectionFooter
                              isSelected={isSelected}
                              idleHint="Click once or drag this card into the generator"
                              selectedHint="Topic selected for blog generation"
                            />
                          )}
                        />
                      </div>
                    );
                  })}
                  {articlesHasMore ? (
                    <div ref={articleLoadMoreRef} className="col-span-full flex items-center justify-center py-3 text-xs font-bold text-gray-400">
                      {loadingArticles ? 'Loading more...' : 'Scroll for more'}
                    </div>
                  ) : null}
                </div>
              ) : (
                <Empty icon={FileText} label="No topics found matching criteria" />
              )}
            </div>
          </section>

          {/* Panel 2: Studio Generator */}
          <section className="relative z-10 flex min-h-[620px] flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm xl:h-[calc(100vh-96px)]">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-brand-crimson via-brand-pink to-brand-crimson opacity-50"></div>
            <PanelHeader icon={Settings2} title="Style & Generation Settings" />
            
            <div className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar">
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDropActive(true);
                }}
                onDragLeave={() => setDropActive(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDropActive(false);
                  selectArticleById(event.dataTransfer.getData('text/plain'));
                }}
                className={`mb-4 rounded-xl border border-dashed p-3 transition-all duration-300 ${
                  dropActive 
                    ? 'border-brand-crimson bg-brand-pink/10' 
                    : selectedArticle 
                      ? 'border-gray-200 bg-white/60' 
                      : 'border-gray-200 bg-gray-50/70 hover:bg-gray-50'
                }`}
              >
                <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-gray-500">
                  <GripVertical size={14} />
                  Selected Topic Source
                </div>
                {selectedArticle ? (
                  <div className="animate-fade-in-up stagger-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 text-sm font-black leading-snug text-gray-900">{selectedArticle.title}</div>
                      <button
                        type="button"
                        onClick={() => setSelectedArticle(null)}
                        className="shrink-0 rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-gray-500 border border-gray-200 transition hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="mt-2 text-xs font-medium text-gray-500 line-clamp-2 italic border-l-2 border-gray-200 pl-2">{selectedArticle.summary || selectedArticle.aiSummary}</div>
                  </div>
                ) : (
                  <div className="flex min-h-[78px] items-center justify-center rounded-lg bg-white/60 text-center">
                    <div className="text-sm font-bold text-gray-500">Drag or click a topic to select</div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <SettingsGroup title="Basic Information">
                  <Field label="Topic">
                    <input className="input rounded-xl hover:border-gray-300 focus:border-brand-crimson transition-colors" value={style.topic || selectedArticle?.title || ''} onChange={(e) => setStyle({ ...style, topic: e.target.value })} placeholder="Auto-filled from selected topic" />
                  </Field>
                  <SelectField label="Format" value={style.format} onChange={(value) => setStyle({ ...style, format: value })} options={STYLE_OPTIONS.format} />
                </SettingsGroup>

                <SettingsGroup title="Audience & Style">
                  <Field label="Target Audience">
                    <input className="input rounded-xl hover:border-gray-300 focus:border-brand-crimson transition-colors" value={style.audience} onChange={(e) => setStyle({ ...style, audience: e.target.value })} />
                  </Field>
                  <SelectField label="Tone" value={style.tone} onChange={(value) => setStyle({ ...style, tone: value })} options={STYLE_OPTIONS.tone} />
                </SettingsGroup>

                <SettingsGroup title="SEO">
                  <Field label="Meta Title (50-60 characters)">
                    <input className="input rounded-xl hover:border-gray-300 focus:border-brand-crimson transition-colors" value={style.metaTitle} onChange={(e) => setStyle({ ...style, metaTitle: e.target.value })} placeholder="Optional, AI can generate" />
                  </Field>
                  <Field label="Meta Description (150-160 characters)">
                    <input className="input rounded-xl hover:border-gray-300 focus:border-brand-crimson transition-colors" value={style.metaDescription} onChange={(e) => setStyle({ ...style, metaDescription: e.target.value })} placeholder="Optional, AI can generate" />
                  </Field>
                  <Field label="Primary SEO Keyword">
                    <input className="input rounded-xl hover:border-gray-300 focus:border-brand-crimson transition-colors" value={style.primaryKeyword} onChange={(e) => setStyle({ ...style, primaryKeyword: e.target.value })} />
                  </Field>
                  <Field label="Secondary SEO Keywords">
                    <input className="input rounded-xl hover:border-gray-300 focus:border-brand-crimson transition-colors" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="Comma separated" />
                  </Field>
                  <SelectField label="Target Search Intent" value={style.searchIntent} onChange={(value) => setStyle({ ...style, searchIntent: value })} options={STYLE_OPTIONS.searchIntent} />
                </SettingsGroup>

                <SettingsGroup title="Content Structure">
                  <SelectField label="Length" value={style.length} onChange={(value) => setStyle({ ...style, length: value })} options={STYLE_OPTIONS.length} />
                  {style.length === 'custom' && (
                    <Field label="Custom Length">
                      <input className="input rounded-xl hover:border-gray-300 focus:border-brand-crimson transition-colors" value={style.customLength} onChange={(e) => setStyle({ ...style, customLength: e.target.value })} placeholder="e.g. 1,200 words" />
                    </Field>
                  )}
                  <SelectField label="Content Outline (TOC)" value={style.outlineMode} onChange={(value) => setStyle({ ...style, outlineMode: value })} options={STYLE_OPTIONS.outlineMode} />
                  {style.outlineMode === 'custom' && (
                    <Field label="Custom Outline">
                    <textarea className="input rounded-xl min-h-[100px] resize-y xl:col-span-2 hover:border-gray-300 focus:border-brand-crimson transition-colors" value={style.customOutline} onChange={(e) => setStyle({ ...style, customOutline: e.target.value })} placeholder="Add headings or bullet outline..." />
                    </Field>
                  )}
                </SettingsGroup>

                <SettingsGroup title="Internal Linking & CTA">
                  <Field label="Focus Page / Service">
                    <input className="input rounded-xl hover:border-gray-300 focus:border-brand-crimson transition-colors" value={style.focusPage} onChange={(e) => setStyle({ ...style, focusPage: e.target.value })} />
                  </Field>
                  <Field label="Pages on the company's website to link to">
                    <input className="input rounded-xl hover:border-gray-300 focus:border-brand-crimson transition-colors" value={style.internalLinkPages} onChange={(e) => setStyle({ ...style, internalLinkPages: e.target.value })} placeholder="Comma separated pages or URLs" />
                  </Field>
                  <Field label="CTA Title">
                    <input className="input rounded-xl hover:border-gray-300 focus:border-brand-crimson transition-colors" value={style.ctaTitle} onChange={(e) => setStyle({ ...style, ctaTitle: e.target.value })} />
                  </Field>
                  <Field label="CTA Button Text">
                    <input className="input rounded-xl hover:border-gray-300 focus:border-brand-crimson transition-colors" value={style.ctaButtonText} onChange={(e) => setStyle({ ...style, ctaButtonText: e.target.value })} />
                  </Field>
                  <Field label="CTA Description">
                    <textarea className="input rounded-xl min-h-[72px] resize-y xl:col-span-2 hover:border-gray-300 focus:border-brand-crimson transition-colors" value={style.ctaDescription || style.cta} onChange={(e) => setStyle({ ...style, ctaDescription: e.target.value, cta: e.target.value })} />
                  </Field>
                  <Field label="CTA URL (optional)">
                    <input className="input rounded-xl hover:border-gray-300 focus:border-brand-crimson transition-colors" value={style.ctaUrl} onChange={(e) => setStyle({ ...style, ctaUrl: e.target.value })} />
                  </Field>
                </SettingsGroup>

                <SettingsGroup title="Additional Context">
                  <Field label="Key Points to Cover">
                    <textarea className="input rounded-xl min-h-[90px] resize-y xl:col-span-2 hover:border-gray-300 focus:border-brand-crimson transition-colors" value={style.keyPoints} onChange={(e) => setStyle({ ...style, keyPoints: e.target.value })} />
                  </Field>
                  <Field label="Competitor URLs (optional)">
                    <input className="input rounded-xl hover:border-gray-300 focus:border-brand-crimson transition-colors" value={style.competitorUrls} onChange={(e) => setStyle({ ...style, competitorUrls: e.target.value })} placeholder="Comma separated" />
                  </Field>
                  <Field label="Reference Material / Source URLs (optional)">
                    <input className="input rounded-xl hover:border-gray-300 focus:border-brand-crimson transition-colors" value={style.referenceUrls} onChange={(e) => setStyle({ ...style, referenceUrls: e.target.value })} placeholder="Selected article URL is included automatically" />
                  </Field>
                  <ToggleField label="Include FAQ Section" checked={style.includeFaq} onChange={(checked) => setStyle({ ...style, includeFaq: checked })} />
                  <ToggleField label="Include Statistics & Data" checked={style.includeStats} onChange={(checked) => setStyle({ ...style, includeStats: checked })} />
                </SettingsGroup>
              </div>
              {false && (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                <SelectField label="Tone" value={style.tone} onChange={(value) => setStyle({ ...style, tone: value })} options={STYLE_OPTIONS.tone} />
                <SelectField label="Format" value={style.format} onChange={(value) => setStyle({ ...style, format: value })} options={STYLE_OPTIONS.format} />
                <SelectField label="Length" value={style.length} onChange={(value) => setStyle({ ...style, length: value })} options={STYLE_OPTIONS.length} />
                <SelectField label="Point of view" value={style.pointOfView} onChange={(value) => setStyle({ ...style, pointOfView: value })} options={STYLE_OPTIONS.pointOfView} />
                <Field label="Target Audience">
                  <input className="input rounded-xl hover:border-gray-300 focus:border-brand-crimson transition-colors" value={style.audience} onChange={(e) => setStyle({ ...style, audience: e.target.value })} />
                </Field>
                <Field label="SEO Keywords">
                  <input className="input rounded-xl hover:border-gray-300 focus:border-brand-crimson transition-colors" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="e.g. startup funding, AI regulation" />
                </Field>
                <Field label="Call to Action (CTA)">
                  <textarea className="input rounded-xl min-h-[64px] resize-y xl:col-span-2 hover:border-gray-300 focus:border-brand-crimson transition-colors" value={style.cta} onChange={(e) => setStyle({ ...style, cta: e.target.value })} />
                </Field>
              </div>
              )}
            </div>
            
            <div className="border-t border-gray-200/50 bg-white/70 p-4 backdrop-blur">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                <button 
                  type="button" 
                  onClick={generate} 
                  disabled={isGenerating || !selectedArticle} 
                  className="btn-primary w-full py-3 text-base rounded-xl font-black tracking-wide shadow-lg hover:shadow-brand-crimson/20 transition-all hover-lift disabled:hover:translate-y-0 relative overflow-hidden group"
                >
                  {isGenerating ? (
                    <>
                      <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                      <Loader2 size={18} className="animate-spin relative z-10" />
                      <span className="relative z-10">Generating Content...</span>
                    </>
                  ) : (
                    <>
                      <PenLine size={18} />
                      Generate Blog Draft
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setDraftDrawerOpen(true)}
                  className="inline-flex min-h-[54px] items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-black text-gray-700 transition-all hover:border-brand-crimson/30 hover:text-brand-crimson"
                >
                  <BookOpenText size={16} />
                  Drafts & Publishing
                </button>
              </div>
            </div>
          </section>
        </div>
        <BlogDraftDrawer
          open={draftDrawerOpen}
          onClose={closeDraftDrawer}
          blogQuery={blogQuery}
          setBlogQuery={setBlogQuery}
          selectedBlogIds={selectedBlogIds}
          toggleSelectAllBlogs={toggleSelectAllBlogs}
          deleteBlogs={deleteBlogs}
          deletingBlogs={deletingBlogs}
          loadingBlogs={loadingBlogs}
          blogs={blogs}
          selectedBlog={selectedBlog}
          setSelectedBlog={setSelectedBlog}
          toggleBlogSelection={toggleBlogSelection}
          draftEditorOpen={draftEditorOpen}
          setDraftEditorOpen={setDraftEditorOpen}
          savingStatus={savingStatus}
          updateBlogStatus={updateBlogStatus}
          draftForm={draftForm}
          setDraftForm={setDraftForm}
          saveDraftEdits={saveDraftEdits}
          savingDraft={savingDraft}
          blogsHasMore={blogsHasMore}
          blogLoadMoreRef={blogLoadMoreRef}
        />
        </>
        )}
        </div>
        {generationLocked ? (
          <div className="fixed inset-0 z-[70] flex items-center justify-center px-4" style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(16px)' }}>
            <div className="relative w-full max-w-[320px]">
              {/* Ultra-soft ambient pink glow */}
              <div className="absolute -inset-10 rounded-[50px] bg-brand-pink/20 blur-3xl pointer-events-none" />

              <div className="relative overflow-hidden rounded-[24px] border border-gray-100 bg-white p-7 text-center shadow-[0_24px_50px_rgba(209,18,67,0.06)]">
                
                {/* Single premium custom spinner */}
                <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center">
                  {/* Rotating clean gradient track */}
                  <div className="absolute inset-0 rounded-full border-[2px] border-gray-100" />
                  <div className="absolute inset-0 rounded-full border-[2px] border-transparent border-t-brand-crimson animate-spin" />
                  {/* Central soft logo indicator */}
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-pink/30 text-brand-crimson shadow-[inset_0_1px_2px_rgba(209,18,67,0.05)] animate-pulse">
                    {isGeneratingLinkedin ? (
                      <MessageSquareText size={18} />
                    ) : (
                      <BookOpenText size={18} />
                    )}
                  </div>
                </div>

                {/* Plain, premium text */}
                <h3 className="text-base font-black text-gray-900 tracking-tight">{generationOverlayTitle}</h3>
                <p className="mt-1 text-xs font-semibold text-gray-400">{generationOverlaySubtitle}</p>

                {/* Extremely minimal cancel link */}
                <div className="mt-6 flex justify-center">
                  <button
                    type="button"
                    onClick={cancelGeneration}
                    className="text-[10px] font-black uppercase tracking-wider text-gray-400 hover:text-brand-crimson transition-colors"
                  >
                    Cancel Generation
                  </button>
                </div>

              </div>
            </div>
          </div>
        ) : null}
        {CONTENT_STUDIO_UPCOMING_MODE ? <UpcomingStudioOverlay /> : null}
      </div>
    </Layout>
  );
}

function UpcomingStudioOverlay() {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center p-4 sm:p-8">
      <div className="absolute inset-0 rounded-[28px] bg-[radial-gradient(circle_at_top,rgba(209,18,67,0.16),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.42),rgba(255,255,255,0.76))]" />
      <div className="relative flex min-h-[220px] w-full max-w-xl items-center justify-center overflow-hidden rounded-[28px] border border-white/70 bg-white/82 p-8 text-center shadow-[0_28px_80px_rgba(209,18,67,0.18)] backdrop-blur-xl sm:p-10">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand-crimson via-rose-400 to-brand-crimson" />
        <h2 className="text-3xl font-black tracking-tight text-gray-900 sm:text-4xl">
          Upcoming
        </h2>
      </div>
    </div>
  );
}

function BlogDraftDrawer({
  open,
  onClose,
  blogQuery,
  setBlogQuery,
  selectedBlogIds,
  toggleSelectAllBlogs,
  deleteBlogs,
  deletingBlogs,
  loadingBlogs,
  blogs,
  selectedBlog,
  setSelectedBlog,
  toggleBlogSelection,
  draftEditorOpen,
  setDraftEditorOpen,
  savingStatus,
  updateBlogStatus,
  draftForm,
  setDraftForm,
  saveDraftEdits,
  savingDraft,
  blogsHasMore,
  blogLoadMoreRef
}) {
  const allBlogsSelected = blogs.length > 0 && selectedBlogIds.length === blogs.length;

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-gray-950/30 backdrop-blur-[2px] transition-opacity duration-300 ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      />
      <aside
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-[760px] border-l border-gray-200 bg-white shadow-[0_0_60px_rgba(15,23,42,0.18)] transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <div className="min-w-0">
              <div className="text-base font-black text-gray-900">Drafts & Publishing</div>
              <div className="text-xs font-semibold text-gray-500">Review, edit, and publish your generated drafts from here.</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wider text-gray-500 transition-all hover:border-brand-crimson/30 hover:text-brand-crimson"
            >
              Close
            </button>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(260px,300px)_minmax(0,1fr)]">
            <aside className={`${draftEditorOpen ? 'hidden xl:flex' : 'flex'} min-h-0 flex-col border-b border-gray-100 bg-gray-50/60 xl:min-h-0 xl:border-b-0 xl:border-r`}>
              <div className="border-b border-gray-100 bg-white p-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input className="input min-h-[42px] rounded-xl bg-gray-50 pl-9 transition-colors hover:bg-white hover:border-gray-300 focus:bg-white focus:border-brand-crimson" value={blogQuery} onChange={(e) => setBlogQuery(e.target.value)} placeholder="Search drafts..." />
                </div>
                {selectedBlogIds.length ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-crimson/10 bg-brand-pink/20 px-3 py-2">
                    <span className="text-xs font-black text-brand-crimson">{selectedBlogIds.length} selected</span>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={toggleSelectAllBlogs} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-gray-500 hover:border-gray-300">
                        {allBlogsSelected ? 'Unselect All' : 'Select All'}
                      </button>
                      <button type="button" onClick={() => deleteBlogs(selectedBlogIds)} disabled={deletingBlogs} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-red-600 transition-all hover:bg-red-100 disabled:opacity-60">
                        {deletingBlogs ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 custom-scrollbar">
                {loadingBlogs && !blogs.length ? (
                  <LoadingRows label="Loading drafts..." />
                ) : blogs.length ? (
                  <>
                    {blogs.map((blog) => {
                      const selectedForBulk = selectedBlogIds.includes(blog._id);
                      const active = selectedBlog?._id === blog._id;
                      return (
                        <div
                          key={blog._id}
                          className={`w-full rounded-xl border bg-white p-3 text-left transition-all duration-200 hover:border-gray-200 hover:shadow-sm ${active ? 'border-brand-crimson shadow-sm ring-1 ring-brand-crimson/15' : 'border-gray-100'}`}
                        >
                          <div className="flex items-start gap-3">
                            <button
                              type="button"
                              onClick={() => toggleBlogSelection(blog._id)}
                              className={`mt-0.5 rounded-lg p-1 transition-all ${selectedForBulk ? 'text-brand-crimson' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'}`}
                              title={selectedForBulk ? 'Unselect' : 'Select'}
                            >
                              {selectedForBulk ? <CheckSquare size={16} /> : <Square size={16} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedBlog(blog);
                                setDraftEditorOpen(true);
                              }}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div className="mb-2 flex items-start justify-between gap-2">
                                <span className="truncate text-sm font-black leading-tight text-gray-900">{blog.title}</span>
                                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                                  blog.status === 'published' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                                  blog.status === 'review' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                                  'bg-gray-50 text-gray-500 border-gray-200'
                                }`}>
                                  {blog.status}
                                </span>
                              </div>
                              <p className="line-clamp-2 text-xs font-medium leading-relaxed text-gray-500">{blog.excerpt}</p>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {blogsHasMore ? (
                      <div ref={blogLoadMoreRef} className="flex items-center justify-center py-3 text-xs font-bold text-gray-400">
                        {loadingBlogs ? 'Loading more...' : 'Scroll for more'}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <Empty icon={BookOpenText} label="No drafts generated yet" />
                )}
              </div>
            </aside>

            <div className={`${draftEditorOpen ? 'block' : 'hidden xl:block'} min-h-0 overflow-y-auto bg-white p-4 custom-scrollbar xl:min-h-0`}>
              {selectedBlog && draftEditorOpen ? (
                <div className="animate-fade-in-up stagger-1">
                  <button
                    type="button"
                    onClick={() => setDraftEditorOpen(false)}
                    className="mb-3 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wider text-gray-500 transition-all hover:border-brand-crimson/30 hover:text-brand-crimson xl:hidden"
                  >
                    Back to drafts
                  </button>
                  <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Status</span>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest border ${
                          selectedBlog.status === 'published' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                          selectedBlog.status === 'review' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                          'bg-gray-50 text-gray-500 border-gray-200'
                        }`}>
                          {selectedBlog.status}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <StatusButton status="review" current={selectedBlog.status} saving={savingStatus} onClick={updateBlogStatus} />
                      <StatusButton status="published" current={selectedBlog.status} saving={savingStatus} onClick={updateBlogStatus} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <Field label="Post Title">
                      <input className="input min-h-[42px] rounded-xl font-bold transition-colors hover:border-gray-300 focus:border-brand-crimson" value={draftForm.title} onChange={(e) => setDraftForm({ ...draftForm, title: e.target.value })} />
                    </Field>
                    <Field label="Short Excerpt">
                      <textarea className="input min-h-[92px] resize-y rounded-xl text-sm transition-colors hover:border-gray-300 focus:border-brand-crimson" value={draftForm.excerpt} onChange={(e) => setDraftForm({ ...draftForm, excerpt: e.target.value })} />
                    </Field>
                    <Field label="Markdown Content">
                      <textarea className="input min-h-[360px] resize-y rounded-xl bg-gray-50 font-mono text-xs leading-relaxed transition-colors hover:border-gray-300 focus:bg-white focus:border-brand-crimson custom-scrollbar md:min-h-[430px]" value={draftForm.bodyMarkdown} onChange={(e) => setDraftForm({ ...draftForm, bodyMarkdown: e.target.value })} />
                    </Field>
                    <button type="button" onClick={saveDraftEdits} disabled={savingDraft} className="btn-secondary w-full rounded-xl bg-white py-3 font-black">
                      {savingDraft ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                      Save Edits
                    </button>
                  </div>
                </div>
              ) : selectedBlog ? (
                <div className="flex h-full min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 p-6 text-center">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white text-brand-crimson shadow-sm ring-1 ring-gray-100">
                    <BookOpenText size={18} />
                  </div>
                  <div className="max-w-sm text-sm font-black text-gray-900">{selectedBlog.title}</div>
                  <p className="mt-2 max-w-sm text-xs font-semibold leading-relaxed text-gray-500">
                    Click this draft in the list to open edit mode.
                  </p>
                  <button
                    type="button"
                    onClick={() => setDraftEditorOpen(true)}
                    className="mt-4 rounded-xl bg-brand-crimson px-4 py-2 text-xs font-black text-white shadow-sm transition-all hover:bg-brand-hoverred"
                  >
                    Open Editor
                  </button>
                </div>
              ) : (
                <Empty icon={Settings2} label="Click a draft to open" />
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function cleanList(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function ContentTypeCard({ icon: Icon, title, description, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`glass-panel p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg ${
        active ? 'ring-2 ring-brand-crimson ring-offset-2' : 'hover:border-brand-crimson/30'
      }`}
    >
      <div className="flex items-start gap-4">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          active ? 'bg-brand-crimson text-white' : 'bg-white text-brand-crimson border border-brand-crimson/10'
        }`}>
          <Icon size={20} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-black text-gray-900">{title}</h2>
          <p className="mt-1 text-sm font-semibold leading-relaxed text-gray-500">{description}</p>
        </div>
      </div>
    </button>
  );
}

function SocialPlatformSelector({ value, onChange }) {
  const platforms = [
    {
      key: 'linkedin',
      title: 'LinkedIn Post',
      description: 'Create a professional LinkedIn post from selected intelligence.',
      icon: MessageSquareText,
      disabled: false
    },
    {
      key: 'instagram',
      title: 'Instagram Post',
      description: 'Upcoming',
      icon: Sparkles,
      disabled: true
    },
    {
      key: 'facebook',
      title: 'Facebook Post',
      description: 'Upcoming',
      icon: Sparkles,
      disabled: true
    }
  ];

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      {platforms.map((platform) => {
        const Icon = platform.icon;
        const active = value === platform.key;
        return (
          <button
            key={platform.key}
            type="button"
            disabled={platform.disabled}
            onClick={() => onChange(platform.key)}
            className={`glass-panel flex items-center gap-4 px-5 py-4 text-left transition-all ${
              active ? 'ring-2 ring-brand-crimson ring-offset-1' : 'hover:border-brand-crimson/30'
            } ${platform.disabled ? 'cursor-not-allowed opacity-60' : 'hover:-translate-y-0.5 hover:shadow-md'}`}
          >
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
              active ? 'bg-brand-crimson text-white' : 'bg-white text-brand-crimson border border-brand-crimson/10'
            }`}>
              <Icon size={19} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-black text-gray-900">{platform.title}</span>
              <span className={`mt-1 block text-xs font-bold ${platform.disabled ? 'text-amber-500' : 'text-gray-500'}`}>
                {platform.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CompactPlatformSelector({ value, onChange }) {
  const options = [
    ['linkedin', 'LinkedIn'],
    ['instagram', 'Instagram'],
    ['facebook', 'Facebook']
  ];

  return (
    <div className="mb-4 grid grid-cols-3 rounded-xl border border-gray-100 bg-gray-50 p-1">
      {options.map(([key, label]) => {
        const disabled = key !== 'linkedin';
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onChange(key)}
            className={`relative min-h-[36px] overflow-hidden rounded-lg px-2 text-[11px] font-black transition-all ${
              active ? 'bg-brand-crimson text-white shadow-sm' : disabled ? 'cursor-not-allowed bg-white/60 text-amber-500' : 'text-gray-500 hover:bg-white'
            }`}
          >
            {disabled ? <span className="absolute inset-y-0 -left-1/2 w-1/2 animate-[shimmerPass_2.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/80 to-transparent" /> : null}
            {label}
            {disabled ? <span className="ml-1 inline-block animate-pulse text-[9px] uppercase tracking-wider">Soon</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function LinkedInOutputPreview({
  output,
  onSave,
  saving = false,
  onBackToList
}) {
  const [copied, setCopied] = useState(false);

  const copyOutput = useCallback(async () => {
    if (!output?.postText) return;
    const hashtags = Array.isArray(output.hashtags) && output.hashtags.length ? `\n\n${output.hashtags.join(' ')}` : '';
    try {
      await navigator.clipboard.writeText(`${output.postText}${hashtags}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [output]);

  const emptyPreview = (
    <div className="flex h-full min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 p-6 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white text-brand-crimson shadow-sm ring-1 ring-gray-100">
        <MessageSquareText size={18} />
      </div>
      <div className="max-w-sm text-sm font-black text-gray-900">No post selected</div>
      <p className="mt-2 max-w-sm text-xs font-semibold leading-relaxed text-gray-500">
        Generate a post or open one from the saved posts list.
      </p>
    </div>
  );

  const previewPanel = output ? (
    <>
      <button
        type="button"
        onClick={onBackToList}
        className="mb-3 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wider text-gray-500 transition-all hover:border-brand-crimson/30 hover:text-brand-crimson xl:hidden"
      >
        <ArrowLeft size={13} />
        Back to saved posts
      </button>
      <div className="animate-fade-in-up stagger-1">
        <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Platform</span>
              <span className="rounded-full border border-brand-crimson/20 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-brand-crimson">
                {output.framework || 'LinkedIn'}
              </span>
              {output.topicTier ? (
                <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-gray-500">
                  {output.topicTier}
                </span>
              ) : null}
              {output.emotionalJob ? (
                <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-gray-500">
                  {output.emotionalJob}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!output.saved ? (
                <button
                  type="button"
                  onClick={onSave}
                  disabled={saving}
                  className="group relative inline-flex min-h-[40px] items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-brand-crimson to-brand-hoverred px-5 py-2 text-[12px] font-black uppercase tracking-wider text-white shadow-[0_0_0_3px_rgba(209,18,67,0.15),0_4px_14px_rgba(209,18,67,0.35)] transition-all hover:shadow-[0_0_0_4px_rgba(209,18,67,0.2),0_6px_20px_rgba(209,18,67,0.45)] hover:scale-[1.03] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100"
                >
                  {/* shimmer sweep */}
                  <span className="absolute inset-0 -translate-x-full skew-x-[-20deg] bg-white/20 transition-transform duration-700 group-hover:translate-x-full" />
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  {saving ? 'Saving...' : 'Save Post'}
                </button>
              ) : (
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-600">Saved</span>
              )}
              <button
                type="button"
                onClick={copyOutput}
                className="inline-flex min-h-[34px] items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-gray-600 transition-all hover:border-brand-crimson/30 hover:text-brand-crimson"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
          <div className="text-sm font-black leading-snug text-gray-900">
            {output.selectedTopic || 'LinkedIn post preview'}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 border-b border-gray-100 pb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-crimson text-xs font-black text-white">A</div>
              <div className="min-w-0">
                <div className="text-sm font-black text-gray-900">Admin</div>
                <div className="text-[11px] font-semibold text-gray-400">LinkedIn draft preview</div>
              </div>
            </div>
            <div className="whitespace-pre-wrap text-sm font-medium leading-relaxed text-gray-800">
              {output.postText}
            </div>
            {Array.isArray(output.hashtags) && output.hashtags.length ? (
              <div className="mt-4 border-t border-gray-100 pt-4 text-sm font-bold leading-relaxed text-brand-crimson">
                {output.hashtags.join(' ')}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  ) : emptyPreview;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50/60 p-4 custom-scrollbar">
      {previewPanel}
    </div>
  );
}

function SavedSocialPostsList({ posts = [], loading = false, onSelect, activeId, className = 'mt-4' }) {
  return (
    <div className={className}>
      {posts.length ? (
        <div className="space-y-2">
          {posts.map((post) => (
            <div
              key={post._id}
              className={`w-full rounded-xl border bg-white p-3 text-left transition-all duration-200 hover:border-gray-200 hover:shadow-sm ${
                activeId === post._id ? 'border-brand-crimson shadow-sm ring-1 ring-brand-crimson/15' : 'border-gray-100'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect?.(post)}
                className="w-full text-left"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span className="line-clamp-2 text-sm font-black leading-tight text-gray-900">{post.selectedTopic || 'Saved LinkedIn post'}</span>
                  <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-600">
                    Published
                  </span>
                </div>
                <p className="line-clamp-2 text-xs font-medium leading-relaxed text-gray-500">{post.postText}</p>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl bg-gray-50 p-4 text-center text-xs font-bold text-gray-400">No saved posts yet</div>
      )}
    </div>
  );
}

function TopicFilterBar({ filters, onChange, categoryOptions, subcategoryOptions, countries, types }) {
  const [open, setOpen] = useState(false);
  const hasFilters = Object.values(filters).some(Boolean);
  const activeCount = Object.values(filters).filter(Boolean).length;
  const activeLabels = [
    filters.type && (types || EMPTY_META.types).find((item) => item.id === filters.type)?.label,
    filters.category,
    filters.subcategory,
    filters.country,
    filters.saved === 'true' ? 'Saved only' : '',
    filters.q ? 'Search' : '',
  ].filter(Boolean).slice(0, 3);
  const clearFilters = () => {
    ['q', 'type', 'category', 'subcategory', 'country', 'saved'].forEach((key) => onChange(key, ''));
  };

  return (
    <div className="border-b border-gray-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(252,247,249,0.96)_100%)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-all hover:bg-white sm:px-4"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-pink/55 to-rose-100 text-brand-crimson ring-1 ring-brand-crimson/10 shadow-[0_10px_24px_rgba(209,18,67,0.10)]">
            <MoreHorizontal size={16} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[11px] font-black uppercase tracking-[0.18em] text-gray-700">Filters</div>
            <div className="mt-0.5 flex min-h-[18px] min-w-0 flex-wrap items-center gap-1.5">
              {activeCount ? (
                <>
                  <span className="rounded-full bg-brand-crimson px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-white">
                    {activeCount} active
                  </span>
                  {activeLabels.map((label) => (
                    <span key={label} className="truncate rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-bold text-gray-500">
                      {label}
                    </span>
                  ))}
                </>
              ) : (
                <span className="text-[11px] font-semibold text-gray-400">Refine by type, category, country, or saved topics</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hasFilters ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                clearFilters();
              }}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-gray-500 shadow-sm transition-all hover:border-brand-crimson/30 hover:text-brand-crimson"
            >
              Clear
            </button>
          ) : null}
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400 shadow-sm">
            <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </span>
        </div>
      </button>

      {open && (
      <div className="grid grid-cols-1 gap-3 border-t border-gray-100/80 bg-white/70 px-3 pb-4 pt-2 sm:grid-cols-2 sm:px-4">
        <div className="relative sm:col-span-2">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input min-h-[46px] rounded-2xl border-gray-200 bg-white pl-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition-colors hover:border-gray-300 focus:border-brand-crimson"
            value={filters.q}
            onChange={(e) => onChange('q', e.target.value)}
            placeholder="Search intelligence topics..."
          />
        </div>

        <TopicSelect label="Type" value={filters.type} onChange={(value) => onChange('type', value)}>
          <option value="">All types</option>
          {(types || EMPTY_META.types).map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
        </TopicSelect>

        <TopicSelect label="Category" value={filters.category} onChange={(value) => onChange('category', value)}>
          <option value="">All categories</option>
          {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
        </TopicSelect>

        <TopicSelect
          label="Sub-category"
          value={filters.subcategory}
          onChange={(value) => onChange('subcategory', value)}
          disabled={!filters.category}
        >
          <option value="">All sub-categories</option>
          {subcategoryOptions.map((subcategory) => <option key={subcategory} value={subcategory}>{subcategory}</option>)}
        </TopicSelect>

        <TopicSelect label="Country" value={filters.country} onChange={(value) => onChange('country', value)}>
          <option value="">All countries</option>
          {(countries || []).map((country) => <option key={country} value={country}>{country}</option>)}
        </TopicSelect>

        <TopicSelect label="Saved" value={filters.saved} onChange={(value) => onChange('saved', value)}>
          <option value="">All topics</option>
          <option value="true">Saved only</option>
        </TopicSelect>
      </div>
      )}
    </div>
  );
}

function TopicSelect({ label, value, onChange, children, disabled = false }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.16em] text-gray-500">{label}</span>
      <select
        className="select min-h-[46px] w-full rounded-2xl border-gray-200 bg-white shadow-[0_1px_0_rgba(255,255,255,0.6),inset_0_1px_0_rgba(255,255,255,0.7)] transition-colors hover:border-gray-300 focus:border-brand-crimson disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {children}
      </select>
    </label>
  );
}

function TopicSelectionFooter({ isSelected, idleHint, selectedHint }) {
  return (
    <div
      className={[
        'relative flex items-center justify-between gap-3 rounded-[20px] border px-3.5 py-3.5 text-xs transition-all',
        isSelected
          ? 'border-brand-crimson/70 bg-[linear-gradient(135deg,#d11243_0%,#b40f39_100%)] text-white shadow-[0_16px_32px_rgba(180,15,57,0.26)]'
          : 'border-rose-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,244,247,0.98)_100%)] text-gray-600 shadow-[0_8px_18px_rgba(15,23,42,0.05)] group-hover/topic:border-brand-crimson/30 group-hover/topic:shadow-[0_12px_24px_rgba(209,18,67,0.10)]'
      ].join(' ')}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${isSelected ? 'bg-white/15 text-white' : 'border border-brand-crimson/15 bg-white text-brand-crimson shadow-[0_10px_20px_rgba(209,18,67,0.10)]'}`}>
          {isSelected ? <Check size={14} /> : <MousePointer2 size={14} />}
        </span>
        <div className="min-w-0">
          <div className={`truncate text-[11px] font-black uppercase tracking-[0.18em] ${isSelected ? 'text-white' : 'text-brand-crimson'}`}>
            {isSelected ? 'Ready to Generate' : 'Select Topic'}
          </div>
          <div className={`mt-0.5 text-[11px] font-medium leading-relaxed ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>
            {isSelected ? selectedHint : idleHint}
          </div>
        </div>
      </div>
      {isSelected ? (
        <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <Sparkles size={12} />
          Active
        </div>
      ) : (
        <div className="inline-flex shrink-0 items-center rounded-full border border-brand-crimson/10 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-brand-crimson shadow-sm">
          Select
        </div>
      )}
    </div>
  );
}

function LinkedInStudio({
  socialPlatform,
  setSocialPlatform,
  articles,
  articlesHasMore,
  articleLoadMoreRef,
  selectedArticle,
  setSelectedArticle,
  loadingArticles,
  topicFilters,
  updateTopicFilter,
  categoryOptions,
  subcategoryOptions,
  countries,
  types,
  linkedinForm,
  setLinkedinForm,
  generatingLinkedin,
  generateLinkedinPost,
  cancelGeneration,
  saveLinkedinPost,
  canUseBlogStudio,
  linkedinOutput,
  setLinkedinOutput,
  savingLinkedinPost,
  socialPosts,
  loadingSocialPosts,
  focusComposerMode = false,
  onPreviewOpenChange
}) {
  const update = (key, value) => setLinkedinForm({ ...linkedinForm, [key]: value });
  const [draggingArticleId, setDraggingArticleId] = useState('');
  const [dropActive, setDropActive] = useState(false);
  const [outputDrawerOpen, setOutputDrawerOpen] = useState(false);
  const hasMountedOutputEffect = useRef(false);
  const selectArticleById = (articleId) => {
    const article = articles.find((item) => item._id === articleId);
    if (article) setSelectedArticle(article);
  };

  useEffect(() => {
    if (!hasMountedOutputEffect.current) {
      hasMountedOutputEffect.current = true;
      return;
    }
    if (linkedinOutput?.postText) setOutputDrawerOpen(true);
  }, [linkedinOutput?._id, linkedinOutput?.postText, linkedinOutput?.previewToken]);

  useEffect(() => {
    onPreviewOpenChange?.(outputDrawerOpen);
    return () => onPreviewOpenChange?.(false);
  }, [onPreviewOpenChange, outputDrawerOpen]);

  return (
    <>
    <div className="grid grid-cols-1 gap-4 animate-fade-in-up stagger-3 xl:grid-cols-2">
      <section className={`${focusComposerMode ? 'hidden xl:flex' : 'flex'} min-h-[520px] flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm xl:h-[calc(100vh-96px)]`}>
        <PanelHeader icon={Layers} title="Intelligence Topics" />
        <TopicFilterBar
          filters={topicFilters}
          onChange={updateTopicFilter}
          categoryOptions={categoryOptions}
          subcategoryOptions={subcategoryOptions}
          countries={countries}
          types={types}
        />
        <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50/30 p-4 custom-scrollbar">
          {loadingArticles && !articles.length ? (
            <LoadingRows label="Loading intelligence topics..." />
          ) : articles.length ? (
            <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
              {articles.map((item) => {
                const isSelected = selectedArticle?._id === item._id;
                return (
                  <div
                    key={item._id}
                    role="button"
                    tabIndex={0}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/plain', item._id);
                      setDraggingArticleId(item._id);
                    }}
                    onDragEnd={() => setDraggingArticleId('')}
                    onClick={() => setSelectedArticle(item)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') setSelectedArticle(item);
                    }}
                    className={`group/topic relative w-full cursor-grab rounded-[26px] text-left active:cursor-grabbing transition-all duration-300 ${draggingArticleId === item._id ? 'scale-[0.985] opacity-50' : 'hover:-translate-y-1'} ${isSelected ? 'ring-2 ring-brand-crimson/70 ring-offset-2 ring-offset-rose-50/70' : ''}`}
                  >
                    <ArticleCard
                      item={item}
                      compact
                      selected={isSelected}
                      compactFooter={(
                        <TopicSelectionFooter
                          isSelected={isSelected}
                          idleHint="Click once or drag this card into the builder"
                          selectedHint="Topic selected for social post"
                        />
                      )}
                    />
                  </div>
                );
              })}
              {articlesHasMore ? (
                <div ref={articleLoadMoreRef} className="col-span-full flex items-center justify-center py-3 text-xs font-bold text-gray-400">
                  {loadingArticles ? 'Loading more...' : 'Scroll for more'}
                </div>
              ) : null}
            </div>
          ) : (
            <Empty icon={FileText} label="No topics found matching criteria" />
          )}
        </div>
      </section>

      <section className="relative flex min-h-[620px] flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm xl:h-[calc(100vh-96px)]">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-brand-crimson via-brand-pink to-brand-crimson opacity-50"></div>
        <PanelHeader icon={Settings2} title="Post Builder" subtitle="Customize before generation" />

        <div className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="space-y-4">
            <SettingsGroup title="Platform & Source">
                <div className="xl:col-span-2">
                <CompactPlatformSelector value={socialPlatform} onChange={setSocialPlatform} />
              </div>
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDropActive(true);
                }}
                onDragLeave={() => setDropActive(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDropActive(false);
                  selectArticleById(event.dataTransfer.getData('text/plain'));
                }}
                className={`xl:col-span-2 rounded-xl border border-dashed p-4 transition-all ${dropActive ? 'border-brand-crimson bg-brand-pink/10' : selectedArticle ? 'border-gray-200 bg-white/60' : 'border-gray-200 bg-gray-50/70 hover:bg-gray-50'}`}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-xs font-black uppercase tracking-wider text-gray-500">Selected Topic Source</div>
                  {selectedArticle ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedArticle(null);
                        setLinkedinOutput(null);
                      }}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wider text-gray-500 transition-all hover:border-brand-crimson/30 hover:text-brand-crimson"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
                {selectedArticle ? (
                  <>
                    <div className="text-sm font-black leading-snug text-gray-900">{selectedArticle.title}</div>
                    <p className="mt-2 line-clamp-3 border-l-2 border-gray-200 pl-3 text-xs font-medium italic text-gray-500">
                      {selectedArticle.summary || selectedArticle.aiSummary}
                    </p>
                  </>
                ) : (
                  <div className="flex min-h-[90px] items-center justify-center rounded-lg bg-white/60 text-center text-sm font-bold text-gray-500">
                    Drag a topic here or click one from the left.
                  </div>
                )}
              </div>
            </SettingsGroup>

            <SettingsGroup title="Post Strategy">
              <SelectField
                label="Post Goal"
                value={linkedinForm.postGoal}
                onChange={(value) => update('postGoal', value)}
                options={[
                  ['thought_leadership', 'Thought Leadership'],
                  ['client_alert', 'Client Alert'],
                  ['market_insight', 'Market Insight'],
                  ['educational', 'Educational'],
                  ['lead_generation', 'Lead Generation']
                ]}
              />
              <SelectField
                label="Tone"
                value={linkedinForm.tone}
                onChange={(value) => update('tone', value)}
                options={STYLE_OPTIONS.tone}
              />
              <SelectField
                label="Length"
                value={linkedinForm.length}
                onChange={(value) => update('length', value)}
                options={[
                  ['short', 'Short'],
                  ['medium', 'Medium'],
                  ['long', 'Long']
                ]}
              />
              <SelectField
                label="Hook Style"
                value={linkedinForm.hookStyle}
                onChange={(value) => update('hookStyle', value)}
                options={[
                  ['proof', 'Proof-led'],
                  ['warning', 'Warning-led'],
                  ['contrarian', 'Contrarian'],
                  ['personal_story', 'Personal story'],
                  ['insight', 'Insight-led'],
                  ['question', 'Question-led'],
                  ['stat', 'Stat-led']
                ]}
              />
              <SelectField
                label="Framework"
                value={linkedinForm.framework}
                onChange={(value) => update('framework', value)}
                options={[
                  ['auto', 'Auto select'],
                  ['SLAY', 'SLAY - story-led authority'],
                  ['PAS', 'PAS - pain-driven inbound'],
                  ['PRA', 'PRA - problem-risk-action'],
                  ['POV', 'POV - high reach'],
                  ['5-Line Mirror', '5-Line Mirror'],
                  ['AIDA', 'AIDA - conversion']
                ]}
              />
              <SelectField
                label="Topic Tier"
                value={linkedinForm.topicTier}
                onChange={(value) => update('topicTier', value)}
                options={[
                  ['auto', 'Auto select'],
                  ['Broad', 'Broad - reach'],
                  ['Practical', 'Practical - decision-useful'],
                  ['Narrow', 'Narrow - authority'],
                  ['Niche', 'Niche - conversion']
                ]}
              />
              <SelectField
                label="Emotional Job"
                value={linkedinForm.emotionalJob}
                onChange={(value) => update('emotionalJob', value)}
                options={[
                  ['auto', 'Auto select'],
                  ['Inspire', 'Inspire'],
                  ['Educate', 'Educate'],
                  ['Urgency', 'Urgency'],
                  ['Reassure', 'Reassure'],
                  ['Provoke', 'Provoke'],
                  ['Convert', 'Convert']
                ]}
              />
              <Field label="Rule of One Takeaway">
                <input className="input rounded-xl hover:border-gray-300 focus:border-brand-crimson transition-colors" value={linkedinForm.takeaway} onChange={(e) => update('takeaway', e.target.value)} placeholder="One clear thing reader should remember" />
              </Field>
            </SettingsGroup>

            <SettingsGroup title="Audience & CTA">
              <Field label="Target Audience">
                <input className="input rounded-xl hover:border-gray-300 focus:border-brand-crimson transition-colors" value={linkedinForm.audience} onChange={(e) => update('audience', e.target.value)} />
              </Field>
              <Field label="Person Profile">
                <input className="input rounded-xl hover:border-gray-300 focus:border-brand-crimson transition-colors" value={linkedinForm.personaProfile} onChange={(e) => update('personaProfile', e.target.value)} placeholder="Founder / operator / advisor / consultant..." />
              </Field>
              <Field label="Call to Action">
                <input className="input rounded-xl hover:border-gray-300 focus:border-brand-crimson transition-colors" value={linkedinForm.cta} onChange={(e) => update('cta', e.target.value)} placeholder="Optional - leave blank for a contextual CTA" />
              </Field>
              <Field label="Soft Authority Line">
                <input className="input rounded-xl hover:border-gray-300 focus:border-brand-crimson transition-colors" value={linkedinForm.authorityLine} onChange={(e) => update('authorityLine', e.target.value)} placeholder="Subtle credibility line" />
              </Field>
              <ToggleField label="Include hashtags" checked={linkedinForm.includeHashtags} onChange={(checked) => update('includeHashtags', checked)} />
              <ToggleField label="Include CTA" checked={linkedinForm.includeCTA} onChange={(checked) => update('includeCTA', checked)} />
            </SettingsGroup>

            <SettingsGroup title="Market Context">
              <Field label="ICP Pain Points">
                <textarea className="input rounded-xl min-h-[96px] resize-y hover:border-gray-300 focus:border-brand-crimson transition-colors" value={linkedinForm.icpPainPoints} onChange={(e) => update('icpPainPoints', e.target.value)} placeholder="What painful truth should this speak to?" />
              </Field>
              <Field label="Market Realities">
                <textarea className="input rounded-xl min-h-[96px] resize-y hover:border-gray-300 focus:border-brand-crimson transition-colors" value={linkedinForm.marketReality} onChange={(e) => update('marketReality', e.target.value)} placeholder="What is changing in the market?" />
              </Field>
              <Field label="Proof Element">
                <input className="input rounded-xl hover:border-gray-300 focus:border-brand-crimson transition-colors" value={linkedinForm.proofElement} onChange={(e) => update('proofElement', e.target.value)} placeholder="Number / timeframe / result, if known" />
              </Field>
              <Field label="Custom Instructions">
                <textarea className="input rounded-xl min-h-[120px] resize-y hover:border-gray-300 focus:border-brand-crimson transition-colors" value={linkedinForm.customInstructions} onChange={(e) => update('customInstructions', e.target.value)} placeholder="Add brand voice, angle, keywords, do/don't rules..." />
              </Field>
            </SettingsGroup>
          </div>

        </div>

        <div className="border-t border-gray-200/50 bg-white/70 p-5 backdrop-blur">
          <div className="grid grid-cols-1 gap-3">
            <button
              type="button"
              disabled={generatingLinkedin || !canUseBlogStudio}
              onClick={generateLinkedinPost}
              className="btn-primary w-full rounded-xl py-3.5 text-base font-black tracking-wide shadow-lg transition-all hover:shadow-brand-crimson/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generatingLinkedin ? <Loader2 size={18} className="animate-spin" /> : <PenLine size={18} />}
              {generatingLinkedin ? 'Generating LinkedIn Post...' : 'Generate LinkedIn Post'}
            </button>
          </div>
          <div className="mt-3 text-xs font-semibold text-gray-500">
            After generation, the post preview will open in the right-side drawer.
          </div>
        </div>
      </section>
    </div>
    <SocialOutputDrawer
      open={outputDrawerOpen}
      onClose={() => {
        if (linkedinOutput && !linkedinOutput.saved) {
          const confirmSave = window.confirm("You have unsaved changes. Do you want to save this LinkedIn post before closing?");
          if (confirmSave) {
            saveLinkedinPost();
            return;
          }
        }
        setOutputDrawerOpen(false);
        if (!linkedinOutput?.saved) setLinkedinOutput(null);
      }}
      output={linkedinOutput}
      savedPosts={socialPosts}
      loadingSaved={loadingSocialPosts}
      onSelectSaved={(post) => {
        setLinkedinOutput({ ...post, saved: true });
        setOutputDrawerOpen(true);
      }}
      onSave={saveLinkedinPost}
      saving={savingLinkedinPost}
    />
    </>
  );
}

function SocialOutputDrawer({ open, onClose, output, savedPosts, loadingSaved, onSelectSaved, onSave, saving }) {
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [savedPostsQuery, setSavedPostsQuery] = useState('');
  const drawerRef = useRef(null);
  const listPaneRef = useRef(null);
  const previewPaneRef = useRef(null);
  const filteredSavedPosts = useMemo(() => {
    const query = savedPostsQuery.trim().toLowerCase();
    if (!query) return savedPosts;
    return savedPosts.filter((post) => (
      [post?.selectedTopic, post?.postText, post?.framework]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    ));
  }, [savedPosts, savedPostsQuery]);

  useEffect(() => {
    if (!open) return;
    setSavedPostsQuery('');
    setMobilePreviewOpen(Boolean(output));
  }, [open, output?._id, output?.postText]);

  useLayoutEffect(() => {
    if (!open) return;
    const resetScroll = () => {
      drawerRef.current?.scrollTo?.({ top: 0, behavior: 'auto' });
      if (mobilePreviewOpen) {
        previewPaneRef.current?.scrollTo?.({ top: 0, behavior: 'auto' });
      } else {
        listPaneRef.current?.scrollTo?.({ top: 0, behavior: 'auto' });
      }
    };
    resetScroll();
    const frameId = window.requestAnimationFrame(resetScroll);
    const timeoutId = window.setTimeout(resetScroll, 40);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [open, mobilePreviewOpen, output?._id]);

  const selectSavedPost = useCallback((post) => {
    onSelectSaved?.(post);
    setMobilePreviewOpen(true);
  }, [onSelectSaved]);

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-gray-950/30 backdrop-blur-[2px] transition-opacity duration-300 ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      />
      <aside
        ref={drawerRef}
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-[620px] overflow-hidden border-l border-gray-200 bg-white shadow-[0_0_60px_rgba(15,23,42,0.18)] transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <div className="text-base font-black text-gray-900">Saved Posts & Preview</div>
              <div className="text-xs font-semibold text-gray-500">Review the generated post and reopen saved posts from here.</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wider text-gray-500 transition-all hover:border-brand-crimson/30 hover:text-brand-crimson"
            >
              Close
            </button>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(250px,290px)_minmax(0,1fr)]">
            <aside
              ref={listPaneRef}
              className={`${mobilePreviewOpen ? 'hidden xl:flex' : 'flex'} min-h-0 flex-col overflow-y-auto border-b border-gray-100 bg-gray-50/60 p-4 custom-scrollbar xl:border-b-0 xl:border-r`}
            >
              <div className="border-b border-gray-100 bg-white p-3 -mx-4 -mt-4 mb-3 xl:mb-0">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    className="input min-h-[42px] rounded-xl bg-gray-50 pl-9 transition-colors hover:bg-white hover:border-gray-300 focus:bg-white focus:border-brand-crimson"
                    value={savedPostsQuery}
                    onChange={(e) => setSavedPostsQuery(e.target.value)}
                    placeholder="Search saved posts..."
                  />
                </div>
              </div>
              <SavedSocialPostsList
                posts={filteredSavedPosts}
                loading={loadingSaved}
                onSelect={selectSavedPost}
                activeId={output?.saved ? output._id : ''}
                className="mt-0"
              />
            </aside>
            <div
              ref={previewPaneRef}
              className={`${mobilePreviewOpen ? 'block' : 'hidden xl:block'} min-h-0 overflow-y-auto bg-white custom-scrollbar`}
            >
              <LinkedInOutputPreview
                output={output}
                onSave={onSave}
                saving={saving}
                onBackToList={() => {
                  if (output && !output.saved) {
                    const confirmSave = window.confirm("You have unsaved changes. Do you want to save this LinkedIn post before returning?");
                    if (confirmSave) {
                      onSave();
                      return;
                    }
                  }
                  setMobilePreviewOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function PanelHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-3 border-b border-gray-200/50 px-5 py-4 bg-white/60 backdrop-blur">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-crimson to-brand-hoverred text-white shadow-sm">
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <h2 className="truncate text-base font-black text-gray-900 tracking-tight">{title}</h2>
        {subtitle ? <p className="truncate text-[11px] font-semibold text-gray-500 mt-0.5">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function Field({ label, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="label text-gray-600 font-bold tracking-wider">{label}</span>
      {children}
    </label>
  );
}

function SettingsGroup({ title, children }) {
  return (
    <section className="rounded-xl border border-gray-100 bg-white/70 p-4 shadow-sm">
      <h3 className="mb-3 text-[11px] font-black uppercase tracking-widest text-gray-500">{title}</h3>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{children}</div>
    </section>
  );
}

function ToggleField({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-700">
      <span>{label}</span>
      <input type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <Field label={label}>
      <select className="select rounded-xl hover:border-gray-300 focus:border-brand-crimson transition-colors" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([key, labelText]) => <option key={key} value={key}>{labelText}</option>)}
      </select>
    </Field>
  );
}

function StatusButton({ status, current, saving, onClick }) {
  const active = current === status;
  const label = status === 'published' ? 'Publish' : status === 'review' ? 'Review' : status;
  
  if (active) {
    return (
      <button type="button" disabled className="inline-flex min-h-[38px] items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] font-black text-gray-400">
        <Check size={12} />
        Current
      </button>
    );
  }
  
  return (
    <button
      type="button"
      disabled={Boolean(saving)}
      onClick={() => onClick(status)}
      className="inline-flex min-h-[38px] items-center justify-center gap-2 rounded-lg bg-brand-crimson px-3 py-2 text-[11px] font-black text-white shadow-sm transition-all hover:bg-brand-hoverred disabled:opacity-60"
    >
      {saving === status ? <Loader2 size={12} className="animate-spin" /> : <Settings2 size={12} />}
      {label}
    </button>
  );
}

function LoadingRows({ label }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-brand-crimson">
      <Loader2 size={24} className="animate-spin" />
      <span className="text-sm font-bold text-gray-500">{label}</span>
    </div>
  );
}

function Empty({ icon: Icon, label }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[160px] p-6 text-center">
      <div className="w-12 h-12 rounded-full bg-white shadow-sm border border-gray-100 flex items-center justify-center mb-3">
        <Icon size={20} className="text-gray-300" />
      </div>
      <span className="text-sm font-bold text-gray-500">{label}</span>
    </div>
  );
}
