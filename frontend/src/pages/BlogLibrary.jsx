import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import useInfiniteScroll from '../hooks/useInfiniteScroll';
import { ArrowLeft, BookOpenText, CalendarDays, Check, CheckSquare, Copy, FileText, Loader2, MessageSquareText, MoreHorizontal, RefreshCw, Search, Square, Tag, Trash2, X } from 'lucide-react';

const LIBRARY_MODES = [
  { key: 'blogs', label: 'Blog', desktopLabel: 'Blog', icon: BookOpenText },
  { key: 'linkedin', label: 'Social', desktopLabel: 'Social Media Post', icon: MessageSquareText },
];
const LIBRARY_CACHE_VERSION = 'v1';
const LIBRARY_PAGE_SIZE = 12;

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

function renderInlineMarkdown(text = '') {
  const parts = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<strong key={`${match.index}-${match[1]}`}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length ? parts : text;
}

function normalizePreviewMarkdown(bodyMarkdown = '', title = '') {
  const lines = String(bodyMarkdown || '').replace(/\r\n/g, '\n').split('\n');
  const output = [];
  let skippedFirstH1 = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      output.push('');
      continue;
    }

    if (!skippedFirstH1 && /^#\s+/.test(trimmed)) {
      const headingText = trimmed.replace(/^#\s+/, '').trim().toLowerCase();
      if (!title || headingText === String(title).trim().toLowerCase()) {
        skippedFirstH1 = true;
        continue;
      }
    }

    output.push(line);
  }

  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function MarkdownArticle({ bodyMarkdown = '', title = '' }) {
  const lines = normalizePreviewMarkdown(bodyMarkdown, title).split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i += 1;
      continue;
    }

    if (/^###\s+/.test(line)) {
      blocks.push(
        <h4 key={`h3-${i}`} className="mt-6 text-lg font-black text-gray-900">
          {line.replace(/^###\s+/, '')}
        </h4>
      );
      i += 1;
      continue;
    }

    if (/^##\s+/.test(line)) {
      const heading = line.replace(/^##\s+/, '');
      if (/^table of contents$/i.test(heading)) {
        const items = [];
        i += 1;
        while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*-\s+/, '').trim());
          i += 1;
        }
        blocks.push(
          <section key={`toc-${i}`} className="mb-8 rounded-2xl border border-gray-200 bg-gray-50/70 p-5">
            <h3 className="text-base font-black uppercase tracking-[0.14em] text-gray-500">Table of Contents</h3>
            <ul className="mt-4 space-y-2 text-[15px] font-semibold leading-7 text-gray-700">
              {items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
            </ul>
          </section>
        );
        continue;
      }

      blocks.push(
        <h3 key={`h2-${i}`} className="mt-10 text-2xl font-black tracking-tight text-gray-900">
          {heading}
        </h3>
      );
      i += 1;
      continue;
    }

    if (/^\s*-\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*-\s+/, '').trim());
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${i}`} className="my-5 list-disc space-y-2 pl-6 text-[15px] leading-8 text-gray-700 marker:text-brand-crimson">
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    const paragraphLines = [line];
    i += 1;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (!next || /^##\s+/.test(next) || /^###\s+/.test(next) || /^\s*-\s+/.test(next)) break;
      paragraphLines.push(next);
      i += 1;
    }

    blocks.push(
      <p key={`p-${i}`} className="mt-5 text-[15px] leading-8 text-gray-700">
        {renderInlineMarkdown(paragraphLines.join(' '))}
      </p>
    );
  }

  return <div>{blocks}</div>;
}

export default function BlogLibrary() {
  const { isAdmin, user } = useAuth();
  const cacheKey = useMemo(
    () => `blog_library_cache:${LIBRARY_CACHE_VERSION}:${user?._id || 'guest'}`,
    [user?._id]
  );
  const cachedLibraryState = useMemo(
    () => safeSessionGet(cacheKey, null),
    [cacheKey]
  );
  const [mode, setMode] = useState(() => cachedLibraryState?.mode || 'blogs');
  const [items, setItems] = useState(cachedLibraryState?.items || []);
  const [socialItems, setSocialItems] = useState(cachedLibraryState?.socialItems || []);
  const [selected, setSelected] = useState(cachedLibraryState?.selected || null);
  const [selectedSocial, setSelectedSocial] = useState(cachedLibraryState?.selectedSocial || null);
  const [blogPage, setBlogPage] = useState(cachedLibraryState?.blogPage || 1);
  const [blogHasMore, setBlogHasMore] = useState(cachedLibraryState?.blogHasMore ?? true);
  const [socialPage, setSocialPage] = useState(cachedLibraryState?.socialPage || 1);
  const [socialHasMore, setSocialHasMore] = useState(cachedLibraryState?.socialHasMore ?? true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedSocialIds, setSelectedSocialIds] = useState([]);
  const [query, setQuery] = useState('');
  const [loadingBlogs, setLoadingBlogs] = useState(() => !cachedLibraryState?.items?.length);
  const [loadingSocial, setLoadingSocial] = useState(() => !cachedLibraryState?.socialItems?.length);
  const [mobileModeMenuOpen, setMobileModeMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [mobileReaderOpen, setMobileReaderOpen] = useState(false);
  const loading = mode === 'blogs' ? loadingBlogs : loadingSocial;

  const loadBlogs = useCallback(async ({ page = 1, reset = false } = {}) => {
    setLoadingBlogs(true);
    setError('');
    try {
      const params = { status: 'published', limit: LIBRARY_PAGE_SIZE, page };
      if (query) params.q = query;
      const { data } = await api.get('/blogs', { params });
      const nextBlogs = data.items || [];
      setItems((prev) => (
        reset ? nextBlogs : [...prev, ...nextBlogs.filter((item) => !prev.some((existing) => existing._id === item._id))]
      ));
      setSelected((prev) => {
        if (prev && nextBlogs.some((item) => item._id === prev._id)) return prev;
        return reset ? (nextBlogs[0] || null) : (prev || nextBlogs[0] || null);
      });
      setBlogPage(page);
      setBlogHasMore(page < Number(data.pages || page));
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Could not load content');
    } finally {
      setLoadingBlogs(false);
    }
  }, [query]);

  const loadSocial = useCallback(async ({ page = 1, reset = false } = {}) => {
    setLoadingSocial(true);
    setError('');
    try {
      const params = { platform: 'linkedin', limit: LIBRARY_PAGE_SIZE, page };
      if (query) params.q = query;
      const { data } = await api.get('/blogs/social-posts', { params });
      const nextSocial = data.items || [];
      setSocialItems((prev) => (
        reset ? nextSocial : [...prev, ...nextSocial.filter((item) => !prev.some((existing) => existing._id === item._id))]
      ));
      setSelectedSocial((prev) => {
        if (prev && nextSocial.some((item) => item._id === prev._id)) return prev;
        return reset ? (nextSocial[0] || null) : (prev || nextSocial[0] || null);
      });
      setSocialPage(page);
      setSocialHasMore(page < Number(data.pages || page));
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Could not load content');
    } finally {
      setLoadingSocial(false);
    }
  }, [query]);

  useEffect(() => {
    if (mode === 'blogs') {
      if (cachedLibraryState?.items?.length && !query) return;
      loadBlogs({ page: 1, reset: true });
      return;
    }
    if (cachedLibraryState?.socialItems?.length && !query) return;
    loadSocial({ page: 1, reset: true });
  }, [cachedLibraryState?.items?.length, cachedLibraryState?.socialItems?.length, loadBlogs, loadSocial, mode, query]);

  useEffect(() => {
    safeSessionSet(cacheKey, {
      mode,
      items,
      socialItems,
      selected,
      selectedSocial,
      blogPage,
      blogHasMore,
      socialPage,
      socialHasMore
    });
  }, [blogHasMore, blogPage, cacheKey, items, mode, selected, selectedSocial, socialHasMore, socialPage, socialItems]);

  const blogLoadMoreRef = useInfiniteScroll({
    enabled: mode === 'blogs',
    hasMore: blogHasMore,
    loading: loadingBlogs,
    onLoadMore: () => loadBlogs({ page: blogPage + 1 })
  });

  const socialLoadMoreRef = useInfiniteScroll({
    enabled: mode === 'linkedin',
    hasMore: socialHasMore,
    loading: loadingSocial,
    onLoadMore: () => loadSocial({ page: socialPage + 1 })
  });

  const toggleSelection = (id) => {
    setSelectedIds((prev) => (
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    ));
  };

  const toggleSelectAllBlogs = () => {
    setSelectedIds((prev) => (
      prev.length === items.length ? [] : items.map((item) => item._id)
    ));
  };

  const toggleSocialSelection = (id) => {
    setSelectedSocialIds((prev) => (
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    ));
  };

  const toggleSelectAllSocial = () => {
    setSelectedSocialIds((prev) => (
      prev.length === socialItems.length ? [] : socialItems.map((item) => item._id)
    ));
  };

  const deletePosts = async (ids) => {
    const targetIds = ids.filter(Boolean);
    if (!targetIds.length) return;
    const confirmed = window.confirm(targetIds.length === 1 ? 'Delete this post?' : `Delete ${targetIds.length} posts?`);
    if (!confirmed) return;

    setDeleting(true);
    setError('');
    try {
      if (targetIds.length === 1) {
        await api.delete(`/blogs/${targetIds[0]}`);
      } else {
        await api.delete('/blogs/bulk', { data: { ids: targetIds } });
      }
      setSelectedIds((prev) => prev.filter((id) => !targetIds.includes(id)));
      if (targetIds.includes(selected?._id)) setSelected(null);
      await loadBlogs({ page: 1, reset: true });
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const deleteSocialPosts = async (ids) => {
    const targetIds = ids.filter(Boolean);
    if (!targetIds.length) return;
    const confirmed = window.confirm(targetIds.length === 1 ? 'Delete this social post?' : `Delete ${targetIds.length} social posts?`);
    if (!confirmed) return;

    setDeleting(true);
    setError('');
    try {
      if (targetIds.length === 1) {
        await api.delete(`/blogs/social-posts/${targetIds[0]}`);
      } else {
        await api.delete('/blogs/social-posts/bulk', { data: { ids: targetIds } });
      }
      setSelectedSocialIds((prev) => prev.filter((id) => !targetIds.includes(id)));
      if (targetIds.includes(selectedSocial?._id)) setSelectedSocial(null);
      await loadSocial({ page: 1, reset: true });
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const copyBlogPost = useCallback(async () => {
    if (!selected) return;
    const parts = [
      selected.title || '',
      selected.excerpt || '',
      selected.bodyMarkdown || ''
    ].filter(Boolean);

    try {
      await navigator.clipboard.writeText(parts.join('\n\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      setError(err.message || 'Could not copy content');
    }
  }, [selected]);

  const copySocialPost = useCallback(async () => {
    if (!selectedSocial?.postText) return;
    const hashtags = Array.isArray(selectedSocial.hashtags) && selectedSocial.hashtags.length
      ? `\n\n${selectedSocial.hashtags.join(' ')}`
      : '';
    try {
      await navigator.clipboard.writeText(`${selectedSocial.postText}${hashtags}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      setError(err.message || 'Could not copy content');
    }
  }, [selectedSocial]);

  const openReaderOnSmallScreens = () => {
    if (window.matchMedia('(max-width: 1279px)').matches) setMobileReaderOpen(true);
  };

  const activeMode = LIBRARY_MODES.find((item) => item.key === mode) || LIBRARY_MODES[0];
  const ActiveModeIcon = activeMode.icon;

  const headerActions = (
    <>
    <div className="flex w-full items-center justify-between gap-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:hidden">
        <div className="inline-flex min-h-[42px] items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-[13px] font-black text-gray-900 shadow-sm">
          <ActiveModeIcon size={14} />
          {activeMode.label}
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2 sm:hidden">
        <button
          type="button"
          onClick={() => mode === 'blogs' ? loadBlogs({ page: 1, reset: true }) : loadSocial({ page: 1, reset: true })}
          className="inline-flex h-[42px] min-w-[42px] items-center justify-center rounded-2xl border border-brand-crimson/20 bg-brand-pink/10 px-3 text-brand-crimson shadow-sm transition-all hover:bg-brand-pink/20 hover:border-brand-crimson/30"
          aria-label="Refresh content repository"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          type="button"
          onClick={() => setMobileModeMenuOpen((value) => !value)}
          className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-600 shadow-sm transition-all hover:border-brand-crimson/20 hover:text-brand-crimson"
          aria-label="Open repository menu"
        >
          <MoreHorizontal size={16} />
        </button>
      </div>
      <div className="hidden w-full min-w-0 sm:flex sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="relative min-w-0 max-w-xl flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            className="w-full rounded-2xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm font-medium text-gray-700 shadow-sm transition-all placeholder:text-gray-400 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-crimson/20 focus:border-brand-crimson/40"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setMobileReaderOpen(false);
            }}
            placeholder={mode === 'linkedin' ? 'Search LinkedIn posts...' : 'Search articles...'}
          />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="grid grid-cols-2 rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
            {LIBRARY_MODES.map((item) => {
              const Icon = item.icon;
              const active = mode === item.key;
              return (
                <button type="button" key={item.key} onClick={() => { setMode(item.key); setQuery(''); setMobileReaderOpen(false); }} className={`flex min-h-[40px] items-center justify-center gap-2 rounded-xl px-3 text-[12px] font-black transition-all sm:px-5 sm:text-[13px] ${active ? 'bg-brand-crimson text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}>
                  <Icon size={14} />
                  <span className="sm:hidden">{item.label}</span>
                  <span className="hidden sm:inline">{item.desktopLabel}</span>
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => mode === 'blogs' ? loadBlogs({ page: 1, reset: true }) : loadSocial({ page: 1, reset: true })} className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 text-[13px] font-black text-gray-900 shadow-sm transition-all hover:border-brand-crimson/20 hover:bg-gray-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>
    </div>
    {mobileModeMenuOpen ? (
      <>
        <button
          type="button"
          aria-label="Close repository menu"
          onClick={() => setMobileModeMenuOpen(false)}
          className="fixed inset-0 z-40 bg-gray-950/20 backdrop-blur-[1px] sm:hidden"
        />
        <div className="fixed right-3 top-[76px] z-50 w-[min(290px,calc(100vw-24px))] overflow-hidden rounded-[24px] border border-gray-200 bg-white shadow-[0_24px_48px_rgba(15,23,42,0.18)] sm:hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Content Repository</div>
              <div className="mt-1 text-sm font-black text-gray-900">Quick Actions</div>
            </div>
            <button
              type="button"
              onClick={() => setMobileModeMenuOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500"
              aria-label="Close repository menu"
            >
              <X size={15} />
            </button>
          </div>
          <div className="space-y-2 p-3">
            <button
              type="button"
              onClick={() => {
                setMode('blogs');
                setQuery('');
                setMobileReaderOpen(false);
                setMobileModeMenuOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition-all ${mode === 'blogs' ? 'border border-brand-crimson/15 bg-brand-pink/20 text-brand-crimson' : 'border border-gray-200 bg-gray-50 text-gray-700'}`}
            >
              <span className="flex items-center gap-3 text-sm font-black">
                <BookOpenText size={15} />
                Blog
              </span>
              {mode === 'blogs' ? <Check size={15} /> : null}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('linkedin');
                setQuery('');
                setMobileReaderOpen(false);
                setMobileModeMenuOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition-all ${mode === 'linkedin' ? 'border border-brand-crimson/15 bg-brand-pink/20 text-brand-crimson' : 'border border-gray-200 bg-gray-50 text-gray-700'}`}
            >
              <span className="flex items-center gap-3 text-sm font-black">
                <MessageSquareText size={15} />
                Social
              </span>
              {mode === 'linkedin' ? <Check size={15} /> : null}
            </button>
          </div>
        </div>
      </>
    ) : null}
    </>
  );

  return (
    <Layout headerActions={headerActions}>
      <div className="flex h-full min-h-[calc(100vh-64px)] -m-3 flex-col gap-4 p-3 mesh-bg sm:-m-5 sm:gap-5 sm:p-5 lg:-m-6 lg:p-6">
        <div className="sm:hidden">
          <div className="relative min-w-0 max-w-xl flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-gray-400" />
            <input
              className="relative w-full rounded-2xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm font-medium text-gray-700 shadow-sm transition-all placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-crimson/20 focus:border-brand-crimson/40 hover:border-gray-300"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setMobileReaderOpen(false);
              }}
              placeholder={mode === 'linkedin' ? 'Search LinkedIn posts...' : 'Search articles...'}
            />
          </div>
        </div>

        {mode === 'linkedin' && isAdmin && selectedSocialIds.length ? (
          <div className="glass-panel rounded-[22px] flex flex-wrap items-center gap-2 px-4 py-3 shadow-[0_16px_30px_rgba(15,23,42,0.06)]">
            <span className="text-sm font-black text-gray-800">{selectedSocialIds.length} selected</span>
            <button type="button" onClick={toggleSelectAllSocial} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-gray-500 hover:border-gray-300">
              {selectedSocialIds.length === socialItems.length ? 'Unselect All' : 'Select All'}
            </button>
            <button type="button" onClick={() => deleteSocialPosts(selectedSocialIds)} disabled={deleting} className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-red-600 transition-all hover:bg-red-100 disabled:opacity-60">
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete
            </button>
            <button type="button" onClick={() => setSelectedSocialIds([])} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-all hover:border-gray-300 hover:text-gray-700" title="Clear selection">
              <X size={14} />
            </button>
          </div>
        ) : null}

        {mode === 'blogs' && isAdmin && selectedIds.length ? (
          <div className="glass-panel rounded-[22px] flex flex-wrap items-center gap-2 px-4 py-3 shadow-[0_16px_30px_rgba(15,23,42,0.06)]">
            <span className="text-sm font-black text-gray-800">{selectedIds.length} selected</span>
            <button type="button" onClick={toggleSelectAllBlogs} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-gray-500 hover:border-gray-300">
              {selectedIds.length === items.length ? 'Unselect All' : 'Select All'}
            </button>
            <button type="button" onClick={() => deletePosts(selectedIds)} disabled={deleting} className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-red-600 transition-all hover:bg-red-100 disabled:opacity-60">
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete
            </button>
            <button type="button" onClick={() => setSelectedIds([])} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-all hover:border-gray-300 hover:text-gray-700" title="Clear selection">
              <X size={14} />
            </button>
          </div>
        ) : null}

        {error && (
          <div className="rounded-xl bg-red-50/80 backdrop-blur-md px-5 py-4 text-sm font-semibold text-red-700 border border-red-200/50 shadow-sm animate-fade-in-up stagger-2">
            {error}
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 pb-4 animate-fade-in-up stagger-2 xl:grid-cols-[minmax(280px,400px)_minmax(0,1fr)]">
          <section className={`${mobileReaderOpen ? 'hidden xl:block' : 'block'} min-h-0 overflow-y-auto rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.92))] p-3 shadow-[0_24px_50px_rgba(15,23,42,0.08)] backdrop-blur custom-scrollbar sm:p-4`}>
            {loading && ((mode === 'blogs' && !items.length) || (mode === 'linkedin' && !socialItems.length)) ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3 text-brand-crimson">
                <Loader2 size={24} className="animate-spin" />
                <span className="text-sm font-bold text-gray-500">Loading library...</span>
              </div>
            ) : mode === 'linkedin' ? (
              socialItems.length ? (
              <div className="space-y-3">
                {socialItems.map((post) => {
                  const isSelected = selectedSocial?._id === post._id;
                  const isMarked = selectedSocialIds.includes(post._id);
                  return (
                    <div
                      key={post._id}
                      className={`w-full rounded-[22px] border p-4 text-left transition-all duration-300 ${
                        isSelected ? 'border-brand-crimson/35 bg-white shadow-[0_18px_36px_rgba(209,18,67,0.12)]' : 'border-white/50 bg-white/72 hover:bg-white hover:shadow-[0_14px_30px_rgba(15,23,42,0.08)]'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => toggleSocialSelection(post._id)}
                            className={`mt-0.5 rounded-lg p-1 transition-all ${isMarked ? 'text-brand-crimson' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'}`}
                            title={isMarked ? 'Unselect' : 'Select'}
                          >
                            {isMarked ? <CheckSquare size={16} /> : <Square size={16} />}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSocial(post);
                            openReaderOnSmallScreens();
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="rounded-full border border-brand-crimson/10 bg-brand-pink/50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-brand-crimson shadow-sm">LinkedIn</span>
                            <span className="text-[10px] font-bold text-gray-400">{post.createdAt ? new Date(post.createdAt).toLocaleDateString() : ''}</span>
                          </div>
                          <div className="line-clamp-2 text-sm font-black leading-snug text-gray-900">{post.selectedTopic || 'Saved LinkedIn post'}</div>
                          <p className="mt-2 line-clamp-3 text-xs font-medium leading-relaxed text-gray-500">{post.postText}</p>
                        </button>
                      </div>
                    </div>
                  );
                })}
                {socialHasMore ? (
                  <div ref={socialLoadMoreRef} className="flex items-center justify-center py-3 text-xs font-bold text-gray-400">
                    {loadingSocial ? 'Loading more...' : 'Scroll for more'}
                  </div>
                ) : null}
              </div>
              ) : <Empty label="No saved LinkedIn posts yet" />
            ) : items.length ? (
              <div className="space-y-3">
                {items.map((blog) => {
                  const isSelected = selected?._id === blog._id;
                  return (
                    <div
                      key={blog._id}
                      className={`w-full text-left transition-all duration-300 rounded-[22px] p-4 border relative overflow-hidden group ${
                        isSelected 
                          ? 'border-brand-crimson/35 bg-white shadow-[0_18px_36px_rgba(209,18,67,0.12)]' 
                          : 'border-white/50 bg-white/72 hover:bg-white hover:border-white hover:shadow-[0_14px_30px_rgba(15,23,42,0.08)]'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brand-crimson to-brand-pink rounded-l-xl"></div>
                      )}
                      <div className="flex items-start gap-3">
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => toggleSelection(blog._id)}
                            className={`mt-0.5 rounded-lg p-1 transition-all ${selectedIds.includes(blog._id) ? 'text-brand-crimson' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'}`}
                            title={selectedIds.includes(blog._id) ? 'Unselect' : 'Select'}
                          >
                            {selectedIds.includes(blog._id) ? <CheckSquare size={16} /> : <Square size={16} />}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setSelected(blog);
                            openReaderOnSmallScreens();
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className={`mb-2 text-base font-black leading-snug ${isSelected ? 'text-gray-900' : 'text-gray-800 group-hover:text-gray-900'}`}>
                            {blog.title}
                          </div>
                          <p className="mb-3 line-clamp-2 text-xs font-medium leading-relaxed text-gray-500">{blog.excerpt}</p>
                          
                          <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wider text-gray-500">
                            {blog.category && <span className={`rounded-full px-2.5 py-1 border shadow-sm ${isSelected ? 'bg-brand-pink/10 border-brand-crimson/20 text-brand-crimson' : 'bg-white border-gray-200'}`}>{blog.category}</span>}
                            {blog.type && <span className={`rounded-full px-2.5 py-1 border shadow-sm ${isSelected ? 'bg-brand-pink/10 border-brand-crimson/20 text-brand-crimson' : 'bg-white border-gray-200'}`}>{blog.type}</span>}
                          </div>
                        </button>
                      </div>
                    </div>
                  );
                })}
                {blogHasMore ? (
                  <div ref={blogLoadMoreRef} className="flex items-center justify-center py-3 text-xs font-bold text-gray-400">
                    {loadingBlogs ? 'Loading more...' : 'Scroll for more'}
                  </div>
                ) : null}
              </div>
            ) : (
              <Empty />
            )}
          </section>

          <article className={`${mobileReaderOpen ? 'block' : 'hidden xl:block'} min-h-0 overflow-y-auto rounded-[28px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(255,255,255,0.98))] p-4 shadow-[0_24px_50px_rgba(15,23,42,0.08)] backdrop-blur custom-scrollbar relative sm:p-8 xl:p-10`}>
            <div className="sticky top-0 z-10 -mx-4 mb-5 border-b border-gray-100 bg-white/96 px-4 py-3 backdrop-blur xl:hidden">
              <button
                type="button"
                onClick={() => setMobileReaderOpen(false)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-brand-crimson/15 bg-[linear-gradient(180deg,#fff7f9_0%,#ffeef3_100%)] px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.14em] text-brand-crimson shadow-[0_12px_26px_rgba(209,18,67,0.12)] transition-all hover:border-brand-crimson/30 hover:bg-[linear-gradient(180deg,#fff3f6_0%,#ffe7ef_100%)] hover:shadow-[0_14px_30px_rgba(209,18,67,0.16)]"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-brand-crimson shadow-sm">
                  <ArrowLeft size={14} />
                </span>
                <span>Back to posts</span>
              </button>
            </div>
            {mode === 'linkedin' ? (
              selectedSocial ? (
                <div className="max-w-3xl mx-auto animate-fade-in-up">
                  <div className="mb-5 rounded-[22px] border border-gray-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,250,252,0.98))] p-3 shadow-[0_14px_32px_rgba(15,23,42,0.06)] sm:p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      <Pill icon={MessageSquareText} highlight>LinkedIn</Pill>
                      {selectedSocial.framework && <Pill icon={Tag}>{selectedSocial.framework}</Pill>}
                      {selectedSocial.createdAt && <Pill icon={CalendarDays}>{new Date(selectedSocial.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</Pill>}
                    </div>
                    <button
                      type="button"
                      onClick={copySocialPost}
                      className={`inline-flex min-h-[42px] items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[11px] font-black uppercase tracking-[0.12em] shadow-sm transition-all ${
                        copied
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-brand-crimson/15 bg-brand-pink/35 text-brand-crimson hover:border-brand-crimson/30 hover:bg-brand-pink/50'
                      }`}
                    >
                      {copied ? <CheckSquare size={14} /> : <Copy size={14} />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                    </div>
                  </div>
                  <h2 className="mb-5 text-3xl font-black leading-tight text-gray-900 text-gradient">{selectedSocial.selectedTopic || 'Saved LinkedIn post'}</h2>
                  <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center gap-3 border-b border-gray-100 pb-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-crimson text-xs font-black text-white">A</div>
                      <div>
                        <div className="text-sm font-black text-gray-900">Admin</div>
                        <div className="text-xs font-semibold text-gray-400">LinkedIn draft</div>
                      </div>
                    </div>
                    <div className="whitespace-pre-wrap text-[15px] font-medium leading-loose text-gray-800">{selectedSocial.postText}</div>
                    {Array.isArray(selectedSocial.hashtags) && selectedSocial.hashtags.length ? (
                      <div className="mt-4 break-words text-sm font-bold leading-relaxed text-brand-crimson">{selectedSocial.hashtags.join(' ')}</div>
                    ) : null}
                  </div>
                </div>
              ) : <Empty large />
            ) : selected ? (
              <div className="max-w-3xl mx-auto animate-fade-in-up">
                <div className="mb-6 rounded-[22px] border border-gray-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,250,252,0.98))] p-3 shadow-[0_14px_32px_rgba(15,23,42,0.06)] sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2.5">
                    {selected.category && <Pill icon={Tag}>{selected.category}</Pill>}
                    {selected.subcategory && <Pill icon={Tag}>{selected.subcategory}</Pill>}
                    {selected.publishedAt && <Pill icon={CalendarDays} highlight>{new Date(selected.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</Pill>}
                  </div>
                  <button
                    type="button"
                    onClick={copyBlogPost}
                    className={`inline-flex min-h-[42px] items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[11px] font-black uppercase tracking-[0.12em] shadow-sm transition-all ${
                      copied
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-brand-crimson/15 bg-brand-pink/35 text-brand-crimson hover:border-brand-crimson/30 hover:bg-brand-pink/50'
                    }`}
                  >
                      {copied ? <CheckSquare size={14} /> : <Copy size={14} />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                
                <h2 className="text-3xl sm:text-4xl font-black leading-tight text-gray-900 mb-6 font-display tracking-tight text-gradient">{selected.title}</h2>
                
                {selected.excerpt && (
                  <div className="pl-4 border-l-4 border-brand-crimson/30 mb-8 py-1">
                    <p className="text-lg font-medium leading-relaxed text-gray-600 italic">
                      {selected.excerpt}
                    </p>
                  </div>
                )}
                
                <div className="max-w-none">
                  <div className="text-gray-800">
                    <MarkdownArticle bodyMarkdown={selected.bodyMarkdown} title={selected.title} />
                  </div>
                </div>
              </div>
            ) : (
              <Empty large />
            )}
          </article>
        </div>
      </div>
    </Layout>
  );
}

function Pill({ icon: Icon, children, highlight = false }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] border shadow-sm transition-all ${
      highlight 
        ? 'border-brand-hoverred bg-brand-crimson text-white shadow-[0_10px_24px_rgba(209,18,67,0.18)]' 
        : 'border-gray-200 bg-white text-gray-600 shadow-[0_8px_18px_rgba(15,23,42,0.05)]'
    }`}>
      <Icon size={12} />
      {children}
    </span>
  );
}

function Empty({ large = false, label }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-4 text-center h-full min-h-[300px] ${large ? 'px-10' : 'px-6'}`}>
      <div className="relative">
        <div className="absolute inset-0 bg-brand-crimson/5 blur-xl rounded-full"></div>
        <div className="relative bg-white p-4 rounded-full shadow-sm border border-gray-100">
          <FileText size={large ? 32 : 24} className="text-brand-crimson/40" />
        </div>
      </div>
      <div>
        <h3 className={`font-black text-gray-800 ${large ? 'text-xl mb-2' : 'text-base mb-1'}`}>No content available</h3>
        <p className="text-sm font-medium text-gray-500 max-w-xs mx-auto">
          {label || (large ? "Select a post from the list to read the full content." : "There is no content to display right now.")}
        </p>
      </div>
    </div>
  );
}
