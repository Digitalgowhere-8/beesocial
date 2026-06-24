import { useCallback, useEffect, useState } from 'react';
import api from '../api/axios';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { BookOpenText, CalendarDays, CheckSquare, FileText, Loader2, MessageSquareText, RefreshCw, Search, Square, Tag, Trash2 } from 'lucide-react';
import { APP_EVENT_CONTENT_CHANGED } from '../utils/appEvents';

export default function BlogLibrary() {
  const { isAdmin } = useAuth();
  const [mode, setMode] = useState('blogs');
  const [items, setItems] = useState([]);
  const [socialItems, setSocialItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [selectedSocial, setSelectedSocial] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (mode === 'linkedin') {
        const { data } = await api.get('/blogs/social-posts', { params: { platform: 'linkedin', limit: 60 } });
        const rows = (data.items || []).filter((item) => (
          !query || `${item.selectedTopic || ''} ${item.postText || ''}`.toLowerCase().includes(query.toLowerCase())
        ));
        setSocialItems(rows);
        setSelectedSocial((prev) => prev && rows.some((item) => item._id === prev._id) ? prev : rows[0] || null);
      } else {
        const params = { status: 'published', limit: 30 };
        if (query) params.q = query;
        const { data } = await api.get('/blogs', { params });
        setItems(data.items || []);
        setSelected((prev) => prev || data.items?.[0] || null);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Could not load content');
    } finally {
      setLoading(false);
    }
  }, [mode, query]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handleContentChange = () => {
      load();
    };
    window.addEventListener(APP_EVENT_CONTENT_CHANGED, handleContentChange);
    return () => window.removeEventListener(APP_EVENT_CONTENT_CHANGED, handleContentChange);
  }, [load]);

  useEffect(() => {
    const refreshVisibleData = () => {
      if (document.visibilityState === 'hidden') return;
      load();
    };

    window.addEventListener('focus', refreshVisibleData);
    document.addEventListener('visibilitychange', refreshVisibleData);
    return () => {
      window.removeEventListener('focus', refreshVisibleData);
      document.removeEventListener('visibilitychange', refreshVisibleData);
    };
  }, [load]);

  const toggleSelection = (id) => {
    setSelectedIds((prev) => (
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    ));
  };

  const deletePosts = async (ids) => {
    const targetIds = ids.filter(Boolean);
    if (!targetIds.length) return;
    const confirmed = window.confirm(targetIds.length === 1 ? 'Delete this post?' : `Delete ${targetIds.length} posts?`);
    if (!confirmed) return;

    setDeleting(true);
    setError('');
    try {
      if (targetIds.length === 1) {
        await api.delete(`/blogs/${targetIds[0]}`);
      } else {
        await api.delete('/blogs/bulk', { data: { ids: targetIds } });
      }
      setSelectedIds((prev) => prev.filter((id) => !targetIds.includes(id)));
      if (targetIds.includes(selected?._id)) setSelected(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const headerActions = (
    <div className="flex items-center gap-2">
      <div className="grid grid-cols-2 rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
        <button type="button" onClick={() => { setMode('blogs'); setQuery(''); }} className={`flex min-h-[40px] items-center justify-center gap-2 rounded-xl px-5 text-[13px] font-black transition-all ${mode === 'blogs' ? 'bg-brand-crimson text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}>
          <BookOpenText size={14} />
          Blog
        </button>
        <button type="button" onClick={() => { setMode('linkedin'); setQuery(''); }} className={`flex min-h-[40px] items-center justify-center gap-2 rounded-xl px-5 text-[13px] font-black transition-all ${mode === 'linkedin' ? 'bg-brand-crimson text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}>
          <MessageSquareText size={14} />
          Social Media Post
        </button>
      </div>
      <button type="button" onClick={load} className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 text-[13px] font-black text-gray-900 shadow-sm transition-all hover:border-brand-crimson/20 hover:bg-gray-50">
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        Refresh
      </button>
    </div>
  );

  return (
    <Layout headerActions={headerActions}>
      <div className="flex h-full min-h-[calc(100vh-64px)] -m-6 flex-col gap-5 p-4 mesh-bg sm:p-6">
        <div className="glass-panel flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-crimson/80">
              Library Search
            </div>
            <h2 className="mt-1 text-lg font-black tracking-tight text-gray-900">
              {mode === 'linkedin' ? 'Find Saved Social Posts' : 'Find Published Content'}
            </h2>
          </div>
          <div className="relative min-w-0 w-full max-w-xl group z-10">
            <div className="absolute inset-0 rounded-2xl bg-brand-crimson/5 blur-md transition-colors group-focus-within:bg-brand-crimson/10"></div>
            <Search size={16} className="absolute left-4 top-1/2 z-10 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-brand-crimson" />
            <input 
              className="relative z-10 w-full rounded-2xl border border-gray-200 bg-white pl-11 pr-4 py-3 text-sm font-medium text-gray-800 shadow-sm transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-crimson/20 focus:border-brand-crimson/30" 
              value={query} 
              onChange={(e) => setQuery(e.target.value)} 
              placeholder={mode === 'linkedin' ? 'Search LinkedIn posts...' : 'Search articles...'} 
            />
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50/80 backdrop-blur-md px-5 py-4 text-sm font-semibold text-red-700 border border-red-200/50 shadow-sm animate-fade-in-up stagger-2">
            {error}
          </div>
        )}

        {mode === 'blogs' && isAdmin && selectedIds.length ? (
          <div className="glass-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3 animate-fade-in-up stagger-2">
            <span className="text-sm font-black text-gray-800">{selectedIds.length} selected</span>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setSelectedIds([])} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-black text-gray-500 hover:border-gray-300">
                Clear
              </button>
              <button type="button" onClick={() => deletePosts(selectedIds)} disabled={deleting} className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-600 transition-all hover:bg-red-100 disabled:opacity-60">
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Delete Selected
              </button>
            </div>
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 pb-4 animate-fade-in-up stagger-2 xl:grid-cols-[minmax(280px,400px)_minmax(0,1fr)]">
          <section className="min-h-0 overflow-y-auto glass-panel p-3 custom-scrollbar sm:p-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3 text-brand-crimson">
                <Loader2 size={24} className="animate-spin" />
                <span className="text-sm font-bold text-gray-500">Loading library...</span>
              </div>
            ) : mode === 'linkedin' ? (
              socialItems.length ? (
              <div className="space-y-3">
                {socialItems.map((post) => {
                  const isSelected = selectedSocial?._id === post._id;
                  return (
                    <button
                      key={post._id}
                      type="button"
                      onClick={() => setSelectedSocial(post)}
                      className={`w-full rounded-xl border p-4 text-left transition-all duration-300 ${
                        isSelected ? 'border-brand-crimson/40 bg-white shadow-md' : 'border-white/40 bg-white/50 hover:bg-white hover:shadow-sm'
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="rounded-full bg-brand-pink px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-brand-crimson">LinkedIn</span>
                        <span className="text-[10px] font-bold text-gray-400">{post.createdAt ? new Date(post.createdAt).toLocaleDateString() : ''}</span>
                      </div>
                      <div className="line-clamp-2 text-sm font-black leading-snug text-gray-900">{post.selectedTopic || 'Saved LinkedIn post'}</div>
                      <p className="mt-2 line-clamp-3 text-xs font-medium leading-relaxed text-gray-500">{post.postText}</p>
                    </button>
                  );
                })}
              </div>
              ) : <Empty label="No saved LinkedIn posts yet" />
            ) : items.length ? (
              <div className="space-y-3">
                {items.map((blog) => {
                  const isSelected = selected?._id === blog._id;
                  return (
                    <div
                      key={blog._id}
                      className={`w-full text-left transition-all duration-300 rounded-xl p-4 border relative overflow-hidden group ${
                        isSelected 
                          ? 'border-brand-crimson/40 bg-white shadow-md' 
                          : 'border-white/40 bg-white/40 hover:bg-white/80 hover:border-white hover:shadow-sm'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brand-crimson to-brand-pink rounded-l-xl"></div>
                      )}
                      <div className="flex items-start gap-3">
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => toggleSelection(blog._id)}
                            className={`mt-0.5 rounded-lg p-1 transition-all ${selectedIds.includes(blog._id) ? 'text-brand-crimson' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'}`}
                            title={selectedIds.includes(blog._id) ? 'Unselect' : 'Select'}
                          >
                            {selectedIds.includes(blog._id) ? <CheckSquare size={16} /> : <Square size={16} />}
                          </button>
                        ) : null}
                        <button type="button" onClick={() => setSelected(blog)} className="min-w-0 flex-1 text-left">
                          <div className={`mb-2 text-base font-black leading-snug ${isSelected ? 'text-gray-900' : 'text-gray-800 group-hover:text-gray-900'}`}>
                            {blog.title}
                          </div>
                          <p className="line-clamp-2 text-xs font-medium leading-relaxed text-gray-500 mb-3">{blog.excerpt}</p>
                          
                          <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wider text-gray-500">
                            {blog.category && <span className={`rounded-md px-2 py-1 border ${isSelected ? 'bg-brand-pink/10 border-brand-crimson/20 text-brand-crimson' : 'bg-white border-gray-200'}`}>{blog.category}</span>}
                            {blog.type && <span className={`rounded-md px-2 py-1 border ${isSelected ? 'bg-brand-pink/10 border-brand-crimson/20 text-brand-crimson' : 'bg-white border-gray-200'}`}>{blog.type}</span>}
                          </div>
                        </button>
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => deletePosts([blog._id])}
                            disabled={deleting}
                            className="mt-0.5 rounded-lg border border-transparent p-1.5 text-gray-400 transition-all hover:border-red-100 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            title="Delete post"
                          >
                            <Trash2 size={15} />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty />
            )}
          </section>

          <article className="min-h-0 overflow-y-auto glass-panel p-6 sm:p-10 custom-scrollbar relative">
            {mode === 'linkedin' ? (
              selectedSocial ? (
                <div className="max-w-3xl mx-auto animate-fade-in-up">
                  <div className="mb-5 flex flex-wrap gap-2">
                    <Pill icon={MessageSquareText} highlight>LinkedIn</Pill>
                    {selectedSocial.framework && <Pill icon={Tag}>{selectedSocial.framework}</Pill>}
                    {selectedSocial.createdAt && <Pill icon={CalendarDays}>{new Date(selectedSocial.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</Pill>}
                  </div>
                  <h2 className="mb-5 text-3xl font-black leading-tight text-gray-900 text-gradient">{selectedSocial.selectedTopic || 'Saved LinkedIn post'}</h2>
                  <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center gap-3 border-b border-gray-100 pb-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-crimson text-xs font-black text-white">A</div>
                      <div>
                        <div className="text-sm font-black text-gray-900">Admin</div>
                        <div className="text-xs font-semibold text-gray-400">LinkedIn draft</div>
                      </div>
                    </div>
                    <div className="whitespace-pre-wrap text-[15px] font-medium leading-loose text-gray-800">{selectedSocial.postText}</div>
                    {Array.isArray(selectedSocial.hashtags) && selectedSocial.hashtags.length ? (
                      <div className="mt-4 break-words text-sm font-bold leading-relaxed text-brand-crimson">{selectedSocial.hashtags.join(' ')}</div>
                    ) : null}
                  </div>
                </div>
              ) : <Empty large />
            ) : selected ? (
              <div className="max-w-3xl mx-auto animate-fade-in-up">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-3">
                    {selected.category && <Pill icon={Tag}>{selected.category}</Pill>}
                    {selected.subcategory && <Pill icon={Tag}>{selected.subcategory}</Pill>}
                    {selected.publishedAt && <Pill icon={CalendarDays} highlight>{new Date(selected.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</Pill>}
                  </div>
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => deletePosts([selected._id])}
                      disabled={deleting}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-black text-red-600 transition-all hover:bg-red-100 disabled:opacity-60"
                    >
                      {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      Delete
                    </button>
                  ) : null}
                </div>
                
                <h2 className="text-3xl sm:text-4xl font-black leading-tight text-gray-900 mb-6 font-display tracking-tight text-gradient">{selected.title}</h2>
                
                {selected.excerpt && (
                  <div className="pl-4 border-l-4 border-brand-crimson/30 mb-8 py-1">
                    <p className="text-lg font-medium leading-relaxed text-gray-600 italic">
                      {selected.excerpt}
                    </p>
                  </div>
                )}
                
                <div className="prose prose-sm sm:prose-base prose-gray max-w-none">
                  <div className="whitespace-pre-wrap text-gray-800 leading-loose font-medium text-[15px]">
                    {selected.bodyMarkdown}
                  </div>
                </div>
              </div>
            ) : (
              <Empty large />
            )}
          </article>
        </div>
      </div>
    </Layout>
  );
}

function Pill({ icon: Icon, children, highlight = false }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wider border shadow-sm ${
      highlight 
        ? 'bg-brand-crimson text-white border-brand-hoverred' 
        : 'bg-white/80 text-gray-600 border-gray-200'
    }`}>
      <Icon size={13} />
      {children}
    </span>
  );
}

function Empty({ large = false, label }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-4 text-center h-full min-h-[300px] ${large ? 'px-10' : 'px-6'}`}>
      <div className="relative">
        <div className="absolute inset-0 bg-brand-crimson/5 blur-xl rounded-full"></div>
        <div className="relative bg-white p-4 rounded-full shadow-sm border border-gray-100">
          <FileText size={large ? 32 : 24} className="text-brand-crimson/40" />
        </div>
      </div>
      <div>
        <h3 className={`font-black text-gray-800 ${large ? 'text-xl mb-2' : 'text-base mb-1'}`}>No content available</h3>
        <p className="text-sm font-medium text-gray-500 max-w-xs mx-auto">
          {label || (large ? "Select a post from the list to read the full content." : "There is no content to display right now.")}
        </p>
      </div>
    </div>
  );
}
