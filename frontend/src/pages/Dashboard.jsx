import { memo, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import Filters from '../components/Filters';
import ArticleCard from '../components/ArticleCard';
import { Skeleton } from '../components/Loader';
import AnalyticsSection from '../components/AnalyticsSection';
import Layout from '../components/Layout';
import useInfiniteScroll from '../hooks/useInfiniteScroll';
import { APP_EVENT_CONTENT_CHANGED } from '../utils/appEvents';
import { getDashboardAppearance } from '../utils/feedTheme';
import {
  Newspaper, Landmark, Building2, BookOpen, RefreshCw, BookOpenText, MessageSquareText, Sparkles, Bookmark, Trash2, X, MoreHorizontal, Check
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const DASHBOARD_TIMEZONE = 'Asia/Kolkata';
const FEED_PAGE_SIZE = 8;
const FEED_SCROLL_ROW_SIZE = 4;

const FEED_COLUMNS = [
  { key: 'govt', label: 'Government Updates', icon: Landmark },
  { key: 'news', label: 'News Articles', icon: Newspaper },
  { key: 'evergreen', label: 'Evergreen Topics', icon: BookOpen },
  { key: 'competitor', label: 'Competitor Intel', icon: Building2 },
];
const INTEL_DESK_TABS = ['intel', 'tailored', 'saved'];

const TYPE_LABELS = Object.fromEntries(FEED_COLUMNS.map((col) => [col.key, col]));

function normalizeBuckets(payload = {}) {
  return {
    news: Array.isArray(payload?.news) ? payload.news : [],
    govt: Array.isArray(payload?.govt) ? payload.govt : [],
    competitor: Array.isArray(payload?.competitor) ? payload.competitor : [],
    evergreen: Array.isArray(payload?.evergreen) ? payload.evergreen : [],
  };
}

function articleDescription(item = {}) {
  const safeItem = item && typeof item === 'object' ? item : {};
  const rawData = safeItem.rawData && typeof safeItem.rawData === 'object' ? safeItem.rawData : {};
  const value = (
    rawData.blogContext ||
    rawData.tavilyAnswer ||
    safeItem.summary ||
    safeItem.aiSummary ||
    ''
  );
  return typeof value === 'string' ? value : String(value || '');
}

function withoutRegion(value = {}) {
  const { region: _region, ...rest } = value || {};
  return rest;
}

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
  } catch {}
}

function emptyFeedState() {
  return Object.fromEntries(
    FEED_COLUMNS.map(({ key }) => [key, {
      items: [],
      page: 0,
      total: 0,
      loaded: false,
      loadingInitial: false,
      hasMore: true,
      loadingMore: false
    }])
  );
}

function emptyColumnState() {
  return {
    items: [],
    page: 0,
    total: 0,
    loaded: false,
    loadingInitial: false,
    hasMore: true,
    loadingMore: false
  };
}

function normalizeCachedColumnState(value = {}) {
  return {
    ...emptyColumnState(),
    ...value,
    loadingInitial: false,
    loadingMore: false
  };
}

function normalizeCachedFeedState(value = {}) {
  return Object.fromEntries(
    FEED_COLUMNS.map(({ key }) => [key, normalizeCachedColumnState(value?.[key])])
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl p-4 space-y-3 border border-gray-100">
      <div className="flex gap-2">
        <div className="skeleton h-4 w-16 rounded" />
        <div className="skeleton h-4 w-20 rounded" />
      </div>
      <div className="skeleton h-4 w-full rounded" />
      <div className="skeleton h-4 w-4/5 rounded" />
      <div className="skeleton h-3 w-3/4 rounded" />
      <div className="skeleton h-3 w-24 rounded" />
    </div>
  );
}

function EmptyState({ icon: Icon, isAdmin }) {
  return (
    <div className="bg-white rounded-xl p-8 text-center flex flex-col items-center gap-2 border border-gray-100 w-full">
      <Icon size={24} className="text-gray-200" />
      <span className="text-sm font-semibold text-gray-400">Nothing here yet.</span>
      {isAdmin && <span className="text-[11px] text-gray-300">Go to Admin to trigger a fetch.</span>}
    </div>
  );
}

function getEffectiveTime(item) {
  return new Date(item.fetchedAt || item.publishedAt || 0).getTime();
}

function getEffectiveDateKey(item) {
  const time = getEffectiveTime(item);
  if (!time) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DASHBOARD_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(time));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateScoreRanked(items = []) {
  return [...items].sort((a, b) => {
    const timeDiff = getEffectiveTime(b) - getEffectiveTime(a);
    if (timeDiff) return timeDiff;

    const scoreDiff = (b.relevanceScore || 0) - (a.relevanceScore || 0);
    if (scoreDiff) return scoreDiff;

    return getEffectiveDateKey(b).localeCompare(getEffectiveDateKey(a));
  });
}

const FeedColumn = memo(function FeedColumn({ column, items, loading, totalCount = 0, isAdmin, renderArticle, hasMore = false, loadingMore = false, onLoadMore }) {
  const Icon = column.icon;
  const scrollRef = useRef(null);
  const sentinelRef = useInfiniteScroll({
    hasMore,
    loading: loadingMore || loading,
    onLoadMore,
    root: scrollRef.current
  });

  return (
    <section
      data-analytics-section={`Intel feed: ${column.label}`}
      className="min-h-0 overflow-hidden rounded-[26px] border shadow-card flex flex-col"
      style={{ borderColor: column.border, background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,250,251,0.94))' }}
    >
      <div className="border-b px-4 py-3.5" style={{ borderColor: column.border, background: column.soft }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#ffffffcc', border: `1px solid ${column.border}` }}>
              <Icon size={15} style={{ color: column.text }} />
            </span>
            <div className="min-w-0">
              <h2 className="font-black text-[14px] text-gray-900 truncate">{column.label}</h2>
            </div>
          </div>
          <span className="rounded-xl px-2.5 py-1 text-[11px] font-black" style={{ color: column.text, background: '#ffffffcc', border: `1px solid ${column.border}` }}>
            {loading ? '...' : totalCount}
          </span>
        </div>
      </div>

      <div ref={scrollRef} className="hide-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4" style={{ background: column.soft }}>
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : items.length
            ? items.map(item => renderArticle(item, { compact: true }))
            : <EmptyState icon={Icon} isAdmin={isAdmin} />}
        {!loading && hasMore ? (
          <div ref={sentinelRef} className="flex items-center justify-center py-2 text-[11px] font-bold text-gray-400">
            {loadingMore ? 'Loading more...' : 'Scroll for more'}
          </div>
        ) : null}
      </div>
    </section>
  );
});

export default function Dashboard({ initialTab = 'analytics' }) {
  const { user, isAdmin, isSuperAdmin, uiSettings } = useAuth();
  const navigate = useNavigate();
  const dashTab = initialTab;
  const analyticsCacheKey = user?._id ? `dashboard_analytics_state_${user._id}` : null;
  const cachedAnalyticsState = useMemo(
    () => (analyticsCacheKey ? safeSessionGet(analyticsCacheKey, null) : null),
    [analyticsCacheKey]
  );
  const intelDeskCacheKey = user?._id ? `intel_desk_state_${user._id}` : null;
  const cachedIntelDeskState = useMemo(
    () => (intelDeskCacheKey ? safeSessionGet(intelDeskCacheKey, null) : null),
    [intelDeskCacheKey]
  );
  const [analyticsData, setAnalyticsData] = useState(() => normalizeBuckets(cachedAnalyticsState?.analyticsData));
  const [analyticsVelocityData, setAnalyticsVelocityData] = useState(() => Array.isArray(cachedAnalyticsState?.analyticsVelocityData) ? cachedAnalyticsState.analyticsVelocityData : []);
  const [feedStateByTab, setFeedStateByTab] = useState(() => ({
    intel: cachedIntelDeskState?.feedStateByTab?.intel ? normalizeCachedFeedState(cachedIntelDeskState.feedStateByTab.intel) : emptyFeedState(),
    tailored: cachedIntelDeskState?.feedStateByTab?.tailored ? normalizeCachedFeedState(cachedIntelDeskState.feedStateByTab.tailored) : emptyFeedState(),
    saved: cachedIntelDeskState?.feedStateByTab?.saved ? normalizeCachedFeedState(cachedIntelDeskState.feedStateByTab.saved) : emptyFeedState()
  }));
  const [loading, setLoading] = useState(true);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const isIntelDesk = dashTab === 'feed';
  const [intelDeskTab, setIntelDeskTab] = useState(() => cachedIntelDeskState?.intelDeskTab || 'intel');
  const [analyticsViewMode, setAnalyticsViewMode] = useState('today');
  const [mobileIntelMenuOpen, setMobileIntelMenuOpen] = useState(false);
  const [mobileAnalyticsMenuOpen, setMobileAnalyticsMenuOpen] = useState(false);
  const [intelFilters, setIntelFilters] = useState(() => {
    if (!user?._id) return {};
    try {
      const saved = localStorage.getItem(`intel_desk_filters_${user._id}`);
      return saved ? withoutRegion(JSON.parse(saved)) : {};
    } catch { return {}; }
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [draggedArticle, setDraggedArticle] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [savingArticleIds, setSavingArticleIds] = useState(new Set());
  const [selectedArticleIds, setSelectedArticleIds] = useState(new Set());
  const canUseBlogStudio = isSuperAdmin || user?.access?.canUseBlogStudio === true || (isAdmin && user?.access?.canUseBlogStudio !== false);
  const dashboardAppearance = useMemo(() => getDashboardAppearance(uiSettings), [uiSettings]);
  const feedColumns = useMemo(() => FEED_COLUMNS.map((column) => ({
    ...column,
    ...(dashboardAppearance.topicColors[column.key] || dashboardAppearance.topicColors.news)
  })), [dashboardAppearance]);
  const feedRequestVersionRef = useRef(0);
  const feedScrollRequestRef = useRef(null);
  const feedStateRef = useRef(feedStateByTab);
  const feedLoadedSignatureRef = useRef(cachedIntelDeskState?.feedLoadedSignatures || {});
  const analyticsLoadedSignatureRef = useRef(cachedAnalyticsState?.signature || '');
  const analyticsCacheReadyRef = useRef(Boolean(cachedAnalyticsState?.loaded));

  useEffect(() => {
    feedStateRef.current = feedStateByTab;
  }, [feedStateByTab]);

  useEffect(() => {
    if (!intelDeskCacheKey) return;
    safeSessionSet(intelDeskCacheKey, {
      intelDeskTab,
      feedStateByTab,
      feedLoadedSignatures: feedLoadedSignatureRef.current
    });
  }, [feedStateByTab, intelDeskCacheKey, intelDeskTab]);

  useEffect(() => {
    if (!analyticsCacheKey) return;
    safeSessionSet(analyticsCacheKey, {
      analyticsData,
      analyticsVelocityData,
      signature: analyticsLoadedSignatureRef.current,
      loaded: analyticsCacheReadyRef.current
    });
  }, [analyticsCacheKey, analyticsData, analyticsVelocityData]);

  useEffect(() => {
    if (user?._id)
      localStorage.setItem(`intel_desk_filters_${user._id}`, JSON.stringify(withoutRegion(intelFilters)));
  }, [intelFilters, user?._id]);

  const effectiveIntelFilters = useMemo(() => {
    const next = withoutRegion(intelFilters);
    delete next.saved;
    delete next.publishedOnly;
    delete next.ownerOnly;
    delete next.sharedOnly;
    return next;
  }, [intelFilters]);
  const [debouncedIntelFilters, setDebouncedIntelFilters] = useState(effectiveIntelFilters);
  const analyticsQuerySignature = useMemo(
    () => JSON.stringify({ refreshKey }),
    [refreshKey]
  );
  const feedQuerySignature = useMemo(
    () => JSON.stringify({ filters: withoutRegion(debouncedIntelFilters), refreshKey }),
    [debouncedIntelFilters, refreshKey]
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedIntelFilters(effectiveIntelFilters);
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [effectiveIntelFilters]);

  const scopeParamsForTab = useCallback((tabKey) => {
    if (tabKey === 'tailored') return { ownerOnly: 'true' };
    if (tabKey === 'saved') return { saved: 'true' };
    return { sharedOnly: 'true' };
  }, []);
  const filterMetaParams = useMemo(() => ({
    personalized: 'true',
    ...scopeParamsForTab(intelDeskTab)
  }), [intelDeskTab, scopeParamsForTab]);
  const activeType = intelFilters.type;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { personalized: 'true' };
      const [analyticsRes, analyticsVelocityRes] = await Promise.all([
        api.get('/articles/dashboard', { params }),
        api.get('/articles/velocity', { params })
      ]);

      setAnalyticsData(normalizeBuckets(analyticsRes.data));
      setAnalyticsVelocityData(analyticsVelocityRes.data.days || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  const loadFeedCounts = useCallback(async (tabKey, requestVersion = feedRequestVersionRef.current) => {
      const params = {
        personalized: 'true',
        ...withoutRegion(debouncedIntelFilters),
        ...scopeParamsForTab(tabKey)
      };

    try {
      const { data } = await api.get('/articles/counts', { params });
      if (requestVersion !== feedRequestVersionRef.current) return;
      setFeedStateByTab((prev) => ({
        ...prev,
        [tabKey]: Object.fromEntries(
          FEED_COLUMNS.map(({ key }) => [
            key,
            {
              ...(prev[tabKey]?.[key] || { items: [], page: 0, total: 0, hasMore: true, loadingMore: false }),
              total: Math.max(0, Number(data?.[key] || 0))
            }
          ])
        )
      }));
    } catch (error) {
      console.error(error);
    }
  }, [debouncedIntelFilters, scopeParamsForTab]);

  const loadFeedSnapshot = useCallback(async ({ tabKey, offset = 0, limit = FEED_PAGE_SIZE, reset = false, requestVersion = feedRequestVersionRef.current }) => {
    const isScrollPage = !reset && offset > 0;
    const requestKey = isScrollPage ? `${tabKey}:all:${offset}:${limit}` : null;
    if (isScrollPage) {
      if (feedScrollRequestRef.current && feedScrollRequestRef.current !== requestKey) {
        return false;
      }
      feedScrollRequestRef.current = requestKey;
    }

    const params = {
      personalized: 'true',
      offset,
      limit,
      ...withoutRegion(debouncedIntelFilters),
      ...scopeParamsForTab(tabKey)
    };

    setFeedStateByTab((prev) => ({
      ...prev,
      [tabKey]: Object.fromEntries(
        FEED_COLUMNS.map(({ key }) => {
          const current = prev[tabKey]?.[key] || emptyColumnState();
          return [
            key,
            {
              ...current,
              items: reset ? [] : current.items,
              page: reset ? 0 : current.page,
              loadingInitial: reset,
              loadingMore: !reset
            }
          ];
        })
      )
    }));

    try {
      const { data } = await api.get('/articles/dashboard', { params });
      if (requestVersion !== feedRequestVersionRef.current) return;
      setFeedStateByTab((prev) => ({
        ...prev,
        [tabKey]: Object.fromEntries(
          FEED_COLUMNS.map(({ key }) => {
            const nextItems = Array.isArray(data?.[key]) ? data[key].filter((item) => String(item?.type || '') === key) : [];
            const current = prev[tabKey]?.[key] || emptyColumnState();
            const total = Number(current.total || 0);
            const mergedItems = reset
              ? nextItems
              : [...current.items, ...nextItems.filter((item) => !current.items.some((existing) => existing._id === item._id))];
            return [
              key,
              {
                ...current,
                items: mergedItems,
                page: mergedItems.length,
                loaded: true,
                loadingInitial: false,
                hasMore: total > mergedItems.length,
                loadingMore: false
              }
            ];
          })
        )
      }));
      return true;
    } catch (error) {
      console.error(error);
      setFeedStateByTab((prev) => ({
        ...prev,
        [tabKey]: Object.fromEntries(
          FEED_COLUMNS.map(({ key }) => [
            key,
            {
              ...(prev[tabKey]?.[key] || emptyColumnState()),
              loadingInitial: false,
              loadingMore: false
            }
          ])
        )
      }));
      return false;
    } finally {
      if (isScrollPage && feedScrollRequestRef.current === requestKey) {
        feedScrollRequestRef.current = null;
      }
    }
  }, [debouncedIntelFilters, scopeParamsForTab]);

  const loadFeedPage = useCallback(async ({ tabKey, type, page = 1, reset = false, requestVersion = feedRequestVersionRef.current }) => {
    const isScrollPage = !reset && page > 1;
    const requestKey = isScrollPage ? `${tabKey}:${type}:${page}` : null;
    if (isScrollPage) {
      if (feedScrollRequestRef.current && feedScrollRequestRef.current !== requestKey) {
        return;
      }
      feedScrollRequestRef.current = requestKey;
    }

    const params = {
      personalized: 'true',
      type,
      page,
      limit: FEED_PAGE_SIZE,
      ...withoutRegion(debouncedIntelFilters),
      ...scopeParamsForTab(tabKey)
    };

    setFeedStateByTab((prev) => ({
      ...prev,
        [tabKey]: {
          ...prev[tabKey],
          [type]: {
          ...(prev[tabKey]?.[type] || emptyColumnState()),
          items: reset ? [] : (prev[tabKey]?.[type]?.items || []),
          page: reset ? 0 : (prev[tabKey]?.[type]?.page || 0),
          hasMore: reset ? true : (prev[tabKey]?.[type]?.hasMore ?? true),
          loadingInitial: reset,
          loadingMore: !reset
        }
      }
    }));

    try {
      const { data } = await api.get('/articles', { params });
      if (requestVersion !== feedRequestVersionRef.current) return;
      const nextItems = (Array.isArray(data.items) ? data.items : []).filter((item) => String(item?.type || '') === String(type));
      const totalItems = Math.max(0, Number(data.total || 0));
      setFeedStateByTab((prev) => {
        const current = prev[tabKey]?.[type] || emptyColumnState();
        const mergedItems = reset
          ? nextItems
          : [...current.items, ...nextItems.filter((item) => !current.items.some((existing) => existing._id === item._id))];
        return {
          ...prev,
          [tabKey]: {
            ...prev[tabKey],
            [type]: {
              items: mergedItems,
              page,
              total: totalItems,
              loaded: true,
              loadingInitial: false,
              hasMore: page < Number(data.pages || page),
              loadingMore: false
            }
          }
        };
      });
    } catch (error) {
      console.error(error);
      setFeedStateByTab((prev) => ({
        ...prev,
        [tabKey]: {
          ...prev[tabKey],
          [type]: {
            ...prev[tabKey][type],
            loadingInitial: false,
            loadingMore: false
          }
        }
      }));
    } finally {
      if (isScrollPage && feedScrollRequestRef.current === requestKey) {
        feedScrollRequestRef.current = null;
      }
    }
  }, [debouncedIntelFilters, scopeParamsForTab]);

  useEffect(() => {
    if (dashTab !== 'analytics') return;
    const hasCachedAnalytics = (
      analyticsLoadedSignatureRef.current === analyticsQuerySignature &&
      analyticsCacheReadyRef.current
    );
    if (hasCachedAnalytics) {
      setLoading(false);
      return;
    }
    load().then(() => {
      analyticsLoadedSignatureRef.current = analyticsQuerySignature;
      analyticsCacheReadyRef.current = true;
    });
  }, [analyticsQuerySignature, dashTab, load]);

  useEffect(() => {
    if (dashTab === 'analytics') return;
    const currentTabState = feedStateRef.current[intelDeskTab] || emptyFeedState();
    const typesToLoad = activeType ? [activeType] : FEED_COLUMNS.map((column) => column.key);
    const hasMatchingLoadedData = (
      feedLoadedSignatureRef.current[intelDeskTab] === feedQuerySignature &&
      typesToLoad.every((type) => currentTabState[type]?.loaded)
    );
    if (hasMatchingLoadedData) {
      setFeedRefreshing(false);
      return;
    }
    const shouldWarmAllTabs = INTEL_DESK_TABS.every(
      (tabKey) => feedLoadedSignatureRef.current[tabKey] !== feedQuerySignature
    );
    const tabsToLoad = shouldWarmAllTabs ? INTEL_DESK_TABS : [intelDeskTab];

    const requestVersion = feedRequestVersionRef.current + 1;
    feedRequestVersionRef.current = requestVersion;
    setFeedStateByTab((prev) => ({
      ...prev,
      ...Object.fromEntries(
        tabsToLoad.map((tabKey) => [
          tabKey,
          Object.fromEntries(
            FEED_COLUMNS.map(({ key }) => [
              key,
              typesToLoad.includes(key)
                ? {
                    ...(prev[tabKey]?.[key] || emptyColumnState()),
                    items: [],
                    page: 0,
                    total: 0,
                    loaded: false,
                    loadingInitial: true,
                    hasMore: true,
                    loadingMore: false
                  }
                : prev[tabKey]?.[key] || emptyColumnState()
            ])
          )
        ])
      )
    }));
    setFeedRefreshing(true);
    const requests = activeType
      ? tabsToLoad.flatMap((tabKey) => (
          typesToLoad.map((type) => loadFeedPage({ tabKey, type, page: 1, reset: true, requestVersion }))
        ))
      : tabsToLoad.flatMap((tabKey) => ([
          loadFeedCounts(tabKey, requestVersion),
          loadFeedSnapshot({ tabKey, offset: 0, limit: FEED_PAGE_SIZE, reset: true, requestVersion })
        ]));
    Promise.all(requests)
      .then(() => {
        if (requestVersion === feedRequestVersionRef.current) {
          tabsToLoad.forEach((tabKey) => {
            feedLoadedSignatureRef.current[tabKey] = feedQuerySignature;
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (requestVersion === feedRequestVersionRef.current) {
          setFeedRefreshing(false);
        }
      });
  }, [activeType, dashTab, debouncedIntelFilters, feedQuerySignature, intelDeskTab, loadFeedCounts, loadFeedPage, loadFeedSnapshot]);

  useEffect(() => {
    const invalidateDashboardCache = () => {
      setRefreshKey((value) => value + 1);
    };

    window.addEventListener(APP_EVENT_CONTENT_CHANGED, invalidateDashboardCache);
    return () => {
      window.removeEventListener(APP_EVENT_CONTENT_CHANGED, invalidateDashboardCache);
    };
  }, []);

  const visibleColumns = activeType ? feedColumns.filter(c => c.key === activeType) : feedColumns;
  const canDeleteTailoredArticles = isIntelDesk && intelDeskTab === 'tailored' && isAdmin;
  const currentFeedState = feedStateByTab[intelDeskTab] || emptyFeedState();
  const isFeedLoading = visibleColumns.some((column) => currentFeedState[column.key]?.loadingInitial);
  const isAnyScrollPageLoading = FEED_COLUMNS.some((column) => currentFeedState[column.key]?.loadingMore);
  const combinedFeedLoadedCount = visibleColumns.reduce((maxCount, column) => {
    const count = Number(currentFeedState[column.key]?.items?.length || 0);
    return count > maxCount ? count : maxCount;
  }, 0);
  const hasCombinedFeedMore = visibleColumns.some((column) => currentFeedState[column.key]?.hasMore);
  const refreshIndicatorLoading = dashTab === 'analytics' ? loading : (feedRefreshing || isFeedLoading);
  const rankedData = useMemo(() => ({
    news: dateScoreRanked(currentFeedState.news?.items || []),
    govt: dateScoreRanked(currentFeedState.govt?.items || []),
    competitor: dateScoreRanked(currentFeedState.competitor?.items || []),
    evergreen: dateScoreRanked(currentFeedState.evergreen?.items || []),
  }), [currentFeedState]);
  const mobileFeedItems = useMemo(() => (
    visibleColumns
      .flatMap((col) => rankedData[col.key] || [])
      .sort((a, b) => {
        const timeDiff = getEffectiveTime(b) - getEffectiveTime(a);
        if (timeDiff) return timeDiff;

        const scoreDiff = (b.relevanceScore || 0) - (a.relevanceScore || 0);
        if (scoreDiff) return scoreDiff;
        return getEffectiveDateKey(b).localeCompare(getEffectiveDateKey(a));
      })
  ), [rankedData, visibleColumns]);
  const visibleFeedItems = useMemo(() => {
    if (activeType) return rankedData[activeType] || [];
    return mobileFeedItems;
  }, [activeType, mobileFeedItems, rankedData]);
  const activeFeedScrollRef = useRef(null);
  const mobileFeedScrollRef = useRef(null);
  const activeFeedLoadMoreRef = useInfiniteScroll({
    enabled: isIntelDesk && Boolean(activeType),
    hasMore: Boolean(activeType && currentFeedState[activeType]?.hasMore),
    loading: Boolean(isAnyScrollPageLoading || (activeType && (currentFeedState[activeType]?.loadingMore || currentFeedState[activeType]?.loadingInitial))),
    onLoadMore: () => {
      if (!activeType) return false;
      const state = currentFeedState[activeType];
      if (!state?.hasMore || state.loadingMore || isAnyScrollPageLoading) return false;
      loadFeedPage({ tabKey: intelDeskTab, type: activeType, page: (state.page || 1) + 1, requestVersion: feedRequestVersionRef.current });
      return true;
    },
    root: activeFeedScrollRef.current
  });
  const loadCombinedFeedMore = useCallback(() => {
    if (activeType || isAnyScrollPageLoading || !hasCombinedFeedMore) return false;
    loadFeedSnapshot({
      tabKey: intelDeskTab,
      offset: combinedFeedLoadedCount,
      limit: FEED_SCROLL_ROW_SIZE,
      requestVersion: feedRequestVersionRef.current
    });
    return true;
  }, [activeType, combinedFeedLoadedCount, hasCombinedFeedMore, intelDeskTab, isAnyScrollPageLoading, loadFeedSnapshot]);
  const mobileLoadMoreRef = useInfiniteScroll({
    enabled: isIntelDesk,
    hasMore: hasCombinedFeedMore,
    loading: isAnyScrollPageLoading || visibleColumns.some((column) => currentFeedState[column.key]?.loadingMore || currentFeedState[column.key]?.loadingInitial),
    onLoadMore: loadCombinedFeedMore,
    root: mobileFeedScrollRef.current
  });
  useEffect(() => {
    setSelectedArticleIds(new Set());
  }, [canDeleteTailoredArticles, intelFilters.type, intelDeskTab]);

  const startArticleDrag = (event, item) => {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', item._id);
    setDraggedArticle(item);
    setComposerOpen(true);
  };

  const endArticleDrag = () => {
    window.setTimeout(() => {
      setDraggedArticle(null);
      setComposerOpen(false);
    }, 180);
  };

  const openStudioForArticle = (item, mode, options = {}) => {
    if (!item?._id) return;
    navigate('/social-media-studio', {
      state: {
        articleId: item._id,
        article: item,
        contentType: mode,
        socialPlatform: 'linkedin',
        ...options
      }
    });
  };

  const openStudioWithArticle = (mode) => {
    openStudioForArticle(draggedArticle, mode);
  };

  const patchArticleSavedState = (article, isSaved) => {
    const articleId = article?._id;
    if (!articleId) return;
    const updateBuckets = (prev) => Object.fromEntries(
      Object.entries(prev || {}).map(([type, items]) => [
        type,
        (items || []).map((item) => item._id === articleId ? { ...item, isSaved } : item)
      ])
    );
    setFeedStateByTab((prev) => {
      const next = Object.fromEntries(
        Object.entries(prev || {}).map(([tab, bucketState]) => [tab, Object.fromEntries(
          Object.entries(bucketState || {}).map(([type, state]) => [
            type,
            { ...state, items: (state.items || []).map((item) => item._id === articleId ? { ...item, isSaved } : item) }
          ])
        )])
      );

      const articleType = article.type;
      if (articleType && next.saved?.[articleType]) {
        const savedState = next.saved[articleType];
        const savedItems = savedState.items || [];
        const existingIndex = savedItems.findIndex((item) => item._id === articleId);

        if (isSaved) {
          const savedItem = { ...article, isSaved: true };
          next.saved[articleType] = {
            ...savedState,
            items: existingIndex >= 0
              ? savedItems.map((item) => item._id === articleId ? { ...item, ...savedItem } : item)
              : [savedItem, ...savedItems]
          };
        } else if (existingIndex >= 0) {
          next.saved[articleType] = {
            ...savedState,
            items: savedItems.filter((item) => item._id !== articleId)
          };
        }
      }

      return next;
    });
    setAnalyticsData(updateBuckets);
  };

  const removeArticlesFromBuckets = (articleIds) => {
    const ids = new Set(articleIds.map(String));
    const updateBuckets = (prev) => Object.fromEntries(
      Object.entries(prev || {}).map(([type, items]) => [
        type,
        (items || []).filter((item) => !ids.has(String(item._id)))
      ])
    );
    setFeedStateByTab((prev) => Object.fromEntries(
      Object.entries(prev || {}).map(([tab, bucketState]) => [tab, Object.fromEntries(
        Object.entries(bucketState || {}).map(([type, state]) => [
          type,
          { ...state, items: (state.items || []).filter((item) => !ids.has(String(item._id))) }
        ])
      )])
    ));
    setAnalyticsData(updateBuckets);
  };

  const toggleSelectArticle = (articleId) => {
    setSelectedArticleIds((prev) => {
      const next = new Set(prev);
      next.has(articleId) ? next.delete(articleId) : next.add(articleId);
      return next;
    });
  };

  const selectAllVisibleArticles = () => {
    setSelectedArticleIds(new Set(visibleFeedItems.map((item) => item._id)));
  };

  const clearSelectedArticles = () => setSelectedArticleIds(new Set());

  const deleteArticle = async (item) => {
    if (!canDeleteTailoredArticles || !item?._id) return;
    if (!confirm('Delete this article permanently?')) return;
    await api.delete(`/admin/articles/${item._id}`);
    removeArticlesFromBuckets([item._id]);
    setSelectedArticleIds((prev) => {
      const next = new Set(prev);
      next.delete(item._id);
      return next;
    });
  };

  const deleteSelectedArticles = async () => {
    const ids = Array.from(selectedArticleIds);
    if (!canDeleteTailoredArticles || !ids.length) return;
    if (!confirm(`Delete ${ids.length} articles? This is permanent.`)) return;
    await api.post('/admin/articles/bulk-delete', { ids });
    removeArticlesFromBuckets(ids);
    clearSelectedArticles();
  };

  const toggleSaveArticle = async (item) => {
    if (!item?._id || savingArticleIds.has(item._id)) return;
    setSavingArticleIds((prev) => new Set(prev).add(item._id));
    const nextSaved = !item.isSaved;
    patchArticleSavedState(item, nextSaved);
    try {
      if (nextSaved) {
        await api.post(`/articles/${item._id}/save`);
      } else {
        await api.delete(`/articles/${item._id}/save`);
      }
    } catch (error) {
      patchArticleSavedState(item, item.isSaved);
      console.error(error);
    } finally {
      setSavingArticleIds((prev) => {
        const next = new Set(prev);
        next.delete(item._id);
        return next;
      });
    }
  };

  const renderDraggableArticle = (item, options = {}) => (
    <div
      key={item._id}
      draggable
      onDragStart={(event) => startArticleDrag(event, item)}
      onDragEnd={endArticleDrag}
      className="cursor-grab active:cursor-grabbing"
      title="Drag to create blog or social post"
    >
      <ArticleCard
        item={item}
        {...options}
        onSaveToggle={toggleSaveArticle}
        saving={savingArticleIds.has(item._id)}
        selectable={canDeleteTailoredArticles}
        selected={selectedArticleIds.has(item._id)}
        onSelect={toggleSelectArticle}
        adminActions={canDeleteTailoredArticles ? (
          <button onClick={() => deleteArticle(item)} className="btn-ghost text-[12px] text-red-600 hover:bg-red-50">
            <Trash2 size={12} /> Delete
          </button>
        ) : null}
      />
      {canUseBlogStudio ? (
        <div className="mt-2 grid grid-cols-2 gap-2 xl:hidden">
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openStudioForArticle(item, 'blog', { focusComposer: true });
            }}
            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-brand-crimson/10 bg-white px-3 text-[11px] font-black uppercase tracking-wider text-brand-crimson shadow-sm transition-all hover:bg-brand-pink/50"
          >
            <BookOpenText size={14} /> Blog
          </button>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openStudioForArticle(item, 'social', { focusComposer: true });
            }}
            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-blue-100 bg-white px-3 text-[11px] font-black uppercase tracking-wider text-blue-600 shadow-sm transition-all hover:bg-blue-50"
          >
            <MessageSquareText size={14} /> LinkedIn
          </button>
        </div>
      ) : null}
    </div>
  );

  const headerActions = (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
      {isIntelDesk && (
        <>
        <div className="flex items-center justify-between gap-3 sm:hidden">
          <div className="inline-flex min-h-[42px] items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-[13px] font-black text-gray-900 shadow-sm">
            {intelDeskTab === 'intel' ? <Sparkles size={14} /> : intelDeskTab === 'tailored' ? <Newspaper size={14} /> : <Bookmark size={14} />}
            {intelDeskTab === 'intel' ? 'Intelligence Library' : intelDeskTab === 'tailored' ? 'Personalized Feed' : 'Saved Briefs'}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              data-tour="dashboard-refresh"
              className="inline-flex h-[42px] min-w-[42px] items-center justify-center rounded-2xl border border-brand-crimson/20 bg-brand-pink/10 px-3 text-brand-crimson shadow-sm transition-all hover:bg-brand-pink/20 hover:border-brand-crimson/30"
              aria-label="Refresh intel desk"
            >
                <RefreshCw size={16} className={refreshIndicatorLoading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={() => setMobileIntelMenuOpen((value) => !value)}
              className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-600 shadow-sm transition-all hover:border-brand-crimson/20 hover:text-brand-crimson"
              aria-label="Open intel desk menu"
            >
              <MoreHorizontal size={16} />
            </button>
          </div>
        </div>
        <div className="hidden w-full grid-cols-3 rounded-2xl border border-gray-200 bg-white p-1 shadow-sm sm:grid sm:w-auto">
          {[
            { key: 'intel', label: 'Intelligence Library', mobileLabel: 'Intelligence Library', icon: Sparkles },
            { key: 'tailored', label: 'Personalized Feed', mobileLabel: 'Personalized Feed', icon: Newspaper },
            { key: 'saved', label: 'Saved Briefs', mobileLabel: 'Saved Briefs', icon: Bookmark },
          ].map((item) => {
            const Icon = item.icon;
            const active = intelDeskTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setIntelDeskTab(item.key)}
                className={[
                  'flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl px-2 text-center text-[10px] font-black leading-[1.1] transition-all sm:min-h-[40px] sm:gap-2 sm:px-5 sm:text-[13px]',
                  active ? 'bg-brand-crimson text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'
                ].join(' ')}
              >
                <Icon size={13} className="shrink-0 sm:block" />
                <span className="line-clamp-2 sm:hidden">{item.mobileLabel}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            );
          })}
        </div>
        </>
      )}
      {dashTab === 'analytics' && (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:hidden">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-2">
              <div
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-[13px] font-black text-gray-900 shadow-sm"
              >
                <Sparkles size={14} />
                <span className="truncate">{analyticsViewMode === 'today' ? 'Today' : 'Full Hive'}</span>
              </div>
              <div className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-[#ffd8e1] bg-[linear-gradient(180deg,#fff8fa_0%,#fff3f6_100%)] px-4 text-[13px] font-black text-brand-crimson shadow-sm">
                <span className="h-2.5 w-2.5 rounded-full bg-[#6ddf72] shadow-[0_0_0_4px_rgba(109,223,114,0.14)]" />
                <span className="truncate">{Object.values(analyticsData || {}).flat().length > 0 ? 'Live Buzz' : 'No Buzz'}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRefreshKey((k) => k + 1)}
                data-tour="dashboard-refresh"
                className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-2xl border border-brand-crimson/20 bg-[linear-gradient(180deg,#fff8fa_0%,#fff1f5_100%)] text-brand-crimson shadow-sm transition-all hover:bg-brand-pink/20 hover:border-brand-crimson/30"
                aria-label="Refresh dashboard"
              >
                <RefreshCw size={16} className={refreshIndicatorLoading ? 'animate-spin' : ''} />
              </button>
              <button
                type="button"
                onClick={() => setMobileAnalyticsMenuOpen((value) => !value)}
                className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-600 shadow-sm transition-all hover:border-brand-crimson/20 hover:text-brand-crimson"
                aria-label="Open analytics menu"
              >
                <MoreHorizontal size={16} />
              </button>
            </div>
          </div>
          <div className="hidden sm:inline-flex rounded-2xl border border-gray-200 bg-[#f7f8fb] p-1 shadow-sm">
            {[
              { key: 'today', label: 'Today' },
              ...(isAdmin ? [{ key: 'all', label: 'Full Hive' }] : []),
            ].map((mode) => (
              <button
                key={mode.key}
                type="button"
                onClick={() => setAnalyticsViewMode(mode.key)}
                className={`min-h-[40px] rounded-xl px-5 text-[13px] font-black uppercase tracking-wider transition-all ${
                  analyticsViewMode === mode.key
                    ? 'bg-brand-crimson text-white shadow-[0_6px_14px_rgba(209,18,67,0.18)]'
                    : 'text-[#98a0b3] hover:bg-white'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <div className="hidden sm:inline-flex min-h-[40px] items-center gap-2 rounded-2xl border border-[#ffd8e1] bg-[#fff7f9] px-4 text-[13px] font-black text-brand-crimson shadow-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-[#6ddf72]" />
            {Object.values(analyticsData || {}).flat().length > 0 ? 'Live Buzz' : 'No Buzz'}
          </div>
        </>
      )}
      <button
        type="button"
        onClick={() => setRefreshKey((k) => k + 1)}
        data-tour="dashboard-refresh"
        className={`hidden min-h-[40px] w-full items-center justify-center gap-2 rounded-2xl border border-[#ffd8e1] bg-[#fff7f9] px-5 text-[13px] font-black text-brand-crimson shadow-sm transition-all hover:border-brand-crimson/25 hover:bg-white sm:w-auto ${(dashTab === 'analytics' || isIntelDesk) ? 'sm:inline-flex' : ''}`}
      >
        <RefreshCw size={14} className={refreshIndicatorLoading ? 'animate-spin' : ''} />
        Refresh
      </button>
      {isIntelDesk && mobileIntelMenuOpen ? (
        <>
          <button
            type="button"
            aria-label="Close intel desk menu"
            onClick={() => setMobileIntelMenuOpen(false)}
            className="fixed inset-0 z-40 bg-gray-950/20 backdrop-blur-[1px] sm:hidden"
          />
          <div className="fixed right-3 top-[76px] z-50 w-[min(290px,calc(100vw-24px))] overflow-hidden rounded-[24px] border border-gray-200 bg-white shadow-[0_24px_48px_rgba(15,23,42,0.18)] sm:hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Intel Desk</div>
                <div className="mt-1 text-sm font-black text-gray-900">Quick Actions</div>
              </div>
              <button
                type="button"
                onClick={() => setMobileIntelMenuOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500"
                aria-label="Close intel desk menu"
              >
                <X size={15} />
              </button>
            </div>
            <div className="space-y-2 p-3">
              {[
                { key: 'intel', label: 'Intelligence Library' },
                { key: 'tailored', label: 'Personalized Feed' },
                { key: 'saved', label: 'Saved Briefs' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setIntelDeskTab(item.key);
                    setMobileIntelMenuOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition-all ${intelDeskTab === item.key ? 'border border-brand-crimson/15 bg-brand-pink/20 text-brand-crimson' : 'border border-gray-200 bg-gray-50 text-gray-700'}`}
                >
                  <span className="text-sm font-black">{item.label}</span>
                  {intelDeskTab === item.key ? <Check size={15} /> : null}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
      {dashTab === 'analytics' && mobileAnalyticsMenuOpen ? (
        <>
          <button
            type="button"
            aria-label="Close analytics menu"
            onClick={() => setMobileAnalyticsMenuOpen(false)}
            className="fixed inset-0 z-40 bg-gray-950/20 backdrop-blur-[1px] sm:hidden"
          />
          <div className="fixed right-3 top-[76px] z-50 w-[min(290px,calc(100vw-24px))] overflow-hidden rounded-[24px] border border-gray-200 bg-white shadow-[0_24px_48px_rgba(15,23,42,0.18)] sm:hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Analytics</div>
                <div className="mt-1 text-sm font-black text-gray-900">Quick Actions</div>
              </div>
              <button
                type="button"
                onClick={() => setMobileAnalyticsMenuOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500"
                aria-label="Close analytics menu"
              >
                <X size={15} />
              </button>
            </div>
            <div className="space-y-2 p-3">
              {[
                { key: 'today', label: 'Today' },
                ...(isAdmin ? [{ key: 'all', label: 'Full Hive' }] : []),
              ].map((mode) => (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => {
                    setAnalyticsViewMode(mode.key);
                    setMobileAnalyticsMenuOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition-all ${analyticsViewMode === mode.key ? 'border border-brand-crimson/15 bg-brand-pink/20 text-brand-crimson' : 'border border-gray-200 bg-gray-50 text-gray-700'}`}
                >
                  <span className="text-sm font-black">{mode.label}</span>
                  {analyticsViewMode === mode.key ? <Check size={15} /> : null}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );

  return (
    <Layout headerActions={headerActions}>
      <div className="flex h-full min-h-0 flex-col">
        {dashTab === 'analytics' ? (
          <div className="min-h-0 flex-1" data-tour="dashboard-analytics" data-analytics-section="Intelligence analytics dashboard">
            <AnalyticsSection
              data={analyticsData}
              velocityData={analyticsVelocityData}
              loading={loading}
              isAdmin={isAdmin}
              viewMode={analyticsViewMode}
              onViewModeChange={setAnalyticsViewMode}
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col" data-analytics-section="Personalized intelligence feed">
            <div className="mb-4 shrink-0" data-tour="intel-filters">
              <Filters initial={intelFilters} onChange={setIntelFilters} showAdmin={isAdmin} showSavedFilter={false} showStatusFilter={false} metaParams={filterMetaParams} />
            </div>

            {canDeleteTailoredArticles && selectedArticleIds.size > 0 && (
              <div className="mb-4 flex flex-col gap-3 rounded-xl border border-red-100 bg-red-50/80 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-black text-gray-800">
                  {selectedArticleIds.size} selected
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllVisibleArticles}
                    disabled={!visibleFeedItems.length}
                    className="rounded-xl bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wider text-gray-500 ring-1 ring-gray-100 hover:text-gray-900 disabled:opacity-40"
                  >
                    Select all visible
                  </button>
                  <button
                    type="button"
                    onClick={deleteSelectedArticles}
                    disabled={!selectedArticleIds.size}
                    className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-black text-red-600 ring-1 ring-red-100 hover:bg-red-100 disabled:opacity-40"
                  >
                    <Trash2 size={14} /> Delete selected
                  </button>
                  <button onClick={clearSelectedArticles} className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-gray-500 ring-1 ring-gray-200 hover:bg-gray-50">
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}

            {activeType ? (
              <div ref={activeFeedScrollRef} className="min-h-0 flex-1 overflow-y-auto pb-6 pr-1">
                {(() => {
                  const col = visibleColumns[0];
                  if (!col) return null;
                  return (
                    <>
                      <div className="flex items-center justify-between mb-4 px-0.5">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: col.accent }} />
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl" style={{ background: col.soft, border: `1px solid ${col.border}` }}>
                            <col.icon size={15} style={{ color: col.text }} />
                          </span>
                          <h2 className="font-bold text-[15px] text-gray-800">{col.label}</h2>
                        </div>
                        <span className="rounded-full px-2.5 py-1 text-[11px] uppercase tracking-wider font-mono" style={{ color: col.text, background: '#ffffffcc', border: `1px solid ${col.border}` }}>
                          {currentFeedState[col.key]?.loadingInitial ? '...' : currentFeedState[col.key]?.total || 0}
                        </span>
                      </div>
                      <div>
                        {currentFeedState[col.key]?.loadingInitial ? (
                            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
                          </div>
                        ) : rankedData[col.key]?.length ? (
                          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                            {rankedData[col.key].map(item => renderDraggableArticle(item))}
                            {currentFeedState[col.key]?.hasMore ? (
                              <div ref={activeFeedLoadMoreRef} className="col-span-full flex items-center justify-center py-2 text-xs font-bold text-gray-400">
                                {currentFeedState[col.key]?.loadingMore ? 'Loading more...' : 'Scroll for more'}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <EmptyState icon={col.icon} isAdmin={isAdmin} />
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <>
              <div ref={mobileFeedScrollRef} className="min-h-0 flex-1 overflow-y-auto pb-8 xl:hidden" data-tour="intel-feed">
                {isFeedLoading ? (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
                  </div>
                ) : mobileFeedItems.length ? (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {mobileFeedItems.map(item => renderDraggableArticle(item))}
                    {hasCombinedFeedMore ? (
                      <div ref={mobileLoadMoreRef} className="col-span-full flex items-center justify-center py-2 text-xs font-bold text-gray-400">
                        {isAnyScrollPageLoading ? 'Loading more...' : 'Scroll for more'}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <EmptyState icon={intelDeskTab === 'saved' ? Bookmark : intelDeskTab === 'intel' ? Sparkles : Newspaper} isAdmin={isAdmin} />
                )}
              </div>
              <div className="hidden min-h-0 flex-1 grid-cols-4 gap-4 pb-2 xl:grid 2xl:gap-5" data-tour="intel-feed">
                  {visibleColumns.map(col => (
                    <FeedColumn
                      key={col.key}
                      column={col}
                      items={rankedData[col.key] || []}
                      totalCount={currentFeedState[col.key]?.total || 0}
                      loading={Boolean(currentFeedState[col.key]?.loadingInitial)}
                      isAdmin={isAdmin}
                      renderArticle={renderDraggableArticle}
                      hasMore={Boolean(currentFeedState[col.key]?.hasMore)}
                      loadingMore={Boolean(currentFeedState[col.key]?.loadingMore)}
                      onLoadMore={() => {
                        const state = currentFeedState[col.key];
                        if (!state?.hasMore || state.loadingMore || isAnyScrollPageLoading) return false;
                        loadFeedPage({ tabKey: intelDeskTab, type: col.key, page: (state.page || 1) + 1, requestVersion: feedRequestVersionRef.current });
                        return true;
                      }}
                    />
                  ))}
                {false && visibleColumns.map(col => (
                  <div key={col.key} className="flex min-h-0 flex-col">
                    <div className="flex items-center justify-between mb-4 px-0.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                        <col.icon size={14} className="text-gray-500" />
                        <h2 className="font-bold text-[15px] text-gray-800">{col.label}</h2>
                      </div>
                      <span className="text-[11px] text-gray-400 uppercase tracking-wider font-mono">
                        {loading ? '...' : rankedData[col.key]?.length || 0}
                      </span>
                    </div>
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4 pr-1">
                      {loading
                        ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
                        : rankedData[col.key]?.length
                          ? rankedData[col.key].map(item => <ArticleCard key={item._id} item={item} />)
                          : <EmptyState icon={col.icon} isAdmin={isAdmin} />}
                    </div>
                  </div>
                ))}
              </div>
              </>
            )}
          </div>
        )}
      </div>
      {isIntelDesk && (
        <ComposerDropTray
          open={composerOpen}
          article={draggedArticle}
          onDropMode={openStudioWithArticle}
        />
      )}
    </Layout>
  );
}

function ComposerDropTray({ open, article, onDropMode }) {
  const [activeTarget, setActiveTarget] = useState('');
  const targets = [
    {
      mode: 'blog',
      title: 'Blog Generator',
      subtitle: 'Draft a polished long-form article',
      icon: BookOpenText,
      tint: 'from-rose-500 to-pink-500',
    },
    {
      mode: 'social',
      title: 'Social Media Post',
      subtitle: 'Create a LinkedIn-ready post',
      icon: MessageSquareText,
      tint: 'from-sky-500 to-cyan-500',
    },
  ];

  return (
    <>
      <div
        className={[
          'pointer-events-none fixed inset-0 z-30 bg-gray-950/10 backdrop-blur-[2px] transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
      />
      <div
        className={[
          'pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-3 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] sm:px-6 sm:pb-5',
          open ? 'translate-y-0 opacity-100' : 'translate-y-[115%] opacity-0',
        ].join(' ')}
      >
        <div className={`pointer-events-auto mx-auto max-w-5xl overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-[0_-22px_70px_rgba(15,23,42,0.22)] backdrop-blur-2xl ${open ? 'composer-pop' : ''}`}>
          <div className="h-1.5 bg-[linear-gradient(90deg,#D11243,#38bdf8,#8b5cf6,#D11243)] bg-[length:220%_100%] composer-gradient" />
          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.35fr)] lg:p-5">
            <div className="relative overflow-hidden rounded-xl border border-gray-100 bg-gray-50/80 p-4">
              <div className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white text-brand-crimson shadow-sm">
                <Sparkles size={18} className="composer-spark" />
              </div>
              <div className="pr-12">
                <div className="text-[10px] font-black uppercase tracking-widest text-brand-crimson">
                  Selected intelligence
                </div>
                <h3 className="mt-2 line-clamp-3 text-base font-black leading-snug text-gray-950">
                  {article?.title || 'Drag a topic into a composer'}
                </h3>
                <p className="mt-3 line-clamp-3 text-xs font-semibold leading-relaxed text-gray-500">
                  {articleDescription(article) || 'Choose where this source should become content.'}
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {article?.type && (
                  <span className="rounded-md bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-gray-500 ring-1 ring-gray-100">
                    {TYPE_LABELS[article.type]?.label || article.type}
                  </span>
                )}
                <span className="rounded-md bg-brand-pink/70 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-brand-crimson ring-1 ring-brand-crimson/10">
                  Drop to continue
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {targets.map((target) => {
                const Icon = target.icon;
                const active = activeTarget === target.mode;
                return (
                  <button
                    key={target.mode}
                    type="button"
                    onDragEnter={() => setActiveTarget(target.mode)}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'copy';
                      setActiveTarget(target.mode);
                    }}
                    onDragLeave={() => setActiveTarget('')}
                    onDrop={(event) => {
                      event.preventDefault();
                      setActiveTarget('');
                      onDropMode(target.mode);
                    }}
                    className={[
                      'group relative flex min-h-[148px] overflow-hidden rounded-xl border-2 border-dashed px-4 py-4 text-left transition-all duration-300 sm:px-5',
                      active
                        ? 'scale-[1.025] border-brand-crimson bg-brand-pink/50 shadow-[0_18px_45px_rgba(209,18,67,0.18)]'
                        : 'border-gray-200 bg-white hover:-translate-y-1 hover:border-brand-crimson/40 hover:shadow-lg',
                    ].join(' ')}
                  >
                    <span className={`absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br ${target.tint} opacity-10 blur-2xl transition-all duration-300 group-hover:scale-125 group-hover:opacity-20`} />
                    <span className="relative flex h-full min-w-0 flex-col justify-between gap-5">
                      <span className="flex items-start gap-3">
                        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${target.tint} text-white shadow-lg transition-transform duration-300 ${active ? 'scale-110 rotate-3' : 'group-hover:scale-105'}`}>
                          <Icon size={21} />
                        </span>
                        <span className="min-w-0 pt-0.5">
                          <span className="block text-base font-black text-gray-950">{target.title}</span>
                          <span className="mt-1 block text-xs font-semibold leading-relaxed text-gray-500">{target.subtitle}</span>
                        </span>
                      </span>
                      <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${active ? 'bg-brand-crimson text-white' : 'bg-gray-50 text-gray-400 group-hover:bg-brand-pink group-hover:text-brand-crimson'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-white' : 'bg-brand-crimson'}`} />
                        {active ? 'Release to open' : 'Drop here'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
