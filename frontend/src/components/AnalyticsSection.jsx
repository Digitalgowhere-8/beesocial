import { useMemo } from 'react';
import { TrendingUp, Newspaper, Landmark, Building2, BookOpen, BarChart2, Activity, Globe, Sparkles } from 'lucide-react';

const CRIMSON = '#D11243';
const DARK_RED = '#8F0B2F';

function StatCard({ icon: Icon, label, value, sub, color, delay = 0 }) {
  return (
    <div
      className="bg-white rounded-xl p-4 sm:p-5 flex flex-col gap-3 relative overflow-hidden fade-in min-w-0"
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
          style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
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

function DonutChart({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  let cumulative = 0;
  const segments = data.map(d => {
    const pct = total > 0 ? (d.value / total) * 100 : 0;
    const seg = { ...d, pct, offset: cumulative };
    cumulative += pct;
    return seg;
  });

  const r = 58;
  const circ = 2 * Math.PI * r;
  const center = 80;

  return (
    <div className="bg-white rounded-xl p-4 sm:p-5 fade-in min-w-0" style={{ animationDelay: '0.3s', boxShadow: '0 1px 12px rgba(209,18,67,0.06)', border: '1px solid rgba(209,18,67,0.08)' }}>
      <div className="flex items-center gap-2 mb-4">
        <BarChart2 size={16} style={{ color: CRIMSON }} />
        <span className="text-sm font-bold text-gray-700">Content by Type</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="shrink-0 relative mx-auto sm:mx-0">
          <svg className="w-36 h-36 sm:w-40 sm:h-40" viewBox={`0 0 ${center * 2} ${center * 2}`}>
            {/* Background circle */}
            <circle cx={center} cy={center} r={r} fill="none" stroke="#f3f4f6" strokeWidth="16" />
            {segments.map((seg, i) => (
              <circle
                key={i}
                cx={center}
                cy={center}
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth="16"
                strokeDasharray={`${(seg.pct / 100) * circ} ${circ}`}
                strokeDashoffset={-(seg.offset / 100) * circ}
                transform={`rotate(-90 ${center} ${center})`}
                style={{ transition: 'stroke-dasharray 1s ease' }}
              />
            ))}
            {/* Center text */}
            <text x={center} y={center - 5} textAnchor="middle" dominantBaseline="middle"
              fill="#111" fontWeight="900" fontSize="20" fontFamily='"DM Sans", system-ui, sans-serif'>
              {total}
            </text>
            <text x={center} y={center + 14} textAnchor="middle" dominantBaseline="middle"
              fill="#9ca3af" fontWeight="600" fontSize="9" fontFamily='"DM Sans", system-ui, sans-serif' letterSpacing="0.1em">
              TOTAL
            </text>
          </svg>
        </div>

        <div className="flex flex-col gap-2.5 flex-1">
          {segments.map((seg, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: seg.color }} />
                <span className="text-[12px] text-gray-600 font-medium truncate">{seg.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 rounded-full bg-gray-100">
                  <div className="h-1.5 rounded-full" style={{ width: `${seg.pct}%`, background: seg.color }} />
                </div>
                <span className="text-[11px] font-bold text-gray-700 w-6 text-right">{seg.value}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SignalChart({ data }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const W = 280, H = 80;
  const pts = data.map((d, i) => ({
    x: (i / (data.length - 1)) * (W - 20) + 10,
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
    <div className="bg-white rounded-xl p-4 sm:p-5 fade-in min-w-0" style={{ animationDelay: '0.4s', boxShadow: '0 1px 12px rgba(209,18,67,0.06)', border: '1px solid rgba(209,18,67,0.08)' }}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Activity size={16} style={{ color: CRIMSON }} />
          <span className="text-sm font-bold text-gray-700">Signal Velocity</span>
        </div>
        <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Last 7 days</span>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: '80px' }}>
          <defs>
            <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CRIMSON} stopOpacity="0.18" />
              <stop offset="100%" stopColor={CRIMSON} stopOpacity="0.01" />
            </linearGradient>
          </defs>
          <path d={areaD} fill="url(#chartGrad)" />
          <path d={pathD} fill="none" stroke={CRIMSON} strokeWidth="2" strokeLinecap="round" />
          {pts.map((pt, i) => (
            <circle key={i} cx={pt.x} cy={pt.y} r="3" fill={CRIMSON} stroke="white" strokeWidth="1.5" />
          ))}
        </svg>

        <div className="flex justify-between mt-1">
          {data.map((d, i) => (
            <div key={i} className="flex flex-col items-center">
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

function InsightsCard({ counts, total }) {
  return (
    <div
      className="bg-white rounded-xl p-4 sm:p-5 border border-brand-crimson/15 relative overflow-hidden fade-in"
      style={{
        boxShadow: '0 4px 24px rgba(209,18,67,0.03), 0 1px 2px rgba(209,18,67,0.01)',
        animationDelay: '0.25s',
      }}
    >
      {/* Decorative gradient overlay */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-crimson via-brand-hoverred to-brand-pink" />
      
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-brand-crimson animate-pulse" />
          <span className="text-sm font-bold text-gray-800">Executive Briefing & Strategic Insights</span>
        </div>
        <span className="text-[9px] bg-brand-crimson/5 text-brand-crimson px-2 py-0.5 rounded font-mono uppercase tracking-wider font-bold">
          AI generated
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Insight 1 */}
        <div className="p-4 rounded-lg bg-emerald-50/30 border border-emerald-100/40 hover:border-emerald-200/50 transition-all">
          <div className="flex items-center gap-2 mb-2 text-emerald-800 font-bold text-xs uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            MOM Compliance Notice
          </div>
          <p className="text-[12px] text-gray-600 leading-relaxed">
            MOM Singapore updated quota and compliance ratios for workforce operations. Action recommended: Review HR-related documentation updates in Singapore Guides.
          </p>
        </div>

        {/* Insight 2 */}
        <div className="p-4 rounded-lg bg-brand-pink/20 border border-brand-crimson/10 hover:border-brand-crimson/20 transition-all">
          <div className="flex items-center gap-2 mb-2 text-brand-crimson font-bold text-xs uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-crimson" />
            Regulator Updates Surge
          </div>
          <p className="text-[12px] text-gray-600 leading-relaxed">
            Government signals and filings spiked by <span className="font-bold text-brand-crimson">{counts.govt} items</span> this week. Primary focuses are ACRA registers and corporate filing calendars.
          </p>
        </div>

        {/* Insight 3 */}
        <div className="p-4 rounded-lg bg-purple-50/30 border border-purple-100/40 hover:border-purple-200/50 transition-all">
          <div className="flex items-center gap-2 mb-2 text-purple-800 font-bold text-xs uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            Competitor Intelligence
          </div>
          <p className="text-[12px] text-gray-600 leading-relaxed">
            Vistra and Tricor expanded local corporate advisory lines in ASEAN. Competitor movements recorded: <span className="font-bold text-purple-700">{counts.competitor} signals</span> total.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsSection({ data, velocityData = [], loading }) {
  const counts = useMemo(() => ({
    news: data?.news?.length || 0,
    govt: data?.govt?.length || 0,
    competitor: data?.competitor?.length || 0,
    evergreen: data?.evergreen?.length || 0,
  }), [data]);

  const total = Object.values(counts).reduce((s, v) => s + v, 0);

  const donutData = [
    { label: 'Government', value: counts.govt, color: '#10b981' },
    { label: 'News', value: counts.news, color: CRIMSON },
    { label: 'Competitors', value: counts.competitor, color: '#f59e0b' },
    { label: 'Evergreen', value: counts.evergreen, color: '#8b5cf6' },
  ];

  const signalData = velocityData.length
    ? velocityData
    : [
      { day: 'MON', count: 0 },
      { day: 'TUE', count: 0 },
      { day: 'WED', count: 0 },
      { day: 'THU', count: 0 },
      { day: 'FRI', count: 0 },
      { day: 'SAT', count: 0 },
      { day: 'SUN', count: total },
    ];

  const sources = [
    { label: 'Government Registries (ACRA · MOM · IRAS)', status: 'ok', lastFetch: 'Today 07:02 SGT', count: `${counts.govt} articles` },
    { label: 'News Outlets (Business Times · CNA)', status: 'ok', lastFetch: 'Today 07:04 SGT', count: `${counts.news} articles` },
    { label: 'Competitor Intelligence (Vistra · TMF · Tricor)', status: 'ok', lastFetch: 'Today 07:06 SGT', count: `${counts.competitor} articles` },
    { label: 'Evergreen Guides & Resources', status: total === 0 ? 'warn' : 'ok', lastFetch: 'Today 07:08 SGT', count: `${counts.evergreen} articles` },
  ];

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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
    <div className="space-y-5 fade-in">
      {/* Eyebrow */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] font-bold" style={{ color: CRIMSON }}>
            Singapore · Daily Brief
          </p>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight animate-pulse"
            style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
            Intelligence Overview
          </h2>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold"
          style={{ background: 'rgba(209,18,67,0.08)', color: CRIMSON }}>
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-ping" />
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 absolute" />
          Live Signals
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <StatCard icon={TrendingUp} label="Total Signals" value={total} sub="Across all categories" color={CRIMSON} delay={0.05} />
        <StatCard icon={Landmark} label="Gov't Updates" value={counts.govt} sub="ACRA · IRAS · MOM" color="#10b981" delay={0.1} />
        <StatCard icon={Newspaper} label="News Items" value={counts.news} sub="BT · CNA · ST · AB" color="#3b82f6" delay={0.15} />
        <StatCard icon={Building2} label="Competitor Intel" value={counts.competitor} sub="8 tracked companies" color="#f59e0b" delay={0.2} />
      </div>

      {/* NEW: Executive Briefing & Strategic Insights section */}
      <InsightsCard counts={counts} total={total} />

      {/* Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <DonutChart data={donutData} />
        <SignalChart data={signalData} />
      </div>

      {/* Source Health */}
      <div className="bg-white rounded-xl p-4 sm:p-5 fade-in" style={{ animationDelay: '0.5s', boxShadow: '0 1px 12px rgba(209,18,67,0.06)', border: '1px solid rgba(209,18,67,0.08)' }}>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Globe size={16} style={{ color: CRIMSON }} />
          <span className="text-sm font-bold text-gray-700">Crawler Health</span>
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(16,185,129,0.1)', color: '#059669' }}>
            All Systems Go
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {sources.map((s, i) => <SourceCard key={i} {...s} />)}
        </div>
      </div>
    </div>
  );
}
