import { useEffect, useState, useMemo } from 'react';
import api from '../api/axios';
import { Search, X, SlidersHorizontal, ChevronDown } from 'lucide-react';

const CRIMSON = '#D11243';

export default function Filters({ initial = {}, onChange, showAdmin = false }) {
  const [meta, setMeta] = useState(null);
  const [filters, setFilters] = useState({
    type: '',
    category: '',
    subcategory: '',
    source: '',
    from: '',
    to: '',
    q: '',
    publishedOnly: '',
    ...initial,
  });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.get('/articles/meta/filters').then((r) => setMeta(r.data)).catch(() => {});
  }, []);

  const subcatOptions = useMemo(() => {
    if (!meta || !filters.category) return [];
    return meta.categories[filters.category] || [];
  }, [meta, filters.category]);

  const sourceOptions = useMemo(() => {
    if (!meta) return [];
    if (!filters.type)
      return [...meta.sources.news, ...meta.sources.govt, ...meta.sources.competitor, ...meta.sources.evergreen];
    return meta.sources[filters.type] || [];
  }, [meta, filters.type]);

  const update = (k, v) => {
    const next = { ...filters, [k]: v };
    if (k === 'category') next.subcategory = '';
    if (k === 'type')     next.source = '';
    setFilters(next);
    onChange?.(next);
  };

  const reset = () => {
    const blank = { type: '', category: '', subcategory: '', source: '', from: '', to: '', q: '', publishedOnly: '' };
    setFilters(blank);
    onChange?.(blank);
  };

  const activeCount = Object.values(filters).filter((v) => v !== '' && v != null).length;

  const inputBase = {
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '13px',
    color: '#374151',
    width: '100%',
    outline: 'none',
    transition: 'border-color 0.2s',
    fontFamily: '"DM Sans", system-ui, sans-serif',
  };

  const handleFocus = e => e.target.style.borderColor = CRIMSON;
  const handleBlur  = e => e.target.style.borderColor = '#e5e7eb';

  return (
    <section
      className="overflow-hidden transition-all duration-300"
      style={{
        background: 'white',
        borderRadius: '12px',
        border: '1px solid rgba(209,18,67,0.1)',
        boxShadow: '0 1px 8px rgba(209,18,67,0.05)',
      }}
    >
      {/* Header toggle */}
      <header
        className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none"
        style={{ borderBottom: open ? '1px solid rgba(209,18,67,0.08)' : 'none' }}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2.5">
          <SlidersHorizontal size={14} style={{ color: CRIMSON }} />
          <span className="text-[11px] uppercase tracking-[0.16em] font-bold text-gray-600">Filters</span>
          {activeCount > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full text-white"
              style={{ background: CRIMSON }}>
              {activeCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {activeCount > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); reset(); }}
              className="text-[11px] uppercase tracking-wider flex items-center gap-1 transition-colors font-semibold"
              style={{ color: '#9ca3af' }}
              onMouseOver={e => e.currentTarget.style.color = '#ef4444'}
              onMouseOut={e => e.currentTarget.style.color = '#9ca3af'}
            >
              <X size={11} /> Clear
            </button>
          )}
          <ChevronDown
            size={15}
            style={{ color: '#9ca3af', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}
          />
        </div>
      </header>

      {/* Filter body */}
      {open && (
        <div className="p-4 fade-in">
          {/* Row 1 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500 mb-1.5">Search</label>
              <div className="relative">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#9ca3af' }} />
                <input
                  style={{ ...inputBase, paddingLeft: '32px' }}
                  placeholder="Keyword in title…"
                  value={filters.q}
                  onChange={(e) => update('q', e.target.value)}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500 mb-1.5">Type</label>
              <select style={inputBase} value={filters.type} onChange={(e) => update('type', e.target.value)}
                onFocus={handleFocus} onBlur={handleBlur}>
                <option value="">All</option>
                <option value="news">News</option>
                <option value="govt">Government</option>
                <option value="competitor">Competitor</option>
                <option value="evergreen">Evergreen</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500 mb-1.5">Source</label>
              <select style={inputBase} value={filters.source} onChange={(e) => update('source', e.target.value)}
                onFocus={handleFocus} onBlur={handleBlur}>
                <option value="">All sources</option>
                {sourceOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500 mb-1.5">Category</label>
              <select style={inputBase} value={filters.category} onChange={(e) => update('category', e.target.value)}
                onFocus={handleFocus} onBlur={handleBlur}>
                <option value="">All categories</option>
                {meta && Object.keys(meta.categories).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500 mb-1.5">Sub-category</label>
              <select
                style={{ ...inputBase, opacity: !filters.category ? 0.5 : 1 }}
                value={filters.subcategory}
                onChange={(e) => update('subcategory', e.target.value)}
                disabled={!filters.category}
                onFocus={handleFocus} onBlur={handleBlur}
              >
                <option value="">All</option>
                {subcatOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500 mb-1.5">From</label>
              <input type="date" style={inputBase} value={filters.from}
                onChange={(e) => update('from', e.target.value)} onFocus={handleFocus} onBlur={handleBlur} />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500 mb-1.5">To</label>
              <input type="date" style={inputBase} value={filters.to}
                onChange={(e) => update('to', e.target.value)} onFocus={handleFocus} onBlur={handleBlur} />
            </div>
            {showAdmin && (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500 mb-1.5">Status</label>
                <select style={inputBase} value={filters.publishedOnly}
                  onChange={(e) => update('publishedOnly', e.target.value)}
                  onFocus={handleFocus} onBlur={handleBlur}>
                  <option value="">All</option>
                  <option value="true">Published</option>
                  <option value="false">Draft</option>
                </select>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
