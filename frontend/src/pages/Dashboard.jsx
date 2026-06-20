import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import Filters from '../components/Filters';
import ArticleCard from '../components/ArticleCard';
import { Skeleton } from '../components/Loader';
import AnalyticsSection from '../components/AnalyticsSection';
import Layout from '../components/Layout';
import {
  Newspaper, Landmark, Building2, BookOpen, RefreshCw, TrendingUp, BookOpenText, MessageSquareText, Sparkles
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const CRIMSON = '#D11243';
const DASHBOARD_TIMEZONE = 'Asia/Kolkata';

const FEED_COLUMNS = [
  { key: 'govt', label: 'Government Updates', icon: Landmark, dot: 'bg-emerald-500', color: '#10b981', tint: 'rgba(16,185,129,0.08)' },
  { key: 'news', label: 'News Articles', icon: Newspaper, dot: 'bg-rose-500', color: '#e11d48', tint: 'rgba(225,29,72,0.08)' },
  { key: 'evergreen', label: 'Evergreen Guides', icon: BookOpen, dot: 'bg-violet-500', color: '#8b5cf6', tint: 'rgba(139,92,246,0.08)' },
  { key: 'competitor', label: 'Competitor Intel', icon: Building2, dot: 'bg-amber-500', color: '#f59e0b', tint: 'rgba(245,158,11,0.08)' },
];

const TYPE_LABELS = Object.fromEntries(FEED_COLUMNS.map((col) => [col.key, col]));

function withoutRegion(value = {}) {
  const { region: _region, ...rest } = value || {};
  return rest;
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

function getTodayDateKey() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DASHBOARD_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateScoreRanked(items = []) {
  return [...items].sort((a, b) => {
    const dateDiff = getEffectiveDateKey(b).localeCompare(getEffectiveDateKey(a));
    if (dateDiff) return dateDiff;

    const scoreDiff = (b.relevanceScore || 0) - (a.relevanceScore || 0);
    if (scoreDiff) return scoreDiff;

    return getEffectiveTime(b) - getEffectiveTime(a);
  });
}

function FeedColumn({ column, items, loading, isAdmin, renderArticle }) {
  const Icon = column.icon;
  const countries = [...new Set(items.map((item) => item.country).filter(Boolean))].slice(0, 3);

  return (
    <section className="min-h-0 rounded-lg border border-gray-100 bg-white shadow-card overflow-hidden flex flex-col">
      <div className="px-4 py-3.5 border-b border-gray-100 bg-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: column.tint }}>
              <Icon size={15} style={{ color: column.color }} />
            </span>
            <div className="min-w-0">
              <h2 className="font-black text-[14px] text-gray-900 truncate">{column.label}</h2>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold truncate">
                {countries.length ? countries.join(' / ') : 'Ranked feed'}
              </p>
            </div>
          </div>
          <span className="rounded-md px-2 py-1 text-[11px] font-black" style={{ color: column.color, background: column.tint }}>
            {loading ? '...' : items.length}
          </span>
        </div>
      </div>

      <div className="hide-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto bg-gray-50/40 p-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : items.length
            ? items.map(item => renderArticle(item, { compact: true }))
            : <EmptyState icon={Icon} isAdmin={isAdmin} />}
      </div>
    </section>
  );
}

export default function Dashboard({ initialTab = 'analytics' }) {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState({ news: [], govt: [], competitor: [], evergreen: [] });
  const [analyticsData, setAnalyticsData] = useState({ news: [], govt: [], competitor: [], evergreen: [] });
  const [analyticsVelocityData, setAnalyticsVelocityData] = useState([]);
  const [loading, setLoading] = useState(true);
  const dashTab = initialTab;
  const [analyticsViewMode, setAnalyticsViewMode] = useState('today');
  const [filters, setFilters] = useState(() => {
    if (!user?._id) return {};
    try {
      const saved = localStorage.getItem(`dashboard_filters_${user._id}`);
      return saved ? withoutRegion(JSON.parse(saved)) : {};
    } catch { return {}; }
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [draggedArticle, setDraggedArticle] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [savingArticleIds, setSavingArticleIds] = useState(new Set());

  useEffect(() => {
    if (user?._id)
      localStorage.setItem(`dashboard_filters_${user._id}`, JSON.stringify(withoutRegion(filters)));
  }, [filters, user?._id]);

  const load = useCallback(async (f) => {
    setLoading(true);
    try {
      const params = { personalized: 'true' };
      for (const [k, v] of Object.entries(withoutRegion(f))) if (v) params[k] = v;
      const [dashboardRes, analyticsRes, analyticsVelocityRes] = await Promise.all([
        api.get('/articles/dashboard', { params }),
        api.get('/articles/dashboard'),
        api.get('/articles/velocity', { params: { scope: 'dataset' } })
      ]);
      setData(dashboardRes.data);
      setAnalyticsData(analyticsRes.data);
      setAnalyticsVelocityData(analyticsVelocityRes.data.days || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(filters); }, [load, filters, refreshKey]);

  const activeType = filters.type;
  const visibleColumns = activeType ? FEED_COLUMNS.filter(c => c.key === activeType) : FEED_COLUMNS;
  const rankedData = {
    news: dateScoreRanked(data.news),
    govt: dateScoreRanked(data.govt),
    competitor: dateScoreRanked(data.competitor),
    evergreen: dateScoreRanked(data.evergreen),
  };
  const mobileFeedItems = visibleColumns
    .flatMap((col) => rankedData[col.key] || [])
    .sort((a, b) => {
      const dateDiff = getEffectiveDateKey(b).localeCompare(getEffectiveDateKey(a));
      if (dateDiff) return dateDiff;

      const scoreDiff = (b.relevanceScore || 0) - (a.relevanceScore || 0);
      if (scoreDiff) return scoreDiff;
      return getEffectiveTime(b) - getEffectiveTime(a);
    });
  const todaySignalTotal = useMemo(() => {
    const todayKey = getTodayDateKey();
    return Object.values(analyticsData || {})
      .flat()
      .filter((item) => getEffectiveDateKey(item) === todayKey)
      .length;
  }, [analyticsData]);

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

  const openStudioWithArticle = (mode) => {
    if (!draggedArticle?._id) return;
    navigate('/social-media-studio', {
      state: {
        articleId: draggedArticle._id,
        article: draggedArticle,
        contentType: mode,
        socialPlatform: 'linkedin'
      }
    });
  };

  const patchArticleSavedState = (articleId, isSaved) => {
    const updateBuckets = (prev) => Object.fromEntries(
      Object.entries(prev || {}).map(([type, items]) => [
        type,
        (items || []).map((item) => item._id === articleId ? { ...item, isSaved } : item)
      ])
    );
    setData(updateBuckets);
    setAnalyticsData(updateBuckets);
  };

  const toggleSaveArticle = async (item) => {
    if (!item?._id || savingArticleIds.has(item._id)) return;
    setSavingArticleIds((prev) => new Set(prev).add(item._id));
    const nextSaved = !item.isSaved;
    patchArticleSavedState(item._id, nextSaved);
    try {
      if (nextSaved) {
        await api.post(`/articles/${item._id}/save`);
      } else {
        await api.delete(`/articles/${item._id}/save`);
      }
    } catch (error) {
      patchArticleSavedState(item._id, item.isSaved);
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
      />
    </div>
  );

  return (
    <Layout>
      <div className="flex h-full min-h-0 flex-col">
        {/* Dashboard header with refresh button */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 shrink-0 rounded-lg border border-gray-100 bg-white px-4 py-3 shadow-card">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} style={{ color: CRIMSON }} />
              <h1 className="truncate text-base font-black text-gray-900">
                {dashTab === 'feed' ? 'My Intelligence' : 'Intelligence Briefing'}
              </h1>
            </div>
            {dashTab === 'feed' && (
              <p className="mt-0.5 truncate text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Personalized by market, service category and profile
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {dashTab === 'analytics' && (
              <>
                <div className="inline-flex rounded-md bg-gray-50 border border-gray-100 p-1 shadow-sm">
                  {[
                    { key: 'today', label: 'Today' },
                    ...(isAdmin ? [{ key: 'all', label: 'All Data' }] : []),
                  ].map((mode) => (
                    <button
                      key={mode.key}
                      type="button"
                      onClick={() => setAnalyticsViewMode(mode.key)}
                      className="px-3 py-1.5 rounded-md text-[11px] font-black uppercase tracking-wider transition-all"
                      style={{
                        background: analyticsViewMode === mode.key ? CRIMSON : 'transparent',
                        color: analyticsViewMode === mode.key ? 'white' : '#9ca3af',
                      }}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
                <div className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold"
                  style={{ background: 'rgba(209,18,67,0.08)', color: CRIMSON }}>
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-400" />
                  </span>
                  {todaySignalTotal > 0 ? 'Live Signals' : 'No Signals'}
                </div>
              </>
            )}
            <button onClick={() => setRefreshKey(k => k + 1)}
              className="flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg transition-all hover:shadow-sm sm:w-auto w-full"
              style={{ color: CRIMSON, background: 'rgba(209,18,67,0.06)', border: '1px solid rgba(209,18,67,0.12)' }}>
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {dashTab === 'analytics' ? (
          <div className="min-h-0 flex-1">
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
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-4 shrink-0">
              <Filters initial={filters} onChange={setFilters} showAdmin={isAdmin} />
            </div>

            {activeType ? (
              <div className="min-h-0 flex-1 overflow-y-auto pb-6 pr-1">
                {(() => {
                  const col = visibleColumns[0];
                  if (!col) return null;
                  return (
                    <>
                      <div className="flex items-center justify-between mb-4 px-0.5">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                          <col.icon size={15} className="text-gray-500" />
                          <h2 className="font-bold text-[15px] text-gray-800">{col.label}</h2>
                        </div>
                        <span className="text-[11px] text-gray-400 uppercase tracking-wider font-mono">
                          {loading ? '...' : rankedData[col.key]?.length || 0}
                        </span>
                      </div>
                      <div>
                        {loading ? (
                            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
                          </div>
                        ) : rankedData[col.key]?.length ? (
                          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                            {rankedData[col.key].map(item => renderDraggableArticle(item))}
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
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-8 xl:hidden">
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
                  : mobileFeedItems.length
                    ? mobileFeedItems.map(item => renderDraggableArticle(item))
                    : <EmptyState icon={Newspaper} isAdmin={isAdmin} />}
              </div>
              <div className="hidden min-h-0 flex-1 grid-cols-4 gap-4 pb-2 xl:grid 2xl:gap-5">
                {visibleColumns.map(col => (
                  <FeedColumn
                    key={col.key}
                    column={col}
                    items={rankedData[col.key] || []}
                    loading={loading}
                    isAdmin={isAdmin}
                    renderArticle={renderDraggableArticle}
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
      {dashTab === 'feed' && (
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
                  {article?.summary || article?.aiSummary || 'Choose where this source should become content.'}
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
