import { useEffect, useState, useCallback } from 'react';
import api from '../api/axios';
import Layout from '../components/Layout';
import Filters from '../components/Filters';
import ArticleCard from '../components/ArticleCard';
import Loader, { Skeleton } from '../components/Loader';
import { useAuth } from '../context/AuthContext';
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

const N8N_WORKFLOWS = [
  { key: 'news', label: 'News', tone: '#3b82f6' },
  { key: 'govt', label: 'Government', tone: '#10b981' },
  { key: 'competitor', label: 'Competitor', tone: '#f59e0b' },
  { key: 'evergreen', label: 'Evergreen', tone: '#8b5cf6' }
];

export default function AdminPanel() {
  const [tab, setTab] = useState('articles');

  return (
    <Layout>
      <div className="space-y-5 pb-10">
        <div className="rounded-lg border border-gray-100 bg-white px-4 py-4 shadow-card sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="eyebrow mb-1">Operations</div>
              <h1 className="text-2xl font-black tracking-tight text-gray-900">Admin Panel</h1>
              <p className="mt-1 text-sm text-gray-500">Manage content, users, n8n runs, and operational logs.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <span className="rounded-md bg-emerald-50 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-100">
                Console online
              </span>
              <span className="rounded-md bg-brand-pink/50 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-brand-crimson ring-1 ring-brand-crimson/10">
                Admin access
              </span>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="hide-scrollbar flex items-center gap-2 overflow-x-auto rounded-lg border border-gray-100 bg-white p-1.5 shadow-card">
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={[
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-bold transition-all whitespace-nowrap',
                  active
                    ? 'bg-brand-crimson text-white shadow-sm'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                ].join(' ')}
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
  const [n8nStatus, setN8nStatus] = useState({ isFetching: false, configured: {}, running: {} });
  const [lastLog, setLastLog] = useState(null);
  const [startingN8n, setStartingN8n] = useState('');
  const [msg, setMsg] = useState('');

  const refresh = useCallback(async () => {
    const [n, l] = await Promise.all([
      api.get('/admin/n8n/status'),
      api.get('/admin/logs', { params: { limit: 1 } })
    ]);
    setN8nStatus(n.data);
    setLastLog(l.data.items[0] || null);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  const runN8n = async (type) => {
    setStartingN8n(type);
    setMsg('');
    try {
      await api.post('/admin/n8n/run', { type });
      setMsg(`${type} n8n workflow started. Logs will refresh while it runs.`);
      refresh();
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setStartingN8n('');
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      {/* Trigger card */}
      <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-card sm:p-5 xl:col-span-2">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="eyebrow mb-1">Manual fetch</div>
            <h3 className="text-xl font-black tracking-tight text-gray-900">Run intelligence workflows</h3>
            <p className="mt-1 text-sm text-gray-500">
              Trigger each n8n pipeline and track its callback in the run log.
            </p>
          </div>
          <span className={[
            'rounded-md px-3 py-1.5 text-[11px] font-black uppercase tracking-wider',
            n8nStatus.isFetching ? 'bg-orange-50 text-orange-700 ring-1 ring-orange-200' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
          ].join(' ')}>
            {n8nStatus.isFetching ? 'Running...' : 'Idle'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {N8N_WORKFLOWS.map((workflow) => {
            const configured = Boolean(n8nStatus.configured?.[workflow.key]);
            const running = Boolean(n8nStatus.running?.[workflow.key]);
            const startingThis = startingN8n === workflow.key;
            return (
              <div
                key={workflow.key}
                className="rounded-lg border border-gray-100 bg-gray-50/60 p-4 transition-all hover:bg-white hover:shadow-sm"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                      style={{ color: workflow.tone, background: `${workflow.tone}12` }}
                    >
                      <Play size={15} />
                    </span>
                    <div className="min-w-0">
                      <div className="font-black text-gray-900">{workflow.label}</div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                        {configured ? 'Webhook configured' : 'Missing webhook'}
                      </div>
                    </div>
                  </div>
                  <span
                    className={[
                      'rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wider',
                      running || startingThis
                        ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
                        : configured
                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                          : 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'
                    ].join(' ')}
                  >
                    {running || startingThis ? 'Running' : configured ? 'Ready' : 'Setup'}
                  </span>
                </div>
                <button
                  disabled={startingThis || running || !configured}
                  onClick={() => runN8n(workflow.key)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-black transition-all disabled:cursor-not-allowed disabled:opacity-45"
                  style={{
                    background: configured ? workflow.tone : '#f3f4f6',
                    color: configured ? 'white' : '#9ca3af',
                  }}
                  title={configured ? `Run ${workflow.label} n8n workflow` : `${workflow.label} workflow URL is not configured yet`}
                >
                  {startingThis || running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  Run workflow
                </button>
              </div>
            );
          })}
        </div>

        {N8N_WORKFLOWS.some((workflow) => !n8nStatus.configured?.[workflow.key]) && (
          <div className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-700 ring-1 ring-amber-100">
            Add the remaining n8n webhook URLs in backend .env to enable disabled workflow buttons.
          </div>
        )}

        {msg && (
          <div className="mt-4 rounded-md bg-gray-50 px-3 py-2 text-[13px] text-gray-600 ring-1 ring-gray-100">
            {msg}
          </div>
        )}
      </div>

      {/* Last log */}
      <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-card sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="eyebrow mb-1">Last run</div>
            <h3 className="text-lg font-black tracking-tight text-gray-900">Latest callback</h3>
          </div>
          <Activity size={17} className="text-brand-crimson" />
        </div>
        {!lastLog ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm font-semibold text-gray-400">
            No logs yet.
          </div>
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
            <Stat label="Started" value={lastLog.startedAt ? formatDistanceToNow(new Date(lastLog.startedAt), { addSuffix: true }) : '-'} />
            <Stat label="Trigger" value={lastLog.triggeredBy} />
            <Stat label="Fetched" value={lastLog.totalFetched} />
            <Stat label="Inserted" value={lastLog.totalInserted} highlight />
            <Stat label="Duplicates" value={lastLog.totalDuplicates} />
            <Stat label="Errors" value={lastLog.totalErrors} />
            <Stat label="Duration" value={lastLog.durationMs ? `${Math.round(lastLog.durationMs / 1000)}s` : '-'} />
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 ring-1 ring-gray-100">
      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{label}</span>
      <span className={highlight ? 'text-brand-crimson text-base font-black' : 'text-gray-700 text-sm font-bold'}>
        {value ?? '-'}
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
        <div className="rounded-lg border border-dashed border-gray-200 bg-white p-8 text-center text-sm font-semibold text-gray-400 shadow-card">
          No fetch logs yet.
        </div>
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
  const { user: currentUser } = useAuth();
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

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/admin/users', { params: { limit: 50 } });
      setItems(data.items);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(() => load({ silent: true }), 30 * 1000);
    return () => window.clearInterval(id);
  }, [load]);

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

  const currentUserId = currentUser?._id || currentUser?.id;
  const currentAccount = items.find((u) => currentUserId && String(u._id) === String(currentUserId));
  const managedUsers = items.filter((u) => !currentUserId || String(u._id) !== String(currentUserId));
  const displayCurrent = currentAccount || currentUser;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-brand-crimson/15 bg-white shadow-card">
        <div className="border-b border-brand-crimson/10 px-4 py-3">
          <div className="eyebrow mb-1">Current session</div>
          <h3 className="text-lg font-black tracking-tight text-gray-900">Signed-in account</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_180px_180px_180px] lg:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-crimson text-base font-black text-white shadow-sm">
              {(displayCurrent?.name || displayCurrent?.email || 'U').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate text-base font-black text-gray-900">{displayCurrent?.name || 'Current user'}</div>
                <span className="rounded-md bg-brand-crimson px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
                  You
                </span>
              </div>
              <div className="truncate text-xs font-medium text-gray-400">{displayCurrent?.email}</div>
            </div>
          </div>
          <div className="rounded-md bg-gray-50 px-3 py-2 ring-1 ring-gray-100">
            <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">Role</div>
            <div className="text-sm font-black text-gray-900">
              {displayCurrent?.role === 'super_admin' ? 'Super Admin' : displayCurrent?.role === 'admin' ? 'Admin' : 'Member'}
            </div>
          </div>
          <div className="rounded-md bg-gray-50 px-3 py-2 ring-1 ring-gray-100">
            <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">Company</div>
            <div className="truncate text-sm font-black text-gray-900">{displayCurrent?.company || '-'}</div>
          </div>
          <div className={`rounded-md px-3 py-2 ring-1 ${displayCurrent?.isOnline === false ? 'bg-gray-50 ring-gray-100' : 'bg-emerald-50 ring-emerald-100'}`}>
            <div className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Status</div>
            <div className={`text-sm font-black ${displayCurrent?.isOnline === false ? 'text-gray-600' : 'text-emerald-700'}`}>
              {displayCurrent?.isActive === false ? 'Inactive' : displayCurrent?.isOnline === false ? 'Active' : 'Live now'}
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={createUser} className="rounded-lg border border-gray-100 bg-white p-4 shadow-card sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="eyebrow mb-1">Create account</div>
            <h3 className="text-xl font-black tracking-tight text-gray-900">Add admin or member</h3>
            <p className="mt-1 text-sm text-gray-500">Create a user and control their role and access state.</p>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-pink/60 text-brand-crimson ring-1 ring-brand-crimson/10">
            <UserPlus size={18} />
          </span>
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

      <div className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div>
          <div className="text-sm font-black text-gray-900">Members and admins</div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
            {managedUsers.length} managed accounts
          </div>
        </div>
        <Users size={17} className="text-gray-400" />
      </div>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[860px]">
        <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
          <tr className="text-left">
            <th className="py-3 px-4">User</th>
            <th className="py-3 px-4">Company</th>
            <th className="py-3 px-4">Role</th>
            <th className="py-3 px-4">Status</th>
            <th className="py-3 px-4">Live</th>
            <th className="py-3 px-4">Last login</th>
            <th className="py-3 px-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {managedUsers.map((u) => (
            <tr key={u._id} className="border-t border-gray-100 hover:bg-gray-50/60">
              <td className="py-3 px-4">
                <div className="font-black text-gray-900">{u.name}</div>
                <div className="text-xs font-medium text-gray-400">{u.email}</div>
              </td>
              <td className="py-3 px-4 text-sm font-medium text-gray-600">{u.company || '-'}</td>
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
              <td className="py-3 px-4">
                <div className="flex flex-col gap-1">
                  <span className={`tag ${u.isOnline ? 'bg-green-50 text-green-700 ring-1 ring-green-100' : 'bg-gray-50 text-gray-400 ring-1 ring-gray-100'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${u.isOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
                    {u.isOnline ? 'Live now' : 'Offline'}
                  </span>
                  {u.lastSeenAt && !u.isOnline && (
                    <span className="text-[10px] font-medium text-gray-400">
                      Seen {formatDistanceToNow(new Date(u.lastSeenAt), { addSuffix: true })}
                    </span>
                  )}
                </div>
              </td>
              <td className="py-3 px-4 text-sm font-medium text-gray-500">
                {u.lastLoginAt ? formatDistanceToNow(new Date(u.lastLoginAt), { addSuffix: true }) : 'Never'}
              </td>
              <td className="py-3 px-4 text-right">
                {u.role === 'super_admin' ? (
                  <span className="text-[11px] text-ink-300">Developer managed</span>
                ) : (
                  <div className="inline-flex items-center gap-1">
                    <button onClick={() => setRole(u, u.role === 'admin' ? 'user' : 'admin')} className="rounded-md px-2 py-1 text-[11px] font-bold text-gray-500 hover:bg-gray-100 hover:text-gray-900">
                      Make {u.role === 'admin' ? 'Member' : 'Admin'}
                    </button>
                    <button onClick={() => toggleActive(u)} className="rounded-md px-2 py-1 text-[11px] font-bold text-gray-500 hover:bg-gray-100 hover:text-gray-900">
                      {u.isActive ? 'Disable' : 'Approve'}
                    </button>
                    <button onClick={() => remove(u)} className="rounded-md p-1.5 text-red-500 hover:bg-red-50">
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
          {managedUsers.length === 0 && (
            <tr className="border-t border-gray-100">
              <td colSpan={7} className="px-4 py-8 text-center text-sm font-semibold text-gray-400">
                No other users to manage.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
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
  const TYPE_COLORS = { news: '#3b82f6', govt: '#10b981', competitor: '#f59e0b', evergreen: '#8b5cf6' };
  const total = Number(stats.counts.total || 0);
  const published = Number(stats.counts.published || 0);
  const drafts = Number(stats.counts.unpublished || 0);
  const publishRate = total ? Math.round((published / total) * 100) : 0;
  const draftRate = total ? Math.round((drafts / total) * 100) : 0;
  const typeEntries = ['news', 'govt', 'competitor', 'evergreen'].map((type) => ({
    type,
    label: TYPE_LABELS[type],
    count: Number(stats.byType[type] || 0),
    color: TYPE_COLORS[type],
  }));
  const topType = [...typeEntries].sort((a, b) => b.count - a.count)[0];
  const topCategory = stats.byCategory[0];
  const maxTypeCount = Math.max(1, ...typeEntries.map((x) => x.count));
  const recentPublished = stats.recent.filter((item) => item.isPublished).length;
  const actionItems = [
    drafts > 0
      ? `${drafts} draft${drafts === 1 ? '' : 's'} need review before they reach users.`
      : 'No draft backlog. Publishing coverage is clean.',
    topCategory
      ? `${topCategory.category} is the highest demand area with ${topCategory.count} signals.`
      : 'No category concentration detected yet.',
    topType?.count
      ? `${topType.label} is the largest content stream.`
      : 'No content stream has started yet.',
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <StatCard label="Total signals" value={total} accent="bg-brand-crimson" note="All indexed intelligence" />
        <StatCard label="Published" value={published} accent="bg-emerald-500" note={`${publishRate}% live coverage`} />
        <StatCard label="Draft review" value={drafts} accent="bg-amber-500" note={`${draftRate}% pending`} />
        <StatCard label="Recent live" value={recentPublished} accent="bg-blue-500" note="In latest activity" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-card sm:p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="eyebrow mb-1">Admin insights</div>
              <h3 className="text-lg font-black tracking-tight text-gray-900">Operational snapshot</h3>
              <p className="mt-1 text-sm text-gray-500">What needs attention from an admin perspective.</p>
            </div>
            <Activity size={17} className="text-brand-crimson" />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <InsightMetric label="Publish health" value={`${publishRate}%`} detail={drafts ? `${drafts} drafts pending` : 'All visible content is live'} tone="#10b981" />
            <InsightMetric label="Leading stream" value={topType?.label || 'None'} detail={`${topType?.count || 0} signals`} tone={topType?.color || '#D11243'} />
            <InsightMetric label="Top category" value={topCategory?.category || 'None'} detail={`${topCategory?.count || 0} signals`} tone="#D11243" />
          </div>
        </div>

        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-card sm:p-5">
          <div className="eyebrow mb-3">Recommended actions</div>
          <div className="space-y-2">
            {actionItems.map((item, index) => (
              <div key={index} className="flex gap-2 rounded-md bg-gray-50 p-3 ring-1 ring-gray-100">
                <Check size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                <p className="text-sm font-medium leading-relaxed text-gray-600">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-card sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="eyebrow mb-1">By type</div>
            <h3 className="text-lg font-black tracking-tight text-gray-900">Content mix</h3>
            <p className="mt-1 text-sm text-gray-500">Balance of sources feeding the dashboard.</p>
          </div>
          <BarChart3 size={17} className="text-gray-400" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          {typeEntries.map((entry) => {
            const pct = Math.round((entry.count / maxTypeCount) * 100);
            return (
            <div key={entry.type} className="rounded-lg bg-gray-50 p-4 ring-1 ring-gray-100">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{entry.label}</div>
                <div className="h-2.5 w-2.5 rounded-full" style={{ background: entry.color }} />
              </div>
              <div className="mb-3 text-3xl font-black tracking-tight text-gray-900">{entry.count}</div>
              <div className="h-2 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: entry.color }} />
              </div>
            </div>
          );})}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-card sm:p-5 xl:col-span-3">
          <div className="mb-4">
            <div className="eyebrow mb-1">Top categories</div>
            <h3 className="text-lg font-black tracking-tight text-gray-900">Demand concentration</h3>
            <p className="mt-1 text-sm text-gray-500">Service areas where market activity is most concentrated.</p>
          </div>
          <div className="space-y-3">
            {stats.byCategory.map((c, i) => {
              const maxCount = stats.byCategory[0]?.count || 1;
              const pct = Math.round((c.count / maxCount) * 100);
              return (
                <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[220px_1fr_48px] sm:items-center">
                  <div className="truncate text-sm font-bold text-gray-700">{c.category}</div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-brand-crimson" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-right text-sm font-black text-gray-500">{c.count}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-card sm:p-5 xl:col-span-2">
          <div className="mb-3">
            <div className="eyebrow mb-1">Latest activity</div>
            <h3 className="text-lg font-black tracking-tight text-gray-900">Recent signals</h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {stats.recent.map((r) => (
              <li key={r._id} className="py-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-md bg-gray-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-gray-500 ring-1 ring-gray-100">
                    {TYPE_LABELS[r.type] || r.type}
                  </span>
                  <span className={r.isPublished ? 'text-emerald-600' : 'text-amber-500'}>
                    {r.isPublished ? <Check size={14} /> : <X size={14} />}
                  </span>
                </div>
                <div className="truncate text-sm font-bold text-gray-800">{r.title}</div>
                <div className="mt-1 text-[11px] font-medium text-gray-400">{r.source}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function InsightMetric({ label, value, detail, tone }) {
  return (
    <div className="rounded-lg bg-gray-50 p-4 ring-1 ring-gray-100">
      <div className="mb-2 text-[10px] font-black uppercase tracking-wider text-gray-400">{label}</div>
      <div className="truncate text-xl font-black tracking-tight text-gray-900" style={{ color: tone }}>{value}</div>
      <div className="mt-1 text-xs font-medium text-gray-500">{detail}</div>
    </div>
  );
}

function StatCard({ label, value, accent, note }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-gray-100 bg-white p-5 shadow-card">
      <div className={`absolute left-0 top-0 h-full w-1 ${accent}`} />
      <div className="pl-2">
        <div className="mb-2 text-[10px] font-black uppercase tracking-wider text-gray-400">{label}</div>
        <div className="text-4xl font-black tracking-tight text-gray-900">{value}</div>
        {note && <div className="mt-1 text-xs font-bold text-gray-400">{note}</div>}
      </div>
    </div>
  );
}
