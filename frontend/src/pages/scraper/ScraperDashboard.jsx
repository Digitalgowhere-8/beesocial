import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  FileText,
  Filter,
  Globe2,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Search,
  Square,
  Trash2,
} from 'lucide-react';
import api from '../../api/axios';
import Loader from '../../components/Loader';
import './scraper-dashboard.css';

const TABS = [
  { key: 'scraper', label: 'Scraper', icon: Play },
  { key: 'sources', label: 'Country Sources', icon: Globe2 },
  { key: 'trust', label: 'Source Trust', icon: CheckCircle2 },
  { key: 'articles', label: 'Global Articles', icon: FileText },
  { key: 'analysis', label: 'Analysis', icon: BarChart3 },
];

const METRICS = [
  ['totalArticles', 'Articles', Database],
  ['attemptedPages', 'Attempted', Activity],
  ['savedPages', 'Saved', CheckCircle2],
  ['updatedPages', 'Updated', RefreshCw],
  ['skippedPages', 'Skipped', Filter],
  ['failedPages', 'Failed', AlertTriangle],
];

const ARTICLE_PAGE_SIZE = 40;
const ARTICLE_FILTER_STORAGE_KEY = 'scraperGlobalArticleFilters';
const EMPTY_ARTICLE_FILTERS = { q: '', country: '', source: '', topic: '', from: '', to: '' };

function scraperApiBaseUrl() {
  return String(import.meta.env.VITE_SCRAPER_API_BASE_URL || '').trim().replace(/\/+$/, '');
}

function scraperApi(path, options) {
  const baseUrl = scraperApiBaseUrl();
  if (!baseUrl) {
    throw new Error('Set VITE_SCRAPER_API_BASE_URL in the frontend environment to connect this dashboard to the scraper API.');
  }
  const url = `${baseUrl}${path}`;
  return fetch(url, options).then(async (response) => {
    const text = await response.text();
    let data = {};
    if (text.trim()) {
      try {
        data = JSON.parse(text);
      } catch (_error) {
        throw new Error(`Scraper API returned non-JSON response for ${path}.`);
      }
    } else if (!response.ok) {
      throw new Error(`Scraper API returned empty error response for ${path}.`);
    }
    if (!response.ok) throw new Error(data.reason || data.error || `Request failed: ${response.status}`);
    return data;
  }).catch((error) => {
    if (error instanceof TypeError) {
      throw new Error('Scraper API is not reachable. Check VITE_SCRAPER_API_BASE_URL and make sure the scraper API is running.');
    }
    throw error;
  });
}

function articleId(article) {
  return article.urlHash || article.contentHash || article.canonicalHash || '';
}

function articleSortDate(article) {
  return article?.publishedAt || article?.fetchedAt || article?.lastScrapedAt || article?.updatedAt || article?.createdAt || '';
}

function latestFirstArticles(items) {
  return [...(items || [])].sort((a, b) => String(articleSortDate(b)).localeCompare(String(articleSortDate(a))));
}

function formatDate(value) {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-SG', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function validDateRange(fromDate, toDate) {
  if (!fromDate || !toDate) return true;
  return new Date(fromDate).getTime() <= new Date(toDate).getTime();
}

function loadSavedArticleFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem(ARTICLE_FILTER_STORAGE_KEY) || '{}');
    return { ...EMPTY_ARTICLE_FILTERS, ...saved };
  } catch (_error) {
    return EMPTY_ARTICLE_FILTERS;
  }
}

function runDuration(status) {
  if (status.durationSeconds != null) return formatDuration(status.durationSeconds);
  if (!status.startedAt) return '-';
  const started = new Date(status.startedAt);
  if (Number.isNaN(started.getTime())) return '-';
  const end = status.finishedAt ? new Date(status.finishedAt) : new Date();
  if (Number.isNaN(end.getTime())) return '-';
  return formatDuration((end.getTime() - started.getTime()) / 1000);
}

function host(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_error) {
    return '';
  }
}

function normalizeHost(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .toLowerCase();
}

function articleTextPreview(article) {
  const text = String(article.summary || article.content || '').replace(/\s+/g, ' ').trim();
  return text || 'No content available yet. Re-run the scraper to update this older record.';
}

function titleCaseLabel(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function articleChips(article) {
  const values = [
    article.businessCategory || article.category || article.section,
    article.intent || article.signal || article.subTopic || article.topic,
  ].filter(Boolean);
  return [...new Set(values.map(titleCaseLabel).filter(Boolean))].slice(0, 2);
}

function articleTrust(article, sourceTrustMap = {}) {
  const articleHost = normalizeHost(article.sourceDomain || host(article.url));
  const articleSource = String(article.source || '').trim().toLowerCase();
  const mapped = sourceTrustMap[articleHost] || sourceTrustMap[articleSource];
  if (mapped) {
    return {
      key: mapped,
      label: mapped === 'high' ? 'High' : mapped === 'low' ? 'Low' : 'Moderate',
    };
  }
  const value = String(
    article.sourceTrust
    || article.trustLevel
    || article.trust
    || article.sourceQuality
    || article.reliability
    || ''
  ).toLowerCase();
  if (value.includes('high') || value === 'trusted' || value === 'good') return { key: 'high', label: 'High' };
  if (value.includes('low') || value.includes('poor') || value.includes('weak')) return { key: 'low', label: 'Low' };
  return { key: 'moderate', label: 'Moderate' };
}

function sourceTrustMapFromRegistry(registry = []) {
  const map = {};
  registry.forEach((item) => {
    const credibility = ['high', 'moderate', 'low'].includes(item?.credibility) ? item.credibility : 'moderate';
    const domain = normalizeHost(item?.sourceType);
    const name = String(item?.name || '').trim().toLowerCase();
    const id = String(item?.sourceId || '').trim().toLowerCase();
    if (domain) map[domain] = credibility;
    if (name) map[name] = credibility;
    if (id) map[id] = credibility;
  });
  return map;
}

function normalizeSavedRunForm(params = {}, catalog = {}, fallback = {}) {
  const topics = Array.isArray(params.topics) && params.topics.length
    ? params.topics
    : (Array.isArray(fallback.topics) && fallback.topics.length ? fallback.topics : (catalog.topics || []));
  const countries = Array.isArray(params.countries) && params.countries.length
    ? params.countries
    : (Array.isArray(fallback.countries) && fallback.countries.length ? fallback.countries : (catalog.countries || []).slice(0, 1));
  const savedCountryTopics = params.countryTopics && typeof params.countryTopics === 'object' ? params.countryTopics : {};
  const countryTopics = {};
  countries.forEach((country) => {
    const savedTopics = Array.isArray(savedCountryTopics[country]) ? savedCountryTopics[country] : [];
    const supported = catalog.countryTopics?.[country] || topics;
    countryTopics[country] = savedTopics.length
      ? savedTopics
      : topics.filter((topic) => supported.includes(topic));
  });
  const hasDateRange = Boolean(params.fromDate || params.toDate);

  return {
    mode: params.mode || (hasDateRange ? 'range' : (fallback.mode || 'days')),
    days: params.days ?? fallback.days ?? 7,
    fromDate: params.fromDate || fallback.fromDate || '',
    toDate: params.toDate || fallback.toDate || '',
    countries,
    topics,
    countryTopics,
    onlySources: params.onlySources ?? fallback.onlySources ?? '',
    sourceDomainsByCountry: fallback.sourceDomainsByCountry || {},
    incremental: params.incremental ?? fallback.incremental ?? true,
    forceRescan: params.forceRescan ?? fallback.forceRescan ?? false,
  };
}

export default function ScraperDashboard({ activeTab = 'scraper' }) {
  const [summary, setSummary] = useState({});
  const [articles, setArticles] = useState([]);
  const [analysisArticles, setAnalysisArticles] = useState([]);
  const [sourceTrustMap, setSourceTrustMap] = useState({});
  const [reports, setReports] = useState([]);
  const [status, setStatus] = useState({});
  const [config, setConfig] = useState({});
  const [selected, setSelected] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [articlesMeta, setArticlesMeta] = useState({ total: 0, hasMore: false, page: 1, filters: { countries: [], topics: [], sources: [] } });
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(loadSavedArticleFilters);
  const [runForm, setRunForm] = useState({ mode: 'days', days: 7, fromDate: '', toDate: '', countries: [], topics: [], countryTopics: {}, onlySources: '', incremental: true, forceRescan: false });
  const [schedule, setSchedule] = useState(null);
  const statusRunningRef = useRef(false);
  const didMountFilterEffectRef = useRef(false);
  const articleRequestSeqRef = useRef(0);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if ((key === 'from' || key === 'to') && !validDateRange(filters.from, filters.to)) return;
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [filters]);

  const countryOptions = articlesMeta.filters?.countries?.length ? articlesMeta.filters.countries : Object.keys(summary.byCountry || {}).sort();
  const sourceOptions = articlesMeta.filters?.sources?.length
    ? articlesMeta.filters.sources
    : Object.keys(summary.bySource || {}).sort().map((source) => ({ id: source, name: source }));
  const topicOptions = articlesMeta.filters?.topics?.length ? articlesMeta.filters.topics : Object.keys(summary.byTopic || {}).sort();

  async function loadArticles(page = 1, append = false) {
    const requestSeq = ++articleRequestSeqRef.current;
    setError('');
    if (append) setLoadingMore(true);
    else setLoading(true);
    const articleQuery = new URLSearchParams(query);
    articleQuery.set('page', String(page));
    articleQuery.set('limit', String(ARTICLE_PAGE_SIZE));
    const articleData = await scraperApi(`/api/articles?${articleQuery.toString()}`);
    if (requestSeq !== articleRequestSeqRef.current) return;
    const nextArticles = append ? [...articles, ...latestFirstArticles(articleData.items || [])] : latestFirstArticles(articleData.items || []);
    setArticles(nextArticles);
    setArticlesMeta({
      total: articleData.total || 0,
      hasMore: Boolean(articleData.hasMore),
      page: articleData.page || page,
      filters: articleData.filters || articlesMeta.filters || { countries: [], topics: [], sources: [] },
    });
    setSelectedIds((current) => new Set([...current].filter((id) => nextArticles.some((item) => articleId(item) === id))));
    setLoading(false);
    setLoadingMore(false);
  }

  async function loadData(page = 1, append = false) {
    const requestSeq = ++articleRequestSeqRef.current;
    setError('');
    if (append) setLoadingMore(true);
    else setLoading(true);
    const articleQuery = new URLSearchParams(query);
    articleQuery.set('page', String(page));
    articleQuery.set('limit', String(ARTICLE_PAGE_SIZE));
    const [summaryData, articleData, analysisData, reportData, statusData, configData, scheduleData, platformConfigData, settingsData] = await Promise.all([
      scraperApi('/api/summary'),
      scraperApi(`/api/articles?${articleQuery.toString()}`),
      scraperApi('/api/analysis-articles?limit=10000'),
      scraperApi('/api/reports'),
      scraperApi('/api/run-status'),
      scraperApi('/api/config'),
      scraperApi('/api/schedule'),
      api.get('/admin/super/fetch/config').then((res) => res.data).catch(() => ({ config: {}, sourceCatalog: {} })),
      api.get('/admin/settings').then((res) => res.data).catch(() => ({ sourceTrust: { registry: [] } })),
    ]);
    const mergedCatalog = {
      ...(configData.catalog || {}),
      countries: Array.from(new Set([
        ...(configData.catalog?.countries || [])
      ])),
      countryTopics: {
        ...(configData.catalog?.countryTopics || {})
      },
      sourceDomainsByCountry: {}
    };
    setSummary(summaryData);
    setAnalysisArticles(analysisData.items || []);
    setSourceTrustMap(sourceTrustMapFromRegistry(settingsData.sourceTrust?.registry || []));
    let nextArticles = articles;
    if (requestSeq === articleRequestSeqRef.current) {
      nextArticles = append ? [...articles, ...latestFirstArticles(articleData.items || [])] : latestFirstArticles(articleData.items || []);
      setArticles(nextArticles);
      setArticlesMeta({
        total: articleData.total || 0,
        hasMore: Boolean(articleData.hasMore),
        page: articleData.page || page,
        filters: articleData.filters || { countries: [], topics: [], sources: [] },
      });
      setSelectedIds((current) => new Set([...current].filter((id) => nextArticles.some((item) => articleId(item) === id))));
    }
    setReports(reportData.items || []);
    setStatus(statusData);
    setConfig({ ...configData, catalog: mergedCatalog });
    setSchedule(scheduleData);
    const statusParams = statusData?.params || {};
    const scheduleParams = scheduleData?.params || {};
    const savedParams = {
      ...statusParams,
      ...scheduleParams,
      fromDate: scheduleParams.fromDate || statusParams.fromDate || '',
      toDate: scheduleParams.toDate || statusParams.toDate || '',
      mode: scheduleParams.mode || statusParams.mode || '',
      days: scheduleParams.days || statusParams.days || '',
    };
    setRunForm((current) => normalizeSavedRunForm(savedParams, mergedCatalog, {
      ...current,
      fromDate: savedParams.fromDate || current.fromDate || configData.defaultFromDate || '',
      toDate: savedParams.toDate || current.toDate || configData.defaultToDate || '',
      sourceDomainsByCountry: {},
    }));
    setLoading(false);
    setLoadingMore(false);
  }

  useEffect(() => {
    loadData().catch((err) => {
      setError(err.message);
      setLoading(false);
      setLoadingMore(false);
    });
  }, []);

  useEffect(() => {
    if (!didMountFilterEffectRef.current) {
      didMountFilterEffectRef.current = true;
      return;
    }
    localStorage.setItem(ARTICLE_FILTER_STORAGE_KEY, JSON.stringify(filters));
    loadArticles().catch((err) => {
      setError(err.message);
      setLoading(false);
      setLoadingMore(false);
    });
  }, [query]);

  useEffect(() => {
    const timer = setInterval(() => {
      scraperApi('/api/run-status').then((nextStatus) => {
        const wasRunning = statusRunningRef.current;
        statusRunningRef.current = Boolean(nextStatus.running);
        setStatus(nextStatus);
        if (wasRunning && !nextStatus.running) loadData().catch(() => {});
      }).catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [query]);

  async function runScraper() {
    if (!runForm.countries?.length || !runForm.topics?.length) {
      setError('Select at least one country and one topic before running the scraper.');
      return;
    }
    if (runForm.mode === 'days') {
      const days = Number(runForm.days);
      if (!Number.isInteger(days) || days < 1 || days > 730) {
        setError('Last days must be a number between 1 and 730.');
        return;
      }
    }
    if (runForm.mode === 'range') {
      if (!runForm.fromDate || !runForm.toDate) {
        setError('Select both From and To dates before running the scraper.');
        return;
      }
      if (!validDateRange(runForm.fromDate, runForm.toDate)) {
        setError('From date cannot be after To date.');
        return;
      }
    }
    setError('');
    const basePayload = {
      countries: runForm.countries,
      topics: runForm.topics,
      countryTopics: runForm.countryTopics,
      sourceDomainsByCountry: config.catalog?.sourceDomainsByCountry || runForm.sourceDomainsByCountry || {},
      onlySources: runForm.onlySources,
      incremental: runForm.incremental,
      forceRescan: runForm.forceRescan,
    };
    const payload = runForm.mode === 'days'
      ? { ...basePayload, mode: 'days', days: runForm.days }
      : { ...basePayload, mode: 'range', fromDate: runForm.fromDate, toDate: runForm.toDate };
    await saveSchedule({
      ...(schedule || {}),
      params: {
        countries: runForm.countries,
        topics: runForm.topics,
        countryTopics: runForm.countryTopics,
        days: runForm.days,
        mode: runForm.mode,
        fromDate: runForm.fromDate,
        toDate: runForm.toDate,
        onlySources: runForm.onlySources,
        incremental: runForm.incremental,
        forceRescan: runForm.forceRescan,
      },
    });
    const result = await scraperApi('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    statusRunningRef.current = true;
    setStatus({ running: true, startedAt: new Date().toISOString(), params: result.params });
  }

  async function runPlatformFetch() {
    if (!runForm.countries?.length || !runForm.topics?.length) {
      setError('Select at least one country and one topic before running fetch.');
      return;
    }
    if (runForm.mode === 'range' && !validDateRange(runForm.fromDate, runForm.toDate)) {
      setError('From date cannot be after To date.');
      return;
    }
    setError('');
    const rangeStart = new Date(runForm.fromDate || Date.now()).getTime();
    const rangeEnd = new Date(runForm.toDate || Date.now()).getTime();
    const rangeDays = Number.isFinite(rangeStart) && Number.isFinite(rangeEnd)
      ? Math.max(1, Math.ceil((rangeEnd - rangeStart) / (24 * 60 * 60 * 1000)) + 1)
      : 7;
    const days = runForm.mode === 'days' ? Number(runForm.days || 7) : rangeDays;
    await api.post('/admin/super/fetch/run', {
      config: {
        countries: runForm.countries,
        topics: runForm.topics,
        sourceDomainsByCountry: config.catalog?.sourceDomainsByCountry || runForm.sourceDomainsByCountry || {},
        days,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
      },
    });
  }

  async function runScraperAndFetch() {
    const scraperPromise = status.running ? Promise.resolve() : runScraper();
    await Promise.all([scraperPromise, runPlatformFetch()]);
  }

  async function saveSchedule(nextSchedule) {
    const saved = await scraperApi('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextSchedule),
    });
    setSchedule(saved);
  }

  async function stopScraper() {
    await scraperApi('/api/stop', { method: 'POST' });
    const nextStatus = await scraperApi('/api/run-status');
    setStatus(nextStatus);
    await loadData();
  }

  async function deleteOne(article) {
    const id = articleId(article);
    if (!id) return;
    if (!window.confirm('Delete this article from scraper output and MongoDB if configured?')) return;
    await scraperApi(`/api/articles/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setSelected(null);
    await loadData();
  }

  async function deleteSelected() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} selected article(s)?`)) return;
    await scraperApi('/api/articles/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    setSelectedIds(new Set());
    setSelected(null);
    await loadData();
  }

  async function clearData(clearMongo) {
    const message = clearMongo
      ? 'This will delete all scraper output files and all documents in the configured Mongo collection. Continue?'
      : 'This will clear local scraper output files only. Continue?';
    if (!window.confirm(message)) return;
    await scraperApi('/api/clear-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clearMongo }),
    });
    setSelectedIds(new Set());
    setSelected(null);
    await loadData();
  }

  function toggleSelected(id) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    const allVisible = articles.map(articleId).filter(Boolean);
    const allSelected = allVisible.length && allVisible.every((id) => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(allVisible));
  }

  function loadMoreArticles() {
    if (loading || loadingMore || !articlesMeta.hasMore) return;
    loadArticles((articlesMeta.page || 1) + 1, true).catch((err) => {
      setError(err.message);
      setLoadingMore(false);
    });
  }

  return (
    <main className="scraper-dashboard text-ink-900">
      <section className="scraper-dashboard-shell flex flex-col gap-5">
        {error ? <div className="alert alert-danger">{error}</div> : null}
        {activeTab !== 'scraper' && !(activeTab === 'analysis' && loading) ? <MetricGrid summary={summary} /> : null}

        {activeTab === 'scraper' && loading ? (
          <ScraperLoadingState />
        ) : activeTab === 'scraper' ? (
          <ScraperTab
            runForm={runForm}
            setRunForm={setRunForm}
            status={status}
            config={config}
            schedule={schedule}
            onSaveSchedule={saveSchedule}
            reports={reports}
            onRun={runScraper}
            onRunFetch={runPlatformFetch}
            onRunBoth={runScraperAndFetch}
            onStop={stopScraper}
            onClearData={clearData}
          />
        ) : null}

        {activeTab === 'articles' ? (
          <ArticlesTab
            articles={articles}
            loading={loading}
          filters={filters}
          setFilters={(next) => {
            const nextFilters = typeof next === 'function' ? next(filters) : next;
            setFilters({ ...EMPTY_ARTICLE_FILTERS, ...nextFilters });
          }}
            countries={countryOptions}
            sources={sourceOptions}
            topics={topicOptions}
            total={articlesMeta.total}
            hasMore={articlesMeta.hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMoreArticles}
            selected={selected}
            setSelected={setSelected}
            selectedIds={selectedIds}
            sourceTrustMap={sourceTrustMap}
            toggleSelected={toggleSelected}
            selectAllVisible={selectAllVisible}
            deleteSelected={deleteSelected}
            deleteOne={deleteOne}
          />
        ) : null}

        {activeTab === 'analysis' && loading ? (
          <AnalysisLoadingState />
        ) : activeTab === 'analysis' ? (
          <AnalysisTab summary={summary} reports={reports} articles={analysisArticles} />
        ) : null}
      </section>
    </main>
  );
}

function Header({ status, onRefresh, onRun, onStop }) {
  return (
    <header className="scraper-page-header flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-4">
        <span className="scraper-header-icon flex items-center justify-center">
          <Globe2 size={22} />
        </span>
        <div>
          <div className="scraper-eyebrow">Beesocial Intelligence</div>
          <h1 className="scraper-page-title mt-1">Scraper Control Center</h1>
          <p className="mt-1 text-sm font-semibold text-gray-500">Run scraping, review global articles, and monitor source performance.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-secondary" type="button" onClick={onRefresh}><RefreshCw size={16} /> Refresh</button>
        {status.running ? (
          <button className="btn-danger" type="button" onClick={onStop}><Square size={16} /> Stop Scrape</button>
        ) : (
          <button className="btn-primary" type="button" onClick={onRun}><Play size={16} /> Run Scraper</button>
        )}
      </div>
    </header>
  );
}

function TabBar({ activeTab, setActiveTab }) {
  return (
    <nav className="tabs-shell">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.key;
        return (
          <button key={tab.key} type="button" className={`tab-button ${active ? 'active' : ''}`} onClick={() => setActiveTab(tab.key)}>
            <Icon size={16} /> {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

function MetricGrid({ summary }) {
  return (
    <section className="scraper-metric-grid grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      {METRICS.map(([key, label, Icon]) => (
        <div key={key} className="stat-card">
          <span className="stat-icon"><Icon size={17} /></span>
          <div>
            <p>{label}</p>
            <strong>{Number(summary[key] || 0).toLocaleString()}</strong>
          </div>
        </div>
      ))}
    </section>
  );
}

function ScraperTab({ runForm, setRunForm, status, config, schedule, onSaveSchedule, reports, onRun, onRunFetch, onRunBoth, onStop, onClearData }) {
  const [autosaveStatus, setAutosaveStatus] = useState('saved');
  const autosaveReadyRef = useRef(false);
  const catalog = config.catalog || {};
  const countries = Array.from(new Set([
    ...(catalog.countries || [])
  ]))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const topics = catalog.topics || [];
  const topicLabels = { news: 'News', govt: 'Government updates', competitor: 'Competitor intel', evergreen: 'Evergreen guides' };
  const selectedCountries = (runForm.countries || []).filter((country) => countries.includes(country));
  const selectedCountryTopics = runForm.countryTopics || {};
  const selectedTopics = runForm.topics || [];
  const canRun = selectedCountries.length > 0 && selectedTopics.length > 0;

  useEffect(() => {
    const currentCountries = runForm.countries || [];
    const nextCountries = currentCountries.filter((country) => countries.includes(country));
    const nextCountryTopics = Object.fromEntries(
      Object.entries(runForm.countryTopics || {}).filter(([country]) => countries.includes(country))
    );
    if (nextCountries.length !== currentCountries.length || Object.keys(nextCountryTopics).length !== Object.keys(runForm.countryTopics || {}).length) {
      setRunForm({ ...runForm, countries: nextCountries, countryTopics: nextCountryTopics });
    }
  }, [countries.join('|')]);

  function updateCountry(country) {
    const exists = selectedCountries.includes(country);
    const nextCountries = exists ? selectedCountries.filter((item) => item !== country) : [...selectedCountries, country];
    const nextCountryTopics = { ...selectedCountryTopics };
    if (exists) delete nextCountryTopics[country];
    else nextCountryTopics[country] = catalog.countryTopics?.[country] || topics.filter((topic) => topic !== 'evergreen');
    setRunForm({ ...runForm, countries: nextCountries, countryTopics: nextCountryTopics });
  }

  function updateCountryTopic(country, topic) {
    const current = selectedCountryTopics[country] || [];
    const next = current.includes(topic) ? current.filter((item) => item !== topic) : [...current, topic];
    const nextCountries = selectedCountries.includes(country) ? selectedCountries : [...selectedCountries, country];
    setRunForm({
      ...runForm,
      countries: nextCountries,
      countryTopics: { ...selectedCountryTopics, [country]: next },
      topics: [...new Set([...(runForm.topics || []), topic])],
    });
  }

  function updateGlobalTopic(topic) {
    const nextTopics = selectedTopics.includes(topic) ? selectedTopics.filter((item) => item !== topic) : [...selectedTopics, topic];
    const nextCountryTopics = {};
    selectedCountries.forEach((country) => {
      const supported = catalog.countryTopics?.[country] || topics;
      nextCountryTopics[country] = nextTopics.filter((item) => supported.includes(item));
    });
    setRunForm({ ...runForm, topics: nextTopics, countryTopics: nextCountryTopics });
  }

  const scheduleParams = useMemo(() => ({
    countries: selectedCountries,
    topics: selectedTopics,
    countryTopics: selectedCountryTopics,
    days: runForm.days,
    mode: runForm.mode,
    fromDate: runForm.fromDate,
    toDate: runForm.toDate,
    onlySources: runForm.onlySources,
    incremental: runForm.incremental,
    forceRescan: runForm.forceRescan,
  }), [selectedCountries.join('|'), selectedTopics.join('|'), JSON.stringify(selectedCountryTopics), runForm.days, runForm.mode, runForm.fromDate, runForm.toDate, runForm.onlySources, runForm.incremental, runForm.forceRescan]);
  const currentSchedule = schedule || {};

  const saveSettings = async () => {
    setAutosaveStatus('saving');
    try {
      await onSaveSchedule({ ...currentSchedule, params: scheduleParams });
      setAutosaveStatus('saved');
    } catch (_error) {
      setAutosaveStatus('error');
    }
  };

  useEffect(() => {
    if (!selectedCountries.length || !selectedTopics.length) return undefined;
    if (!autosaveReadyRef.current) {
      autosaveReadyRef.current = true;
      return undefined;
    }
    setAutosaveStatus('pending');
    const timer = window.setTimeout(() => {
      saveSettings();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [scheduleParams]);

  return (
    <section className="scraper-workspace-grid grid gap-5">
      <section className="scraper-main-column">
        <section className="card-shell p-4">
          <div className="scraper-fetch-header mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="scraper-header-icon scraper-fetch-icon"><Globe2 size={18} /></span>
              <div>
                <div className="scraper-eyebrow">Source Scraper</div>
                <h2 className="text-base font-black text-gray-950">Master Data Scraper</h2>
                <p className="text-xs font-bold text-gray-400">Collect raw articles from trusted sources into the scraper master database.</p>
              </div>
            </div>
            <span className={`status-pill ${status.running ? 'status-running' : 'status-idle'}`}>{status.running ? 'Running' : 'Idle'}</span>
          </div>
          <div className="grid gap-3">
            <div className="config-panel">
              <div className="config-label">Countries</div>
              <div className="choice-grid">
                {countries.map((country) => (
                  <label key={country} className={`choice-card ${selectedCountries.includes(country) ? 'active' : ''}`}>
                    <input type="checkbox" checked={selectedCountries.includes(country)} onChange={() => updateCountry(country)} />
                    <span>{country}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="scraper-fetch-controls">
              <div>
                <div className="config-label">Topics</div>
                <div className="topic-list">
                  {topics.map((topic) => (
                    <label key={topic} className={`choice-card ${selectedTopics.includes(topic) ? 'active' : ''}`}>
                      <input type="checkbox" checked={selectedTopics.includes(topic)} onChange={() => updateGlobalTopic(topic)} />
                      <span>{topicLabels[topic] || topic}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="config-label">Data age</div>
                <div className="segmented">
                  <button type="button" className={runForm.mode === 'days' ? 'active' : ''} onClick={() => setRunForm({ ...runForm, mode: 'days' })}>Last days</button>
                  <button type="button" className={runForm.mode === 'range' ? 'active' : ''} onClick={() => setRunForm({ ...runForm, mode: 'range' })}>Date range</button>
                </div>
                {runForm.mode === 'days' ? (
                  <label className="field mt-2"><input type="number" min="1" max="730" value={runForm.days} onChange={(e) => setRunForm({ ...runForm, days: e.target.value })} /></label>
                ) : (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="field"><input type="date" value={runForm.fromDate} max={runForm.toDate || undefined} onChange={(e) => setRunForm({ ...runForm, fromDate: e.target.value })} /></label>
                    <label className="field"><input type="date" value={runForm.toDate} min={runForm.fromDate || undefined} onChange={(e) => setRunForm({ ...runForm, toDate: e.target.value })} /></label>
                  </div>
                )}
              </div>
              <label className="field"><span>Only sources</span><input value={runForm.onlySources} placeholder="Source names" onChange={(e) => setRunForm({ ...runForm, onlySources: e.target.value })} /></label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="clear-check">
                <input type="checkbox" checked={runForm.incremental !== false} onChange={(event) => setRunForm({ ...runForm, incremental: event.target.checked, forceRescan: event.target.checked ? runForm.forceRescan : false })} />
                <span>Skip already scraped URLs</span>
              </label>
              <label className="clear-check">
                <input type="checkbox" checked={Boolean(runForm.forceRescan)} onChange={(event) => setRunForm({ ...runForm, forceRescan: event.target.checked, incremental: event.target.checked ? false : runForm.incremental })} />
                <span>Full source rescan</span>
              </label>
            </div>
            <section className="schedule-box">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="config-label">Scheduler</div>
                  <h3>Automatic source scraping</h3>
                </div>
                <label className="clear-check">
                  <input type="checkbox" checked={Boolean(currentSchedule.enabled)} onChange={(event) => onSaveSchedule({ ...currentSchedule, enabled: event.target.checked, params: scheduleParams })} />
                  <span>Enable</span>
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="field"><span>Frequency</span><select value={currentSchedule.frequency || 'daily'} onChange={(e) => onSaveSchedule({ ...currentSchedule, frequency: e.target.value, params: scheduleParams })}><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
                <label className="field"><span>Time</span><input type="time" value={currentSchedule.time || '07:00'} onChange={(e) => onSaveSchedule({ ...currentSchedule, time: e.target.value, params: scheduleParams })} /></label>
                <label className="field"><span>Timezone</span><select value={currentSchedule.timezone || 'Asia/Calcutta'} onChange={(e) => onSaveSchedule({ ...currentSchedule, timezone: e.target.value, params: scheduleParams })}><option value="Asia/Calcutta">Asia/Calcutta</option><option value="Asia/Singapore">Asia/Singapore</option><option value="Asia/Hong_Kong">Asia/Hong_Kong</option><option value="UTC">UTC</option></select></label>
              </div>
              <div className="schedule-status">
                <span>{currentSchedule.enabled ? 'Enabled' : 'Disabled'}</span>
                <strong>{currentSchedule.lastRunAt ? `Last scheduled run ${formatDate(currentSchedule.lastRunAt)}` : 'No scheduled run yet'}</strong>
              </div>
            </section>
            <div className="fetch-action-bar">
              <div>
                <strong>{selectedCountries.length} countries, {selectedTopics.length} source topics selected</strong>
                <span>Raw source pages are crawled and saved into the master database</span>
                <em className={`autosave-status autosave-${autosaveStatus}`}>
                  {autosaveStatus === 'saving' ? 'Saving changes...'
                    : autosaveStatus === 'pending' ? 'Changes will save automatically'
                      : autosaveStatus === 'error' ? 'Autosave failed'
                        : 'Changes saved'}
                </em>
              </div>
              <div className="fetch-action-buttons">
                <button className="btn-secondary" type="button" onClick={saveSettings}><Save size={14} /> Save</button>
                {status.running ? (
                  <>
                    <button className="btn-secondary" type="button" onClick={onRunFetch} disabled={!canRun}><Database size={14} /> Run fetch</button>
                    <button className="btn-danger" type="button" onClick={onStop}><Square size={14} /> Stop Scrape</button>
                  </>
                ) : (
                  <>
                    <button className="btn-secondary" type="button" onClick={onRun} disabled={!canRun}><RefreshCw size={14} /> Run scraper</button>
                    <button className="btn-primary" type="button" onClick={onRunBoth} disabled={!canRun}><Play size={14} /> Run scraper + fetch</button>
                  </>
                )}
              </div>
            </div>
            <div className="rounded-2xl bg-brand-pink/60 p-3 text-xs font-bold leading-relaxed text-brand-crimson ring-1 ring-brand-crimson/10">
              <div className="flex items-center gap-2"><CalendarDays size={14} /> Default: {config.defaultFromDate || '-'} to {config.defaultToDate || '-'}</div>
              {status.params?.fromDate ? <div className="mt-1">Last run: {status.params.fromDate} to {status.params.toDate}</div> : null}
            </div>
          </div>
        </section>
        <LiveRunPanel status={status} />
      </section>
      <section className="scraper-side-rail">
        <ReportSection reports={reports} />
      </section>
    </section>
  );
}

function LiveRunPanel({ status }) {
  const events = status.events || [];
  const counts = status.liveCounts || {};
  const visibleEvents = [...events].reverse().slice(0, 80);
  const hasFinished = Boolean(status.finishedAt || status.durationSeconds != null || events.length);
  const failedCount = Number(counts.failed || 0);
  const completionState = status.running ? 'running' : hasFinished ? (failedCount ? 'issues' : 'complete') : 'idle';
  const completionLabel = {
    running: 'Live',
    complete: 'Completed',
    issues: 'Completed with issues',
    idle: 'Idle',
  }[completionState];
  return (
    <section className={`card-shell live-run-panel overflow-hidden ${completionState}`}>
      <div className="flex flex-col gap-2 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="scraper-eyebrow">Last run</div>
          <h2 className="text-base font-black text-gray-950">
            {completionState === 'complete' ? 'Scraping complete' : completionState === 'issues' ? 'Scraping completed with issues' : 'Latest scraper activity'}
          </h2>
          <p className="text-xs font-bold text-gray-400">
            {status.running ? `Crawling${status.currentSource ? `: ${status.currentSource}` : ''}` : 'Latest source crawl activity'}
          </p>
        </div>
        <span className={`status-pill run-state-${completionState}`}>{completionLabel}</span>
      </div>
      {!status.running && hasFinished ? (
        <div className={`run-complete-banner ${failedCount ? 'issues' : 'complete'}`}>
          <CheckCircle2 size={16} />
          <span>
            Scraping complete: {Number(counts.inserted || 0).toLocaleString()} inserted, {Number(counts.updated || 0).toLocaleString()} updated, {Number(counts.skipped || 0).toLocaleString()} skipped.
          </span>
        </div>
      ) : null}
      <div className="live-count-grid">
        <LiveCount label={status.running ? 'Elapsed' : 'Duration'} value={runDuration(status)} />
        <LiveCount label="Inserted" value={counts.inserted} />
        <LiveCount label="Updated" value={counts.updated} />
        <LiveCount label="Duplicates" value={counts.duplicates} />
        <LiveCount label="Skipped" value={counts.skipped} />
        <LiveCount label="Failed" value={counts.failed} danger />
      </div>
      <div className="live-feed">
        {visibleEvents.length ? visibleEvents.map((event, index) => (
          <LiveEvent key={`${event.time}-${index}`} event={event} />
        )) : (
          <div className="live-empty">Run scraper to see insert, skip, duplicate, and fail events here.</div>
        )}
      </div>
    </section>
  );
}

function LiveCount({ label, value, danger = false }) {
  const displayValue = typeof value === 'number' ? Number(value || 0) : (value || 0);
  return (
    <div className={danger ? 'live-count danger' : 'live-count'}>
      <span>{label}</span>
      <strong>{displayValue}</strong>
    </div>
  );
}

function LiveEvent({ event }) {
  const tone = {
    insert: 'good',
    update: 'good',
    duplicate: 'neutral',
    cleanup: 'neutral',
    enriched: 'neutral',
    skip: 'warn',
    fail: 'bad',
    source: 'source',
    stop: 'bad',
    kept: 'neutral',
    commit: 'source',
  }[event.kind] || 'neutral';
  const label = {
    insert: 'Inserted',
    update: 'Updated',
    duplicate: 'Duplicate',
    cleanup: 'Cleaned',
    enriched: 'Enriched',
    file_only: 'File only',
    skip: 'Skipped',
    fail: 'Failed',
    source: 'Source',
    candidate: 'Candidates',
    sitemap: 'Sitemap',
    start_url: 'Start URL',
    stop: 'Stopped',
    kept: 'Queued',
    commit: 'Saving',
  }[event.kind] || event.kind;
  return (
    <article className={`live-event ${tone}`}>
      <span className="live-event-badge">{label}</span>
      <div className="min-w-0">
        <h3>{event.kind === 'source' ? event.label : event.title || event.message}</h3>
        {event.reason || event.url || event.message ? (
          <p>{event.reason ? `${event.reason}${event.url ? ` | ${event.url}` : ''}` : event.url || event.message}</p>
        ) : null}
      </div>
    </article>
  );
}

function ArticlesTab(props) {
  const {
    articles, loading, filters, setFilters, countries, sources, topics, total, hasMore, loadingMore, onLoadMore,
    selected, setSelected, selectedIds, sourceTrustMap, toggleSelected, selectAllVisible, deleteSelected, deleteOne,
  } = props;
  const loadMoreRef = useRef(null);
  const resetFilters = () => {
    localStorage.removeItem(ARTICLE_FILTER_STORAGE_KEY);
    setFilters(EMPTY_ARTICLE_FILTERS);
  };

  useEffect(() => {
    if (!loadMoreRef.current || !hasMore) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
    }, { rootMargin: '500px' });
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore]);

  return (
    <>
      <section className="space-y-4">
        <section className="article-toolbar">
          <div className="grid min-w-0 flex-1 gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_200px_180px] xl:grid-cols-[minmax(260px,1fr)_180px_200px_180px_170px_170px]">
            <label className="field">
              <span>Search</span>
              <div className="input-with-icon"><Search size={15} /><input value={filters.q} placeholder="Title, summary, source..." onChange={(e) => setFilters({ ...filters, q: e.target.value })} /></div>
            </label>
            <label className="field"><span>Country</span><select value={filters.country} onChange={(e) => setFilters({ ...filters, country: e.target.value, source: '', topic: '' })}><option value="">All countries</option>{countries.map((country) => <option key={country} value={country}>{country}</option>)}</select></label>
            <label className="field"><span>Source</span><select value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })}><option value="">All sources</option>{sources.map((source) => <option key={source.id || source} value={source.id || source}>{source.name || source}</option>)}</select></label>
            <label className="field"><span>Topic</span><select value={filters.topic} onChange={(e) => setFilters({ ...filters, topic: e.target.value, source: '' })}><option value="">All topics</option>{topics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}</select></label>
            <label className="field"><span>From</span><input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
            <label className="field"><span>To</span><input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
          </div>
          <div className="toolbar-actions">
            <button className="btn-secondary" type="button" onClick={resetFilters}>Reset</button>
            <button className="btn-secondary" type="button" onClick={selectAllVisible}>Select visible</button>
            <button className="btn-danger" type="button" onClick={deleteSelected} disabled={!selectedIds.size}><Trash2 size={14} /> Delete {selectedIds.size || ''}</button>
          </div>
        </section>
        <section className="card-shell overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-base font-black text-gray-950">Global Articles</h2><p className="text-xs font-bold text-gray-400">{loading ? 'Loading' : `${articles.length.toLocaleString()} of ${Number(total || 0).toLocaleString()} loaded`}</p></div>
            {selectedIds.size ? <span className="selection-pill">{selectedIds.size} selected</span> : null}
          </div>
          <div className="article-grid">
            {articles.length ? articles.map((article) => (
              <GlobalArticleCard
                key={articleId(article)}
                article={article}
                selected={articleId(selected || {}) === articleId(article)}
                checked={selectedIds.has(articleId(article))}
                sourceTrustMap={sourceTrustMap}
                onCheck={() => toggleSelected(articleId(article))}
                onInspect={() => setSelected(article)}
                onDelete={() => deleteOne(article)}
              />
            )) : loading ? <ArticleLoadingState /> : <EmptyState loading={false} />}
          </div>
          <div ref={loadMoreRef} className="load-more-sentinel">
            {loadingMore ? <span>Loading more articles...</span> : hasMore ? <button className="btn-secondary" type="button" onClick={onLoadMore}>Load more</button> : articles.length ? <span>All matching articles loaded</span> : null}
          </div>
        </section>
      </section>
      <DetailPanel article={selected} onClose={() => setSelected(null)} onDelete={deleteOne} />
    </>
  );
}

function GlobalArticleCard({ article, selected, checked, sourceTrustMap, onCheck, onInspect, onDelete }) {
  const source = article.source || host(article.url) || 'Unknown source';
  const preview = articleTextPreview(article);
  const chips = articleChips(article);
  const topicLabel = titleCaseLabel(article.type || article.intelligenceBucket || 'News articles');
  const trust = articleTrust(article, sourceTrustMap);
  return (
    <article className={`article-library-card trust-${trust.key} ${selected ? 'record-selected' : ''}`} onClick={onInspect}>
      <div className="article-card-top">
        <span className="type-pill">{topicLabel}</span>
        <input className="card-checkbox" type="checkbox" checked={checked} onChange={(event) => { event.stopPropagation(); onCheck(); }} onClick={(event) => event.stopPropagation()} />
      </div>
      {chips.length ? (
        <div className="article-chip-row">
          {chips.map((chip) => <span key={chip} className="article-chip">{chip}</span>)}
        </div>
      ) : null}
      <h3 className="mt-5 line-clamp-3 text-[16px] font-black leading-snug text-gray-950">{article.title || 'Untitled'}</h3>
      <p className="mt-3 line-clamp-3 min-h-[58px] text-sm font-semibold leading-relaxed text-gray-500">{preview}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="meta-pill"><Globe2 size={11} /> {article.country || 'Global'}</span>
        <span className="meta-pill"><Clock3 size={11} /> {formatDate(article.publishedAt || article.fetchedAt)}</span>
      </div>
      <div className={`source-trust-strip trust-${trust.key} mt-4`}>
        <span className="source-trust-domain"><Globe2 size={13} /> {article.sourceDomain || host(article.url) || source}</span>
        <span className="source-trust-level">{trust.label}</span>
      </div>
      <div className="article-card-actions mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
        <button className="btn-danger min-h-[38px]" type="button" onClick={(event) => { event.stopPropagation(); onDelete(); }}><Trash2 size={14} /> Delete</button>
        {article.url ? <a className="source-link" href={article.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Open <ExternalLink size={12} /></a> : null}
      </div>
    </article>
  );
}

function DetailPanel({ article, onClose, onDelete }) {
  if (!article) return null;
  const preview = articleTextPreview(article);
  const content = String(article.content || '').trim();
  return (
    <div className="detail-overlay" onClick={onClose}>
      <aside className="detail-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5">
          <div><h2 className="text-base font-black text-gray-950">Article Detail</h2><p className="text-xs font-bold text-gray-400">Full stored payload</p></div>
          <button className="icon-button" type="button" onClick={onClose}>x</button>
        </div>
        <div className="max-h-[calc(100vh-120px)] overflow-y-auto p-5">
          <span className="type-pill">{article.type || article.intelligenceBucket || 'article'}</span>
          <h3 className="mt-3 text-lg font-black leading-snug text-gray-950">{article.title}</h3>
          <p className="mt-3 text-sm font-semibold leading-relaxed text-gray-500">{preview}</p>
          <div className="mt-4 grid gap-2 text-xs font-bold">
            <InfoRow label="Source" value={article.source || article.sourceDomain} />
            <InfoRow label="Published" value={formatDate(article.publishedAt)} />
            <InfoRow label="Scraped" value={formatDate(article.fetchedAt)} />
            <InfoRow label="Country" value={article.country} />
          </div>
          <section className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <h4 className="text-xs font-black uppercase text-gray-500">Content</h4>
            <p className="mt-2 max-h-[260px] overflow-auto whitespace-pre-wrap text-sm font-semibold leading-relaxed text-gray-700">
              {content || 'Content was not stored for this older article. Run scraper again to update it.'}
            </p>
          </section>
          <div className="mt-4 flex flex-wrap gap-2">
            {article.url ? <a className="btn-secondary" href={article.url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open source</a> : null}
            <button className="btn-danger" type="button" onClick={() => onDelete(article)}><Trash2 size={14} /> Delete</button>
          </div>
          <pre className="mt-4 max-h-[360px] overflow-auto rounded-2xl bg-gray-950 p-4 text-[11px] leading-relaxed text-gray-100">{JSON.stringify(article, null, 2)}</pre>
        </div>
      </aside>
    </div>
  );
}

function AnalysisTab({ summary, reports, articles }) {
  const [selectedCountry, setSelectedCountry] = useState('all');
  const [selectedTopic, setSelectedTopic] = useState('all');
  const [selectedSource, setSelectedSource] = useState('all');
  const articleRows = Array.isArray(articles) ? articles : [];
  const countryOptions = ['all', ...new Set(articleRows.map((item) => item.country || 'Unknown').filter(Boolean))].sort((a, b) => a === 'all' ? -1 : b === 'all' ? 1 : a.localeCompare(b));
  const countryScoped = selectedCountry === 'all' ? articleRows : articleRows.filter((item) => (item.country || 'Unknown') === selectedCountry);
  const topicOptions = ['all', ...new Set(countryScoped.map((item) => item.type || item.intelligenceBucket || 'unknown').filter(Boolean))];
  const topicScoped = selectedTopic === 'all' ? countryScoped : countryScoped.filter((item) => (item.type || item.intelligenceBucket || 'unknown') === selectedTopic);
  const sourceOptions = ['all', ...new Set(topicScoped.map((item) => item.source || item.sourceDomain || 'Unknown').filter(Boolean))].sort((a, b) => a === 'all' ? -1 : b === 'all' ? 1 : a.localeCompare(b));
  const scopedArticles = selectedSource === 'all' ? topicScoped : topicScoped.filter((item) => (item.source || item.sourceDomain || 'Unknown') === selectedSource);
  const total = Math.max(1, scopedArticles.length);
  const countries = groupCount(articleRows, (item) => item.country || 'Unknown');
  const topics = groupCount(countryScoped, (item) => item.type || item.intelligenceBucket || 'unknown');
  const sources = groupCount(topicScoped, (item) => item.source || item.sourceDomain || 'Unknown');
  const dates = groupCount(scopedArticles, (item) => String(item.publishedAt || item.fetchedAt || '').slice(0, 10) || 'unknown').sort((a, b) => a[0].localeCompare(b[0]));
  const recentDateRows = dates.slice(-7);
  const latestDateKey = [...scopedArticles]
    .map((item) => String(item.publishedAt || item.fetchedAt || '').slice(0, 10))
    .filter(Boolean)
    .sort()
    .pop();
  const latestArticles = [...scopedArticles]
    .sort((a, b) => new Date(b.publishedAt || b.fetchedAt || 0) - new Date(a.publishedAt || a.fetchedAt || 0))
    .filter((item) => !latestDateKey || String(item.publishedAt || item.fetchedAt || '').slice(0, 10) === latestDateKey);
  const reportRows = reports.filter((report) => report.topic !== 'run-summary');
  const reportScope = reportRows.filter((report) => (
    (selectedCountry === 'all' || report.country === selectedCountry)
    && (selectedTopic === 'all' || report.topic === selectedTopic)
    && (selectedSource === 'all' || report.sourceName === selectedSource || report.sourceDomain === selectedSource)
  ));
  const attempted = reportScope.reduce((sum, row) => sum + Number(row.attemptedPages || 0), 0);
  const saved = reportScope.reduce((sum, row) => sum + Number(row.savedPages || 0), 0);
  const skipped = reportScope.reduce((sum, row) => sum + Number(row.skippedPages || 0), 0);
  const failed = reportScope.reduce((sum, row) => sum + Number(row.failedPages || 0), 0);
  const successRate = attempted ? Math.round((saved / attempted) * 100) : 0;
  const skipRate = attempted ? Math.round((skipped / attempted) * 100) : 0;
  const latestDay = recentDateRows[recentDateRows.length - 1] || ['-', 0];
  const topSource = sources[0] || ['-', 0];
  const contextLabel = [selectedCountry, selectedTopic, selectedSource].filter((item) => item !== 'all').join(' / ') || 'All markets';
  const toggleTopic = (topic) => {
    setSelectedTopic((current) => {
      const next = current === topic ? 'all' : topic;
      setSelectedSource('all');
      return next;
    });
  };
  const toggleSource = (source) => {
    setSelectedSource((current) => current === source ? 'all' : source);
  };
  const rawVsPassedRows = reportScope.map((report) => {
    const rawLinks = Number(report.sitemapLinks || 0) + Number(report.discoveredLinks || 0);
    const rowAttempted = Number(report.attemptedPages || 0);
    const rowSaved = Number(report.savedPages || 0);
    const rowSkipped = Number(report.skippedPages || 0);
    const rowFailed = Number(report.failedPages || 0);
    const passed = Number(report.insertedPages || 0) + Number(report.updatedPages || 0) + Number(report.duplicatePages || 0) + Number(report.enrichedDuplicatePages || 0) || rowSaved;
    const rejected = rowSkipped + rowFailed;
    const denominator = Math.max(1, rowAttempted || rawLinks);
    return {
      name: report.sourceName || report.sourceDomain || 'Unknown',
      topic: report.topic || '-',
      rawLinks,
      attempted: rowAttempted,
      passed,
      rejected,
      passRate: Math.round((passed / denominator) * 100),
    };
  })
    .filter((row) => row.rawLinks || row.attempted || row.passed || row.rejected)
    .sort((a, b) => b.rawLinks - a.rawLinks || b.attempted - a.attempted || b.passed - a.passed)
    .slice(0, 12);

  return (
    <section className="analysis-board">
      <section className="analysis-hero">
        <div className="analysis-control-box">
          <div className="scraper-eyebrow">Intelligence overview</div>
          <h2>{contextLabel}</h2>
          <p>Drill into market, topic, and source performance to understand coverage, yield, and recent intelligence flow.</p>
          <div className="bi-filter-grid">
            <label><span>Country</span><select value={selectedCountry} onChange={(e) => { setSelectedCountry(e.target.value); setSelectedTopic('all'); setSelectedSource('all'); }}>{countryOptions.map((item) => <option key={item} value={item}>{item === 'all' ? 'All countries' : item}</option>)}</select></label>
            <label><span>Topic</span><select value={selectedTopic} onChange={(e) => { setSelectedTopic(e.target.value); setSelectedSource('all'); }}>{topicOptions.map((item) => <option key={item} value={item}>{item === 'all' ? 'All topics' : item}</option>)}</select></label>
            <label><span>Source</span><select value={selectedSource} onChange={(e) => setSelectedSource(e.target.value)}>{sourceOptions.map((item) => <option key={item} value={item}>{item === 'all' ? 'All sources' : item}</option>)}</select></label>
          </div>
        </div>
        <div className="analysis-hero-grid">
          <KpiTile label="Intelligence Records" value={scopedArticles.length.toLocaleString()} sub="In selected view" tone="good" />
          <KpiTile label="Active Sources" value={sources.length.toLocaleString()} sub="Contributing coverage" tone="neutral" />
          <KpiTile label="Collection Yield" value={`${successRate}%`} sub={`${saved.toLocaleString()} approved`} tone="good" />
          <KpiTile label="Filtered Out" value={`${skipped.toLocaleString()} / ${failed.toLocaleString()}`} sub={`${skipRate}% review loss`} tone={failed ? 'bad' : 'warn'} />
        </div>
      </section>

      <section className="analysis-visual-grid">
        <Panel title="Topic Mix" subtitle="Share of intelligence records by content stream.">
          <div className="visual-bar-list">
            {topics.map(([topic, count]) => (
              <VisualBar
                key={topic}
                active={selectedTopic === topic}
                label={topic}
                value={count}
                total={countryScoped.length || 1}
                onClick={() => toggleTopic(topic)}
              />
            ))}
          </div>
        </Panel>
        <Panel title="Freshness Trend" subtitle="Daily intake pattern across the last seven dated periods.">
          <LineTrend rows={recentDateRows} />
        </Panel>
        <Panel title="Source Contribution" subtitle="Primary sources ranked by approved intelligence volume.">
          <div className="source-tile-map">
            {sources.slice(0, 8).map(([source, count], index) => (
              <button key={source} type="button" className={`source-tile tile-${Math.min(index + 1, 6)} ${selectedSource === source ? 'active' : ''}`} onClick={() => toggleSource(source)}>
                <span>{source}</span><strong>{count}</strong>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Collection Funnel" subtitle="How discovered pages move through approval filters.">
          <div className="funnel-chart">
            <FunnelRow label="Attempted" value={attempted} total={Math.max(attempted, 1)} tone="neutral" />
            <FunnelRow label="Saved" value={saved} total={Math.max(attempted, 1)} tone="good" />
            <FunnelRow label="Skipped" value={skipped} total={Math.max(attempted, 1)} tone="warn" />
            <FunnelRow label="Failed" value={failed} total={Math.max(attempted, 1)} tone="bad" />
          </div>
        </Panel>
      </section>

      <section className="analysis-layout">
        <div className="analysis-main">
          <div className="analysis-two-col clean-details date-side-layout">
            <Panel title="Raw Intake vs Approved" subtitle="Source-level comparison of discovered URLs and records accepted into the master database.">
              <div className="source-outcome-list">
                {rawVsPassedRows.length ? rawVsPassedRows.map((row) => {
                  const tone = row.passRate >= 70 ? 'good' : row.passRate >= 35 ? 'warn' : 'bad';
                  return (
                  <button key={`${row.name}-${row.topic}`} type="button" className={`source-outcome-row ${selectedSource === row.name ? 'active' : ''}`} onClick={() => toggleSource(row.name)}>
                    <div className="source-outcome-main">
                      <strong>{row.name}</strong>
                      <span>{row.topic}</span>
                    </div>
                    <div className="source-outcome-stats">
                      <em className="neutral">{row.rawLinks.toLocaleString()} discovered</em>
                      <em className={tone}>{row.passed.toLocaleString()} approved</em>
                      <em className={row.rejected ? 'bad' : 'good'}>{row.rejected.toLocaleString()} filtered</em>
                    </div>
                    <MiniMeter value={row.passRate} tone={tone} />
                  </button>
                  );
                }) : <div className="live-empty">Run the scraper to compare discovered URLs against approved records.</div>}
              </div>
            </Panel>

            <Panel title="Intake Calendar" subtitle="Approved record volume by date in the current view.">
              <DateBars rows={recentDateRows} />
            </Panel>

            <Panel title="Latest Intelligence" subtitle={latestDateKey ? `All approved records from ${formatDate(latestDateKey)} in the current view.` : 'Most recent approved records in the current view.'}>
              <div className="latest-source-list">
                {latestArticles.length ? latestArticles.map((item) => (
                  <a key={articleId(item)} className="latest-source-row" href={item.url} target="_blank" rel="noreferrer">
                    <strong>{item.title || 'Untitled'}</strong>
                    <span>{item.source || item.sourceDomain || 'Unknown'} | {formatDate(item.publishedAt || item.fetchedAt)}</span>
                  </a>
                )) : <div className="live-empty">No articles found for this selection.</div>}
              </div>
            </Panel>
          </div>
        </div>
      </section>
    </section>
  );
}

function Panel({ title, subtitle, children }) {
  return <section className="analysis-panel"><div className="analysis-panel-head"><h3>{title}</h3><p>{subtitle}</p></div>{children}</section>;
}

function KpiTile({ label, value, sub, tone = 'neutral' }) {
  return <div className={`kpi-tile ${tone}`}><span>{label}</span><strong>{value}</strong><em>{sub}</em></div>;
}

function InsightCard({ label, value, detail, tone = 'neutral' }) {
  return <article className={`insight-card ${tone}`}><span>{label}</span><strong>{value}</strong><p>{detail}</p></article>;
}

function MiniMeter({ value, tone = 'neutral' }) {
  return <i className={`mini-meter ${tone}`}><b style={{ width: `${Math.max(4, Math.min(100, Number(value || 0)))}%` }} /></i>;
}

function VisualBar({ label, value, total, active = false, onClick }) {
  const pct = Math.max(3, Math.round((Number(value || 0) / Math.max(1, Number(total || 1))) * 100));
  return <button type="button" className={`visual-bar ${active ? 'active' : ''}`} onClick={onClick}><div><span>{label}</span><strong>{Number(value || 0).toLocaleString()}</strong></div><i><b style={{ width: `${pct}%` }} /></i></button>;
}

function FunnelRow({ label, value, total, tone }) {
  const pct = Math.max(value ? 4 : 1, Math.round((Number(value || 0) / Math.max(1, Number(total || 1))) * 100));
  return <div className={`funnel-row ${tone}`}><span>{label}</span><i><b style={{ width: `${pct}%` }} /></i><strong>{Number(value || 0).toLocaleString()}</strong></div>;
}

function LineTrend({ rows = [] }) {
  const values = rows.map(([, count]) => Number(count || 0));
  const max = Math.max(...values, 1);
  const points = rows.map(([, count], index) => {
    const x = rows.length <= 1 ? 50 : (index / (rows.length - 1)) * 100;
    const y = 92 - ((Number(count || 0) / max) * 74);
    return `${x},${y}`;
  }).join(' ');
  const singleY = rows.length === 1 ? points.split(',')[1] : null;

  return (
    <div className="line-chart-box">
      {rows.length ? (
        <>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Freshness line chart">
            {rows.length === 1 ? (
              <>
                <line x1="15" y1={singleY} x2="85" y2={singleY} />
                <circle cx="50" cy={singleY} r="2.8" />
              </>
            ) : <polyline points={points} />}
          </svg>
          <div className="line-chart-axis">
            {rows.map(([date, count]) => (
              <span key={date}><b>{date.slice(5)}</b><em>{count}</em></span>
            ))}
          </div>
        </>
      ) : <div className="live-empty">No dated articles found.</div>}
    </div>
  );
}

function DateBars({ rows = [] }) {
  const max = Math.max(...rows.map(([, count]) => Number(count || 0)), 1);
  return (
    <div className="date-bars-chart">
      {rows.length ? rows.map(([date, count]) => {
        const height = Math.max(8, Math.round((Number(count || 0) / max) * 100));
        return (
          <div className="date-bars-column" key={date}>
            <i><b style={{ height: `${height}%` }} /></i>
            <span>{date.slice(5)}</span>
            <strong>{Number(count || 0).toLocaleString()}</strong>
          </div>
        );
      }) : <div className="live-empty">No dated articles found.</div>}
    </div>
  );
}

function topicShare(topicRows, index) {
  const total = topicRows.reduce((sum, [, count]) => sum + Number(count || 0), 0) || 1;
  return Math.round((Number(topicRows[index]?.[1] || 0) / total) * 100);
}

function groupCount(rows = [], getter) {
  const counts = new Map();
  rows.forEach((row) => {
    const key = getter(row) || 'Unknown';
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function BarRow({ label, value, total, compact = false }) {
  const pct = Math.round((Number(value || 0) / total) * 100);
  return (
    <div className={compact ? 'bar-row compact' : 'bar-row'}>
      <div className="mb-1 flex items-center justify-between text-xs font-black"><span className="text-gray-600">{label}</span><span className="text-brand-crimson">{value}</span></div>
      <div className="h-3 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-brand-crimson" style={{ width: `${Math.max(3, pct)}%` }} /></div>
    </div>
  );
}

function ReportSection({ reports, className = '' }) {
  return (
    <section className={`card-shell report-panel p-4 ${className}`}>
      <div className="mb-4"><h2 className="text-base font-black text-gray-950">Run Report</h2><p className="text-xs font-bold text-gray-400">Source-level collection results, approval counts, and filter outcomes.</p></div>
      <div className="report-list">
        {reports.length ? reports.map((report, index) => (
          <article key={`${report.sourceName}-${index}`} className="report-card">
            <div className="report-card-head"><div><h3>{report.sourceName || 'Unknown'}</h3><p>{report.topic || 'topic'}</p></div><span className={report.failedPages ? 'report-badge danger' : 'report-badge'}>{report.failedPages ? 'Check' : 'OK'}</span></div>
            <div className="report-grid"><InfoStat label="Attempted" value={report.attemptedPages} /><InfoStat label="Saved" value={report.savedPages} /><InfoStat label="Updated" value={report.updatedPages} /><InfoStat label="Skipped" value={report.skippedPages} /></div>
          </article>
        )) : <div className="text-sm font-bold text-gray-400">No report file found yet.</div>}
      </div>
    </section>
  );
}

function InfoRow({ label, value }) {
  return <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 rounded-xl bg-gray-50 px-3 py-2"><span className="text-gray-400">{label}</span><span className="truncate text-gray-700">{value || '-'}</span></div>;
}

function InfoStat({ label, value }) {
  return <div><span>{label}</span><strong>{Number(value || 0)}</strong></div>;
}

function EmptyState({ loading }) {
  return (
    <div className="col-span-full flex min-h-[360px] items-center justify-center rounded-3xl border border-dashed border-gray-200 bg-white/60 text-center">
      <div>{loading ? <Loader2 className="mx-auto mb-3 animate-spin text-brand-crimson" size={24} /> : <Database className="mx-auto mb-3 text-gray-300" size={24} />}<p className="text-sm font-black text-gray-600">{loading ? 'Loading articles' : 'No scraped article found'}</p><p className="mt-1 text-xs font-bold text-gray-400">Run scraper or adjust filters.</p></div>
    </div>
  );
}

function ArticleLoadingState() {
  return (
    <div className="article-loader-cell">
      <Loader />
    </div>
  );
}

function AnalysisLoadingState() {
  return <Loader />;
}

function ScraperLoadingState() {
  return <Loader />;
}
