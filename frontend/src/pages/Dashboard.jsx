import { useEffect, useState, useCallback } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import Filters from '../components/Filters';
import ArticleCard from '../components/ArticleCard';
import { Skeleton } from '../components/Loader';
import AnalyticsSection from '../components/AnalyticsSection';
import Layout from '../components/Layout';
import {
  Newspaper, Landmark, Building2, BookOpen, RefreshCw, TrendingUp, ArrowUpRight
} from 'lucide-react';

const CRIMSON = '#D11243';

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
      {isAdmin && <span className="text-[11px] text-gray-300">Go to Admin → trigger a fetch.</span>}
    </div>
  );
}

function TopSignalsRail({ items }) {
  if (!items.length) return null;

  return (
    <section className="mb-4 shrink-0 rounded-xl border border-brand-crimson/10 bg-white shadow-card overflow-hidden">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 px-4 py-2.5 border-b border-gray-100">
        <div>
          <div className="eyebrow mb-1">Priority queue</div>
          <h2 className="font-black text-[18px] text-gray-900 tracking-tight">Top 5 Signals</h2>
        </div>
        <span className="text-[10px] uppercase tracking-[0.16em] text-gray-400 font-black">Score ranked across all feeds</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
        {items.map((item, index) => {
          const meta = TYPE_LABELS[item.type] || TYPE_LABELS.news;
          const Icon = meta.icon;
          const score = Math.round(Number(item.relevanceScore || 0));

          return (
            <a
              key={item._id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group min-w-0 p-3.5 hover:bg-brand-pink/25 transition-all"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0"
                    style={{ color: meta.color, background: meta.tint }}
                  >
                    {index + 1}
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-gray-400 truncate">
                    <Icon size={11} style={{ color: meta.color }} />
                    {meta.label}
                  </span>
                </div>
                {score > 0 && (
                  <span className="rounded-md px-2 py-1 text-[10px] font-black text-brand-crimson bg-brand-pink/70 ring-1 ring-brand-crimson/10">
                    {score}
                  </span>
                )}
              </div>
              <h3 className="font-black text-[13px] leading-snug text-gray-900 line-clamp-2 group-hover:text-brand-crimson transition-colors">
                {item.title}
              </h3>
              <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-gray-400">
                <span className="truncate font-semibold">{item.source || 'Unknown source'}</span>
                <ArrowUpRight size={13} className="shrink-0 opacity-50 group-hover:opacity-100" />
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}

function FeedColumn({ column, items, loading, isAdmin }) {
  const Icon = column.icon;

  return (
    <section className="min-h-0 rounded-xl border border-gray-100 bg-white/70 shadow-card overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100 bg-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: column.tint }}>
              <Icon size={15} style={{ color: column.color }} />
            </span>
            <div className="min-w-0">
              <h2 className="font-black text-[14px] text-gray-900 truncate">{column.label}</h2>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Ranked feed</p>
            </div>
          </div>
          <span className="rounded-md px-2 py-1 text-[11px] font-black" style={{ color: column.color, background: column.tint }}>
            {loading ? '...' : items.length}
          </span>
        </div>
      </div>

      <div className="hide-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : items.length
            ? items.map(item => <ArticleCard key={item._id} item={item} compact />)
            : <EmptyState icon={Icon} isAdmin={isAdmin} />}
      </div>
    </section>
  );
}

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const [data, setData] = useState({ news: [], govt: [], competitor: [], evergreen: [] });
  const [velocityData, setVelocityData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dashTab, setDashTab] = useState('analytics');
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
      const [dashboardRes, velocityRes] = await Promise.all([
        api.get('/articles/dashboard', { params }),
        api.get('/articles/velocity', { params })
      ]);
      setData(dashboardRes.data);
      setVelocityData(velocityRes.data.days || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(filters); }, [load, filters, refreshKey]);

  const activeType = filters.type;
  const visibleColumns = activeType ? FEED_COLUMNS.filter(c => c.key === activeType) : FEED_COLUMNS;
  const mobileFeedItems = visibleColumns
    .flatMap((col) => data[col.key] || [])
    .sort((a, b) => {
      const scoreDiff = (b.relevanceScore || 0) - (a.relevanceScore || 0);
      if (scoreDiff) return scoreDiff;
      const dateA = new Date(a.publishedAt || a.fetchedAt || 0).getTime();
      const dateB = new Date(b.publishedAt || b.fetchedAt || 0).getTime();
      return dateB - dateA;
    });
  const topSignals = [...mobileFeedItems].slice(0, 5);

  return (
    <Layout>
      <div className="flex flex-col min-h-full">
        {/* Sub-tabs header with refresh button */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 shrink-0 rounded-xl border border-gray-100 bg-white px-3 py-3 shadow-card">
          <div className="hide-scrollbar flex items-center gap-1 overflow-x-auto rounded-lg bg-gray-50 p-1">
            {[{ key: 'analytics', label: 'Analytics', icon: TrendingUp }, { key: 'feed', label: 'Intel Desk', icon: Newspaper }].map(t => (
              <button key={t.key} onClick={() => setDashTab(t.key)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-bold transition-all whitespace-nowrap"
                style={{
                  background: dashTab === t.key ? 'white' : 'transparent',
                  color: dashTab === t.key ? CRIMSON : '#9ca3af',
                  boxShadow: dashTab === t.key ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                }}>
                <t.icon size={14} />
                {t.label}
              </button>
            ))}
          </div>

          <button onClick={() => setRefreshKey(k => k + 1)}
            className="flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg transition-all hover:shadow-sm sm:w-auto w-full"
            style={{ color: CRIMSON, background: 'rgba(209,18,67,0.06)', border: '1px solid rgba(209,18,67,0.12)' }}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {dashTab === 'analytics' ? (
          <div className="pb-6 px-1">
            <AnalyticsSection data={data} velocityData={velocityData} loading={loading} />
          </div>
        ) : (
          <div className="flex flex-col px-1">
            {/* Filters */}
            {!loading && topSignals.length > 0 && (
              <TopSignalsRail items={topSignals} />
            )}

            <div className="sticky top-0 z-20 mb-5 bg-canvas/95 py-2 backdrop-blur">
              <Filters initial={filters} onChange={setFilters} showAdmin={isAdmin} />
            </div>

            {activeType ? (
              <div className="flex flex-col">
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
                          {loading ? '…' : data[col.key]?.length || 0}
                        </span>
                      </div>
                      <div className="pb-6 pr-1">
                        {loading ? (
                          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 xl:gap-6">
                            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
                          </div>
                        ) : data[col.key]?.length ? (
                          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 xl:gap-6">
                            {data[col.key].map(item => <ArticleCard key={item._id} item={item} />)}
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
              <div className="xl:hidden space-y-4 pb-8">
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
                  : mobileFeedItems.length
                    ? mobileFeedItems.map(item => <ArticleCard key={item._id} item={item} />)
                    : <EmptyState icon={Newspaper} isAdmin={isAdmin} />}
              </div>
              <div className="hidden xl:grid h-[calc(100vh-190px)] min-h-[520px] grid-cols-4 gap-4 pb-8">
                {visibleColumns.map(col => (
                  <FeedColumn key={col.key} column={col} items={data[col.key] || []} loading={loading} isAdmin={isAdmin} />
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
                        {loading ? '…' : data[col.key]?.length || 0}
                      </span>
                    </div>
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4 pr-1">
                      {loading
                        ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
                        : data[col.key]?.length
                          ? data[col.key].map(item => <ArticleCard key={item._id} item={item} />)
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
