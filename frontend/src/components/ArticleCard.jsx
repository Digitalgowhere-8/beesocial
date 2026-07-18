import { memo } from 'react';
import { Bookmark, Check, Clock3, Folder, Globe, MapPin, Tag } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { sourceTrustTone } from '../utils/feedTheme';

const TYPE_STYLES = {
  news:       { label: 'News Articles' },
  govt:       { label: 'Government Updates' },
  competitor: { label: 'Competitor Intel' },
  evergreen:  { label: 'Evergreen Topics' },
};

function sourceHost(url) {
  const value = String(url || '').trim();
  if (!value) return '';

  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch (_err) {
    if (!/^[\w.-]+\.[a-z]{2,}/i.test(value)) return '';
    try {
      return new URL(`https://${value}`).hostname.replace(/^www\./, '');
    } catch (_nestedErr) {
      return '';
    }
  }
}

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

function MetaPill({ icon: Icon, children, title, relaxed = false }) {
  if (!children) return null;
  return (
    <span
      className={[
        'inline-flex min-w-0 items-center gap-1.5 rounded-xl bg-gray-50 px-2.5 py-1.5 text-[10px] font-bold text-gray-500 ring-1 ring-gray-100',
        relaxed ? 'normal-case tracking-normal' : 'uppercase tracking-wider',
      ].join(' ')}
      title={title || String(children)}
    >
      <Icon size={11} className="shrink-0 text-gray-400" />
      <span className={relaxed ? 'whitespace-normal leading-snug' : 'truncate'}>{children}</span>
    </span>
  );
}

function ArticleCard({
  item = {},
  compact = false,
  equalHeight = false,
  hideTypeLabel = false,
  selectable = false,
  selected = false,
  compactFooter = null,
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
  const summary = articleDescription(item);
  const country = item.country || item.market || 'Not specified';
  const region = item.region || '';
  const compactMetaPillClass = 'article-meta-pill inline-flex min-w-0 items-center gap-1.5 rounded-xl bg-[#f8fafc] px-3 py-2 text-[11px] font-black uppercase tracking-wider text-[#6b7280] ring-1 ring-[#e8edf3]';
  const compactCardShell = compact
    ? `${equalHeight ? 'h-full min-h-[464px]' : ''} rounded-[26px] bg-[linear-gradient(180deg,rgba(255,248,250,0.96)_0%,rgba(255,255,255,0.98)_52%,rgba(243,255,229,0.94)_100%)] px-4 pb-4 pt-3 xl:px-5 xl:pb-5 xl:pt-4`
    : 'rounded-[22px] bg-white p-4 sm:p-5';
  const source = item.source || sourceHost(item.url) || 'Unknown source';
  const host = sourceHost(item.url);
  const sourceDomain = host || sourceHost(source) || source || item.url || 'Unknown source';
  const sourceTone = sourceTrustTone(item.sourceCredibility || 'moderate');
  const sourceCredibilityLabel = String(item.sourceCredibility || 'moderate').toUpperCase();
  const sourceTrustKey = ['high', 'moderate', 'low'].includes(String(item.sourceCredibility || '').toLowerCase())
    ? String(item.sourceCredibility).toLowerCase()
    : 'moderate';
  const compactScoreOnlyHeader = compact && hideTypeLabel;
  const compactCategoryBlockClass = compactScoreOnlyHeader
    ? `article-compact-category-stack mb-3 flex ${equalHeight ? 'min-h-[74px]' : ''} flex-col gap-2 pr-14`
    : `article-compact-category-stack mb-3 flex ${equalHeight ? 'min-h-[74px]' : ''} flex-col gap-2`;
  const saveButtonClass = [
    'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all',
    compact ? 'h-9 w-9 rounded-xl px-0' : 'w-9 px-0 sm:w-auto sm:px-3',
    item.isSaved
      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
      : 'bg-white text-gray-500 ring-1 ring-gray-100 hover:bg-brand-pink/50 hover:text-brand-crimson',
    saving ? 'cursor-wait opacity-70' : ''
  ].join(' ');
  const saveActionButtonClass = [
    'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-black transition-all',
    item.isSaved
      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
      : 'bg-white text-gray-500 ring-1 ring-gray-100 hover:bg-brand-pink/50 hover:text-brand-crimson',
    saving ? 'cursor-wait opacity-70' : ''
  ].join(' ');
  const showSaveInActionRow = Boolean(onSaveToggle && selectable);
  const renderSaveButton = (className, showLabel = false) => (
    <button
      type="button"
      disabled={saving}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSaveToggle(item);
      }}
      className={className}
      aria-label={item.isSaved ? 'Remove from saved' : 'Save this article'}
      title={item.isSaved ? 'Remove from saved' : 'Save this article'}
    >
      {item.isSaved ? <Check size={12} /> : <Bookmark size={12} />}
      {showLabel ? (
        <span>{saving ? 'Saving' : item.isSaved ? 'Saved' : 'Save'}</span>
      ) : (
        !compact && <span className="hidden sm:inline">{saving ? 'Saving' : item.isSaved ? 'Saved' : 'Save'}</span>
      )}
    </button>
  );

  return (
    <article
      data-analytics-section={`Article: ${item.type || 'signal'} - ${item.category || 'General'}`}
      className={[
        'article-card group relative isolate flex flex-col overflow-hidden font-sans fade-in',
        'transition-all duration-200 hover:-translate-y-0.5',
        compactCardShell,
      ].join(' ')}
      style={{
        boxShadow: selected
          ? '0 10px 30px rgba(15,23,42,0.06), inset 0 0 0 2px rgba(22,58,36,0.38)'
          : '0 10px 30px rgba(15,23,42,0.06), 0 0 0 1px rgba(15,23,42,0.06)',
        contentVisibility: 'auto',
        containIntrinsicSize: compact ? '320px' : '380px',
        contain: 'layout paint style',
        willChange: 'transform',
      }}
    >
      {!compact && <div className="absolute left-0 top-0 h-full w-1 bg-brand-crimson opacity-90" />}
      <div
        className={[
          'article-card-top-row',
          'flex gap-3',
          compact
            ? compactScoreOnlyHeader
              ? 'absolute right-4 top-4 z-10 justify-end'
              : 'mb-4 items-start justify-between'
            : 'mb-3 items-start justify-between pl-3',
        ].join(' ')}
      >
        {!compactScoreOnlyHeader && (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className={[
                'article-type-pill inline-flex items-center border border-gray-200 bg-white font-black uppercase text-brand-crimson',
                compact ? 'rounded-lg px-3 py-1.5 text-[11px] tracking-[0.08em]' : 'rounded-md px-2.5 py-1 text-[10px] tracking-wider',
              ].join(' ')}
            >
              {typeStyle.label}
            </span>
          </div>
        )}

        <div className="flex w-12 shrink-0 flex-col items-center gap-2">
          {score > 0 && (
            <span
              className={[
                'article-score-pill border border-gray-200 bg-white font-black tracking-wide text-gray-950',
                compact ? 'rounded-xl px-3 py-1.5 text-[12px]' : 'rounded-md px-2 py-1 text-[10px]',
              ].join(' ')}
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
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onDragStart={(event) => event.preventDefault()}
              draggable={false}
              className="mt-0.5 rounded border-gray-200 text-brand-crimson focus:ring-brand-crimson/30"
            />
          )}
          {onSaveToggle && !showSaveInActionRow && renderSaveButton(saveButtonClass)}
        </div>
      </div>

      {compact && (
        <div className={compactCategoryBlockClass}>
          {item.category && item.category !== 'General' && (
            <span className={`${compactMetaPillClass} article-compact-category-pill w-full`} title="Category">
              <Folder size={12} className="shrink-0 text-[#9ca3af]" />
              <span className="whitespace-normal break-words leading-snug">{String(item.category).toUpperCase()}</span>
            </span>
          )}
          {item.subcategory && (
            <span className={`${compactMetaPillClass} article-compact-category-pill w-full`} title="Sub-category">
              <Tag size={12} className="shrink-0 text-[#9ca3af]" />
              <span className="whitespace-normal break-words leading-snug">{String(item.subcategory).toUpperCase()}</span>
            </span>
          )}
        </div>
      )}

      {!compact && (
        <div className="mb-3 flex min-w-0 flex-wrap gap-1.5 pl-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">
        {item.category && item.category !== 'General' && (
          <span className="article-meta-pill inline-flex max-w-full items-center gap-1 rounded-md bg-gray-50 px-2 py-1 ring-1 ring-gray-100">
            <Folder size={11} className="shrink-0" />
            <span className="truncate">{String(item.category).toUpperCase()}</span>
          </span>
        )}
        {item.subcategory && (
          <span className="article-meta-pill inline-flex max-w-full items-center gap-1 rounded-md bg-gray-50 px-2 py-1 ring-1 ring-gray-100">
            <Tag size={11} className="shrink-0" />
            <span className="truncate">{String(item.subcategory).toUpperCase()}</span>
          </span>
        )}
        </div>
      )}

      <h3 className={['article-title font-black leading-snug text-gray-900 transition-colors duration-200 group-hover:text-brand-crimson', compact ? `mb-2.5 ${equalHeight ? 'min-h-[58px]' : ''} text-[15px]` : 'mb-2.5 pl-3 text-[15px]'].join(' ')}>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className={['hover:underline decoration-brand-crimson/30 underline-offset-2', compact ? 'line-clamp-3' : 'line-clamp-3'].join(' ')}
          data-analytics-click={`Article title: ${item.title || 'Untitled'}`}
        >
          {item.title}
        </a>
      </h3>

      {summary && (
        <p className={['article-summary flex-1 leading-relaxed text-gray-500', compact ? `mb-4 ${equalHeight ? 'min-h-[62px]' : ''} text-[12px] line-clamp-3 xl:text-[13px]` : 'mb-4 pl-3 text-[13px] line-clamp-3'].join(' ')}>
          {summary}
        </p>
      )}

      <div className={['mt-auto border-t border-gray-100/80', compact ? 'pt-3' : 'pl-0 pt-3 sm:pl-3'].join(' ')}>
        {compact ? (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={compactMetaPillClass} title="Country or region">
              <MapPin size={12} className="shrink-0 text-[#9ca3af]" />
              <span className="truncate">{[region, country].filter(Boolean).join(', ')}</span>
            </span>
            <span className={compactMetaPillClass} title={updatedAt ? `Updated ${updatedAt}` : updatedLabel}>
              <Clock3 size={12} className="shrink-0 text-[#9ca3af]" />
              <span className="truncate">{updatedLabel}</span>
            </span>
          </div>
        ) : (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <MetaPill icon={MapPin} title="Country or region">{[region, country].filter(Boolean).join(', ')}</MetaPill>
            <MetaPill icon={Clock3} title={updatedAt ? `Updated ${updatedAt}` : updatedLabel} relaxed>
              {updatedLabel}
            </MetaPill>
          </div>
        )}
        <div className={compact ? 'mb-4 hidden' : 'mb-3'} />
        <div
          className={[
            'article-source-wrap rounded-2xl bg-gray-50 p-2 ring-1 ring-gray-100 transition-colors group-hover:bg-white',
            'block'
          ].join(' ')}
        >
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className={[
              `article-source-link article-source-${sourceTrustKey}`,
              'min-w-0 items-center rounded-xl',
              compact ? 'grid grid-cols-[36px_minmax(0,1fr)] gap-2 px-2 py-2' : 'flex gap-2 px-2 py-1.5'
            ].join(' ')}
            title={sourceDomain}
            data-analytics-click={`Source domain open: ${item.title || host || 'Article'}`}
            onClick={(event) => event.stopPropagation()}
            style={{ background: sourceTone.bg, border: `1px solid ${sourceTone.border}` }}
          >
            <span
              className={`article-source-icon article-source-icon-${sourceTrustKey} flex h-8 w-8 shrink-0 items-center justify-center rounded-xl`}
              style={{ background: '#ffffff', color: sourceTone.icon }}
            >
              <Globe size={13} />
            </span>
            <span className={compact ? 'min-w-0' : 'min-w-0 flex-1'}>
              <span className={compact ? 'flex items-center justify-between gap-2' : 'block'}>
                <span
                  className={[
                    `article-source-domain article-source-domain-${sourceTrustKey}`,
                    'min-w-0 block text-[11px] font-black',
                    compact ? 'break-words leading-snug pr-2' : 'truncate'
                  ].join(' ')}
                  style={{ color: sourceTone.text }}
                >
                  {sourceDomain}
                </span>
                {compact && (
                  <span
                    className={`article-source-badge article-source-badge-${sourceTrustKey} inline-flex shrink-0 items-center justify-center self-center rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wider`}
                    style={{ background: '#ffffff', color: sourceTone.text, border: `1px solid ${sourceTone.border}` }}
                  >
                    {sourceCredibilityLabel}
                  </span>
                )}
              </span>
            </span>
            <span
              className={[
                `article-source-badge article-source-badge-${sourceTrustKey}`,
                'shrink-0 rounded-full font-black uppercase',
                compact
                  ? 'hidden'
                  : 'hidden sm:inline-flex items-center justify-center px-2 py-1 text-[9px] tracking-wider'
              ].join(' ')}
              style={{ background: '#ffffff', color: sourceTone.text, border: `1px solid ${sourceTone.border}` }}
            >
              {sourceCredibilityLabel}
            </span>
          </a>
        </div>
      </div>

      {compactFooter && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          {compactFooter}
        </div>
      )}

      {(showSaveInActionRow || adminActions) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 sm:pl-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {adminActions}
          </div>
          {showSaveInActionRow ? renderSaveButton(saveActionButtonClass, true) : null}
        </div>
      )}
    </article>
  );
}

export default memo(ArticleCard);
