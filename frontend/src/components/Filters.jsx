import { useEffect, useState, useMemo } from 'react';
import api from '../api/axios';
import { Search, X, SlidersHorizontal, ChevronDown } from 'lucide-react';

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
  // Default closed on page load for all users
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

  return (
    <section className="card overflow-hidden">
      {/* Header / toggle bar */}
      <header
        className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-ink-100 cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2.5">
          <SlidersHorizontal size={14} className="text-brass-500" />
          <span className="text-[11px] uppercase tracking-[0.16em] font-semibold text-ink-700">Filters</span>
          {activeCount > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-brass-100 text-brass-700">
              {activeCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {activeCount > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); reset(); }}
              className="text-[11px] uppercase tracking-wider text-ink-400 hover:text-red-600 flex items-center gap-1 transition-colors"
            >
              <X size={11} /> Clear
            </button>
          )}
          <ChevronDown
            size={15}
            className={`text-ink-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </header>

      {/* Filter body */}
      {open && (
        <div className="p-4 sm:p-5">
          {/* ── Row 1: Search + Type + Source ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-3 sm:mb-4">
            {/* Search spans 2 cols on lg */}
            <div className="sm:col-span-2">
              <label className="label">Search</label>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
                <input
                  className="input pl-8"
                  placeholder="Keyword in title…"
                  value={filters.q}
                  onChange={(e) => update('q', e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="label">Type</label>
              <select className="select" value={filters.type} onChange={(e) => update('type', e.target.value)}>
                <option value="">All</option>
                <option value="news">News</option>
                <option value="govt">Government</option>
                <option value="competitor">Competitor</option>
                <option value="evergreen">Evergreen</option>
              </select>
            </div>

            <div>
              <label className="label">Source</label>
              <select className="select" value={filters.source} onChange={(e) => update('source', e.target.value)}>
                <option value="">All sources</option>
                {sourceOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Row 2: Category + Subcategory + From + To + Status ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            <div>
              <label className="label">Category</label>
              <select className="select" value={filters.category} onChange={(e) => update('category', e.target.value)}>
                <option value="">All categories</option>
                {meta && Object.keys(meta.categories).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Sub-category</label>
              <select
                className="select disabled:opacity-50"
                value={filters.subcategory}
                onChange={(e) => update('subcategory', e.target.value)}
                disabled={!filters.category}
              >
                <option value="">All</option>
                {subcatOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className="label">From</label>
              <input
                type="date"
                className="input"
                value={filters.from}
                onChange={(e) => update('from', e.target.value)}
              />
            </div>

            <div>
              <label className="label">To</label>
              <input
                type="date"
                className="input"
                value={filters.to}
                onChange={(e) => update('to', e.target.value)}
              />
            </div>

            {showAdmin && (
              <div>
                <label className="label">Status</label>
                <select
                  className="select"
                  value={filters.publishedOnly}
                  onChange={(e) => update('publishedOnly', e.target.value)}
                >
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
