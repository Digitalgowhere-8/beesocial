import { Bookmark, Check, ExternalLink, Clock3, Folder, Globe, MapPin, Tag } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const TYPE_STYLES = {
  news:       { label: 'News Articles', accent: '#3b82f6' },
  govt:       { label: 'Government Updates', accent: '#10b981' },
  competitor: { label: 'Competitor Intel', accent: '#f59e0b' },
  evergreen:  { label: 'Evergreen Guides',  accent: '#8b5cf6' },
};

function formatDateTime(value) {
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

function sourceHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_err) {
    return '';
  }
}

function MetaPill({ icon: Icon, children, title, relaxed = false }) {
  if (!children) return null;
  return (
    <span
      className={[
        'inline-flex min-w-0 items-center gap-1.5 rounded-md bg-gray-50 px-2 py-1 text-[10px] font-bold text-gray-500 ring-1 ring-gray-100',
        relaxed ? 'normal-case tracking-normal' : 'uppercase tracking-wider',
      ].join(' ')}
      title={title || String(children)}
    >
      <Icon size={11} className="shrink-0 text-gray-400" />
      <span className={relaxed ? 'whitespace-normal leading-snug' : 'truncate'}>{children}</span>
    </span>
  );
}

export default function ArticleCard({
  item,
  compact = false,
  selectable = false,
  selected = false,
  onSelect,
  onSaveToggle,
  saving = false,
  adminActions = null,
}) {
  const typeStyle = TYPE_STYLES[item.type] || TYPE_STYLES.news;
  const score = Math.round(Number(item.relevanceScore || 0));
  const effectiveDate = item.fetchedAt || item.publishedAt;
  const when = effectiveDate
    ? formatDistanceToNow(new Date(effectiveDate), { addSuffix: true })
    : '';
  const updatedAt = item.fetchedAt ? formatDateTime(item.fetchedAt) : '';
  const updatedLabel = when ? `Updated ${when}` : updatedAt ? `Updated ${updatedAt}` : '';
  const summary = item.summary || item.aiSummary;
  const source = item.source || sourceHost(item.url) || 'Unknown source';
  const country = item.country || item.market || 'Not specified';
  const region = item.region || '';
  const opportunityType = item.opportunityType ? String(item.opportunityType).replace(/_/g, ' ') : '';
  const host = sourceHost(item.url);

  return (
    <article
      data-analytics-section={`Article: ${item.type || 'signal'} - ${item.category || 'General'}`}
      className={[
        'group relative isolate flex flex-col overflow-hidden rounded-lg bg-white fade-in',
        'transition-all duration-200',
        compact ? 'p-4' : 'p-5',
        selected ? 'ring-2 ring-brand-crimson/40' : '',
      ].join(' ')}
      style={{
        boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 0 0 1px rgba(15,23,42,0.08)',
      }}
      onMouseOver={e => {
        if (window.matchMedia('(hover: hover)').matches) {
          e.currentTarget.style.transform = 'translateY(-2px)';
        }
        e.currentTarget.style.boxShadow = `0 12px 28px rgba(15,23,42,0.08), 0 0 0 1px ${typeStyle.accent}30`;
      }}
      onMouseOut={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(15,23,42,0.04), 0 0 0 1px rgba(15,23,42,0.07)';
      }}
    >
      <div className="absolute left-0 top-0 h-full w-1 opacity-90" style={{ background: typeStyle.accent }} />

      <div className="mb-3 flex items-start justify-between gap-3 pl-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wider"
            style={{ color: typeStyle.accent, background: `${typeStyle.accent}12`, border: `1px solid ${typeStyle.accent}24` }}
          >
            {typeStyle.label}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {score > 0 && (
            <span
              className="rounded-md px-2 py-1 text-[10px] font-black tracking-wide"
              style={{ color: typeStyle.accent, background: `${typeStyle.accent}12`, border: `1px solid ${typeStyle.accent}22` }}
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
              className="mt-0.5 rounded border-gray-200 text-brand-crimson focus:ring-brand-crimson/30"
            />
          )}
          {item.isSaved && !selectable && (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-100"
              title="Saved"
            >
              <Check size={11} /> Saved
            </span>
          )}
        </div>
      </div>

      <div className="mb-3 flex min-w-0 flex-wrap gap-1.5 pl-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">
        {item.category && item.category !== 'General' && (
          <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-gray-50 px-2 py-1 ring-1 ring-gray-100">
            <Folder size={11} className="shrink-0" />
            <span className="truncate">{item.category}</span>
          </span>
        )}
        {item.subcategory && (
          <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-gray-50 px-2 py-1 ring-1 ring-gray-100">
            <Tag size={11} className="shrink-0" />
            <span className="truncate">{item.subcategory}</span>
          </span>
        )}
      </div>

      <h3 className="mb-2.5 pl-3 text-[15px] font-black leading-snug text-gray-900 transition-colors duration-200 group-hover:text-brand-crimson">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="line-clamp-3 hover:underline decoration-brand-crimson/30 underline-offset-2"
          data-analytics-click={`Article title: ${item.title || 'Untitled'}`}
        >
          {item.title}
        </a>
      </h3>

      {summary && (
        <p className="mb-4 flex-1 pl-3 text-[13px] leading-relaxed text-gray-500 line-clamp-3">
          {summary}
        </p>
      )}

      <div className="mt-auto border-t border-gray-100 pl-3 pt-3">
        <div className="mb-2 grid grid-cols-2 gap-2">
          <MetaPill icon={MapPin} title="Country or region">{[region, country].filter(Boolean).join(', ')}</MetaPill>
          <MetaPill icon={Globe} title={`Source: ${source}`}>{source}</MetaPill>
        </div>
        {(item.sector || opportunityType) && (
          <div className="mb-2 grid grid-cols-2 gap-2">
            <MetaPill icon={Folder} title="Service focus">{item.sector}</MetaPill>
            <MetaPill icon={Tag} title="Opportunity type">{opportunityType}</MetaPill>
          </div>
        )}
        {item.relevanceReason && (
          <div className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-[11px] font-semibold leading-snug text-emerald-700 ring-1 ring-emerald-100">
            {item.relevanceReason}
          </div>
        )}
        <div className="mb-3">
          <MetaPill icon={Clock3} title={updatedAt ? `Updated ${updatedAt}` : updatedLabel} relaxed>
            {updatedLabel}
          </MetaPill>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-md bg-gray-50 px-2.5 py-2 ring-1 ring-gray-100 transition-colors group-hover:bg-white">
          <div className="min-w-0">
            <div className="text-[9px] font-black uppercase tracking-wider text-gray-400">Source domain</div>
            <div className="truncate text-[11px] font-bold text-gray-500">{host || item.url}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {onSaveToggle && (
              <button
                type="button"
                disabled={saving}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onSaveToggle(item);
                }}
                className={[
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-black uppercase tracking-wider transition-all',
                  item.isSaved
                    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                    : 'bg-white text-gray-500 ring-1 ring-gray-100 hover:bg-brand-pink/50 hover:text-brand-crimson',
                  saving ? 'cursor-wait opacity-70' : ''
                ].join(' ')}
                title={item.isSaved ? 'Remove from saved' : 'Save this article'}
              >
                {item.isSaved ? <Check size={12} /> : <Bookmark size={12} />}
                {saving ? 'Saving' : item.isSaved ? 'Saved' : 'Save'}
              </button>
            )}
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-black uppercase tracking-wider transition-all hover:bg-brand-pink/50"
              style={{ color: typeStyle.accent }}
              title="Open source article"
              data-analytics-click={`Source open: ${item.title || host || 'Article'}`}
              onClick={(event) => event.stopPropagation()}
            >
              Source <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </div>

      {adminActions && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pl-3 pt-3">
          {adminActions}
        </div>
      )}
    </article>
  );
}
