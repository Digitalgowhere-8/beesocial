import { ExternalLink, Calendar, Tag, Globe } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const TYPE_STYLES = {
  news:       { label: 'News',       cls: 'tag-news',       accent: '#3b82f6',  accentBg: 'bg-blue-500'    },
  govt:       { label: 'Government', cls: 'tag-govt',       accent: '#10b981',  accentBg: 'bg-emerald-500' },
  competitor: { label: 'Competitor', cls: 'tag-competitor', accent: '#f59e0b',  accentBg: 'bg-orange-500'  },
  evergreen:  { label: 'Evergreen',  cls: 'tag-evergreen',  accent: '#8b5cf6',  accentBg: 'bg-violet-500'  },
};

function GlobeIcon({ color = '#9ca3af', size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

export default function ArticleCard({
  item,
  compact    = false,
  selectable = false,
  selected   = false,
  onSelect,
  adminActions = null,
}) {
  const t    = TYPE_STYLES[item.type] || TYPE_STYLES.news;
  const score = Math.round(Number(item.relevanceScore || 0));
  const when = item.fetchedAt
    ? formatDistanceToNow(new Date(item.fetchedAt), { addSuffix: true })
    : '';

  return (
    <article
      className={[
        'group relative flex flex-col transition-all duration-300 fade-in',
        'rounded-xl bg-white overflow-hidden isolate',
        compact ? 'p-3.5' : 'p-5',
        selected ? 'ring-2 ring-brand-crimson/40' : '',
      ].join(' ')}
      style={{
        boxShadow: '0 1px 8px rgba(0,0,0,0.04), 0 0 0 1px rgba(209,18,67,0.06)',
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      onMouseOver={e => {
        if (window.matchMedia('(hover: hover)').matches) {
          e.currentTarget.style.transform = 'translateY(-3px)';
        }
        e.currentTarget.style.boxShadow = `0 8px 24px rgba(0,0,0,0.08), 0 0 0 1px ${t.accent}30`;
      }}
      onMouseOut={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 1px 8px rgba(0,0,0,0.04), 0 0 0 1px rgba(209,18,67,0.06)';
      }}
    >
      {/* Left colour accent */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3.5px] rounded-l-xl opacity-50 group-hover:opacity-100 transition-all duration-300"
        style={{ background: `linear-gradient(180deg, ${t.accent}, ${t.accent}66)` }}
      />

      {/* Tags row */}
      <div className="flex items-start justify-between gap-2 mb-3 pl-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className={`tag ${t.cls} shrink-0`}>{t.label}</span>
          {item.category && item.category !== 'General' && (
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium truncate flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-gray-300" />
              {item.category}
            </span>
          )}
        </div>
        {score > 0 && (
          <span
            className="shrink-0 rounded-md px-2 py-1 text-[10px] font-black tracking-wide"
            style={{ color: t.accent, background: `${t.accent}12`, border: `1px solid ${t.accent}22` }}
            title="Relevance score"
          >
            {score}
          </span>
        )}
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelect?.(item._id)}
            className="rounded border-gray-200 text-brand-crimson focus:ring-brand-crimson/30 mt-0.5 shrink-0"
          />
        )}
      </div>

      {/* Title */}
      <h3 className="text-[14px] sm:text-[15px] leading-snug text-gray-800 group-hover:text-brand-crimson transition-colors duration-200 mb-2.5 pl-3 font-bold">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline decoration-brand-crimson/30 underline-offset-2 line-clamp-3"
        >
          {item.title}
        </a>
      </h3>

      {/* Summary */}
      {(item.summary || item.aiSummary) && (
        <p className="text-[12px] sm:text-[13px] text-gray-500 leading-relaxed mb-4 pl-3 line-clamp-2 flex-1">
          {item.summary || item.aiSummary}
        </p>
      )}

      {/* Footer meta */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pl-3 mt-auto pt-3 border-t border-gray-100">
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 text-[11px] text-gray-400 min-w-0">
          {/* Source with Globe icon */}
          <span className="flex items-center gap-1.5 font-semibold text-gray-600 truncate max-w-[120px] sm:max-w-none">
            <GlobeIcon color={t.accent} size={12} />
            {item.source || 'Unknown Source'}
          </span>
          {when && (
            <span className="flex items-center gap-1 shrink-0 text-gray-400">
              <Calendar size={10} />{when}
            </span>
          )}
          {item.subcategory && (
            <span className="hidden lg:flex items-center gap-1 shrink-0 text-gray-400">
              <Tag size={10} />{item.subcategory}
            </span>
          )}
        </div>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="w-6 h-6 rounded-md flex items-center justify-center text-gray-300 hover:text-brand-crimson hover:bg-brand-pink/30 transition-all shrink-0 self-end sm:self-auto"
          title="Open source"
        >
          <ExternalLink size={13} />
        </a>
      </div>

      {/* Admin actions */}
      {adminActions && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-2 pl-3">
          {adminActions}
        </div>
      )}
    </article>
  );
}
