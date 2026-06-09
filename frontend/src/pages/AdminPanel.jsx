import { useEffect, useState, useCallback } from 'react';
import api from '../api/axios';
import Layout from '../components/Layout';
import Filters from '../components/Filters';
import ArticleCard from '../components/ArticleCard';
import Loader, { Skeleton } from '../components/Loader';
import {
  Play, Eye, EyeOff, Trash2, RefreshCw, Activity,
  Users, FileText, BarChart3, Loader2, Check, X, ChevronRight, UserPlus
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// =============== TABS ===============

const TABS = [
  { key: 'articles', label: 'Articles', icon: FileText },
  { key: 'fetch',    label: 'Fetch',    icon: Play },
  { key: 'logs',     label: 'Logs',     icon: Activity },
  { key: 'users',    label: 'Users',    icon: Users },
  { key: 'stats',    label: 'Stats',    icon: BarChart3 }
];

export default function AdminPanel() {
  const [tab, setTab] = useState('articles');

  return (
    <Layout>
      <div className="space-y-6 pb-10">
        <div>
          <div className="eyebrow mb-2">Operations</div>
          <h1 className="section-title text-3xl font-bold">Admin Panel</h1>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 mb-6 border-b border-ink-100 overflow-x-auto">
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={[
                  'px-3 sm:px-4 py-2.5 text-sm font-medium flex items-center gap-2 border-b-2 -mb-px transition-all whitespace-nowrap',
                  active
                    ? 'border-brand-crimson text-brand-crimson font-bold'
                    : 'border-transparent text-ink-400 hover:text-ink-700'
                ].join(' ')}
                style={active ? { borderColor: '#D11243', color: '#D11243' } : {}}
              >
                <t.icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'articles' && <ArticlesTab />}
        {tab === 'fetch'    && <FetchTab />}
        {tab === 'logs'     && <LogsTab />}
        {tab === 'users'    && <UsersTab />}
        {tab === 'stats'    && <StatsTab />}
      </div>
    </Layout>
  );
}

// =============== ARTICLES TAB ===============

function ArticlesTab() {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});
  const [selected, setSelected] = useState(new Set());

  const load = useCallback(async (f = filters, page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 24 };
      for (const [k, v] of Object.entries(f || {})) if (v) params[k] = v;
      const { data } = await api.get('/articles', { params });
      setItems(data.items);
      setPagination({ page: data.page, total: data.total, pages: data.pages });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(filters, 1); }, [filters, load]);

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(items.map((x) => x._id)));
  const clearSelection = () => setSelected(new Set());

  const bulk = async (action) => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (action === 'delete' && !confirm(`Delete ${ids.length} articles? This is permanent.`)) return;
    try {
      await api.post(`/admin/articles/bulk-${action}`, { ids });
      clearSelection();
      load(filters, pagination.page);
    } catch (e) {
      alert(e.message);
    }
  };

  const togglePublish = async (item) => {
    const op = item.isPublished ? 'unpublish' : 'publish';
    await api.patch(`/admin/articles/${item._id}/${op}`);
    load(filters, pagination.page);
  };

  const remove = async (item) => {
    if (!confirm('Delete this article permanently?')) return;
    await api.delete(`/admin/articles/${item._id}`);
    load(filters, pagination.page);
  };

  return (
    <div>
      <Filters onChange={setFilters} showAdmin />

      {selected.size > 0 && (
        <div className="mt-4 card p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-brass-50 ring-brass-200">
          <div className="text-sm text-brass-700 font-medium">
            {selected.size} selected
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => bulk('publish')} className="btn-secondary">
              <Eye size={14} /> Publish
            </button>
            <button onClick={() => bulk('unpublish')} className="btn-secondary">
              <EyeOff size={14} /> Unpublish
            </button>
            <button onClick={() => bulk('delete')} className="btn-danger">
              <Trash2 size={14} /> Delete
            </button>
            <button onClick={clearSelection} className="btn-ghost">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-ink-400 mb-3">
        <div>
          {loading ? '…' : `${pagination.total} articles`}
          {pagination.pages > 1 && ` · Page ${pagination.page} of ${pagination.pages}`}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={selectAll} className="text-[11px] uppercase tracking-wider hover:text-ink-700">
            Select all on page
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-4 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <ArticleCard
              key={item._id}
              item={item}
              selectable
              selected={selected.has(item._id)}
              onSelect={toggleSelect}
              adminActions={
                <>
                  <button onClick={() => togglePublish(item)} className="btn-ghost text-[12px]">
                    {item.isPublished ? <EyeOff size={12} /> : <Eye size={12} />}
                    {item.isPublished ? 'Unpublish' : 'Publish'}
                  </button>
                  <button onClick={() => remove(item)} className="btn-ghost text-[12px] text-red-600 hover:bg-red-50">
                    <Trash2 size={12} /> Delete
                  </button>
                  <span className={`ml-auto tag ${item.isPublished ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-ink-50 text-ink-500 ring-1 ring-ink-100'}`}>
                    {item.isPublished ? 'Published' : 'Draft'}
                  </span>
                </>
              }
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            disabled={pagination.page <= 1}
            onClick={() => load(filters, pagination.page - 1)}
            className="btn-secondary"
          >
            Previous
          </button>
          <span className="text-sm text-ink-500 px-3">
            {pagination.page} / {pagination.pages}
          </span>
          <button
            disabled={pagination.page >= pagination.pages}
            onClick={() => load(filters, pagination.page + 1)}
            className="btn-secondary"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// =============== FETCH TAB ===============

function FetchTab() {
  const [status, setStatus] = useState({ isFetching: false });
  const [lastLog, setLastLog] = useState(null);
  const [starting, setStarting] = useState(false);
  const [msg, setMsg] = useState('');

  const refresh = useCallback(async () => {
    const [s, l] = await Promise.all([
      api.get('/admin/fetch/status'),
      api.get('/admin/logs', { params: { limit: 1 } })
    ]);
    setStatus(s.data);
    setLastLog(l.data.items[0] || null);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  const fetchNow = async (types = null) => {
    setStarting(true);
    setMsg('');
    try {
      const body = types ? { types } : {};
      await api.post('/admin/fetch', body);
      setMsg('Fetch started in background. Refreshing logs every few seconds.');
      refresh();
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Trigger card */}
      <div className="card p-6 lg:col-span-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <div className="eyebrow mb-1">Manual fetch</div>
            <h3 className="font-display text-2xl text-ink-800">Run scrapers now</h3>
          </div>
          <span className={[
            'tag',
            status.isFetching ? 'bg-orange-50 text-orange-700 ring-1 ring-orange-200' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
          ].join(' ')}>
            {status.isFetching ? 'Running…' : 'Idle'}
          </span>
        </div>

        <p className="text-sm text-ink-500 leading-relaxed mb-5">
          Triggers an out-of-cycle scrape across all configured sources. Items are deduplicated automatically;
          existing articles will not be re-saved.
        </p>

        <div className="flex flex-wrap gap-2 mb-5">
          <button onClick={() => fetchNow()} disabled={starting || status.isFetching} className="btn-primary">
            {starting || status.isFetching ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Fetch all
          </button>
          {['news', 'govt', 'competitor', 'evergreen'].map((t) => (
            <button
              key={t}
              disabled={starting || status.isFetching}
              onClick={() => fetchNow([t])}
              className="btn-secondary capitalize"
            >
              {t}
            </button>
          ))}
        </div>

        {msg && (
          <div className="text-[13px] text-ink-500 bg-ink-50 ring-1 ring-ink-100 rounded-md px-3 py-2">
            {msg}
          </div>
        )}
      </div>

      {/* Last log */}
      <div className="card p-6">
        <div className="eyebrow mb-1">Last run</div>
        {!lastLog ? (
          <div className="text-sm text-ink-400 mt-4">No logs yet.</div>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-ink-400">Status</span>
              <span className={`tag ${
                lastLog.status === 'success' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                : lastLog.status === 'partial' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'
                : lastLog.status === 'failed' ? 'bg-red-50 text-red-700 ring-1 ring-red-100'
                : 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
              }`}>{lastLog.status}</span>
            </div>
            <Stat label="Started" value={lastLog.startedAt ? formatDistanceToNow(new Date(lastLog.startedAt), { addSuffix: true }) : '—'} />
            <Stat label="Trigger" value={lastLog.triggeredBy} />
            <Stat label="Fetched" value={lastLog.totalFetched} />
            <Stat label="Inserted" value={lastLog.totalInserted} highlight />
            <Stat label="Duplicates" value={lastLog.totalDuplicates} />
            <Stat label="Errors" value={lastLog.totalErrors} />
            <Stat label="Duration" value={lastLog.durationMs ? `${Math.round(lastLog.durationMs / 1000)}s` : '—'} />
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] uppercase tracking-wider text-ink-400">{label}</span>
      <span className={highlight ? 'text-brand-crimson font-display text-lg font-bold' : 'text-ink-700 text-sm font-medium'}>
        {value ?? '—'}
      </span>
    </div>
  );
}

// =============== LOGS TAB ===============

function LogsTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/logs', { params: { limit: 30 } });
      setItems(data.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loader />;

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-1">
        <div className="text-sm text-ink-500">{items.length} most recent runs</div>
        <button onClick={load} className="btn-ghost">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>
      {items.length === 0 && (
        <div className="card p-6 text-center text-ink-400 text-sm">No fetch logs yet.</div>
      )}
      {items.map((log) => (
        <div key={log._id} className="card overflow-hidden">
          <div
            className="px-4 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 cursor-pointer hover:bg-ink-50/50"
            onClick={() => setExpanded(expanded === log._id ? null : log._id)}
          >
            <div className="flex flex-wrap items-center gap-3 min-w-0">
              <span className={`tag ${
                log.status === 'success' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                : log.status === 'partial' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'
                : log.status === 'failed' ? 'bg-red-50 text-red-700 ring-1 ring-red-100'
                : 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
              }`}>{log.status}</span>
              <span className="text-sm text-ink-700 font-medium">
                {new Date(log.startedAt).toLocaleString()}
              </span>
              <span className="text-[11px] uppercase tracking-wider text-ink-400">
                {log.triggeredBy}
                {log.triggeredByUser?.name && ` · ${log.triggeredByUser.name}`}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 lg:gap-6 text-[12px] text-ink-500 font-mono">
              <span>+{log.totalInserted} new</span>
              <span>{log.totalDuplicates} dup</span>
              <span>{log.totalErrors} err</span>
              <ChevronRight size={14} className={`transition-transform ${expanded === log._id ? 'rotate-90' : ''}`} />
            </div>
          </div>

          {expanded === log._id && (
            <div className="border-t border-ink-100 px-4 py-3 bg-ink-50/30">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[10px] uppercase tracking-wider text-ink-400">
                    <tr className="text-left">
                      <th className="py-2 pr-3">Source</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3 text-right">Fetched</th>
                      <th className="py-2 pr-3 text-right">Errors</th>
                      <th className="py-2 pr-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="text-ink-600">
                    {(log.perSource || []).map((p, i) => (
                      <tr key={i} className="border-t border-ink-100/50">
                        <td className="py-1.5 pr-3 font-medium text-ink-700">{p.sourceName}</td>
                        <td className="py-1.5 pr-3 text-ink-400">{p.type}</td>
                        <td className="py-1.5 pr-3 text-right">{p.fetched}</td>
                        <td className="py-1.5 pr-3 text-right">
                          {p.errors > 0
                            ? <span className="text-red-600">{p.errors}</span>
                            : <span className="text-ink-300">0</span>}
                        </td>
                        <td className="py-1.5 pr-3 text-[11px] text-ink-400 max-w-md truncate">
                          {(p.errorMessages || []).join('; ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// =============== USERS TAB ===============

function UsersTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    company: '',
    designation: '',
    role: 'admin',
    isActive: true
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/users', { params: { limit: 50 } });
      setItems(data.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateForm = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const createUser = async (e) => {
    e.preventDefault();
    setErr('');
    setSaving(true);
    try {
      await api.post('/admin/users', form);
      setForm({
        name: '',
        email: '',
        password: '',
        company: '',
        designation: '',
        role: 'admin',
        isActive: true
      });
      load();
    } catch (e) {
      setErr(e.message || 'User creation failed');
    } finally {
      setSaving(false);
    }
  };

  const setRole = async (u, role) => {
    if (u.role === role) return;
    if (!confirm(`Change role of ${u.email} to ${role === 'admin' ? 'Admin' : 'Member'}?`)) return;
    await api.patch(`/admin/users/${u._id}`, { role });
    load();
  };

  const toggleActive = async (u) => {
    await api.patch(`/admin/users/${u._id}`, { isActive: !u.isActive });
    load();
  };

  const remove = async (u) => {
    if (!confirm(`Delete ${u.email}? This is permanent.`)) return;
    try {
      await api.delete(`/admin/users/${u._id}`);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="space-y-5">
      <form onSubmit={createUser} className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <div className="eyebrow mb-1">Create account</div>
            <h3 className="font-display text-xl text-ink-800 font-bold">Add admin or member</h3>
          </div>
          <UserPlus size={18} className="text-brand-crimson" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input className="input" required placeholder="Full name" value={form.name} onChange={(e) => updateForm('name', e.target.value)} />
          <input className="input" type="email" required placeholder="Email" value={form.email} onChange={(e) => updateForm('email', e.target.value)} />
          <input className="input" type="password" required minLength={6} placeholder="Password" value={form.password} onChange={(e) => updateForm('password', e.target.value)} />
          <input className="input" placeholder="Company" value={form.company} onChange={(e) => updateForm('company', e.target.value)} />
          <input className="input" placeholder="Designation" value={form.designation} onChange={(e) => updateForm('designation', e.target.value)} />
          <div className="flex gap-2">
            <select className="input" value={form.role} onChange={(e) => updateForm('role', e.target.value)}>
              <option value="admin">Admin</option>
              <option value="user">Member</option>
            </select>
            <label className="flex items-center gap-2 text-xs text-ink-500 whitespace-nowrap px-2">
              <input type="checkbox" checked={form.isActive} onChange={(e) => updateForm('isActive', e.target.checked)} />
              Active
            </label>
          </div>
        </div>

        {err && (
          <div className="mt-3 text-xs rounded-md px-3 py-2 bg-red-50 text-red-700 ring-1 ring-red-100">
            {err}
          </div>
        )}

        <div className="mt-4">
          <button disabled={saving} className="btn-primary">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Create account
          </button>
        </div>
      </form>

      <div className="card overflow-x-auto">
      <table className="w-full min-w-[760px]">
        <thead className="bg-ink-50/50 text-[10px] uppercase tracking-wider text-ink-500">
          <tr className="text-left">
            <th className="py-3 px-4">User</th>
            <th className="py-3 px-4">Company</th>
            <th className="py-3 px-4">Role</th>
            <th className="py-3 px-4">Status</th>
            <th className="py-3 px-4">Last login</th>
            <th className="py-3 px-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((u) => (
            <tr key={u._id} className="border-t border-ink-100 hover:bg-ink-50/30">
              <td className="py-3 px-4">
                <div className="font-medium text-ink-800">{u.name}</div>
                <div className="text-xs text-ink-400">{u.email}</div>
              </td>
              <td className="py-3 px-4 text-sm text-ink-600">{u.company || '—'}</td>
              <td className="py-3 px-4">
                <span className={`tag ${
                  u.role === 'super_admin' ? 'bg-brass-100 text-brass-700'
                    : u.role === 'admin' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
                    : 'bg-ink-50 text-ink-500 ring-1 ring-ink-100'
                }`}>
                  {u.role === 'super_admin' ? 'Super Admin' : u.role === 'admin' ? 'Admin' : 'Member'}
                </span>
              </td>
              <td className="py-3 px-4">
                <span className={`tag ${u.isActive ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'}`}>
                  {u.isActive ? 'Active' : 'Pending approval'}
                </span>
              </td>
              <td className="py-3 px-4 text-sm text-ink-500">
                {u.lastLoginAt ? formatDistanceToNow(new Date(u.lastLoginAt), { addSuffix: true }) : 'Never'}
              </td>
              <td className="py-3 px-4 text-right">
                {u.role === 'super_admin' ? (
                  <span className="text-[11px] text-ink-300">Developer managed</span>
                ) : (
                  <div className="inline-flex items-center gap-1">
                    <button onClick={() => setRole(u, u.role === 'admin' ? 'user' : 'admin')} className="btn-ghost text-[11px]">
                      Make {u.role === 'admin' ? 'Member' : 'Admin'}
                    </button>
                    <button onClick={() => toggleActive(u)} className="btn-ghost text-[11px]">
                      {u.isActive ? 'Disable' : 'Approve'}
                    </button>
                    <button onClick={() => remove(u)} className="btn-ghost text-[11px] text-red-600 hover:bg-red-50">
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// =============== STATS TAB ===============

function StatsTab() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api.get('/admin/stats').then((r) => setStats(r.data)); }, []);

  if (!stats) return <Loader />;

  const TYPE_LABELS = { news: 'News', govt: 'Government', competitor: 'Competitor', evergreen: 'Evergreen' };

  return (
    <div className="space-y-6">
      {/* Counts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total articles"  value={stats.counts.total}       accent="bg-brand-crimson" />
        <StatCard label="Published"       value={stats.counts.published}   accent="bg-emerald-500" />
        <StatCard label="Drafts"          value={stats.counts.unpublished} accent="bg-amber-500" />
      </div>

      {/* By type */}
      <div className="card p-6">
        <div className="eyebrow mb-3">By type</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {['news', 'govt', 'competitor', 'evergreen'].map((t) => (
            <div key={t} className="bg-ink-50 rounded-md p-4">
              <div className="text-[11px] uppercase tracking-wider text-ink-400 mb-1">
                {TYPE_LABELS[t]}
              </div>
              <div className="font-display text-2xl sm:text-3xl text-ink-800">{stats.byType[t] || 0}</div>
            </div>
          ))}
        </div>
      </div>

      {/* By category */}
      <div className="card p-6">
        <div className="eyebrow mb-3">Top categories</div>
        <div className="space-y-2">
          {stats.byCategory.map((c, i) => {
            const maxCount = stats.byCategory[0]?.count || 1;
            const pct = Math.round((c.count / maxCount) * 100);
            return (
              <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <div className="w-full sm:w-48 text-sm text-ink-700 font-medium truncate">{c.category}</div>
                <div className="flex-1 bg-ink-100 rounded-full h-2 overflow-hidden">
                  <div className="h-full bg-brand-crimson" style={{ width: `${pct}%` }} />
                </div>
                <div className="w-12 text-right text-sm text-ink-500 font-mono">{c.count}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent */}
      <div className="card p-6">
        <div className="eyebrow mb-3">Most recent</div>
        <ul className="divide-y divide-ink-100">
          {stats.recent.map((r) => (
            <li key={r._id} className="py-3 flex flex-wrap items-center gap-3">
              <span className="tag tag-news capitalize">{r.type}</span>
              <span className="flex-1 text-sm text-ink-700 truncate">{r.title}</span>
              <span className="text-[11px] text-ink-400">{r.source}</span>
              <span className={r.isPublished ? 'text-emerald-600' : 'text-ink-300'}>
                {r.isPublished ? <Check size={14} /> : <X size={14} />}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className="card p-5 relative overflow-hidden">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${accent}`} />
      <div className="eyebrow mb-2 pl-2">{label}</div>
      <div className="font-display text-3xl sm:text-4xl text-ink-800 pl-2">{value}</div>
    </div>
  );
}
