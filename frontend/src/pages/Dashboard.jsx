import { useEffect, useState, useCallback, useMemo } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import Filters from '../components/Filters';
import ArticleCard from '../components/ArticleCard';
import { Skeleton } from '../components/Loader';
import AnalyticsSection from '../components/AnalyticsSection';
import Layout from '../components/Layout';
import {
  Newspaper, Landmark, Building2, BookOpen, RefreshCw, TrendingUp
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const CRIMSON = '#D11243';
const DASHBOARD_TIMEZONE = 'Asia/Singapore';

const FEED_COLUMNS = [
  { key: 'govt', label: 'Government Updates', icon: Landmark, dot: 'bg-emerald-500', color: '#10b981', tint: 'rgba(16,185,129,0.08)' },
  { key: 'news', label: 'News Articles', icon: Newspaper, dot: 'bg-rose-500', color: '#e11d48', tint: 'rgba(225,29,72,0.08)' },
  { key: 'evergreen', label: 'Evergreen Guides', icon: BookOpen, dot: 'bg-violet-500', color: '#8b5cf6', tint: 'rgba(139,92,246,0.08)' },
  { key: 'competitor', label: 'Competitor Intel', icon: Building2, dot: 'bg-amber-500', color: '#f59e0b', tint: 'rgba(245,158,11,0.08)' },
];

const TYPE_LABELS = Object.fromEntries(FEED_COLUMNS.map((col) => [col.key, col]));

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

function FeedColumn({ column, items, loading, isAdmin }) {
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
            ? items.map(item => <ArticleCard key={item._id} item={item} compact />)
            : <EmptyState icon={Icon} isAdmin={isAdmin} />}
      </div>
    </section>
  );
}

export default function Dashboard({ initialTab = 'analytics' }) {
  const { user, isAdmin } = useAuth();
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
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (user?._id)
      localStorage.setItem(`dashboard_filters_${user._id}`, JSON.stringify(filters));
  }, [filters, user?._id]);

  const load = useCallback(async (f) => {
    setLoading(true);
    try {
      const params = {};
      for (const [k, v] of Object.entries(f || {})) if (v) params[k] = v;
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

  return (
    <Layout>
      <div className="flex h-full min-h-0 flex-col">
        {/* Dashboard header with refresh button */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 shrink-0 rounded-lg border border-gray-100 bg-white px-4 py-3 shadow-card">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} style={{ color: CRIMSON }} />
              <h1 className="truncate text-base font-black text-gray-900">
                {dashTab === 'feed' ? 'Intel Desk' : 'Today Intelligence Dashboard'}
              </h1>
            </div>
            <p className="mt-0.5 truncate text-[11px] font-bold uppercase tracking-wider text-gray-400">
              {dashTab === 'feed' ? 'All indexed feeds' : 'Today intelligence workspace'}
            </p>
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
                            {rankedData[col.key].map(item => <ArticleCard key={item._id} item={item} />)}
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
                    ? mobileFeedItems.map(item => <ArticleCard key={item._id} item={item} />)
                    : <EmptyState icon={Newspaper} isAdmin={isAdmin} />}
              </div>
              <div className="hidden min-h-0 flex-1 grid-cols-4 gap-4 pb-2 xl:grid 2xl:gap-5">
                {visibleColumns.map(col => (
                  <FeedColumn key={col.key} column={col} items={rankedData[col.key] || []} loading={loading} isAdmin={isAdmin} />
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
    </Layout>
  );
}
