import { useEffect, useMemo, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { TrendingUp, Newspaper, Landmark, Building2, BarChart2, Activity, Globe, Sparkles, ExternalLink, Clock3, MapPin, Tag, Flame } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getDashboardAppearance, scoreBandForValue } from '../utils/feedTheme';

const CRIMSON = '#D11243';
const DASHBOARD_TIMEZONE = 'Asia/Kolkata';
const TYPE_ACCENTS = {
  news: '#3b82f6',
  govt: '#10b981',
  competitor: '#f59e0b',
  evergreen: '#8b5cf6',
};
const TYPE_NAMES = {
  news: 'News Articles',
  govt: 'Government Updates',
  competitor: 'Competitor Intel',
  evergreen: 'Evergreen Topics',
};

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

function StatCard({ icon: Icon, label, value, sub, color, delay = 0 }) {
  return (
    <div
      className="analytics-stat-card bg-white rounded-xl p-4 sm:p-5 flex flex-col gap-3 relative overflow-hidden fade-in min-w-0"
      style={{
        boxShadow: '0 1px 12px rgba(209,18,67,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        border: '1px solid rgba(209,18,67,0.08)',
        animationDelay: `${delay}s`,
      }}
    >
      {/* Accent dot at top right */}
      <div className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-[0.04] pointer-events-none"
        style={{ background: color, transform: 'translate(40%, -40%)' }} />

      <div className="flex items-center justify-between">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: `${color}14` }}>
          <Icon size={17} style={{ color }} />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 text-right truncate">{label}</span>
      </div>

      <div>
        <div className="text-3xl font-black text-gray-900 tracking-tight leading-none"
          style={{ fontFamily: '"Roboto", system-ui, sans-serif' }}>
          {value}
        </div>
        {sub && <div className="text-[11px] text-gray-400 mt-1 font-medium">{sub}</div>}
      </div>

      {/* Mini bar */}
      <div className="h-1 rounded-full bg-gray-100">
        <div className="h-1 rounded-full transition-all duration-1000"
          style={{ width: '65%', background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
      </div>
    </div>
  );
}

function DonutChart({ data, className = '' }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  let cumulative = 0;
  const segments = data.map(d => {
    const pct = total > 0 ? (d.value / total) * 100 : 0;
    const seg = { ...d, pct, offset: cumulative };
    cumulative += pct;
    return seg;
  });

  const r = 54;
  const circ = 2 * Math.PI * r;
  const center = 80;

  return (
    <div className={`analytics-card analytics-card-donut flex flex-col overflow-hidden bg-white rounded-xl p-3 fade-in min-w-0 sm:p-4 ${className}`} style={{ animationDelay: '0.3s', boxShadow: '0 1px 12px rgba(209,18,67,0.06)', border: '1px solid rgba(209,18,67,0.08)' }}>
      <div className="mb-2 flex items-center gap-2 2xl:mb-4">
        <BarChart2 size={16} style={{ color: CRIMSON }} />
        <span className="text-sm font-bold text-gray-700"> Buzz by Type
</span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 items-center gap-3 md:grid-cols-[minmax(128px,0.36fr)_minmax(0,1fr)] 2xl:grid-cols-[minmax(150px,0.36fr)_minmax(0,1fr)] 2xl:gap-5">
        <div className="relative mx-auto flex h-full min-h-0 items-center justify-center sm:mx-0">
          <svg
            className="aspect-square"
            style={{
              height: 'min(clamp(7.25rem, 8.6vw, 9.75rem), 100%)',
              width: 'min(clamp(7.25rem, 8.6vw, 9.75rem), 100%)',
            }}
            viewBox={`0 0 ${center * 2} ${center * 2}`}
          >
            {/* Background circle */}
            <circle cx={center} cy={center} r={r} fill="none" stroke="#f3f4f6" strokeWidth="24" />
            {segments.map((seg, i) => (
              <circle
                key={i}
                cx={center}
                cy={center}
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth="24"
                strokeDasharray={`${(seg.pct / 100) * circ} ${circ}`}
                strokeDashoffset={-(seg.offset / 100) * circ}
                transform={`rotate(-90 ${center} ${center})`}
                style={{ transition: 'stroke-dasharray 1s ease' }}
              />
            ))}
            {/* Center text */}
            <text x={center} y={center - 5} textAnchor="middle" dominantBaseline="middle"
              className="donut-total-value"
              fill="#111" fontWeight="900" fontSize="22" fontFamily='"Roboto", system-ui, sans-serif'>
              {total}
            </text>
            <text x={center} y={center + 14} textAnchor="middle" dominantBaseline="middle"
              className="donut-total-label"
              fill="#9ca3af" fontWeight="600" fontSize="9" fontFamily='"Roboto", system-ui, sans-serif' letterSpacing="0.1em">
              TOTAL
            </text>
          </svg>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-[clamp(0.35rem,0.8vh,0.875rem)]">
          {segments.map((seg, i) => (
            <div key={i} className="grid grid-cols-[minmax(90px,1fr)_minmax(72px,150px)_30px] items-center gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <div className="h-3 w-3 rounded-sm shrink-0" style={{ background: seg.color }} />
                <span className="truncate text-[12px] font-bold text-gray-600">{seg.label}</span>
              </div>
              <div className="h-[clamp(0.4rem,0.75vh,0.55rem)] rounded-full bg-gray-100">
                <div className="h-full rounded-full" style={{ width: `${seg.pct}%`, background: seg.color }} />
              </div>
              <span className="text-right text-[12px] font-black text-gray-700">{seg.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SignalChart({ data, mode, className = '' }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const W = 100, H = 80, PLOT_PAD = 4;
  const xForIndex = (i) => {
    if (data.length <= 1) return W / 2;
    return (i / (data.length - 1)) * (W - (PLOT_PAD * 2)) + PLOT_PAD;
  };
  const pts = data.map((d, i) => ({
    x: xForIndex(i),
    y: H - 10 - ((d.count / max) * (H - 20)),
  }));

  const pathD = pts.reduce((acc, pt, i) => {
    if (i === 0) return `M${pt.x},${pt.y}`;
    const prev = pts[i - 1];
    const cx = (prev.x + pt.x) / 2;
    return `${acc} C${cx},${prev.y} ${cx},${pt.y} ${pt.x},${pt.y}`;
  }, '');

  const areaD = pathD + ` L${pts[pts.length - 1].x},${H} L${pts[0].x},${H} Z`;

  return (
    <div className={`analytics-card analytics-card-signal bg-white rounded-xl p-4 sm:p-5 fade-in min-w-0 ${className}`} style={{ animationDelay: '0.4s', boxShadow: '0 1px 12px rgba(209,18,67,0.06)', border: '1px solid rgba(209,18,67,0.08)' }}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Activity size={16} style={{ color: CRIMSON }} />
          <span className="text-sm font-bold text-gray-700">Signal Velocity</span>
        </div>
        <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">
          {mode === 'today' ? 'Today' : 'Dataset by date'}
        </span>
      </div>

      <div className="relative">
        <div className="relative h-20">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
          >
          <defs>
            <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CRIMSON} stopOpacity="0.18" />
              <stop offset="100%" stopColor={CRIMSON} stopOpacity="0.01" />
            </linearGradient>
          </defs>
          <path d={areaD} fill="url(#chartGrad)" />
          <path d={pathD} fill="none" stroke={CRIMSON} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {pts.map((pt, i) => (
            <span
              key={i}
              className="absolute h-2 w-2 rounded-full border-2 border-white"
              style={{
                left: `${pt.x}%`,
                top: `${(pt.y / H) * 100}%`,
                background: CRIMSON,
                transform: 'translate(-50%, -50%)',
              }}
            />
          ))}
        </div>

        <div className="relative mt-1 h-8">
          {data.map((d, i) => (
            <div
              key={i}
              className="absolute flex w-12 -translate-x-1/2 flex-col items-center"
              style={{ left: `${pts[i]?.x ?? 50}%` }}
            >
              <span className="text-[9px] font-bold text-gray-400 uppercase">{d.day}</span>
              <span className="text-[10px] font-black text-gray-600">{d.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SourceCard({ label, status, lastFetch, count }) {
  const isOk = status === 'ok';
  return (
    <div className="flex items-center gap-3 p-3.5 rounded-xl hover:bg-gray-50/80 transition-all duration-200 group/source cursor-default"
      style={{ border: '1px solid transparent' }}
      onMouseOver={e => e.currentTarget.style.border = '1px solid rgba(209,18,67,0.08)'}
      onMouseOut={e => e.currentTarget.style.border = '1px solid transparent'}
    >
      {/* Globe icon */}
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: isOk ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isOk ? '#10b981' : '#f59e0b'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-bold text-gray-700 truncate">{label}</div>
        <div className="text-[10px] text-gray-400 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: isOk ? '#10b981' : '#f59e0b', boxShadow: `0 0 4px ${isOk ? '#10b981' : '#f59e0b'}` }} />
          {lastFetch}
        </div>
      </div>
      <div className="text-[11px] font-black text-gray-600 shrink-0 bg-gray-50 px-2 py-1 rounded-md group-hover/source:bg-white transition-all">{count}</div>
    </div>
  );
}

function getArticleTime(item) {
  const time = new Date(item?.fetchedAt || item?.publishedAt || item?.createdAt || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatDashboardDateKey(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DASHBOARD_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatDashboardWeekday(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: DASHBOARD_TIMEZONE,
    weekday: 'short',
  }).format(date).toUpperCase();
}

function getArticleDay(item) {
  if (item?.effectiveDay) return String(item.effectiveDay).slice(0, 10);
  const time = getArticleTime(item);
  return time ? formatDashboardDateKey(new Date(time)) : '';
}

function getInsertedTime(item) {
  const time = new Date(item?.fetchedAt || item?.createdAt || 0).getTime();
  return Number.isFinite(time) && time > 0 ? time : 0;
}

function getInsertedDay(item) {
  const time = getInsertedTime(item);
  return time ? formatDashboardDateKey(new Date(time)) : '';
}

function dateFromKey(key) {
  const [year, month, day] = String(key || '').split('-').map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function keyFromUtcDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildSignalData(items) {
  const counts = items.reduce((acc, item) => {
    const key = getArticleDay(item);
    if (key) acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const latestKey = Object.keys(counts).sort().at(-1) || formatDashboardDateKey(new Date());
  const end = dateFromKey(latestKey);

  return Array.from({ length: 7 }).map((_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (6 - index));
    const key = keyFromUtcDate(date);
    return {
      date: key,
      day: formatDashboardWeekday(date),
      count: counts[key] || 0,
    };
  });
}

function formatLastFetch(items) {
  const latest = Math.max(0, ...items.map(getArticleTime));
  return latest ? formatDistanceToNow(new Date(latest), { addSuffix: true }) : 'No data';
}

function uniqueLabels(items, key, fallback) {
  const labels = [...new Set(items.map((item) => item?.[key]).filter(Boolean))].slice(0, 3);
  return labels.length ? labels.join(' | ') : fallback;
}

function formatCompactDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-SG', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function InsightItem({ item, color }) {
  const appearance = getDashboardAppearance();
  const score = Math.round(Number(item.relevanceScore || 0));
  const scoreBand = scoreBandForValue(score, appearance);
  const when = item.fetchedAt || item.publishedAt
    ? formatDistanceToNow(new Date(item.fetchedAt || item.publishedAt), { addSuffix: true })
    : '';
  const exactTime = formatCompactDateTime(item.fetchedAt || item.publishedAt);
  const source = item.source || 'Unknown source';
  const country = item.country || item.market || 'Not specified';

  return (
    <article className="analytics-insight-item min-w-0 rounded-lg border border-gray-100 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span
              className="inline-flex rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wider"
              style={{ color, background: `${color}12`, border: `1px solid ${color}24` }}
            >
              {item.category || item.type || 'Signal'}
            </span>
            {item.subcategory && (
              <span className="inline-flex min-w-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <Tag size={11} className="shrink-0" />
                <span className="truncate">{item.subcategory}</span>
              </span>
            )}
          </div>
          <p className="text-[12px] font-black leading-snug text-gray-900 line-clamp-2">
            {item.title}
          </p>
        </div>
        {score > 0 && (
          <span
            className="shrink-0 rounded-md px-2 py-1 text-[10px] font-black"
            style={{ color: scoreBand.text, background: scoreBand.bg, border: `1px solid ${scoreBand.border}` }}
            title="Relevance score"
          >
            {score}
          </span>
        )}
      </div>

      <p className="mb-4 text-[12px] leading-relaxed text-gray-500 line-clamp-3">
        {articleDescription(item) || 'No summary available.'}
      </p>

      <div className="grid grid-cols-2 gap-2 border-t border-gray-100 pt-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">
        <span className="flex min-w-0 items-center gap-1.5 rounded-md bg-gray-50 px-2 py-1 ring-1 ring-gray-100">
          <MapPin size={11} className="shrink-0 text-gray-400" />
          <span className="truncate">{country}</span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5 rounded-md bg-gray-50 px-2 py-1 ring-1 ring-gray-100" title={exactTime}>
          <Clock3 size={11} className="shrink-0 text-gray-400" />
          <span className="truncate">{when || exactTime}</span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5 rounded-md bg-gray-50 px-2 py-1 ring-1 ring-gray-100">
          <Globe size={11} className="shrink-0 text-gray-400" />
          <span className="truncate">{source}</span>
        </span>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-1 transition-all hover:bg-brand-pink/50"
          style={{ color }}
        >
          Source <ExternalLink size={11} />
        </a>
      </div>
    </article>
  );
}

function InsightsCard({ topArticles }) {
  return (
    <div
      className="analytics-card analytics-card-insights relative overflow-hidden rounded-lg border border-gray-100 bg-white p-4 fade-in sm:p-5"
      style={{
        boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 0 0 1px rgba(15,23,42,0.04)',
        animationDelay: '0.25s',
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-brand-crimson" />
          <span className="text-sm font-bold text-gray-800">Executive Briefing & Strategic Insights</span>
        </div>
        <span className="rounded-md bg-brand-crimson/5 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-brand-crimson ring-1 ring-brand-crimson/10">
          From current data
        </span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {topArticles.length ? (
          topArticles.map((item, index) => (
            <InsightItem
              key={item._id || item.urlHash || item.url || index}
              item={item}
              color={index === 0 ? '#10b981' : index === 1 ? CRIMSON : '#8b5cf6'}
            />
          ))
        ) : (
          <div className="xl:col-span-3 p-4 rounded-lg bg-gray-50 border border-gray-100">
            <p className="text-[12px] text-gray-500 leading-relaxed">
              No current signals available for the selected filters.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function buildCategoryMomentum(items) {
  const buckets = items.reduce((acc, item) => {
    const key = item.category || item.subcategory || 'General';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(buckets)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function sortBySignal(items) {
  return [...items].sort((a, b) => {
    const scoreDiff = Number(b.relevanceScore || 0) - Number(a.relevanceScore || 0);
    if (scoreDiff) return scoreDiff;
    return getArticleTime(b) - getArticleTime(a);
  });
}

function buildMixedSignalFeed(items, perTypeLimit = 5) {
  const ranked = sortBySignal(items);
  const typeOrder = ['news', 'govt', 'competitor', 'evergreen'];

  return typeOrder.flatMap((type) => (
    ranked
      .filter((item) => item.type === type)
      .slice(0, perTypeLimit)
  ));
}

function shuffleSignals(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function sortByLatest(items) {
  return [...items].sort((a, b) => getArticleTime(b) - getArticleTime(a));
}

function UpdateRow({ item }) {
  const accent = TYPE_ACCENTS[item.type] || CRIMSON;
  const when = item.fetchedAt || item.publishedAt
    ? formatDistanceToNow(new Date(item.fetchedAt || item.publishedAt), { addSuffix: true })
    : 'No date';
  const score = Math.round(Number(item.relevanceScore || 0));
  const market = item.country || item.market || 'Market n/a';
  const category = item.category || 'General';
  const subcategory = item.subcategory || 'Unclassified';
  const description = articleDescription(item) || 'No description available.';

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="analytics-update-row group block rounded-lg border border-gray-100 bg-white p-3 shadow-sm transition-all hover:border-brand-crimson/20 hover:shadow-md"
    >
      <div className="mb-2 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <span
            className="rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider"
            style={{ color: accent, background: `${accent}10` }}
          >
            {TYPE_NAMES[item.type] || 'Signal'}
          </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{when}</span>
          </div>
          <h4 className="text-[13px] font-black leading-snug text-gray-900 line-clamp-2 group-hover:text-brand-crimson">
            {item.title}
          </h4>
        </div>
        <ExternalLink size={13} className="mt-1 shrink-0 text-gray-300 transition-colors group-hover:text-brand-crimson" />
      </div>

      <p className="mb-2 text-[11px] leading-relaxed text-gray-500 line-clamp-2">
        {description}
      </p>

      <div className="grid grid-cols-2 gap-1.5 text-[9px] font-black uppercase tracking-wider text-gray-500">
        <span className="analytics-update-meta-pill truncate rounded-md bg-gray-50 px-2 py-1.5 ring-1 ring-gray-100">Market: {String(market).toUpperCase()}</span>
        <span className="analytics-update-meta-pill truncate rounded-md bg-gray-50 px-2 py-1.5 ring-1 ring-gray-100">Score: {score || '-'}</span>
        <span className="analytics-update-meta-pill truncate rounded-md bg-gray-50 px-2 py-1.5 ring-1 ring-gray-100">Category: {String(category).toUpperCase()}</span>
        <span className="analytics-update-meta-pill truncate rounded-md bg-gray-50 px-2 py-1.5 ring-1 ring-gray-100">Sub: {String(subcategory).toUpperCase()}</span>
      </div>
    </a>
  );
}

function TrendingUpdatesCard({ items, className = '' }) {
  const visibleItems = useMemo(() => sortByLatest(items).slice(0, 20), [items]);
  const marqueeItems = visibleItems.length > 3 ? [...visibleItems, ...visibleItems] : visibleItems;
  const scrollRef = useRef(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || visibleItems.length <= 3) return undefined;

    let animationFrame;
    let previousTime;

    const move = (time) => {
      if (previousTime === undefined) previousTime = time;

      const loopHeight = scroller.scrollHeight / 2;
      if (!pausedRef.current && loopHeight > 0) {
        const pixelsPerMillisecond = loopHeight / 60000;
        scroller.scrollTop += (time - previousTime) * pixelsPerMillisecond;

        if (scroller.scrollTop >= loopHeight) {
          scroller.scrollTop -= loopHeight;
        }
      }

      previousTime = time;
      animationFrame = window.requestAnimationFrame(move);
    };

    animationFrame = window.requestAnimationFrame(move);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [visibleItems]);

  return (
    <section className={`analytics-card analytics-card-updates relative overflow-hidden rounded-lg border border-gray-100 bg-white p-4 shadow-card sm:p-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="todays-buzz-icon flex h-8 w-8 items-center justify-center rounded-lg bg-brand-pink/60 text-brand-crimson">
            <Flame size={16} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-black text-gray-900">Today's Buzz</h3>
          </div>
        </div>
        <span className="todays-buzz-count rounded-md bg-brand-pink/70 px-2.5 py-1 text-[10px] font-black text-brand-crimson ring-1 ring-brand-crimson/10">
          {visibleItems.length}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="hide-scrollbar relative min-h-0 flex-1 overflow-y-auto rounded-lg bg-gray-50/40 p-2 ring-1 ring-gray-100"
        onMouseEnter={() => { pausedRef.current = true; }}
        onMouseLeave={() => { pausedRef.current = false; }}
      >
        {marqueeItems.length ? (
          <div className="space-y-2">
            {marqueeItems.map((item, index) => (
              <UpdateRow
                key={`${item._id || item.url || index}-${index}`}
                item={item}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-[12px] font-semibold text-gray-400">
            No news or government updates available in the current dataset.
          </div>
        )}
      </div>
    </section>
  );
}

function CategoryMomentumCard({ categories, className = '' }) {
  const max = Math.max(...categories.map((item) => item.count), 1);

  return (
    <section className={`analytics-card analytics-card-momentum flex flex-col rounded-lg border border-gray-100 bg-white px-3 py-3 shadow-card sm:px-4 sm:py-4 lg:py-[clamp(0.65rem,1.4vh,1rem)] ${className}`}>
      <div className="mb-[clamp(0.35rem,1vh,0.75rem)] flex shrink-0 items-center gap-2">
        <Sparkles size={15} className="shrink-0 text-brand-crimson" />
        <h3 className="text-sm font-black text-gray-900">Category Momentum</h3>
      </div>
      <div className="max-h-[210px] min-h-0 flex-1 space-y-[clamp(0.28rem,0.65vh,0.45rem)] overflow-y-auto pr-2">
        {categories.length ? categories.map((item) => (
          <div key={item.label} className="flex min-h-[34px] shrink-0 flex-col justify-center">
            <div className="mb-[clamp(0.1rem,0.35vh,0.25rem)] flex items-center justify-between gap-2">
              <span className="truncate text-[12px] font-black leading-none text-gray-700">{item.label}</span>
              <span className="shrink-0 text-[10px] font-black leading-none text-gray-500">{item.count}</span>
            </div>
            <div className="h-[clamp(0.2rem,0.55vh,0.4rem)] shrink-0 rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-brand-crimson" style={{ width: `${Math.round((item.count / max) * 100)}%` }} />
            </div>
          </div>
        )) : (
          <p className="text-[12px] font-semibold text-gray-400">No category data available.</p>
        )}
      </div>
    </section>
  );
}

function buildMarketDistribution(items) {
  const rows = Object.values(items.reduce((acc, item) => {
    const market = item.country || item.market || 'Unspecified';
    if (!acc[market]) {
      acc[market] = { market, count: 0, latest: 0, types: new Set() };
    }
    acc[market].count += 1;
    acc[market].latest = Math.max(acc[market].latest, getArticleTime(item));
    if (item.type) acc[market].types.add(item.type);
    return acc;
  }, {}));

  return rows
    .map((row) => ({ ...row, types: [...row.types] }))
    .sort((a, b) => b.count - a.count || b.latest - a.latest);
}

function MarketDistributionCard({ markets, className = '' }) {
  const max = Math.max(...markets.map((market) => market.count), 1);
  const total = markets.reduce((sum, market) => sum + market.count, 0);

  return (
    <section className={`analytics-card analytics-card-market flex flex-col rounded-lg border border-gray-100 bg-white p-3 shadow-card sm:p-4 ${className}`}>
      <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Globe size={16} className="text-brand-crimson" />
          <h3 className="truncate text-sm font-black text-gray-900">Market Distribution</h3>
        </div>
        <span className="shrink-0 rounded-md bg-gray-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-gray-500 ring-1 ring-gray-100">
          {total} signals
        </span>
      </div>
      <div className="max-h-[210px] min-h-0 flex-1 space-y-[clamp(0.35rem,0.8vh,0.5rem)] overflow-y-auto pr-2">
        {markets.length ? markets.map((market, index) => {
          const pct = Math.round((market.count / max) * 100);
          const color = index === 0 ? CRIMSON : index === 1 ? '#10b981' : index === 2 ? '#3b82f6' : '#f59e0b';
          return (
            <div key={market.market} className="flex min-h-[58px] shrink-0 flex-col justify-center rounded-lg border border-gray-100 px-3 py-[clamp(0.28rem,0.65vh,0.5rem)]">
              <div className="mb-[clamp(0.18rem,0.45vh,0.35rem)] grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <div className="flex min-w-0 items-baseline gap-2">
                  <div className="truncate text-[12px] font-black text-gray-700">{market.market}</div>
                  <div className="truncate text-[9px] font-bold uppercase tracking-wider text-gray-400">
                    {market.types.length ? market.types.join(' / ') : 'Unclassified'}
                  </div>
                </div>
                <span className="rounded-md bg-gray-50 px-2 py-1 text-[10px] font-black text-gray-500 ring-1 ring-gray-100">{market.count}</span>
              </div>
              <div className="h-[clamp(0.3rem,0.72vh,0.48rem)] shrink-0 rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: color,
                  }}
                />
              </div>
            </div>
          );
        }) : (
          <p className="text-[12px] font-semibold text-gray-400">No market data available.</p>
        )}
      </div>
    </section>
  );
}

function TodayDashboard({ total, donutData, trendingUpdates, categoryMomentum, marketDistribution }) {
  return (
    <div className="analytics-today-grid grid min-h-0 grid-cols-1 gap-4 overflow-y-auto pb-2 xl:h-full xl:grid-cols-2 xl:overflow-hidden xl:pb-2">
      <div className="grid min-h-0 grid-cols-1 gap-[clamp(0.45rem,1vh,0.75rem)] xl:h-full xl:grid-rows-[minmax(140px,0.78fr)_minmax(150px,1fr)_minmax(150px,1fr)]">
        <DonutChart data={donutData} className="min-h-[220px] xl:h-full xl:min-h-0" />
        <MarketDistributionCard markets={marketDistribution} className="min-h-[210px] xl:h-full xl:min-h-0 xl:flex xl:flex-col" />
        <CategoryMomentumCard categories={categoryMomentum} className="min-h-[210px] xl:h-full xl:min-h-0 xl:flex xl:flex-col" />
      </div>

      <TrendingUpdatesCard items={trendingUpdates} className="min-h-[480px] xl:h-full xl:min-h-0 xl:flex xl:flex-col" />

      {!total && (
        <section className="rounded-lg border border-dashed border-gray-200 bg-white p-5 text-[12px] font-semibold text-gray-400 shadow-card xl:col-span-2">
          No live signals found for today. Once the fetch job indexes fresh articles, these charts will update automatically.
        </section>
      )}
    </div>
  );
}

function AllDataDashboard({ total, counts, categoryCount, donutData, signalData, topArticles, dynamicSources }) {
  return (
    <div className="analytics-full-grid space-y-5 pb-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <StatCard icon={TrendingUp} label="Total Signals" value={total} sub={`${categoryCount} categories`} color={CRIMSON} delay={0.05} />
        <StatCard icon={Landmark} label="Government Updates" value={counts.govt} sub="Policy and public-sector signals" color="#10b981" delay={0.1} />
        <StatCard icon={Newspaper} label="News Items" value={counts.news} sub="Market coverage indexed" color="#3b82f6" delay={0.15} />
        <StatCard icon={Building2} label="Competitor Intel" value={counts.competitor} sub="Competitive movement tracked" color="#f59e0b" delay={0.2} />
      </div>

      <InsightsCard topArticles={topArticles} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <DonutChart data={donutData} />
        <SignalChart data={signalData} mode="all" />
      </div>

      <div className="analytics-card analytics-card-sources bg-white rounded-xl p-4 sm:p-5 fade-in" style={{ animationDelay: '0.5s', boxShadow: '0 1px 12px rgba(209,18,67,0.06)', border: '1px solid rgba(209,18,67,0.08)' }}>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Globe size={16} style={{ color: CRIMSON }} />
          <span className="text-sm font-bold text-gray-700">Data Source Health</span>
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{
              background: total > 0 ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
              color: total > 0 ? '#059669' : '#b45309',
            }}>
            {total > 0 ? 'Data Loaded' : 'No Data'}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {dynamicSources.map((s, i) => <SourceCard key={i} {...s} />)}
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsSection({ data, velocityData = [], loading, isAdmin = false, viewMode = 'today', onViewModeChange }) {
  const allArticles = useMemo(
    () => Object.values(data || {}).flat().filter(Boolean),
    [data]
  );
  const todayKey = formatDashboardDateKey(new Date());
  const latestInsertedDayKey = useMemo(() => {
    const latest = Math.max(0, ...allArticles.map(getInsertedTime));
    return latest ? formatDashboardDateKey(new Date(latest)) : todayKey;
  }, [allArticles, todayKey]);

  useEffect(() => {
    if (!isAdmin && viewMode !== 'today') onViewModeChange?.('today');
  }, [isAdmin, onViewModeChange, viewMode]);

  const todayArticles = useMemo(
    () => allArticles.filter((item) => getInsertedDay(item) === todayKey),
    [allArticles, todayKey]
  );

  const todayBuzzArticles = useMemo(() => {
    if (todayArticles.length) return todayArticles;
    return allArticles.filter((item) => getInsertedDay(item) === latestInsertedDayKey);
  }, [allArticles, latestInsertedDayKey, todayArticles]);

  const visibleArticles = useMemo(
    () => viewMode === 'today'
      ? todayArticles
      : allArticles,
    [allArticles, todayArticles, viewMode]
  );

  const articlesByType = useMemo(() => ({
    news: visibleArticles.filter((item) => item.type === 'news'),
    govt: visibleArticles.filter((item) => item.type === 'govt'),
    competitor: visibleArticles.filter((item) => item.type === 'competitor'),
    evergreen: visibleArticles.filter((item) => item.type === 'evergreen'),
  }), [visibleArticles]);

  const counts = useMemo(() => ({
    news: articlesByType.news.length,
    govt: articlesByType.govt.length,
    competitor: articlesByType.competitor.length,
    evergreen: articlesByType.evergreen.length,
  }), [articlesByType]);

  const total = Object.values(counts).reduce((s, v) => s + v, 0);

  const topArticles = useMemo(
    () => [...visibleArticles]
      .sort((a, b) => {
        const dayDiff = getArticleDay(b).localeCompare(getArticleDay(a));
        if (dayDiff !== 0) return dayDiff;
        const scoreDiff = Number(b.relevanceScore || 0) - Number(a.relevanceScore || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return getArticleTime(b) - getArticleTime(a);
      })
      .slice(0, 3),
    [visibleArticles]
  );

  const trendingUpdates = useMemo(
    () => viewMode === 'today' ? todayBuzzArticles : visibleArticles,
    [todayBuzzArticles, viewMode, visibleArticles]
  );

  const categoryMomentum = useMemo(
    () => buildCategoryMomentum(visibleArticles),
    [visibleArticles]
  );

  const marketDistribution = useMemo(
    () => buildMarketDistribution(visibleArticles),
    [visibleArticles]
  );

  const categoryCount = useMemo(
    () => new Set(visibleArticles.map((item) => item.category).filter(Boolean)).size,
    [visibleArticles]
  );

  const donutData = [
    { label: 'Government', value: counts.govt, color: '#10b981' },
    { label: 'News', value: counts.news, color: CRIMSON },
    { label: 'Competitors', value: counts.competitor, color: '#f59e0b' },
    { label: 'Evergreen', value: counts.evergreen, color: '#8b5cf6' },
  ];

  const dynamicSources = [
    {
      label: `Government (${uniqueLabels(articlesByType.govt, 'source', 'No sources')})`,
      status: counts.govt > 0 ? 'ok' : 'warn',
      lastFetch: formatLastFetch(articlesByType.govt),
      count: `${counts.govt} articles`,
    },
    {
      label: `News (${uniqueLabels(articlesByType.news, 'source', 'No sources')})`,
      status: counts.news > 0 ? 'ok' : 'warn',
      lastFetch: formatLastFetch(articlesByType.news),
      count: `${counts.news} articles`,
    },
    {
      label: `Competitors (${uniqueLabels(articlesByType.competitor, 'source', 'No sources')})`,
      status: counts.competitor > 0 ? 'ok' : 'warn',
      lastFetch: formatLastFetch(articlesByType.competitor),
      count: `${counts.competitor} articles`,
    },
    {
      label: `Evergreen (${uniqueLabels(articlesByType.evergreen, 'source', 'No sources')})`,
      status: counts.evergreen > 0 ? 'ok' : 'warn',
      lastFetch: formatLastFetch(articlesByType.evergreen),
      count: `${counts.evergreen} articles`,
    },
  ];

  const signalData = useMemo(() => {
    if (viewMode === 'all' && velocityData.length) return velocityData;
    return buildSignalData(visibleArticles);
  }, [velocityData, viewMode, visibleArticles]);

  if (loading) {
    return (
      <div className="space-y-5">
        {/* Shimmer items */}
        <div className="flex justify-between items-center">
          <div className="skeleton h-8 w-48 rounded" />
          <div className="skeleton h-6 w-20 rounded" />
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-5 border border-gray-100 space-y-3 shadow-sm">
              <div className="flex justify-between items-center">
                <div className="skeleton h-7 w-7 rounded" />
                <div className="skeleton h-3 w-16 rounded" />
              </div>
              <div className="skeleton h-8 w-24 rounded" />
              <div className="skeleton h-1.5 w-full rounded" />
            </div>
          ))}
        </div>
        
        <div className="bg-white rounded-xl p-5 border border-gray-100 space-y-3 shadow-sm">
          <div className="skeleton h-5 w-48 rounded" />
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="skeleton h-20 w-full rounded" />
            <div className="skeleton h-20 w-full rounded" />
            <div className="skeleton h-20 w-full rounded" />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl p-5 border border-gray-100 space-y-4 shadow-sm">
            <div className="skeleton h-4 w-32 rounded" />
            <div className="flex items-center gap-5">
              <div className="skeleton h-24 w-24 rounded-full" />
              <div className="space-y-2 flex-1">
                <div className="skeleton h-3 w-full rounded" />
                <div className="skeleton h-3 w-full rounded" />
                <div className="skeleton h-3 w-3/4 rounded" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-100 space-y-4 shadow-sm">
            <div className="skeleton h-4 w-32 rounded" />
            <div className="skeleton h-20 w-full rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col fade-in">
      <div className="min-h-0 flex-1">
      {viewMode === 'today' ? (
        <TodayDashboard
          total={total}
          donutData={donutData}
          trendingUpdates={trendingUpdates}
          categoryMomentum={categoryMomentum}
          marketDistribution={marketDistribution}
        />
      ) : (
        <AllDataDashboard
          total={total}
          counts={counts}
          categoryCount={categoryCount}
          donutData={donutData}
          signalData={signalData}
          topArticles={topArticles}
          dynamicSources={dynamicSources}
        />
      )}
      </div>
    </div>
  );
}
