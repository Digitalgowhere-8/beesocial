import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';
import Filters from '../components/Filters';
import ArticleCard from '../components/ArticleCard';
import Loader, { Skeleton } from '../components/Loader';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  Play, Eye, EyeOff, Trash2, RefreshCw, Activity,
  Users, FileText, BarChart3, Loader2, Check, X, ChevronRight, ChevronDown, UserPlus, MoreHorizontal,
  Search, Clock3, Save, Crown, ShieldCheck, Database, Gauge, KeyRound, AlertTriangle, Globe2, Sparkles, Mail, Send,
  MousePointerClick, Timer, MonitorUp, TrendingUp, Building2, Wallet, Server, HardDrive
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// Plan limits matching backend PLAN_DEFAULTS — used for auto-fill
const PLAN_DEFAULTS_UI = {
  free:       { memberLimit: 1,   fetchesPerMonth: 10,   storageItems: 100,    tokenBudgetMonthly: 50000,    blogGenerationsMonthly: 3,    socialPostsMonthly: 5 },
  growth:     { memberLimit: 3,   fetchesPerMonth: 50,   storageItems: 2000,   tokenBudgetMonthly: 500000,   blogGenerationsMonthly: 25,   socialPostsMonthly: 50 },
  scale:      { memberLimit: 10,  fetchesPerMonth: 300,  storageItems: 15000,  tokenBudgetMonthly: 3500000,  blogGenerationsMonthly: 150,  socialPostsMonthly: 300 },
  enterprise: { memberLimit: 999, fetchesPerMonth: 1500, storageItems: 999999, tokenBudgetMonthly: 10000000, blogGenerationsMonthly: 1000, socialPostsMonthly: 2000 },
  premium:    { memberLimit: 10,  fetchesPerMonth: 300,  storageItems: 15000,  tokenBudgetMonthly: 3500000,  blogGenerationsMonthly: 150,  socialPostsMonthly: 300 }
};

const PLAN_BADGE = {
  free:       'bg-gray-50 text-gray-500 ring-1 ring-gray-200',
  growth:     'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  scale:      'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  enterprise: 'bg-gradient-to-r from-amber-100 to-yellow-50 text-amber-800 ring-1 ring-amber-200/50 shadow-sm',
  premium:    'bg-gradient-to-r from-amber-100 to-yellow-50 text-amber-800 ring-1 ring-amber-200/50 shadow-sm'
};

function formatPlanLabel(planId, dbPlans = []) {
  const normalized = String(planId || '').trim().toLowerCase();
  const dbPlan = Array.isArray(dbPlans) ? dbPlans.find((plan) => String(plan?.planId || '').toLowerCase() === normalized) : null;
  if (dbPlan?.label) {
    const price = String(dbPlan.price || '').trim();
    return price ? `${dbPlan.label} (${price})` : dbPlan.label;
  }
  if (!normalized) return 'Not assigned';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

const PAID_PLAN_IDS = ['growth', 'scale', 'enterprise', 'premium'];

const MEMBER_ACCESS_OPTIONS = [
  { key: 'canFetch', label: 'Fetch' },
  { key: 'canUseContentRepository', label: 'Content Repository' },
  { key: 'canUseBlogStudio', label: 'Content Studio' },
  { key: 'canUseSavedSearches', label: 'Saved' },
  { key: 'canUseScheduler', label: 'Schedule' }
];

// =============== TABS ===============

const ADMIN_TABS = [
  { key: 'logs',     label: 'Logs',     icon: Activity, hint: 'System activity' },
  { key: 'users',    label: 'Users',    icon: Users, hint: 'Team access' },
  { key: 'stats',    label: 'Stats',    icon: BarChart3, hint: 'Usage insights' }
];

const SUPER_ADMIN_TABS = [
  { key: 'platform', label: 'Platform', icon: Crown, hint: 'Global health and activity' },
  { key: 'articles', label: 'Articles', icon: FileText, hint: 'Review and moderate content' },
  { key: 'fetch',    label: 'Fetch',    icon: Globe2, hint: 'Shared intelligence workflows' },
  { key: 'users',    label: 'Users',    icon: ShieldCheck, hint: 'Companies, members and access' },
  { key: 'plans',    label: 'Plans',    icon: Database, hint: 'Limits, pricing and upgrades' },
  { key: 'settings', label: 'Settings', icon: KeyRound, hint: 'Platform controls and AI config' },
];

const SUPER_ADMIN_SUBTABS = {
  platform: [
    { key: 'overview', label: 'Overview' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'activity', label: 'Recent Activity' }
  ],
  articles: [
    { key: 'library', label: 'Article Library' }
  ],
  fetch: [
    { key: 'setup', label: 'Fetch Settings' },
    { key: 'sources', label: 'Country Sources' },
    { key: 'trust', label: 'Source Trust' }
  ],
  users: [
    { key: 'add', label: 'Add User' },
    { key: 'access', label: 'Access Manager' }
  ],
  plans: [
    { key: 'builder', label: 'Plan Builder' }
  ],
  settings: [
    { key: 'system', label: 'System Settings' },
    { key: 'mail', label: 'Mail Center' }
  ]
};

const TOPIC_OPTIONS = [
  { key: 'news', label: 'News', help: 'Market and business updates' },
  { key: 'govt', label: 'Government updates', help: 'Regulatory, tax and policy sources' },
  { key: 'competitor', label: 'Competitor intel', help: 'Other firms, partnerships and launches' },
  { key: 'evergreen', label: 'Evergreen guides', help: 'Guides, explainers and reference content' }
];

const SOURCE_TYPE_OPTIONS = [
  { key: 'news', label: 'News sources', help: 'Business, market and publisher domains', icon: Globe2, accent: 'from-sky-500/15 via-blue-500/10 to-cyan-500/10', ring: 'ring-sky-100', tint: 'text-sky-700' },
  { key: 'govt', label: 'Government sources', help: 'Regulatory, ministry and official domains', icon: ShieldCheck, accent: 'from-emerald-500/15 via-green-500/10 to-teal-500/10', ring: 'ring-emerald-100', tint: 'text-emerald-700' },
  { key: 'competitor', label: 'Competitor sources', help: 'Firm websites and competitor intelligence domains', icon: Building2, accent: 'from-amber-500/15 via-orange-500/10 to-yellow-500/10', ring: 'ring-amber-100', tint: 'text-amber-700' },
  { key: 'evergreen', label: 'Evergreen sources', help: 'Reference and guide sources for evergreen content', icon: Sparkles, accent: 'from-brand-pink/80 via-[#F9C416]/10 to-white', ring: 'ring-brand-crimson/10', tint: 'text-brand-crimson' }
];

const COUNTRY_TIMEZONES = {
  India: ['Asia/Kolkata'],
  Singapore: ['Asia/Singapore'],
  'United States': ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu'],
  USA: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu'],
  'United Kingdom': ['Europe/London'],
  UK: ['Europe/London'],
  Canada: ['America/Toronto', 'America/Winnipeg', 'America/Edmonton', 'America/Vancouver', 'America/Halifax', 'America/St_Johns'],
  Australia: ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Adelaide', 'Australia/Perth'],
  UAE: ['Asia/Dubai'],
  'United Arab Emirates': ['Asia/Dubai'],
  Germany: ['Europe/Berlin'],
  France: ['Europe/Paris'],
  Netherlands: ['Europe/Amsterdam'],
  Switzerland: ['Europe/Zurich'],
  Japan: ['Asia/Tokyo'],
  China: ['Asia/Shanghai'],
  Hongkong: ['Asia/Hong_Kong'],
  'Hong Kong': ['Asia/Hong_Kong'],
  Malaysia: ['Asia/Kuala_Lumpur'],
  Indonesia: ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'],
  Philippines: ['Asia/Manila'],
  Thailand: ['Asia/Bangkok'],
  Vietnam: ['Asia/Ho_Chi_Minh'],
  'South Africa': ['Africa/Johannesburg'],
  Brazil: ['America/Sao_Paulo'],
  Mexico: ['America/Mexico_City'],
  'New Zealand': ['Pacific/Auckland']
};

const superAdminPlatformCache = {
  overview: null,
  analytics: null,
  dbHealth: null
};

const superAdminArticlesCache = new Map();
let superAdminUsersCache = null;

function getBrowserTimezones() {
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      return Intl.supportedValuesOf('timeZone');
    }
  } catch {
    // Fall through to curated list below.
  }
  return [
    'Asia/Kolkata', 'Asia/Singapore', 'Asia/Dubai', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Hong_Kong',
    'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'America/New_York', 'America/Chicago',
    'America/Denver', 'America/Los_Angeles', 'Australia/Sydney', 'Pacific/Auckland'
  ];
}

export default function AdminPanel() {
  const { user, isSuperAdmin, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabs = useMemo(() => {
    if (isSuperAdmin) return SUPER_ADMIN_TABS;
    if (isAdmin) return ADMIN_TABS;
    return [];
  }, [isSuperAdmin, isAdmin]);

  const [tab, setTab] = useState(() => (isSuperAdmin ? (searchParams.get('section') || 'platform') : 'logs'));
  const [subTab, setSubTab] = useState(() => SUPER_ADMIN_SUBTABS.platform[0].key);
  const [dbPlans, setDbPlans] = useState([]);
  const [superAdminRefreshKey, setSuperAdminRefreshKey] = useState(0);
  const [mobileAdminMenuOpen, setMobileAdminMenuOpen] = useState(false);

  const loadDbPlans = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/plans');
      if (data.items) setDbPlans(data.items);
    } catch (e) {
      console.error('Failed to load plans:', e.message);
    }
  }, []);

  useEffect(() => {
    loadDbPlans();
  }, [loadDbPlans]);

  const refreshSuperAdminSection = useCallback(() => {
    if (tab === 'platform') {
      superAdminPlatformCache.overview = null;
      superAdminPlatformCache.analytics = null;
      superAdminPlatformCache.dbHealth = null;
    }
    if (tab === 'articles') {
      superAdminArticlesCache.clear();
    }
    if (tab === 'users') {
      superAdminUsersCache = null;
    }
    if (tab === 'plans') {
      loadDbPlans();
    }
    setSuperAdminRefreshKey((value) => value + 1);
  }, [loadDbPlans, tab]);

  useEffect(() => {
    if (!tabs.length) return;
    if (!tabs.some((item) => item.key === tab)) setTab(tabs[0].key);
  }, [tabs, tab]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const nextSection = searchParams.get('section') || 'platform';
    if (nextSection !== tab && tabs.some((item) => item.key === nextSection)) {
      setTab(nextSection);
    }
  }, [isSuperAdmin, searchParams, tab, tabs]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const nextSubTabs = SUPER_ADMIN_SUBTABS[tab] || [];
    if (!nextSubTabs.length) return;
    if (!nextSubTabs.some((item) => item.key === subTab)) {
      setSubTab(nextSubTabs[0].key);
    }
  }, [isSuperAdmin, tab, subTab]);

  useEffect(() => {
    setMobileAdminMenuOpen(false);
  }, [tab, subTab, isSuperAdmin]);

  const handleSuperAdminTabChange = useCallback((nextTab) => {
    setTab(nextTab);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('section', nextTab);
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const headerActions = (
    <>
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 xl:hidden">
          {isSuperAdmin ? (
            <div className="inline-flex min-h-[42px] items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-[13px] font-black text-gray-900 shadow-sm">
              {(() => {
                const currentItem = (SUPER_ADMIN_SUBTABS[tab] || []).find((item) => item.key === subTab);
                return currentItem?.label || 'Admin';
              })()}
            </div>
          ) : (
            <div className="content-header-segmented hide-scrollbar inline-grid min-w-0 grid-flow-col auto-cols-[minmax(78px,1fr)] gap-1.5 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
              {tabs.map((item) => {
                const active = item.key === tab;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setTab(item.key)}
                    className={[
                      'flex min-h-[36px] min-w-0 items-center justify-center gap-1.5 rounded-xl px-2.5 text-[11px] font-black transition-all',
                      active ? 'content-header-tab-active bg-brand-crimson text-white shadow-sm' : 'content-header-tab-idle text-gray-500 hover:bg-gray-50'
                    ].join(' ')}
                  >
                    {item.icon ? <item.icon size={13} /> : null}
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-2">
            {isSuperAdmin ? (
              <button
                type="button"
                onClick={refreshSuperAdminSection}
                className="app-refresh-button admin-mobile-refresh-button inline-flex h-[42px] min-w-[42px] items-center justify-center rounded-2xl border px-3 shadow-sm transition-all"
                aria-label="Refresh admin panel"
              >
                <RefreshCw size={16} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setMobileAdminMenuOpen((value) => !value)}
              className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-600 shadow-sm transition-all hover:border-brand-crimson/20 hover:text-brand-crimson"
              aria-label="Open admin menu"
            >
              <MoreHorizontal size={16} />
            </button>
          </div>
        </div>
        <div className="hidden min-w-0 flex-1 gap-2 xl:flex xl:flex-row xl:items-center">
          <div className="content-header-segmented hide-scrollbar inline-grid min-w-0 flex-1 grid-flow-col auto-cols-[minmax(120px,1fr)] gap-2 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-1 shadow-sm sm:auto-cols-[minmax(132px,1fr)]">
            {(isSuperAdmin ? (SUPER_ADMIN_SUBTABS[tab] || []) : tabs).map((item) => {
              const active = isSuperAdmin ? item.key === subTab : item.key === tab;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    if (isSuperAdmin) {
                      setSubTab(item.key);
                      return;
                    }
                    setTab(item.key);
                  }}
                  className={[
                    'group flex min-h-[40px] min-w-0 items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-black transition-all sm:px-5',
                    active ? 'content-header-tab-active bg-brand-crimson text-white shadow-sm' : 'content-header-tab-idle text-gray-500 hover:bg-gray-50'
                  ].join(' ')}
                >
                  {!isSuperAdmin && item.icon ? <item.icon size={14} /> : null}
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
          {isSuperAdmin ? (
            <button
              type="button"
              onClick={refreshSuperAdminSection}
              className="app-refresh-button inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-2xl border px-5 text-[13px] font-black shadow-sm transition-all"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
          ) : null}
        </div>
      </div>
      {mobileAdminMenuOpen ? (
        <>
          <button
            type="button"
            aria-label="Close admin menu"
            onClick={() => setMobileAdminMenuOpen(false)}
            className="fixed inset-0 z-40 bg-gray-950/20 backdrop-blur-[1px] xl:hidden"
          />
          <div className="fixed right-3 top-[76px] z-50 w-[min(320px,calc(100vw-24px))] overflow-hidden rounded-[24px] border border-gray-200 bg-white shadow-[0_24px_48px_rgba(15,23,42,0.18)] xl:hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">{isSuperAdmin ? 'Super Admin' : 'Profile'}</div>
                <div className="mt-1 text-sm font-black text-gray-900">Sections</div>
              </div>
              <button
                type="button"
                onClick={() => setMobileAdminMenuOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500"
                aria-label="Close admin menu"
              >
                <X size={15} />
              </button>
            </div>
            <div className="space-y-2 p-3">
              {isSuperAdmin ? (
                (SUPER_ADMIN_SUBTABS[tab] || []).map((item) => {
                  const active = item.key === subTab;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setSubTab(item.key);
                        setMobileAdminMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition-all ${active ? 'border border-brand-crimson/15 bg-brand-pink/20 text-brand-crimson' : 'border border-gray-200 bg-gray-50 text-gray-700'}`}
                    >
                      <span className="flex items-center gap-3 text-sm font-black">{item.label}</span>
                      {active ? <Check size={15} /> : null}
                    </button>
                  );
                })
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      navigate('/profile', { state: { tab: 'profile' } });
                      setMobileAdminMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm font-black text-gray-700 transition-all hover:border-brand-crimson/20 hover:text-brand-crimson"
                  >
                    <span>My Hive Profile</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigate('/profile', { state: { tab: 'fetch' } });
                      setMobileAdminMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm font-black text-gray-700 transition-all hover:border-brand-crimson/20 hover:text-brand-crimson"
                  >
                    <span>My Personalisation</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileAdminMenuOpen(false)}
                    className="flex w-full items-center justify-between rounded-2xl border border-brand-crimson/15 bg-brand-pink/20 px-4 py-3 text-left text-sm font-black text-brand-crimson transition-all"
                  >
                    <span>Admin Controls</span>
                    <Check size={15} />
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      ) : null}
    </>
  );

  return (
    <Layout headerActions={headerActions}>
      <div data-tour="admin-shell" className="admin-theme-page -m-3 min-h-[calc(100vh-64px)] p-3 mesh-bg sm:-m-5 sm:p-5 lg:-m-6 lg:p-6">
        <div className="w-full space-y-5 pb-5">
          {isSuperAdmin ? (
            <SuperAdminWorkspace
              tabs={tabs}
              activeTab={tab}
              onTabChange={handleSuperAdminTabChange}
              subTabs={SUPER_ADMIN_SUBTABS[tab] || []}
              activeSubTab={subTab}
              onSubTabChange={setSubTab}
              onRefresh={refreshSuperAdminSection}
              onOpenMenu={() => setMobileAdminMenuOpen((value) => !value)}
            >
              {tab === 'platform' && <SuperAdminPlatform key={`platform-${superAdminRefreshKey}`} activeSubTab={subTab} dbPlans={dbPlans} />}
              {tab === 'articles' && <ArticlesTab key={`articles-${superAdminRefreshKey}`} />}
              {tab === 'fetch' && <SuperAdminFetchTab key={`fetch-${superAdminRefreshKey}`} activeSubTab={subTab} />}
              {tab === 'users' && <UsersTab key={`users-${superAdminRefreshKey}`} dbPlans={dbPlans} activeSubTab={subTab} />}
              {tab === 'plans' && <PlanBuilderTab key={`plans-${superAdminRefreshKey}`} dbPlans={dbPlans} loadDbPlans={loadDbPlans} />}
              {tab === 'settings' && (subTab === 'mail'
                ? <SuperAdminMailCenter key={`settings-mail-${superAdminRefreshKey}`} />
                : <SystemSettingsTab key={`settings-${superAdminRefreshKey}`} />)}
            </SuperAdminWorkspace>
          ) : null}
          {!isSuperAdmin && <>
          <div className="hidden flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-brand-pink/40 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-brand-crimson">
                {isSuperAdmin ? <Crown size={13} /> : <ShieldCheck size={13} />}
                {isSuperAdmin ? 'Super Admin' : 'Operations'}
              </div>
              <h1 className="truncate text-2xl font-black tracking-tight text-gray-900 sm:text-3xl">{isSuperAdmin ? 'Super Admin Console' : 'Admin Panel'}</h1>
              <p className="mt-1 text-sm text-gray-500">{isSuperAdmin ? 'Full platform control — users, plans, system config, and access management for all companies.' : 'Manage content, users, profile searches, and operational logs.'}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <span className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.14)]" />
                Console online
              </span>
              <span className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-black uppercase tracking-wider ${isSuperAdmin ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-brand-crimson/10 bg-brand-pink/50 text-brand-crimson'}`}>
                {isSuperAdmin ? <Crown size={12} /> : <ShieldCheck size={12} />}
                {isSuperAdmin ? 'Super Admin' : 'Admin access'}
              </span>
            </div>
          </div>
        {tab === 'users' && !isSuperAdmin && <UsersTab dbPlans={dbPlans} />}
        {tab === 'logs' && !isSuperAdmin && <LogsTab />}
        {tab === 'stats' && !isSuperAdmin && <StatsTab />}
          </>}
        </div>
      </div>
    </Layout>
  );
}

function SuperAdminWorkspace({
  children,
}) {
  return (
    <section className="min-w-0">
      <div className="min-w-0">
        {children}
      </div>
    </section>
  );
}

// =============== SUPER ADMIN PLATFORM ===============

function parsePlanPrice(value) {
  const numeric = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

function SuperAdminPlatform({ activeSubTab = 'overview', dbPlans = [] }) {
  const [overview, setOverview] = useState(() => superAdminPlatformCache.overview);
  const [analytics, setAnalytics] = useState(() => superAdminPlatformCache.analytics);
  const [dbHealth, setDbHealth] = useState(() => superAdminPlatformCache.dbHealth);
  const [loading, setLoading] = useState(() => !superAdminPlatformCache.overview || !superAdminPlatformCache.analytics);
  const [refreshingHealth, setRefreshingHealth] = useState(false);
  const [cleaningAnalytics, setCleaningAnalytics] = useState(false);
  const [cleanupNotice, setCleanupNotice] = useState('');
  const [expandedPlatformRunId, setExpandedPlatformRunId] = useState('');

  const loadDatabaseHealth = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setRefreshingHealth(true);
    try {
      const { data } = await api.get('/admin/super/database-health');
      superAdminPlatformCache.dbHealth = data;
      setDbHealth(data);
      return data;
    } finally {
      if (!silent) setRefreshingHealth(false);
    }
  }, []);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [overviewRes, analyticsRes, dbHealthRes] = await Promise.all([
        api.get('/admin/super/overview'),
        api.get('/admin/super/analytics'),
        api.get('/admin/super/database-health')
      ]);
      superAdminPlatformCache.overview = overviewRes.data;
      superAdminPlatformCache.analytics = analyticsRes.data;
      superAdminPlatformCache.dbHealth = dbHealthRes.data;
      setOverview(overviewRes.data);
      setAnalytics(analyticsRes.data);
      setDbHealth(dbHealthRes.data);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load({ silent: Boolean(superAdminPlatformCache.overview && superAdminPlatformCache.analytics) });
  }, [load]);

  useEffect(() => {
    if (activeSubTab !== 'analytics') return undefined;
    const id = window.setInterval(() => {
      loadDatabaseHealth({ silent: true }).catch(() => {});
    }, 30000);
    return () => window.clearInterval(id);
  }, [activeSubTab, loadDatabaseHealth]);

  if (loading || !overview || !analytics) return <Loader />;

  const users = overview.users || {};
  const usage = overview.usage || {};
  const topUsers = overview.topUsers || [];
  const recentRuns = overview.recentRuns || [];
  const planPremiumPct = users.total ? Math.round((Number(users.premium || 0) / users.total) * 100) : 0;
  const activePct = users.total ? Math.round((Number(users.active || 0) / users.total) * 100) : 0;
  const failedPct = Number(usage.failureRateThisMonth || 0);
  const successfulRunsThisMonth = Math.max(0, Number(usage.monthRuns || 0) - Number(usage.monthFailedRuns || 0));
  const traffic = analytics.totals || {};
  const analyticsSince = analytics.since ? new Date(analytics.since) : null;
  const companyCount = Number(users.admins || 0);
  const premiumCompanies = Number(users.premium || 0);
  const planPriceMap = dbPlans.reduce((acc, plan) => {
    acc[plan.planId] = parsePlanPrice(plan.price);
    return acc;
  }, {});
  const monthlyRevenue = Object.entries(users.planCounts || {}).reduce((sum, [planId, count]) => {
    if (!PAID_PLAN_IDS.includes(planId)) return sum;
    return sum + (Number(count || 0) * Number(planPriceMap[planId] || 0));
  }, 0);
  const apiCalls = Number(traffic.pageViews || 0) + Number(traffic.clicks || 0) + Number(traffic.visitors || 0);
  const mobileTopUsers = topUsers.slice(0, 5);
  const ownerStats = [
    { label: 'Total Companies', value: compactNumber(companyCount), icon: Building2, accent: 'bg-brand-crimson', note: `${users.active || 0} active operators`, tint: 'bg-brand-pink/40 text-brand-crimson' },
    { label: 'Total Users', value: compactNumber(users.total || 0), icon: Users, accent: 'bg-violet-500', note: `${activePct}% active this month`, tint: 'bg-violet-50 text-violet-700' },
    { label: 'Premium Companies', value: compactNumber(premiumCompanies), icon: Crown, accent: 'bg-amber-500', note: `${planPremiumPct}% on paid access`, tint: 'bg-amber-50 text-amber-700' },
    { label: 'Monthly Revenue', value: `$${compactNumber(monthlyRevenue)}`, icon: Wallet, accent: 'bg-emerald-500', note: 'Estimated MRR snapshot', tint: 'bg-emerald-50 text-emerald-700' },
    { label: 'Fetches This Month', value: compactNumber(usage.monthRuns || 0), icon: RefreshCw, accent: 'bg-blue-500', note: `${successfulRunsThisMonth} successful runs`, tint: 'bg-blue-50 text-blue-700' },
    { label: 'Stored Signals', value: compactNumber(usage.totalArticles || 0), icon: Database, accent: 'bg-cyan-500', note: `${usage.monthArticles || 0} added this cycle`, tint: 'bg-cyan-50 text-cyan-700' },
    { label: 'Failed Fetches', value: compactNumber(usage.monthFailedRuns || 0), icon: AlertTriangle, accent: 'bg-rose-500', note: `${failedPct}% failure rate`, tint: 'bg-rose-50 text-rose-700' },
    { label: 'API Calls', value: compactNumber(apiCalls), icon: Gauge, accent: 'bg-gray-900', note: 'Views, clicks and sessions combined', tint: 'bg-gray-100 text-gray-700' }
  ];

  const cleanupAnalytics = async () => {
    if (!confirm('Delete analytics data older than the current calendar month? Current month analytics will stay untouched.')) return;
    setCleaningAnalytics(true);
    setCleanupNotice('');
    try {
      const { data } = await api.delete('/admin/super/analytics/cleanup');
      setCleanupNotice(data.message || 'Analytics cleanup completed.');
      setDbHealth(data.health || null);
      const analyticsRes = await api.get('/admin/super/analytics');
      setAnalytics(analyticsRes.data);
    } catch (e) {
      setCleanupNotice(e.response?.data?.message || e.message || 'Analytics cleanup failed.');
    } finally {
      setCleaningAnalytics(false);
    }
  };

  return (
    <div className="super-admin-overview space-y-6" data-analytics-section="Super admin platform overview">
      {activeSubTab === 'overview' ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4" data-analytics-section="Platform KPI cards">
            {ownerStats.map((item) => (
              <StatCard
                key={item.label}
                label={item.label}
                value={item.value}
                icon={item.icon}
                accent={item.accent}
                note={item.note}
                tint={item.tint}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3 relative z-10">
            <div className="premium-glass overflow-hidden p-0 xl:col-span-2" data-analytics-section="Top users table">
              <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-crimson mb-1 flex items-center gap-1.5">
                    <Gauge size={12} /> Usage Leaders
                  </div>
                  <h3 className="text-xl font-black tracking-tight text-gray-900">Top users</h3>
                </div>
                <div className="admin-content-icon-tile h-10 w-10 rounded-2xl bg-brand-pink/30 flex items-center justify-center ring-1 ring-brand-crimson/10">
                  <Gauge size={18} className="text-brand-crimson" />
                </div>
              </div>
              <div className="space-y-3 p-4 lg:hidden">
                {mobileTopUsers.map((row, index) => (
                  <div key={row.user?._id || index} className="rounded-2xl border border-gray-100 bg-white/80 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        {row.user?.avatar ? (
                          <img src={row.user.avatar} className="h-10 w-10 shrink-0 rounded-full border border-gray-200 object-cover shadow-sm" alt={row.user?.name || 'User avatar'} />
                        ) : (
                          <div className="super-admin-user-avatar flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-crimson text-sm font-black text-white shadow-sm">
                            {(row.user?.name || row.user?.email || 'U')[0].toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black text-gray-900">{row.user?.name || 'Unknown user'}</div>
                          <div className="truncate text-xs font-medium text-gray-500">{row.user?.email || '-'}</div>
                        </div>
                      </div>
                      <span className={`tag shrink-0 px-2.5 py-1 ${PLAN_BADGE[row.user?.subscriptionPlan] || PLAN_BADGE.free}`}>
                        {row.user?.subscriptionPlan || 'free'}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <UsageMini label="Fetches" value={compactNumber(row.runs || 0)} />
                      <UsageMini label="Stored" value={compactNumber(row.inserted || 0)} />
                      <UsageMini label="Errors" value={compactNumber(row.errors || 0)} danger={Number(row.errors || 0) > 0} />
                      <UsageMini label="Tokens" value={compactNumber(row.estimatedTokens || 0)} />
                    </div>
                  </div>
                ))}
                {!mobileTopUsers.length && (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-white/50 p-8 text-center text-sm font-semibold text-gray-400">
                    No usage this month yet.
                  </div>
                )}
              </div>
              <div className="hidden overflow-x-auto px-4 pb-4 pt-3 lg:block">
                <table className="admin-top-users-table w-full min-w-[680px] border-separate border-spacing-y-2 text-sm">
                  <thead className="text-left text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">
                    <tr>
                      <th className="px-3 py-2">User</th>
                      <th className="px-3 py-2">Plan</th>
                      <th className="px-3 py-2 text-right">Fetches</th>
                      <th className="px-3 py-2 text-right">Stored</th>
                      <th className="px-3 py-2 text-right">Errors</th>
                      <th className="px-3 py-2 text-right">Est. tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topUsers.map((row, index) => (
                      <tr key={row.user?._id || index} className="premium-table-row">
                        <td className="rounded-l-2xl px-3 py-4">
                          <div className="flex min-w-0 items-center gap-3">
                            {row.user?.avatar ? (
                              <img src={row.user.avatar} className="h-9 w-9 shrink-0 rounded-full border border-gray-200 object-cover shadow-sm" alt={row.user?.name || 'User avatar'} />
                            ) : (
                              <div className="super-admin-user-avatar flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-crimson text-xs font-black text-white shadow-sm">
                                {(row.user?.name || row.user?.email || 'U')[0].toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="truncate font-black leading-tight text-gray-900">{row.user?.name || 'Unknown user'}</div>
                              <div className="mt-0.5 truncate text-xs font-semibold text-gray-500">{row.user?.email || '-'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-4">
                          <span className={`tag px-2.5 py-1 ${PLAN_BADGE[row.user?.subscriptionPlan] || PLAN_BADGE.free}`}>
                            {(row.user?.subscriptionPlan === 'enterprise' || row.user?.subscriptionPlan === 'premium') && <Crown size={10} className="mr-1 inline" />}
                            {row.user?.subscriptionPlan || 'free'}
                          </span>
                        </td>
                        <td className="px-3 py-4 text-right font-black text-gray-700">{row.runs || 0}</td>
                        <td className="px-3 py-4 text-right font-black text-gray-700">{row.inserted || 0}</td>
                        <td className="px-3 py-4 text-right font-black text-red-500">{row.errors || 0}</td>
                        <td className="rounded-r-2xl px-3 py-4 text-right font-mono text-xs font-black text-gray-500">{Number(row.estimatedTokens || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                    {!topUsers.length && (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-sm font-semibold text-gray-400 bg-white/50 rounded-xl border border-dashed border-gray-200">No usage this month yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-4" data-analytics-section="Platform metric side panel">
              <SystemHealthCard usage={usage} failedPct={failedPct} recentRuns={recentRuns} />
              <PlatformMetric icon={Users} label="Company admins" value={users.admins || 0} detail={`${users.members || 0} members managed`} />
              <PlatformMetric icon={KeyRound} label="Estimated tokens" value={Number(usage.estimatedTokensThisMonth || 0).toLocaleString()} detail="Approximate AI usage from stored results" />
              <PlatformMetric icon={Database} label="Storage growth" value={usage.monthArticles || 0} detail="New stored signals this month" />
            </div>
          </div>
        </>
      ) : null}

      {activeSubTab === 'analytics' ? (
        <div className="premium-glass p-5 sm:p-6 relative z-10" data-analytics-section="Business analytics dashboard">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-brand-crimson">
              <BarChart3 size={12} /> Analytics
            </div>
            <h3 className="text-xl font-black tracking-tight text-gray-900">Visitor behaviour and engagement</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex w-fit rounded-xl border border-brand-crimson/10 bg-brand-pink/20 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-brand-crimson shadow-sm">
              {analyticsSince ? `Month to date since ${analyticsSince.toLocaleDateString()}` : 'Month to date'}
            </div>
            <button
              type="button"
              onClick={() => loadDatabaseHealth()}
              disabled={refreshingHealth}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-white px-3.5 text-[11px] font-black uppercase tracking-wider text-gray-700 ring-1 ring-gray-200 transition hover:bg-gray-50 disabled:opacity-50"
            >
              {refreshingHealth ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Health
            </button>
            <button
              type="button"
              onClick={cleanupAnalytics}
              disabled={cleaningAnalytics}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-red-50 px-3.5 text-[11px] font-black uppercase tracking-wider text-red-700 ring-1 ring-red-100 transition hover:bg-red-100 disabled:opacity-50"
            >
              {cleaningAnalytics ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              Cleanup old analytics
            </button>
          </div>
        </div>
        {cleanupNotice ? (
          <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-600">
            {cleanupNotice}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <AnalyticsKpi icon={Users} label="Visitors" value={traffic.visitors || 0} detail={`${traffic.sessions || 0} sessions`} color="text-blue-600" bg="bg-blue-50" />
          <AnalyticsKpi icon={MonitorUp} label="Page views" value={traffic.pageViews || 0} detail={`${traffic.engagementRate || 0}% engaged`} color="text-emerald-600" bg="bg-emerald-50" />
          <AnalyticsKpi icon={MousePointerClick} label="Clicks" value={traffic.clicks || 0} detail={`${traffic.clickThroughRate || 0}% CTR`} color="text-amber-600" bg="bg-amber-50" />
          <AnalyticsKpi icon={Timer} label="Avg time" value={formatDuration(traffic.avgEngagedMsPerSession)} detail="Per session" color="text-violet-600" bg="bg-violet-50" />
          <AnalyticsKpi icon={Eye} label="Section views" value={traffic.sectionViews || 0} detail="Tracked panels" color="text-brand-crimson" bg="bg-brand-pink" />
          <AnalyticsKpi icon={TrendingUp} label="Bounce rate" value={`${traffic.bounceRate || 0}%`} detail="Low is better" color="text-gray-700" bg="bg-gray-50" />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
          <AnalyticsTrend data={analytics.trend || []} />
          <AnalyticsSectionTable rows={analytics.sections || []} />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
          <AnalyticsList
            title="Top clicked actions"
            icon={MousePointerClick}
            rows={(analytics.clicks || []).map((row) => ({
              label: row.label || row.section || 'Unknown click',
              meta: row.section || 'No section',
              value: row.clicks || 0,
              suffix: 'clicks'
            }))}
          />
          <AnalyticsList
            title="Most visited pages"
            icon={MonitorUp}
            rows={(analytics.pages || []).map((row) => ({
              label: row.path || 'Unknown page',
              meta: `${row.visitors || 0} visitors`,
              value: row.views || 0,
              suffix: 'views'
            }))}
          />
          <div className="space-y-5">
            <BusinessInsightPanel analytics={analytics} />
            <DatabaseHealthPanel
              dbHealth={dbHealth}
              onRefresh={() => loadDatabaseHealth()}
              refreshing={refreshingHealth}
              onCleanup={cleanupAnalytics}
              cleaning={cleaningAnalytics}
            />
          </div>
        </div>
        </div>
      ) : null}

      {activeSubTab === 'activity' ? (
        <div className="premium-glass p-6 relative z-10" data-analytics-section="Recent platform runs">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-crimson mb-1 flex items-center gap-1.5">
              <Activity size={12} /> Activity
            </div>
            <h3 className="text-xl font-black tracking-tight text-gray-900">Recent platform activity</h3>
          </div>
          <div className="admin-content-icon-tile h-10 w-10 rounded-2xl bg-brand-pink/30 flex items-center justify-center ring-1 ring-brand-crimson/10">
             <Activity size={18} className="text-brand-crimson" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {recentRuns.map((run) => {
            const owner = run.userId || run.triggeredByUser || {};
            const isSuccess = run.status === 'success';
            const isFailed = run.status === 'failed';
            const isRunning = run.status === 'running' || run.status === 'queued';
            const isExpanded = expandedPlatformRunId === run._id;
            const messages = Array.isArray(run.progressMessages) ? run.progressMessages : [];
            return (
              <button
                key={run._id}
                type="button"
                onClick={() => setExpandedPlatformRunId(isExpanded ? '' : run._id)}
                className="relative overflow-hidden rounded-xl bg-white p-5 text-left border border-gray-100 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5"
              >
                <div className="absolute top-0 right-0 p-5">
                  <div className={`h-2.5 w-2.5 rounded-full ${
                    isSuccess ? 'bg-emerald-400 glow-dot-success' 
                    : isFailed ? 'bg-red-500 glow-dot-error'
                    : 'bg-blue-400 glow-dot-running'
                  }`} />
                </div>
                <div className="mb-3 flex items-center justify-between gap-3 pr-6">
                  <span className={`tag px-2.5 py-1 ${
                    isSuccess ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60'
                    : isFailed ? 'bg-red-50 text-red-700 ring-1 ring-red-200/60'
                    : 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/60'
                  }`}>
                    {run.status}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                    {run.startedAt ? formatDistanceToNow(new Date(run.startedAt), { addSuffix: true }) : '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="font-black text-gray-900 text-base">{owner.name || owner.email || 'Unknown user'}</div>
                  <span className="inline-flex items-center gap-1 rounded-lg bg-gray-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-gray-400 ring-1 ring-gray-100">
                    Details <ChevronDown size={12} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 bg-gray-50/80 rounded-lg p-2.5 border border-gray-100/50">
                  <div className="text-center">
                    <div className="text-[10px] font-black uppercase text-gray-400">Fetched</div>
                    <div className="font-black text-gray-700 mt-0.5">{run.totalFetched || 0}</div>
                  </div>
                  <div className="text-center border-l border-r border-gray-200/60">
                    <div className="text-[10px] font-black uppercase text-gray-400">Stored</div>
                    <div className="font-black text-gray-700 mt-0.5">{run.totalInserted || 0}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] font-black uppercase text-gray-400">Errors</div>
                    <div className="font-black text-red-500 mt-0.5">{run.totalErrors || 0}</div>
                  </div>
                </div>
                {isExpanded ? (
                  <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <UsageMini label="Matched" value={compactNumber(run.totalMatched || 0)} />
                      <UsageMini label="Rejected" value={compactNumber(run.totalRejected || 0)} />
                      <UsageMini label="AI ignored" value={compactNumber(run.totalAiIgnored || 0)} />
                      <UsageMini label="Duplicates" value={compactNumber(run.totalDuplicates || 0)} />
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3 ring-1 ring-gray-100">
                      <div className="mb-2 text-[10px] font-black uppercase tracking-[0.15em] text-gray-400">Progress messages</div>
                      <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                        {messages.length ? messages.slice(-30).map((item, index) => (
                          <div key={`${run._id}-msg-${index}`} className="rounded-lg bg-white px-3 py-2 ring-1 ring-gray-100">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-[10px] font-black uppercase tracking-wider text-gray-400">{item.step || 'process'}</span>
                              <span className="shrink-0 text-[10px] font-semibold text-gray-400">
                                {item.at ? formatDistanceToNow(new Date(item.at), { addSuffix: true }) : ''}
                              </span>
                            </div>
                            <div className="mt-1 text-xs font-semibold leading-relaxed text-gray-600">{item.message || '-'}</div>
                          </div>
                        )) : (
                          <div className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-4 text-center text-xs font-semibold text-gray-400">
                            No saved progress messages for this older run.
                          </div>
                        )}
                      </div>
                    </div>
                    <DebugSamples samples={run.debugSamples} />
                  </div>
                ) : null}
              </button>
            );
          })}
          {!recentRuns.length && (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white/50 p-10 text-center text-sm font-bold text-gray-400 lg:col-span-2">
              <Activity size={24} className="mx-auto mb-2 opacity-50" />
              No platform activity yet.
            </div>
          )}
        </div>
        </div>
      ) : null}
    </div>
  );
}

function PlatformMetric({ icon: Icon, label, value, detail, danger = false }) {
  return (
    <div className="premium-glass p-5 relative overflow-hidden">
      <div className="relative z-10 flex items-start gap-4">
        <span className={`admin-content-icon-tile flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-sm ${danger ? 'bg-gradient-to-br from-red-50 to-red-100 text-red-600 border border-red-200/50' : 'bg-gradient-to-br from-brand-pink/60 to-[#F9C416]/15 text-brand-crimson border border-[#F9C416]/25'}`}>
          <Icon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black uppercase tracking-[0.1em] text-gray-400">{label}</div>
          <div className={`mt-1 text-2xl font-black tracking-tight ${danger ? 'text-red-600' : 'text-gray-900'}`}>{value}</div>
          <div className="mt-1.5 text-xs font-medium text-gray-500 leading-snug">{detail}</div>
        </div>
      </div>
    </div>
  );
}

function SystemHealthCard({ usage, failedPct, recentRuns = [] }) {
  const storageUsed = Number(usage.totalArticles || 0);
  const storageLevel = Math.min(100, Math.round(storageUsed / 25));
  const lastRun = recentRuns[0] || null;
  const latestStatus = String(lastRun?.status || 'unknown');
  const queueState = latestStatus === 'running' || latestStatus === 'queued'
    ? 'In progress'
    : Number(usage.monthRuns || 0) > 0
      ? 'Recent activity'
      : 'No runs yet';
  const healthItems = [
    { label: 'Latest run', value: latestStatus === 'unknown' ? 'No data' : latestStatus, tone: latestStatus === 'failed' ? 'amber' : latestStatus === 'success' ? 'emerald' : latestStatus === 'running' || latestStatus === 'queued' ? 'blue' : 'gray' },
    { label: 'Failure rate', value: `${failedPct}%`, tone: failedPct > 20 ? 'amber' : 'emerald' },
    { label: 'Queue', value: queueState, tone: latestStatus === 'running' || latestStatus === 'queued' ? 'blue' : 'gray' },
    { label: 'Runs this month', value: compactNumber(usage.monthRuns || 0), tone: 'gray' },
    { label: 'Storage', value: `${storageLevel}%`, tone: storageLevel > 80 ? 'amber' : 'emerald' }
  ];

  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    blue: 'bg-blue-50 text-blue-700 ring-blue-100',
    gray: 'bg-gray-50 text-gray-600 ring-gray-100'
  };

  return (
    <div className="rounded-[26px] border border-gray-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-crimson">System Health</div>
          <h4 className="mt-1 text-lg font-black tracking-tight text-gray-950">Core services</h4>
        </div>
        <span className="admin-content-icon-tile flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-pink/35 text-brand-crimson">
          <Server size={18} />
        </span>
      </div>

      <div className="space-y-2.5">
        {healthItems.map((item) => (
          <div key={item.label} className="flex flex-col gap-2 rounded-2xl bg-gray-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-bold text-gray-700">{item.label}</span>
            <span className={`inline-flex w-fit items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ring-1 ${tones[item.tone]}`}>
              <span className="h-2 w-2 rounded-full bg-current opacity-70" />
              {item.value}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">Signal Storage</div>
            <div className="mt-1 text-sm font-black text-gray-900">{storageUsed.toLocaleString()} records</div>
          </div>
          <span className="admin-content-icon-tile flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-gray-700 ring-1 ring-gray-100">
            <HardDrive size={18} />
          </span>
        </div>
        <div className="mt-3 h-2 rounded-full bg-white ring-1 ring-gray-100">
          <div className="h-full rounded-full bg-gradient-to-r from-brand-crimson to-[#F9C416]" style={{ width: `${Math.max(8, storageLevel)}%` }} />
        </div>
      </div>
    </div>
  );
}

function formatDuration(ms) {
  const seconds = Math.round(Number(ms || 0) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remaining}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function compactNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatMegabytes(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return '0 MB';
  if (numeric >= 1024) return `${(numeric / 1024).toFixed(2)} GB`;
  if (numeric >= 100) return `${Math.round(numeric)} MB`;
  return `${numeric.toFixed(1)} MB`;
}

// eslint-disable-next-line no-unused-vars
function formatSessionDate(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleString();
}

function AnalyticsKpi({ icon: Icon, label, value, detail, color, bg }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className={`admin-content-icon-tile flex h-9 w-9 items-center justify-center rounded-lg ${bg} ${color}`}>
          <Icon size={16} />
        </span>
        <span className="truncate text-[10px] font-black uppercase tracking-wider text-gray-400">{label}</span>
      </div>
      <div className="truncate text-2xl font-black tracking-tight text-gray-900">{typeof value === 'number' ? compactNumber(value) : value}</div>
      <div className="mt-1 truncate text-xs font-semibold text-gray-400">{detail}</div>
    </div>
  );
}

function AnalyticsTrend({ data }) {
  const max = Math.max(...(data || []).map((row) => Math.max(row.pageViews || 0, row.clicks || 0)), 1);
  const visible = (data || []).slice(-10);

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm xl:col-span-1">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">Daily trend</div>
          <h4 className="text-base font-black tracking-tight text-gray-900">Views vs clicks</h4>
        </div>
        <Activity size={18} className="text-brand-crimson" />
      </div>
      <div className="flex h-48 items-end gap-1.5 sm:gap-2">
        {visible.map((row) => {
          const viewHeight = Math.max(6, ((row.pageViews || 0) / max) * 100);
          const clickHeight = Math.max(4, ((row.clicks || 0) / max) * 100);
          return (
            <div key={row.day} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="flex h-36 w-full items-end justify-center gap-1 rounded-lg bg-gray-50 px-1 py-2">
                <span className="w-2 rounded-t bg-brand-crimson/70" style={{ height: `${viewHeight}%` }} title={`${row.pageViews || 0} page views`} />
                <span className="w-2 rounded-t bg-amber-400" style={{ height: `${clickHeight}%` }} title={`${row.clicks || 0} clicks`} />
              </div>
              <span className="truncate text-[9px] font-black uppercase text-gray-400">{String(row.day || '').slice(5)}</span>
            </div>
          );
        })}
        {!visible.length && <div className="flex h-full w-full items-center justify-center text-sm font-bold text-gray-400">No analytics yet.</div>}
      </div>
      <div className="mt-4 flex items-center gap-4 text-[10px] font-black uppercase tracking-wider text-gray-400">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded bg-brand-crimson/70" /> Views</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded bg-amber-400" /> Clicks</span>
      </div>
    </div>
  );
}

function AnalyticsSectionTable({ rows }) {
  const maxDuration = Math.max(...(rows || []).map((row) => row.totalDurationMs || 0), 1);

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm xl:col-span-2">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">Dwell time</div>
          <h4 className="text-base font-black tracking-tight text-gray-900">Sections people spend time on</h4>
        </div>
        <Timer size={18} className="text-brand-crimson" />
      </div>
      <div className="space-y-3">
        {(rows || []).slice(0, 8).map((row) => (
          <div key={row.section} className="rounded-lg border border-gray-100 bg-gray-50/70 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-gray-900">{row.section}</div>
                <div className="text-[11px] font-semibold text-gray-400">
                  {compactNumber(row.views)} views · {compactNumber(row.visitors)} visitors · {row.clickRate || 0}% click rate
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-black text-brand-crimson">{formatDuration(row.totalDurationMs)}</div>
                <div className="text-[10px] font-bold uppercase text-gray-400">total</div>
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white">
              <div className="h-full rounded-full bg-brand-crimson" style={{ width: `${Math.max(4, ((row.totalDurationMs || 0) / maxDuration) * 100)}%` }} />
            </div>
          </div>
        ))}
        {!rows?.length && <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center text-sm font-bold text-gray-400">Section data will appear after users browse the app.</div>}
      </div>
    </div>
  );
}

function AnalyticsList({ title, icon: Icon, rows }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h4 className="text-base font-black tracking-tight text-gray-900">{title}</h4>
        <Icon size={18} className="text-brand-crimson" />
      </div>
      <div className="space-y-2">
        {(rows || []).slice(0, 7).map((row, index) => (
          <div key={`${row.label}-${index}`} className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-xs font-black text-brand-crimson ring-1 ring-gray-100">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-black text-gray-800">{row.label}</div>
              <div className="truncate text-[11px] font-semibold text-gray-400">{row.meta}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-black text-gray-900">{compactNumber(row.value)}</div>
              <div className="text-[9px] font-black uppercase text-gray-400">{row.suffix}</div>
            </div>
          </div>
        ))}
        {!rows?.length && <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center text-sm font-bold text-gray-400">No data yet.</div>}
      </div>
    </div>
  );
}

function BusinessInsightPanel({ analytics }) {
  const totals = analytics?.totals || {};
  const topSection = analytics?.sections?.[0];
  const topClick = analytics?.clicks?.[0];
  const topPage = analytics?.pages?.[0];
  const insights = [
    topSection ? `People spend the most time on "${topSection.section}", so use it for the strongest business content.` : 'Dwell-time insights will appear after tracked section views.',
    topClick ? `"${topClick.label}" is the most clicked action; keep it visible and test stronger placement.` : 'Click insights need more user activity.',
    topPage ? `${topPage.path} is the most visited page; prioritize improvements and conversion actions there.` : 'Page popularity will appear after visits.',
    `${totals.engagementRate || 0}% engaged sessions and ${totals.bounceRate || 0}% bounce rate give a quick quality signal.`
  ];

  return (
    <div className="admin-decision-notes-card rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-brand-crimson">Decision notes</div>
          <h4 className="text-base font-black tracking-tight text-gray-900">What to act on</h4>
        </div>
        <Sparkles size={18} className="text-brand-crimson" />
      </div>
      <div className="space-y-3">
        {insights.map((item, index) => (
          <div key={index} className="admin-decision-note-item flex gap-3 rounded-lg bg-white/70 p-3 ring-1 ring-white">
            <ChevronRight size={15} className="mt-0.5 shrink-0 text-brand-crimson" />
            <p className="text-sm font-semibold leading-relaxed text-gray-600">{item}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DatabaseHealthPanel({ dbHealth, onRefresh, refreshing = false, onCleanup, cleaning = false }) {
  const database = dbHealth?.database || {};
  const analytics = dbHealth?.analytics || {};
  const hygiene = dbHealth?.hygiene || {};
  const collections = Array.isArray(dbHealth?.collections) ? dbHealth.collections.slice().sort((a, b) => Number(b.storageSizeMb || 0) - Number(a.storageSizeMb || 0)).slice(0, 4) : [];
  const cards = [
    { label: 'Database size', value: formatMegabytes(database.storageSizeMb), detail: `${compactNumber(database.objects || 0)} documents` },
    { label: 'Analytics kept', value: compactNumber(analytics.currentMonthEvents || 0), detail: 'Current month events' },
    { label: 'Cleanup queue', value: compactNumber(analytics.pendingCleanup || 0), detail: 'Old analytics waiting to clear' },
    { label: 'Old logs', value: compactNumber(hygiene.logsPendingTtlCleanup || 0), detail: 'TTL will remove these' }
  ];

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-brand-crimson">Database health</div>
          <h4 className="text-base font-black tracking-tight text-gray-900">Live storage watch</h4>
          <div className="mt-1 text-xs font-semibold text-gray-400">
            {dbHealth?.checkedAt ? `Updated ${new Date(dbHealth.checkedAt).toLocaleTimeString()}` : 'Waiting for metrics'}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white text-gray-600 ring-1 ring-gray-200 transition hover:bg-gray-50 disabled:opacity-50"
            title="Refresh database health"
          >
            {refreshing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          </button>
          <button
            type="button"
            onClick={onCleanup}
            disabled={cleaning}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-600 ring-1 ring-red-100 transition hover:bg-red-100 disabled:opacity-50"
            title="Delete old analytics"
          >
            {cleaning ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((item) => (
          <div key={item.label} className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
            <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">{item.label}</div>
            <div className="mt-1 text-lg font-black tracking-tight text-gray-900">{item.value}</div>
            <div className="mt-1 text-[11px] font-semibold text-gray-400">{item.detail}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50/70 p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">Heaviest collections</div>
          <HardDrive size={15} className="text-brand-crimson" />
        </div>
        <div className="space-y-2">
          {collections.map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 ring-1 ring-gray-100">
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-gray-800">{item.label}</div>
                <div className="text-[11px] font-semibold text-gray-400">{compactNumber(item.count || 0)} docs</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-black text-gray-900">{formatMegabytes(item.storageSizeMb)}</div>
                <div className="text-[10px] font-semibold text-gray-400">storage</div>
              </div>
            </div>
          ))}
          {!collections.length && <div className="rounded-md border border-dashed border-gray-200 p-4 text-center text-sm font-bold text-gray-400">Collection metrics are not available yet.</div>}
        </div>
      </div>
    </div>
  );
}

// =============== ARTICLES TAB ===============

function ArticlesTab({ ownerOnly = false }) {
  const [filters, setFilters] = useState({});
  const getCacheKey = useCallback((f = filters, page = 1) => JSON.stringify({ ownerOnly, filters: f || {}, page }), [filters, ownerOnly]);
  const initialCache = superAdminArticlesCache.get(getCacheKey({}, 1));
  const [items, setItems] = useState(() => initialCache?.items || []);
  const [pagination, setPagination] = useState(() => initialCache?.pagination || { page: 1, total: 0, pages: 0 });
  const [loading, setLoading] = useState(() => !initialCache);
  const [selected, setSelected] = useState(new Set());
  const filterMetaParams = useMemo(() => (
    ownerOnly ? { ownerOnly: 'true' } : {}
  ), [ownerOnly]);

  const load = useCallback(async (f = filters, page = 1, { silent = false } = {}) => {
    const cacheKey = getCacheKey(f, page);
    if (!silent) setLoading(true);
    try {
      const params = { page, limit: 24 };
      if (ownerOnly) params.ownerOnly = 'true';
      for (const [k, v] of Object.entries(f || {})) if (v) params[k] = v;
      const { data } = await api.get('/articles', { params });
      const nextPagination = { page: data.page, total: data.total, pages: data.pages };
      superAdminArticlesCache.set(cacheKey, { items: data.items, pagination: nextPagination });
      setItems(data.items);
      setPagination(nextPagination);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filters, getCacheKey, ownerOnly]);

  useEffect(() => {
    setSelected(new Set());
    load(filters, 1, { silent: superAdminArticlesCache.has(getCacheKey(filters, 1)) });
  }, [filters, getCacheKey, load]);

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

  const remove = async (item) => {
    if (!confirm('Delete this article permanently?')) return;
    await api.delete(`/admin/articles/${item._id}`);
    load(filters, pagination.page);
  };

  return (
    <div className="admin-articles-page space-y-5">
      <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:p-4">
        <Filters
          initial={filters}
          onChange={setFilters}
          showAdmin
          showStatusFilter={false}
          metaParams={filterMetaParams}
        />
      </div>

      {selected.size > 0 && (
        <div className="rounded-2xl border border-brand-crimson/10 bg-brand-pink/20 p-3 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-sm font-black text-gray-800">
            {selected.size} selected
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => bulk('delete')} className="admin-bulk-delete-button inline-flex items-center gap-2 rounded-xl bg-brand-crimson px-3 py-2 text-sm font-black text-white ring-1 ring-brand-crimson/30 hover:bg-brand-crimson/90">
              <Trash2 size={14} /> Delete
            </button>
            <button onClick={clearSelection} className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-gray-500 ring-1 ring-gray-200 hover:bg-gray-50">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 text-sm font-bold text-gray-500 sm:flex-row sm:items-center sm:justify-between">
        <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-gray-100">
          {loading ? '…' : `${pagination.total} articles`}
          {pagination.pages > 1 && ` · Page ${pagination.page} of ${pagination.pages}`}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={selectAll} className="rounded-xl bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wider text-gray-500 ring-1 ring-gray-100 hover:text-gray-900">
            Select all on page
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {items.map((item) => (
            <ArticleCard
              key={item._id}
              item={item}
              selectable
              selected={selected.has(item._id)}
              onSelect={toggleSelect}
              adminActions={
                <>
                  <button onClick={() => remove(item)} className="btn-ghost text-[12px] text-red-600 hover:bg-red-50">
                    <Trash2 size={12} /> Delete
                  </button>
                </>
              }
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <button
            disabled={pagination.page <= 1}
            onClick={() => load(filters, pagination.page - 1)}
            className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-black text-gray-700 ring-1 ring-gray-200 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="rounded-xl bg-white px-3 py-2 text-sm font-black text-gray-600 ring-1 ring-gray-100">
            {pagination.page} / {pagination.pages}
          </span>
          <button
            disabled={pagination.page >= pagination.pages}
            onClick={() => load(filters, pagination.page + 1)}
            className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-black text-gray-700 ring-1 ring-gray-200 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// =============== SUPER ADMIN FETCH ===============

function SuperAdminFetchTab({ activeSubTab = 'setup' }) {
  const { runProgress, setRunProgress } = useAuth();
  const [profileMeta, setProfileMeta] = useState(null);
  const [config, setConfig] = useState(null);
  const [sourceCatalog, setSourceCatalog] = useState({});
  const [status, setStatus] = useState({ running: false, logId: '' });
  const [lastLog, setLastLog] = useState(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('');
  const [autosaveStatus, setAutosaveStatus] = useState('saved');
  const managerTab = activeSubTab === 'sources' ? 'sources' : activeSubTab === 'trust' ? 'trust' : 'setup';
  const [sourceCountry, setSourceCountry] = useState('');
  const [sourceType, setSourceType] = useState('news');
  const [customCountryInput, setCustomCountryInput] = useState('');
  const [draftCountries, setDraftCountries] = useState([]);
  const [sourceInput, setSourceInput] = useState('');
  const [sourceManagerNotice, setSourceManagerNotice] = useState('');
  const hasLocalEditsRef = useRef(false);
  const saveTimerRef = useRef(null);
  const saveVersionRef = useRef(0);
  const browserTimezones = useMemo(() => getBrowserTimezones(), []);

  const load = useCallback(async () => {
    const [meta, cfg, stat, logs] = await Promise.all([
      api.get('/articles/meta/filters'),
      api.get('/admin/super/fetch/config'),
      api.get('/admin/super/fetch/status'),
      api.get('/admin/logs', { params: { limit: 1 } })
    ]);
    setProfileMeta(meta.data);
    if (!hasLocalEditsRef.current) {
      setConfig(cfg.data.config);
    }
    setSourceCatalog(cfg.data.sourceCatalog || {});
    setStatus(stat.data);
    setLastLog(logs.data.items?.[0] || null);
  }, []);

  useEffect(() => {
    load().catch((e) => setMsg(`Error: ${e.message}`));
    const id = setInterval(() => load().catch(() => {}), 5000);
    return () => {
      clearInterval(id);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [load]);

  useEffect(() => {
    if (runProgress && !['running', 'queued'].includes(runProgress.status)) {
      setRunning(false);
      load().catch(() => {});
    }
  }, [runProgress?.status, load]);

  const countries = profileMeta?.fetchCountries || [];
  const selectedCountries = Array.isArray(config?.countries) ? config.countries : [];
  const selectedTopics = Array.isArray(config?.topics) && config.topics.length ? config.topics : TOPIC_OPTIONS.map((topic) => topic.key);
  const customSourceCountries = Object.keys(config?.sourceDomainsByCountry || {});
  const sourceCountries = Array.from(new Set([
    ...countries,
    ...Object.keys(sourceCatalog || {}),
    ...customSourceCountries,
    ...draftCountries
  ])).sort((a, b) => a.localeCompare(b));
  const fetchSetupCountries = Array.from(new Set([
    ...countries,
    ...customSourceCountries
  ])).sort((a, b) => a.localeCompare(b));
  const isBusy = Boolean(status.running) || running || (runProgress && ['running', 'queued'].includes(runProgress.status));
  const scheduleEnabled = Boolean(config?.schedule?.enabled);
  const scheduleTimezone = config?.schedule?.timezone || config?.timezone || 'Asia/Kolkata';
  const scheduleTime = config?.schedule?.time || '07:00';
  const lastScheduledRunAt = config?.schedule?.lastRunAt;
  const activeRunMessage = Array.isArray(runProgress?.messages)
    ? runProgress.messages.find((item) => String(item?.message || '').toLowerCase().includes('scheduler'))
    : null;
  const scheduledRunActive = Boolean(status.running) && Boolean(activeRunMessage);
  const nextCheckLabel = scheduleEnabled
    ? `${config?.schedule?.frequency === 'weekly' ? 'Weekly' : 'Daily'} at ${scheduleTime} (${scheduleTimezone})`
    : 'Scheduler is disabled';
  const lastRunLabel = lastScheduledRunAt
    ? formatDistanceToNow(new Date(lastScheduledRunAt), { addSuffix: true })
    : 'No scheduled run yet';
  const effectiveRunProgress = runProgress || (
    status.running && status.logId
      ? {
          runId: status.logId,
          logId: status.logId,
          status: 'running',
          step: 'queued',
          percent: 5,
          messages: [
            {
              at: new Date().toISOString(),
              step: 'queued',
              message: 'Platform fetch queued from scheduler.'
            }
          ]
        }
      : null
  );

  useEffect(() => {
    if (!sourceCountries.length) return;
    if (sourceCountry && sourceCountries.includes(sourceCountry)) return;
    setSourceCountry(selectedCountries[0] || sourceCountries[0] || '');
  }, [sourceCountry, sourceCountries, selectedCountries]);

  const persistConfig = useCallback(async (configToSave, { manual = false, version: providedVersion } = {}) => {
    if (!configToSave) return configToSave;
    const version = providedVersion || ++saveVersionRef.current;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (manual) setSaving(true);
    setAutosaveStatus('saving');
    try {
      const { data } = await api.put('/admin/super/fetch/config', configToSave);
      if (version === saveVersionRef.current) {
        hasLocalEditsRef.current = false;
        setConfig(data.config);
        setAutosaveStatus('saved');
      }
      return data.config;
    } catch (e) {
      if (version === saveVersionRef.current) {
        setAutosaveStatus('error');
        setMsg(`Error: ${e.message}`);
      }
      throw e;
    } finally {
      if (manual) setSaving(false);
    }
  }, []);

  const scheduleAutosave = useCallback((nextConfig) => {
    if (!nextConfig) return;
    hasLocalEditsRef.current = true;
    const version = ++saveVersionRef.current;
    setAutosaveStatus('pending');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      persistConfig(nextConfig, { version }).catch(() => {});
    }, 700);
  }, [persistConfig]);

  const changeConfig = useCallback((updater) => {
    setConfig((prev) => {
      const next = typeof updater === 'function' ? updater(prev || {}) : updater;
      scheduleAutosave(next);
      return next;
    });
  }, [scheduleAutosave]);

  const update = (key, value) => changeConfig((prev) => ({ ...(prev || {}), [key]: value }));
  const updateSchedule = (key, value) => changeConfig((prev) => ({
    ...(prev || {}),
    schedule: { ...((prev || {}).schedule || {}), [key]: value }
  }));
  const updateCountrySources = useCallback((country, type, value) => {
    const items = Array.from(new Set(
      Array.isArray(value)
        ? value
        : String(value || '')
          .split(/[\n,]+/)
          .map((item) => item.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase())
          .filter(Boolean)
    ));

    changeConfig((prev) => {
      const current = prev || {};
      const existing = { ...(current.sourceDomainsByCountry || {}) };
      const nextCountry = {
        ...(existing[country] || {}),
        [type]: items
      };
      if (!nextCountry.news?.length && !nextCountry.govt?.length && !nextCountry.competitor?.length && !nextCountry.evergreen?.length) {
        delete existing[country];
      } else {
        existing[country] = nextCountry;
      }
      const hasCountrySources = Boolean(existing[country]);
      const isDefaultCountry = countries.includes(country);
      const nextCountries = hasCountrySources
        ? Array.from(new Set([...(current.countries || []), country]))
        : isDefaultCountry
          ? (current.countries || [])
          : (current.countries || []).filter((item) => item !== country);

      return {
        ...current,
        countries: nextCountries,
        sourceDomainsByCountry: existing
      };
    });
  }, [changeConfig, countries]);

  const addCustomCountry = useCallback(() => {
    const countriesToAdd = Array.from(new Set(
      String(customCountryInput || '')
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    ));
    if (!countriesToAdd.length) return;
    setDraftCountries((prev) => Array.from(new Set([...(prev || []), ...countriesToAdd])));
    setSourceCountry(countriesToAdd[0] || '');
    setSourceManagerNotice(`${countriesToAdd.length} countr${countriesToAdd.length === 1 ? 'y is' : 'ies are'} ready. Add at least one source to save.`);
    setCustomCountryInput('');
  }, [customCountryInput]);

  const removeCustomSource = useCallback((country, type, domain) => {
    if (!country || !type || !domain) return;
    const nextItems = (config?.sourceDomainsByCountry?.[country]?.[type] || []).filter((item) => item !== domain);
    updateCountrySources(country, type, nextItems);
    setSourceManagerNotice(`${domain} removed.`);
  }, [config?.sourceDomainsByCountry, updateCountrySources]);

  const toggleCountry = (country) => {
    const next = selectedCountries.includes(country)
      ? selectedCountries.filter((item) => item !== country)
      : [...selectedCountries, country];
    update('countries', next);
  };

  const toggleTopic = (topic) => {
    const next = selectedTopics.includes(topic)
      ? selectedTopics.filter((item) => item !== topic)
      : [...selectedTopics, topic];
    if (next.length) update('topics', next);
  };

  const saveConfig = async () => {
    setMsg('');
    try {
      const saved = await persistConfig(config, { manual: true });
      setMsg(saved.schedule?.enabled ? 'Platform fetch settings and scheduler saved.' : 'Platform fetch settings saved.');
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    }
  };

  const runFetch = async () => {
    setRunning(true);
    setMsg('');
    try {
      const configForRun = hasLocalEditsRef.current ? await persistConfig(config) : config;
      const { data } = await api.post('/admin/super/fetch/run', { config: configForRun });
      const logId = data.logId || data.runId;
      setConfig(data.config || config);
      setRunProgress({
        runId: logId,
        logId,
        status: 'running',
        step: 'queued',
        percent: 5,
        messages: [{ at: new Date().toISOString(), step: 'queued', message: 'Platform fetch queued for selected countries and topics.' }]
      });
      setMsg(`Platform fetch started. Log ID: ${logId}`);
      await load();
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setRunning(false);
    }
  };

  const selectedSourceDefaults = sourceCatalog?.[sourceCountry]?.[sourceType] || [];
  const selectedSourceCustom = config?.sourceDomainsByCountry?.[sourceCountry]?.[sourceType] || [];
  const selectedSourceEffective = Array.from(new Set([...(selectedSourceDefaults || []), ...(selectedSourceCustom || [])]));
  const showFetchActivity = managerTab === 'setup';

  const addSourceEntries = useCallback((rawValue) => {
    if (!sourceCountry) {
      setSourceManagerNotice('Select or add a country before adding sources.');
      return;
    }
    const parsed = parseSourceDomains(rawValue);
    if (!parsed.length) {
      setSourceManagerNotice('Enter at least one valid domain, for example example.com.');
      return;
    }

    const defaultSet = new Set(selectedSourceDefaults);
    const existingSet = new Set(selectedSourceCustom);
    const nextItems = [...selectedSourceCustom];
    let added = 0;
    let skipped = 0;

    parsed.forEach((domain) => {
      if (defaultSet.has(domain) || existingSet.has(domain)) {
        skipped += 1;
        return;
      }
      existingSet.add(domain);
      nextItems.push(domain);
      added += 1;
    });

    if (added) {
      updateCountrySources(sourceCountry, sourceType, nextItems);
      setDraftCountries((prev) => (prev || []).filter((country) => country !== sourceCountry));
      setSourceInput('');
    }
    setSourceManagerNotice(
      added
        ? `${added} source${added === 1 ? '' : 's'} added${skipped ? `, ${skipped} duplicate${skipped === 1 ? '' : 's'} skipped` : ''}.`
        : `${skipped} duplicate source${skipped === 1 ? '' : 's'} skipped.`
    );
  }, [selectedSourceCustom, selectedSourceDefaults, sourceCountry, sourceType, updateCountrySources]);

  if (!config || !profileMeta) return <Loader />;

  return (
    <div className={`super-admin-fetch-page ${showFetchActivity ? 'grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]' : 'grid grid-cols-1 gap-5'}`}>
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-crimson text-white shadow-sm">
              <Globe2 size={18} />
            </span>
            <div className="min-w-0">
              <div className="eyebrow mb-1 text-brand-crimson/80">Shared fetch</div>
              <h3 className="text-xl font-black tracking-tight text-gray-900">Platform Intelligence Fetch</h3>
              <p className="mt-1 text-sm text-gray-500">Super admin runs once; fetched results become visible across all admins and users.</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center xl:justify-end">
            <span className={[
              'inline-flex w-fit items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-black uppercase tracking-wider',
              isBusy ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700'
            ].join(' ')}>
              <span className={`h-2 w-2 rounded-full ${isBusy ? 'bg-orange-500 animate-pulse' : 'bg-emerald-500'}`} />
              {isBusy ? 'Running...' : 'Idle'}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          {managerTab === 'setup' ? (
            <div>
              <FetchField label="Countries">
                <div className="grid max-h-[360px] grid-cols-1 gap-2 overflow-y-auto rounded-2xl border border-gray-100 bg-gray-50 p-2 sm:grid-cols-2 xl:grid-cols-3">
                  {fetchSetupCountries.map((country) => {
                    const checked = selectedCountries.includes(country);
                    const isCustom = !countries.includes(country);
                    return (
                      <label key={country} className={`admin-fetch-choice flex min-h-[42px] cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition-all ${checked ? 'admin-fetch-choice-selected border-brand-crimson bg-white text-gray-900 shadow-sm' : 'border-gray-100 bg-white/70 text-gray-600 hover:bg-white'}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleCountry(country)} className="h-4 w-4 rounded border-gray-300 text-brand-crimson focus:ring-brand-crimson/30" />
                        <span className="min-w-0 truncate">{country}</span>
                        {isCustom && <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-500">Custom</span>}
                      </label>
                    );
                  })}
                </div>
              </FetchField>
            </div>
          ) : managerTab === 'sources' ? (
            <div className="admin-country-sources space-y-5">
              <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,_#ffffff,_#f8fafc_60%,_#fff1f2)] p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="max-w-2xl">
                    <div className="text-[11px] font-black uppercase tracking-[0.28em] text-brand-crimson/75">Country Sources</div>
                    <h4 className="mt-2 text-[28px] font-black leading-tight tracking-[-0.03em] text-slate-950">Manage country sources</h4>
                    <p className="mt-2 text-[15px] leading-7 text-slate-500">Choose a country, select the source type, add domains in bulk, and remove any incorrect source with one click.</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-2xl border border-white bg-white/90 px-4 py-3 shadow-sm">
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Default</div>
                      <div className="mt-1 text-xl font-black text-slate-950">{selectedSourceDefaults.length}</div>
                    </div>
                    <div className="rounded-2xl border border-white bg-white/90 px-4 py-3 shadow-sm">
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Custom</div>
                      <div className="mt-1 text-xl font-black text-slate-950">{selectedSourceCustom.length}</div>
                    </div>
                    <div className="rounded-2xl border border-white bg-white/90 px-4 py-3 shadow-sm">
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Total</div>
                      <div className="mt-1 text-xl font-black text-slate-950">{selectedSourceEffective.length}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
                <div className="space-y-4">
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                    <FetchField label="Country">
                      <CountrySourceSelect
                        value={sourceCountry}
                        options={sourceCountries}
                        onChange={setSourceCountry}
                      />
                    </FetchField>
                    <div className="mt-3 text-xs font-medium leading-6 text-slate-500">
                      Countries added here will also be available in the Fetch Settings tab.
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                    <FetchField label="Add new countries">
                      <textarea
                        className="input min-h-[140px] rounded-2xl !py-3"
                        value={customCountryInput}
                        onChange={(e) => setCustomCountryInput(e.target.value)}
                        placeholder={'Add one or many countries\n\nExample:\nAbu Dhabi (UAE)\nDoha (Qatar)\nKenya'}
                      />
                    </FetchField>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="text-xs font-medium leading-5 text-slate-500">Use one country per line or separate by commas.</div>
                      <button
                        type="button"
                        onClick={addCustomCountry}
                        disabled={!customCountryInput.trim()}
                        className="admin-source-action-button rounded-2xl bg-brand-crimson px-4 py-2 text-sm font-black text-white transition hover:bg-brand-crimson/90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Add Countries
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <FetchField label="Source type">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {SOURCE_TYPE_OPTIONS.map((item) => {
                        const active = sourceType === item.key;
                        const total = (sourceCatalog?.[sourceCountry]?.[item.key]?.length || 0) + (config?.sourceDomainsByCountry?.[sourceCountry]?.[item.key]?.length || 0);
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => setSourceType(item.key)}
                            className={`rounded-[22px] border px-4 py-4 text-left transition ${active ? 'border-brand-crimson bg-gradient-to-br from-white via-brand-pink/15 to-white text-slate-950 shadow-[0_14px_32px_rgba(22,58,36,0.10)]' : 'border-slate-200 bg-white text-slate-600 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm'}`}
                          >
                            <div className="text-sm font-black">{item.label}</div>
                            <div className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{total} sources</div>
                          </button>
                        );
                      })}
                    </div>
                  </FetchField>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
                    <div className="admin-country-source-editor rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Bulk add sources</div>
                          <div className="mt-2 text-lg font-black text-slate-950">{sourceCountry || 'Select a country'}</div>
                        </div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{sourceType}</span>
                      </div>
                      <textarea
                        className="input mt-4 min-h-[260px] rounded-2xl !py-3"
                        value={sourceInput}
                        onChange={(e) => setSourceInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            addSourceEntries(sourceInput);
                          }
                        }}
                        placeholder={'Add one domain per line\n\nexample.com\ngov.example\nnews.example.org'}
                        disabled={!sourceCountry}
                      />
                      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-xs font-medium leading-6 text-slate-500">
                          Press Enter to add. Use Shift+Enter for a new line, or paste comma-separated domains.
                        </div>
                        <button
                          type="button"
                          onClick={() => addSourceEntries(sourceInput)}
                          disabled={!sourceInput.trim() || !sourceCountry}
                          className="admin-source-action-button inline-flex items-center justify-center rounded-2xl bg-brand-crimson px-4 py-2 text-sm font-black text-white transition hover:bg-brand-crimson/90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Add Sources
                        </button>
                      </div>
                      {sourceManagerNotice && (
                        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                          {sourceManagerNotice}
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div className="admin-source-list-panel rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
                        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Default sources</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {selectedSourceDefaults.length ? selectedSourceDefaults.map((domain) => (
                            <span key={`default-${domain}`} className="rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-sky-700 ring-1 ring-sky-100">{domain}</span>
                          )) : (
                            <span className="text-sm font-medium text-slate-400">No default source for this country and type.</span>
                          )}
                        </div>
                      </div>
                      <div className="admin-source-list-panel rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
                        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Custom sources</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {selectedSourceCustom.length ? selectedSourceCustom.map((domain) => (
                            <button
                              key={`custom-${domain}`}
                              type="button"
                              onClick={() => removeCustomSource(sourceCountry, sourceType, domain)}
                              className="rounded-full bg-brand-pink/25 px-3 py-1.5 text-[11px] font-bold text-brand-crimson ring-1 ring-brand-crimson/10 transition hover:bg-brand-pink/40"
                              title="Remove source"
                            >
                              {domain} x
                            </button>
                          )) : (
                            <span className="text-sm font-medium text-slate-400">No custom source added.</span>
                          )}
                        </div>
                      </div>
                      <div className="admin-source-list-panel rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
                        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Final fetch sources</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {selectedSourceEffective.length ? selectedSourceEffective.map((domain) => (
                            <span
                              key={`effective-${domain}`}
                              className={`rounded-full px-3 py-1.5 text-[11px] font-bold ring-1 ${selectedSourceCustom.includes(domain) ? 'bg-brand-pink/25 text-brand-crimson ring-brand-crimson/10' : 'bg-white text-slate-700 ring-slate-200'}`}
                            >
                              {domain}
                            </span>
                          )) : (
                            <span className="text-sm font-medium text-slate-400">No sources added yet.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-black text-slate-950">{selectedSourceCustom.length} custom sources for {sourceCountry || 'selected country'}</div>
                  <div className={`mt-1 text-[11px] font-black uppercase tracking-[0.18em] ${
                    autosaveStatus === 'error' ? 'text-red-500'
                      : autosaveStatus === 'saved' ? 'text-emerald-600'
                        : 'text-amber-600'
                  }`}>
                    {autosaveStatus === 'saving' ? 'Saving sources...'
                      : autosaveStatus === 'pending' ? 'Source changes will save automatically'
                        : autosaveStatus === 'error' ? 'Source autosave failed'
                          : 'Sources saved'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={saveConfig}
                  disabled={saving}
                  className="admin-source-action-button inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-crimson px-4 py-2.5 text-sm font-black text-white transition hover:bg-brand-crimson/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save Sources
                </button>
              </div>
            </div>
          ) : (
            <SourceTrustRulesPanel />
          )}
        </div>

        {managerTab === 'setup' && (
        <>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <FetchField label="Topics">
            <div className="grid grid-cols-1 gap-2">
              {TOPIC_OPTIONS.map((topic) => (
                <label key={topic.key} className={`admin-fetch-choice flex min-h-[42px] cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-all ${selectedTopics.includes(topic.key) ? 'admin-fetch-choice-selected border-brand-crimson bg-white text-gray-900 shadow-sm' : 'border-gray-100 bg-gray-50 text-gray-600 hover:bg-white'}`}>
                  <input type="checkbox" checked={selectedTopics.includes(topic.key)} onChange={() => toggleTopic(topic.key)} className="h-4 w-4 rounded border-gray-300 text-brand-crimson focus:ring-brand-crimson/30" />
                  <span className="min-w-0 truncate font-black">{topic.label}</span>
                </label>
              ))}
            </div>
          </FetchField>
          <FetchField label="Data age">
            <select className="admin-super-fetch-field-control select min-h-[44px] rounded-xl" value={config.days || 30} onChange={(e) => update('days', Number(e.target.value))}>
              <option value={1}>Last 24 hours</option>
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={180}>Last 180 days</option>
            </select>
          </FetchField>
          <FetchField label="Minimum score">
            <input type="number" min="0" max="100" className="admin-super-fetch-field-control input min-h-[44px] rounded-xl" value={config.minTavilyScore ?? ''} onChange={(e) => update('minTavilyScore', e.target.value)} placeholder="AI default" />
          </FetchField>
        </div>

        <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="eyebrow mb-1">Scheduler</div>
              <h4 className="text-base font-black tracking-tight text-gray-900">Automatic platform fetch</h4>
            </div>
            <Clock3 size={17} className="text-brand-crimson" />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[180px_1fr_1fr_1.2fr] lg:items-end">
            <label className="flex h-[44px] items-center gap-3 rounded-xl border border-gray-100 bg-white px-3 text-sm font-bold text-gray-700">
              <input type="checkbox" checked={Boolean(config.schedule?.enabled)} onChange={(e) => updateSchedule('enabled', e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-crimson focus:ring-brand-crimson/30" />
              Enable schedule
            </label>
            <FetchField label="Frequency">
              <select className="admin-super-fetch-field-control select min-h-[44px] rounded-xl" value={config.schedule?.frequency || 'daily'} onChange={(e) => updateSchedule('frequency', e.target.value)}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </FetchField>
            <FetchField label="Time">
              <input type="time" className="admin-super-fetch-field-control input min-h-[44px] rounded-xl" value={config.schedule?.time || '07:00'} onChange={(e) => updateSchedule('time', e.target.value)} />
            </FetchField>
            <FetchField label="Timezone">
              <select className="admin-super-fetch-field-control select min-h-[44px] rounded-xl" value={config.schedule?.timezone || config.timezone || 'Asia/Kolkata'} onChange={(e) => updateSchedule('timezone', e.target.value)}>
                {browserTimezones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
              </select>
            </FetchField>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className={`rounded-xl border px-3 py-3 ${scheduleEnabled ? 'border-emerald-100 bg-emerald-50/70' : 'border-gray-200 bg-white'}`}>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Status</div>
              <div className={`mt-1 text-sm font-black ${scheduleEnabled ? 'text-emerald-700' : 'text-gray-600'}`}>
                {scheduleEnabled ? 'Enabled and watching time' : 'Disabled'}
              </div>
              <div className="mt-1 text-xs font-medium text-gray-500">
                {scheduleEnabled ? nextCheckLabel : 'Turn on schedule to auto-run platform fetch.'}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-3 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Last scheduled run</div>
              <div className="mt-1 text-sm font-black text-gray-800">{lastRunLabel}</div>
              <div className="mt-1 text-xs font-medium text-gray-500">
                {lastScheduledRunAt ? new Date(lastScheduledRunAt).toLocaleString() : 'This will update after the first auto-trigger.'}
              </div>
            </div>
            <div className={`rounded-xl border px-3 py-3 ${scheduledRunActive ? 'border-orange-200 bg-orange-50/80' : 'border-gray-200 bg-white'}`}>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Live trigger</div>
              <div className={`mt-1 text-sm font-black ${scheduledRunActive ? 'text-orange-700' : 'text-gray-800'}`}>
                {scheduledRunActive ? 'Scheduler triggered a fetch' : 'Waiting for next trigger'}
              </div>
              <div className="mt-1 text-xs font-medium text-gray-500">
                {scheduledRunActive
                  ? 'A scheduled run is active right now and should appear below in live process.'
                  : scheduleEnabled
                    ? `The system will auto-check this rule every minute and trigger at ${scheduleTime}.`
                    : 'No automatic trigger will run until scheduling is enabled.'}
              </div>
            </div>
          </div>
        </div>

        <div className="admin-fetch-summary mt-5 flex flex-col gap-3 rounded-2xl border border-brand-crimson/10 bg-brand-pink/15 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="font-black text-gray-900">{selectedCountries.length} countries, {selectedTopics.length} topics selected</div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">All categories and subcategories are classified during fetch</div>
            <div className={`mt-1 text-[11px] font-black uppercase tracking-wider ${
              autosaveStatus === 'error' ? 'text-red-500'
                : autosaveStatus === 'saved' ? 'text-emerald-600'
                  : 'text-amber-600'
            }`}>
              {autosaveStatus === 'saving' ? 'Saving changes...'
                : autosaveStatus === 'pending' ? 'Changes will save automatically'
                  : autosaveStatus === 'error' ? 'Autosave failed'
                    : 'Changes saved'}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button type="button" onClick={saveConfig} disabled={saving || !selectedCountries.length} className="admin-super-fetch-save-button inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-gray-700 ring-1 ring-gray-200 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </button>
            <button type="button" onClick={runFetch} disabled={isBusy || !selectedCountries.length || !selectedTopics.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-crimson px-4 py-2.5 text-sm font-black text-white transition-all hover:bg-brand-crimson/90 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400">
              {isBusy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Run fetch
            </button>
          </div>
        </div>
        </>
        )}

        {msg && <div className="mt-4 rounded-md bg-gray-50 px-3 py-2 text-[13px] text-gray-600 ring-1 ring-gray-100">{msg}</div>}
        {showFetchActivity && effectiveRunProgress && (
          <div className="mt-4 rounded-lg border border-gray-100 bg-white p-4 ring-1 ring-gray-50">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="eyebrow mb-1">Live process</div>
                <h4 className="text-base font-black tracking-tight text-gray-900">{effectiveRunProgress.status === 'success' ? 'Fetch complete' : effectiveRunProgress.status === 'failed' ? 'Fetch failed' : 'Fetch running'}</h4>
              </div>
              <span className="rounded-md bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-blue-700 ring-1 ring-blue-100">{effectiveRunProgress.step || effectiveRunProgress.status}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div className={`h-full rounded-full transition-all ${effectiveRunProgress.status === 'failed' ? 'bg-red-500' : 'bg-brand-crimson'}`} style={{ width: `${Math.max(5, Math.min(100, Number(effectiveRunProgress.percent || 35)))}%` }} />
            </div>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
              {(effectiveRunProgress.messages || []).slice(-14).map((item, index) => (
                <div key={`${item.at}-${index}`} className="flex gap-2 rounded-md bg-gray-50 px-3 py-2 ring-1 ring-gray-100">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-crimson" />
                  <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">{item.step || 'process'}</div>
                    <div className="text-sm font-medium leading-relaxed text-gray-700">{item.message}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showFetchActivity ? (
        <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="eyebrow mb-1">Last run</div>
                <h3 className="text-lg font-black tracking-tight text-gray-900">Latest platform activity</h3>
              </div>
              <Activity size={17} className="text-brand-crimson" />
            </div>
            {!lastLog ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm font-semibold text-gray-400">No logs yet.</div>
            ) : (
              <div className="mt-3 space-y-3">
                <Stat label="Status" value={lastLog.status} />
                <Stat label="Started" value={lastLog.startedAt ? formatDistanceToNow(new Date(lastLog.startedAt), { addSuffix: true }) : '-'} />
                <Stat label="Fetched" value={lastLog.totalFetched} />
                <Stat label="Matched" value={lastLog.totalMatched ?? lastLog.resultCount ?? 0} />
                <Stat label="Rejected" value={lastLog.totalRejected ?? 0} />
                <Stat label="AI Ignored" value={lastLog.totalAiIgnored ?? 0} />
                <Stat label="Inserted" value={lastLog.totalInserted} highlight />
                <Stat label="Duplicates" value={lastLog.totalDuplicates} />
                <Stat label="Errors" value={lastLog.totalErrors} />
                <Stat label="Duration" value={lastLog.durationMs ? `${Math.round(lastLog.durationMs / 1000)}s` : '-'} />
                <DebugSamples samples={lastLog.debugSamples} />
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// =============== FETCH TAB ===============

export function FetchTab({ embedded = false }) {
  const { user, updateProfile, runProgress, setRunProgress, refreshMe } = useAuth();
  const canUseFetch = user?.role === 'super_admin' || user?.access?.canFetch === true || (user?.role === 'admin' && user?.access?.canFetch !== false);
  const canUseScheduler = user?.role === 'super_admin' || user?.access?.canUseScheduler === true || (user?.role === 'admin' && user?.access?.canUseScheduler !== false);
  const canUseFetchSection = canUseFetch || canUseScheduler;
  const [profileSearchStatus, setProfileSearchStatus] = useState({ isFetching: false });
  const [lastLog, setLastLog] = useState(null);
  const [startingProfileSearch, setStartingProfileSearch] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [profileMeta, setProfileMeta] = useState(null);
  const [savedSearches, setSavedSearches] = useState([]);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState(() => ({
    saveSearchName: '',
    country: user?.country || '',
    category: user?.category || '',
    categories: Array.isArray(user?.categories) && user.categories.length
      ? user.categories
      : (user?.category ? [user.category] : []),
    subcategory: user?.subcategory || '',
    topics: Array.isArray(user?.topics) && user.topics.length ? user.topics : ['news', 'govt', 'competitor', 'evergreen'],
    sources: Array.isArray(user?.sources) ? user.sources.join(', ') : '',
    competitors: Array.isArray(user?.competitors) ? user.competitors.join(', ') : '',
    days: user?.days || 30,
    query: user?.query || '',
    language: user?.language || 'en',
    timezone: user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    scheduleEnabled: Boolean(user?.fetchSchedule?.enabled),
    scheduleFrequency: user?.fetchSchedule?.frequency || 'daily',
    scheduleTime: user?.fetchSchedule?.time || '07:00',
    scheduleTimezone: user?.fetchSchedule?.timezone || user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  }));

  const refresh = useCallback(async () => {
      const [l, s] = await Promise.all([
        api.get('/admin/logs', { params: { limit: 1 } }),
        api.get('/profile-search/saved-searches').catch(() => ({ data: { items: [] } }))
      ]);
      setProfileSearchStatus({ isFetching: false });
      setLastLog(l.data.items[0] || null);
      setSavedSearches(Array.isArray(s.data.items) ? s.data.items : []);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    api.get('/articles/meta/filters')
      .then((r) => setProfileMeta(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const options = profileMeta?.fetchCountries || [];
    if (!options.length) return;
    setForm((prev) => ({
      ...prev,
      country: options.includes(prev.country) ? prev.country : options[0]
    }));
  }, [profileMeta?.fetchCountries]);

  useEffect(() => {
    if (runProgress && !['running', 'queued'].includes(runProgress.status)) {
       setStartingProfileSearch(false);
       refresh();
       refreshMe().catch(() => {});
    }
  }, [runProgress?.status, refresh, refreshMe]);

  useEffect(() => {
    const hasRunningProgress = runProgress && ['running', 'queued'].includes(runProgress.status);
    const isScheduledLog = String(lastLog?.notes || '').toLowerCase().includes('scheduled');
    const scheduledLogRunning = lastLog?.status === 'running' && isScheduledLog;
    if (hasRunningProgress || !lastLog?._id || !scheduledLogRunning) return;

    setRunProgress({
      runId: lastLog._id,
      logId: lastLog._id,
      status: 'running',
      step: 'queued',
      percent: 5,
      messages: [
        {
          at: new Date().toISOString(),
          step: 'queued',
          message: 'Fetch queued from scheduler.'
        }
      ]
    });
  }, [lastLog?._id, lastLog?.notes, lastLog?.status, runProgress, setRunProgress]);

  useEffect(() => {
    if (!user) return;
    setForm((prev) => ({
      ...prev,
      country: prev.country || user.country || '',
      category: prev.category || user.category || '',
      categories: Array.isArray(prev.categories) && prev.categories.length
        ? prev.categories
        : Array.isArray(user.categories) && user.categories.length
          ? user.categories
          : user.category
            ? [user.category]
            : [],
      subcategory: prev.subcategory || user.subcategory || '',
      topics: Array.isArray(prev.topics) && prev.topics.length
        ? prev.topics
        : Array.isArray(user.topics) && user.topics.length
          ? user.topics
          : ['news', 'govt', 'competitor', 'evergreen'],
      sources: prev.sources || (Array.isArray(user.sources) ? user.sources.join(', ') : ''),
      competitors: prev.competitors || (Array.isArray(user.competitors) ? user.competitors.join(', ') : ''),
      days: prev.days || user.days || 30,
      query: prev.query || user.query || '',
      language: prev.language || user.language || 'en',
      timezone: prev.timezone || user.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      scheduleEnabled: Boolean(user.fetchSchedule?.enabled),
      scheduleFrequency: user.fetchSchedule?.frequency || 'daily',
      scheduleTime: user.fetchSchedule?.time || '07:00',
      scheduleTimezone: user.fetchSchedule?.timezone || user.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    }));
  }, [user?._id]);

  const update = (key, value) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
      ...(key === 'category' ? { subcategory: '' } : {})
    }));
  };

  const toggleCategory = (category) => {
    setForm((prev) => {
      const current = Array.isArray(prev.categories) ? prev.categories : [];
      const exists = current.includes(category);
      const next = exists ? current.filter((item) => item !== category) : [...current, category];
      return {
        ...prev,
        categories: next,
        category: next[0] || '',
        subcategory: next.length === 1 ? prev.subcategory : ''
      };
    });
  };

  const toggleTopic = (topic) => {
    setForm((prev) => {
      const current = Array.isArray(prev.topics) ? prev.topics : [];
      const next = current.includes(topic)
        ? current.filter((item) => item !== topic)
        : [...current, topic];
      return { ...prev, topics: next.length ? next : current };
    });
  };

  const loadSavedSearch = (search) => {
    const allowedCountries = profileMeta?.fetchCountries || [];
    setForm((prev) => ({
      ...prev,
      saveSearchName: search.name || '',
      country: allowedCountries.includes(search.country) ? search.country : (allowedCountries[0] || prev.country),
      category: Array.isArray(search.categories) && search.categories.length ? search.categories[0] : (search.category || ''),
      categories: Array.isArray(search.categories) && search.categories.length
        ? search.categories
        : (search.category ? [search.category] : []),
      subcategory: Array.isArray(search.categories) && search.categories.length > 1 ? '' : (search.subcategory || ''),
      topics: Array.isArray(search.topics) && search.topics.length ? search.topics : prev.topics,
      sources: Array.isArray(search.sources) ? search.sources.join(', ') : '',
      competitors: Array.isArray(search.competitors) ? search.competitors.join(', ') : '',
      days: search.days || 30,
      query: search.query || '',
      language: search.language || 'en',
      timezone: search.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    }));
    setMsg(`Loaded saved search: ${search.name}`);
  };

  const saveSchedule = async () => {
    setSavingSchedule(true);
    setMsg('');
    try {
      await updateProfile(buildProfileDetails());
      setMsg(form.scheduleEnabled ? 'Schedule saved. Automatic fetch will use these details.' : 'Schedule disabled.');
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setSavingSchedule(false);
    }
  };

  const saveSearchDetails = async () => {
    const name = String(form.saveSearchName || '').trim();
    if (!selectedCategories.length) {
      setMsg('Select a category before saving details.');
      return;
    }

    setSavingDetails(true);
    setMsg('');
    try {
      const profileDetails = buildProfileDetails();
      await updateProfile(profileDetails);

      if (name) {
        await api.post('/profile-search/saved-searches', {
          name,
          ...profileDetails,
          subcategoryOptions
        });
      }

      await refresh();
      setMsg(name
        ? `Saved default fetch details and saved search: ${name}`
        : 'Saved default fetch details. Future fetches and schedule will use these settings.'
      );
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setSavingDetails(false);
    }
  };

  const runFetch = async () => {
    setStartingProfileSearch(true);
    setMsg('');
    try {
      if (hasUnsavedFetchChanges) {
        const shouldSave = confirm('You have unsaved fetch changes. Save changes before running fetch?');
        if (!shouldSave) {
          setMsg('Fetch cancelled. Save your latest changes before running.');
          return;
        }
        await updateProfile(buildProfileDetails());
        setMsg('Changes saved. Starting fetch...');
      }
      const { data } = await api.post('/profile-search/trigger', {
        async: true,
        country: form.country,
        category: selectedCategories[0] || form.category,
        categories: selectedCategories,
        subcategory: selectedCategories.length === 1 ? form.subcategory : '',
        subcategoryOptions,
        competitors: cleanList(form.competitors),
        topics: form.topics,
        sources: cleanList(form.sources),
        days: Number(form.days || 30),
        query: form.query,
        language: form.language,
        timezone: form.scheduleTimezone || form.timezone,
        saveSearchName: form.saveSearchName ? String(form.saveSearchName).trim() : undefined
      });
      const logId = data.logId || data.runId;
      setRunProgress({
        runId: logId,
        logId,
        status: 'running',
        step: 'queued',
        percent: 5,
        messages: [{ at: new Date().toISOString(), step: 'queued', message: 'Fetch queued. Waiting for backend runner...' }]
      });
      setMsg(data.logId ? `Fetch started. Log ID: ${data.logId}` : 'Fetch started.');
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setStartingProfileSearch(false);
    }
  };

  const countryOptions = [...new Set((profileMeta?.fetchCountries || []).filter(Boolean))];
  const categoryOptions = Object.keys(profileMeta?.categories || {}).filter((category) => category !== 'Competitor Intelligence');
  const selectedCategories = Array.isArray(form.categories) && form.categories.length
    ? form.categories
    : (form.category ? [form.category] : []);
  const subcategoryOptions = selectedCategories.length === 1 ? (profileMeta?.categories?.[selectedCategories[0]] || []) : [];
  const selectedTopics = Array.isArray(form.topics) ? form.topics : [];
  const pipelineConfigured = true;
  const progressRunning = runProgress && ['running', 'queued'].includes(runProgress.status);
  const isScheduledLog = String(lastLog?.notes || '').toLowerCase().includes('scheduled');
  const scheduledLogRunning = lastLog?.status === 'running' && isScheduledLog;
  const pipelineRunning = Boolean(profileSearchStatus.isFetching) || startingProfileSearch || progressRunning || scheduledLogRunning;
  const scheduleEnabled = Boolean(form.scheduleEnabled);
  const scheduleTime = form.scheduleTime || '07:00';
  const scheduleTimezone = form.scheduleTimezone || form.timezone || 'Asia/Kolkata';
  const lastScheduledRunAt = user?.fetchSchedule?.lastRunAt;
  const activeRunMessage = Array.isArray(runProgress?.messages)
    ? runProgress.messages.find((item) => String(item?.message || '').toLowerCase().includes('schedule'))
    : null;
  const scheduledRunActive = scheduledLogRunning || Boolean(activeRunMessage);
  const nextCheckLabel = scheduleEnabled
    ? `${form.scheduleFrequency === 'weekly' ? 'Weekly' : 'Daily'} at ${scheduleTime} (${scheduleTimezone})`
    : 'Scheduler is disabled';
  const lastRunLabel = lastScheduledRunAt
    ? formatDistanceToNow(new Date(lastScheduledRunAt), { addSuffix: true })
    : 'No scheduled run yet';
  const effectiveRunProgress = runProgress || (
    scheduledLogRunning
      ? {
          runId: lastLog?._id,
          logId: lastLog?._id,
          status: 'running',
          step: 'queued',
          percent: 5,
          messages: [
            {
              at: new Date().toISOString(),
              step: 'queued',
              message: 'Fetch queued from scheduler.'
            }
          ]
        }
      : null
  );
  const browserTimezones = useMemo(() => getBrowserTimezones(), []);
  const recommendedTimezones = useMemo(() => {
    const matchKey = Object.keys(COUNTRY_TIMEZONES).find((key) => key.toLowerCase() === String(form.country || '').toLowerCase());
    return matchKey ? COUNTRY_TIMEZONES[matchKey] : [];
  }, [form.country]);
  const remainingTimezones = useMemo(() => {
    const preferred = new Set(recommendedTimezones);
    return browserTimezones.filter((zone) => !preferred.has(zone));
  }, [browserTimezones, recommendedTimezones]);

  const buildProfileDetails = useCallback(() => ({
    country: form.country,
    category: selectedCategories[0] || form.category,
    categories: selectedCategories,
    subcategory: selectedCategories.length === 1 ? form.subcategory : '',
    competitors: cleanList(form.competitors),
    topics: form.topics,
    sources: cleanList(form.sources),
    days: Number(form.days || 30),
    query: form.query,
    language: form.language,
    timezone: form.scheduleTimezone || form.timezone,
    fetchSchedule: {
      enabled: Boolean(form.scheduleEnabled),
      frequency: form.scheduleFrequency,
      time: form.scheduleTime,
      timezone: form.scheduleTimezone || form.timezone
    }
  }), [form, selectedCategories]);

  const currentProfileDetails = useMemo(() => ({
    country: user?.country || '',
    category: user?.category || '',
    categories: Array.isArray(user?.categories) && user.categories.length
      ? user.categories
      : (user?.category ? [user.category] : []),
    subcategory: user?.subcategory || '',
    competitors: Array.isArray(user?.competitors) ? user.competitors : [],
    topics: Array.isArray(user?.topics) && user.topics.length ? user.topics : ['news', 'govt', 'competitor', 'evergreen'],
    sources: Array.isArray(user?.sources) ? user.sources : [],
    days: Number(user?.days || 30),
    query: user?.query || '',
    language: user?.language || 'en',
    timezone: user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    fetchSchedule: {
      enabled: Boolean(user?.fetchSchedule?.enabled),
      frequency: user?.fetchSchedule?.frequency || 'daily',
      time: user?.fetchSchedule?.time || '07:00',
      timezone: user?.fetchSchedule?.timezone || user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    }
  }), [user]);

  const hasUnsavedFetchChanges = useMemo(
    () => JSON.stringify(buildProfileDetails()) !== JSON.stringify(currentProfileDetails),
    [buildProfileDetails, currentProfileDetails]
  );

  const handleCountryChange = (country) => {
    const matchKey = Object.keys(COUNTRY_TIMEZONES).find((key) => key.toLowerCase() === String(country || '').toLowerCase());
    const defaultZone = matchKey ? COUNTRY_TIMEZONES[matchKey][0] : '';
    setForm((prev) => ({
      ...prev,
      country,
      scheduleTimezone: prev.scheduleTimezone || defaultZone || prev.timezone
    }));
  };

  if (!canUseFetchSection) return null;

  return (
    <div className={embedded ? 'grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1.2fr)_280px]' : 'grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]'}>
      {/* Trigger card */}
      <div className={`admin-fetch-control-surface rounded-3xl border p-4 shadow-sm sm:p-5 ${embedded ? 'border-gray-100 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.06)]' : 'border-gray-100 bg-white'}`}>
        <div className={embedded ? 'admin-fetch-hero-panel mb-5 rounded-[28px] border border-brand-crimson/10 bg-[radial-gradient(circle_at_top_left,_rgba(22,58,36,0.08),_transparent_38%),linear-gradient(135deg,#F3FFE5_0%,#ffffff_55%,#f8fafc_100%)] px-5 pb-7 pt-5' : 'mb-5'}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className={`flex shrink-0 items-center justify-center border text-white ${embedded ? 'h-12 w-12 rounded-2xl border-brand-crimson/20 bg-brand-crimson' : 'h-11 w-11 rounded-xl border-brand-crimson/20 bg-brand-crimson'}`}>
                <RefreshCw size={18} />
              </span>
              <div className="min-w-0">
              <div className="eyebrow mb-1 text-brand-crimson/80">{embedded ? 'Fetch settings' : 'Profile fetch'}</div>
              <h3 className={`${embedded ? 'text-2xl' : 'text-xl'} font-black tracking-tight text-gray-900`}>{embedded ? 'Intelligence Command Center' : 'Run Intelligence Fetch'}</h3>
              <p className={`mt-1 ${embedded ? 'max-w-2xl text-[15px] leading-7 text-slate-600' : 'text-sm text-gray-500'}`}>
                {embedded ? 'Choose the market, signal types, and schedule once. The layout is optimized for faster setup with less scrolling and clearer topic selection.' : 'Select the market details, save them, or run a fresh fetch.'}
              </p>
              </div>
            </div>
            <span className={[
              'inline-flex w-fit items-center gap-2 rounded-2xl border px-3.5 py-2 text-[11px] font-black uppercase tracking-wider',
              pipelineRunning ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700'
            ].join(' ')}>
              <span className={`h-2.5 w-2.5 rounded-full ${pipelineRunning ? 'bg-orange-500 animate-pulse' : 'bg-emerald-500'}`} />
              {pipelineRunning ? 'Running...' : 'Idle'}
            </span>
          </div>

          {embedded ? (
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-[0_6px_18px_rgba(15,23,42,0.06)]">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Selected categories</div>
                <div className="mt-1 text-lg font-black text-slate-900">{selectedCategories.length || 0}</div>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-[0_6px_18px_rgba(15,23,42,0.06)]">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Topics enabled</div>
                <div className="mt-1 text-lg font-black text-slate-900">{selectedTopics.length || 0}</div>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-[0_6px_18px_rgba(15,23,42,0.06)]">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Schedule</div>
                <div className="mt-1 text-lg font-black text-slate-900">{canUseScheduler ? (form.scheduleEnabled ? 'Enabled' : 'Available') : 'Locked'}</div>
              </div>
            </div>
          ) : null}
        </div>

        <div className={`grid grid-cols-1 gap-3 ${embedded ? 'xl:grid-cols-12' : 'md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3'}`}>
          {user?.access?.canUseSavedSearches !== false && (
            <FetchField label="Saved search name" className={embedded ? 'xl:col-span-4' : ''}>
              <input className="input min-h-[44px] rounded-xl" value={form.saveSearchName} onChange={(e) => update('saveSearchName', e.target.value)} placeholder="E.g., Singapore compliance watch" />
            </FetchField>
          )}
          <FetchField label="Country" className={embedded ? 'xl:col-span-3' : ''}>
            <select className="select min-h-[44px] rounded-xl" value={form.country} onChange={(e) => handleCountryChange(e.target.value)}>
              {countryOptions.map((country) => <option key={country} value={country}>{country}</option>)}
            </select>
          </FetchField>
          <div className={embedded ? 'xl:col-span-5' : 'md:col-span-2 2xl:col-span-1'}>
          <FetchField label="Category">
            <details className="group relative">
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 transition hover:border-gray-300 hover:bg-white focus:outline-none focus:ring-2 focus:ring-gray-200/70 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 truncate">
                  {selectedCategories.length
                    ? selectedCategories.length === 1
                      ? selectedCategories[0]
                      : `${selectedCategories.length} categories selected`
                    : 'Select categories'}
                </span>
                <ChevronRight size={16} className="shrink-0 text-gray-400 transition-transform group-open:rotate-90" />
              </summary>
              <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl">
                <div className="max-h-64 space-y-1 overflow-y-auto p-2">
                  {categoryOptions.map((category) => {
                    const checked = selectedCategories.includes(category);
                    return (
                      <label
                        key={category}
                        className={`admin-fetch-choice flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-bold transition-all ${
                          checked ? 'admin-fetch-choice-selected bg-white text-gray-900' : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCategory(category)}
                          className="h-4 w-4 rounded border-gray-300 text-brand-crimson focus:ring-brand-crimson/30"
                        />
                        <span className="min-w-0 truncate">{category}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="border-t border-gray-100 bg-gray-50 px-3 py-2 text-[11px] font-semibold text-gray-400">
                  {selectedCategories.length ? `${selectedCategories.length} selected` : 'Select one or more categories'}
                </div>
              </div>
            </details>
          </FetchField>
          </div>
          <FetchField label="Sub-category" className={embedded ? 'xl:col-span-4' : ''}>
            <select className="select min-h-[44px] rounded-xl" value={form.subcategory} onChange={(e) => update('subcategory', e.target.value)} disabled={selectedCategories.length !== 1}>
              <option value="">
                {selectedCategories.length > 1 ? 'All sub-categories for selected categories' : selectedCategories.length === 1 ? 'All sub-categories' : 'Select category first'}
              </option>
              {subcategoryOptions.map((subcategory) => <option key={subcategory} value={subcategory}>{subcategory}</option>)}
            </select>
          </FetchField>
          <FetchField label="Data age" className={embedded ? 'xl:col-span-4' : ''}>
            <select className="select min-h-[44px] rounded-xl" value={form.days} onChange={(e) => update('days', Number(e.target.value))}>
              <option value={1}>Last 24 hours</option>
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={180}>Last 180 days</option>
            </select>
          </FetchField>
          <FetchField label="Preferred sources" className={embedded ? 'xl:col-span-6' : ''}>
            <textarea className="input min-h-[88px] resize-y rounded-2xl bg-white" value={form.sources} onChange={(e) => update('sources', e.target.value)} placeholder="Optional: acra.gov.sg, mom.gov.sg" />
          </FetchField>
          <FetchField label="Tracked competitors" className={embedded ? 'xl:col-span-6' : ''}>
            <textarea className="input min-h-[88px] resize-y rounded-2xl bg-white" value={form.competitors} onChange={(e) => update('competitors', e.target.value)} placeholder="Optional: BoardRoom, Rikvin, Hawksford" />
          </FetchField>
        </div>

        <div className={`admin-fetch-topics-panel mt-4 rounded-[28px] border p-4 ${embedded ? 'border-brand-crimson/20 bg-[linear-gradient(180deg,#F3FFE5_0%,#ffffff_100%)] shadow-[0_18px_45px_rgba(22,58,36,0.05)]' : 'border-brand-crimson/10 bg-white/90 shadow-[0_10px_30px_rgba(22,58,36,0.05)]'}`}>
          <FetchField label="Topics">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-4">
              {TOPIC_OPTIONS.map((topic) => (
                <label key={topic.key} className={`admin-fetch-topic-choice admin-fetch-choice group flex min-h-[74px] cursor-pointer items-start gap-3 rounded-2xl border px-3.5 py-3 text-sm transition-all ${selectedTopics.includes(topic.key) ? 'admin-fetch-topic-choice-selected admin-fetch-choice-selected border-brand-crimson/30 bg-brand-pink/25 text-gray-900 shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:-translate-y-0.5 hover:border-brand-crimson/20 hover:bg-brand-pink/10 hover:shadow-sm'}`}>
                  <input type="checkbox" checked={selectedTopics.includes(topic.key)} onChange={() => toggleTopic(topic.key)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-crimson focus:ring-brand-crimson/30" />
                  <span className="min-w-0">
                    <span className="block truncate font-black text-gray-900">{topic.label}</span>
                    <span className="mt-1 block text-xs font-medium leading-relaxed text-gray-500">{topic.help}</span>
                  </span>
                </label>
              ))}
            </div>
          </FetchField>
        </div>

        <div className="mt-4">
          <FetchField label="Custom query override">
            <textarea className="input min-h-[110px] resize-y rounded-2xl bg-white" value={form.query} onChange={(e) => update('query', e.target.value)} placeholder="Leave blank to auto-generate from country, category and sub-category." />
          </FetchField>
        </div>

        <div className={`admin-fetch-summary mt-5 flex flex-col gap-3 rounded-[28px] border p-4 sm:flex-row sm:items-center sm:justify-between ${embedded ? 'border-brand-crimson/10 bg-[linear-gradient(135deg,#F3FFE5_0%,#ffffff_100%)] shadow-[0_16px_40px_rgba(22,58,36,0.06)]' : 'border-brand-crimson/10 bg-brand-pink/15'}`}>
          <div className="flex min-w-0 items-center gap-3">
            <span className="admin-fetch-summary-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-brand-crimson shadow-sm ring-1 ring-brand-crimson/10">
              <Play size={17} />
            </span>
            <div className="min-w-0">
              <div className="font-black text-gray-900">{canUseFetch ? 'Ready to fetch intelligence' : 'Fetch access is locked'}</div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                {canUseFetch
                  ? (hasUnsavedFetchChanges ? 'Unsaved changes will be saved before fetch' : 'Saved details are ready')
                  : 'Your admin can enable manual fetching for this profile'}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={savingDetails || !selectedCategories.length}
              onClick={saveSearchDetails}
              className={`admin-fetch-save-button inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-gray-700 ring-1 ring-gray-200 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300 ${savingDetails ? 'admin-fetch-save-button-saving' : ''}`}
              title={selectedCategories.length ? 'Save as default fetch details' : 'Select a category first'}
            >
              {savingDetails ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {savingDetails ? 'Saving' : 'Save details'}
            </button>
            <button
              type="button"
              disabled={!canUseFetch || pipelineRunning || !selectedCategories.length}
              onClick={runFetch}
              className="admin-fetch-run-button inline-flex items-center justify-center gap-2 rounded-xl bg-brand-crimson px-4 py-2.5 text-sm font-black text-white transition-all hover:bg-brand-crimson/90 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              title={!canUseFetch ? 'Manual fetch access is disabled for this profile' : selectedCategories.length ? 'Run intelligence fetch' : 'Select a category first'}
            >
              {pipelineRunning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {pipelineRunning ? 'Fetching' : 'Run fetch'}
            </button>
          </div>
        </div>

        {!canUseScheduler ? (
          <div className="mt-5 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm font-semibold text-gray-400">
            <Clock3 size={24} className="text-gray-300 animate-pulse" />
            <div className="font-black text-gray-700">Auto Scheduler is Locked</div>
            <div className="text-xs text-gray-400 max-w-md">Automated scraping runs are not included in your current subscription plan. Contact your administrator or upgrade to a higher tier plan to unlock this feature.</div>
          </div>
        ) : (
          <div className={`mt-5 rounded-[28px] border border-gray-100 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)] ${embedded ? 'bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]' : 'bg-gradient-to-br from-white to-gray-50'}`}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="eyebrow mb-1">Scheduler</div>
                <h4 className="text-base font-black tracking-tight text-gray-900">Automatic fetch</h4>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-brand-crimson shadow-sm">
                <Clock3 size={17} />
              </span>
            </div>
            <div className={`grid grid-cols-1 gap-3 ${embedded ? '2xl:grid-cols-[190px_1fr_1fr_1.2fr]' : 'lg:grid-cols-[180px_1fr_1fr_1.2fr]'} lg:items-end`}>
              <label className="flex h-[48px] items-center gap-3 rounded-2xl border border-gray-100 bg-white px-3.5 text-sm font-bold text-gray-700 shadow-sm">
                <input
                  type="checkbox"
                  checked={form.scheduleEnabled}
                  onChange={(e) => update('scheduleEnabled', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-crimson focus:ring-brand-crimson/30"
                />
                Enable schedule
              </label>
              <FetchField label="Frequency">
                <select className="select min-h-[44px] rounded-xl" value={form.scheduleFrequency} onChange={(e) => update('scheduleFrequency', e.target.value)}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </FetchField>
              <FetchField label="Time">
                <input type="time" className="input min-h-[44px] rounded-xl" value={form.scheduleTime} onChange={(e) => update('scheduleTime', e.target.value)} />
              </FetchField>
              <FetchField label="Schedule timezone">
                <select className="select min-h-[44px] rounded-xl" value={form.scheduleTimezone} onChange={(e) => update('scheduleTimezone', e.target.value)}>
                  {form.scheduleTimezone && !browserTimezones.includes(form.scheduleTimezone) && !recommendedTimezones.includes(form.scheduleTimezone) && (
                    <option value={form.scheduleTimezone}>{form.scheduleTimezone}</option>
                  )}
                  {recommendedTimezones.length > 0 && (
                    <optgroup label={`${form.country || 'Selected country'} timezones`}>
                      {recommendedTimezones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
                    </optgroup>
                  )}
                  <optgroup label="All timezones">
                    {remainingTimezones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
                  </optgroup>
                </select>
              </FetchField>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className={`rounded-xl border px-3 py-3 ${scheduleEnabled ? 'border-emerald-100 bg-emerald-50/70' : 'border-gray-200 bg-white'}`}>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Status</div>
                <div className={`mt-1 text-sm font-black ${scheduleEnabled ? 'text-emerald-700' : 'text-gray-600'}`}>
                  {scheduleEnabled ? 'Enabled and watching time' : 'Disabled'}
                </div>
                <div className="mt-1 text-xs font-medium text-gray-500">
                  {scheduleEnabled ? nextCheckLabel : 'Turn on schedule to auto-run fetch.'}
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white px-3 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Last scheduled run</div>
                <div className="mt-1 text-sm font-black text-gray-800">{lastRunLabel}</div>
                <div className="mt-1 text-xs font-medium text-gray-500">
                  {lastScheduledRunAt ? new Date(lastScheduledRunAt).toLocaleString() : 'This will update after the first auto-trigger.'}
                </div>
              </div>
              <div className={`rounded-xl border px-3 py-3 ${scheduledRunActive ? 'border-orange-200 bg-orange-50/80' : 'border-gray-200 bg-white'}`}>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Live trigger</div>
                <div className={`mt-1 text-sm font-black ${scheduledRunActive ? 'text-orange-700' : 'text-gray-800'}`}>
                  {scheduledRunActive ? 'Scheduler triggered a fetch' : 'Waiting for next trigger'}
                </div>
                <div className="mt-1 text-xs font-medium text-gray-500">
                  {scheduledRunActive
                    ? 'A scheduled run is active right now and should appear below in live process.'
                    : scheduleEnabled
                      ? `The system will auto-check this rule every minute and trigger at ${scheduleTime}.`
                      : 'No automatic trigger will run until scheduling is enabled.'}
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-medium leading-relaxed text-gray-500">
                Scheduled runs use the saved market details and run at the selected local time in {form.scheduleTimezone || form.timezone || 'your timezone'}.
              </p>
              <button
                type="button"
                onClick={saveSchedule}
                disabled={savingSchedule || !selectedCategories.length}
                className={`admin-fetch-save-button inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-gray-700 ring-1 ring-gray-200 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300 ${savingSchedule ? 'admin-fetch-save-button-saving' : ''}`}
                title={selectedCategories.length ? 'Save schedule settings' : 'Select a category before saving schedule'}
              >
                {savingSchedule ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {savingSchedule ? 'Saving' : 'Save schedule'}
              </button>
            </div>
          </div>
        )}

        {msg && (
          <div className="mt-4 rounded-md bg-gray-50 px-3 py-2 text-[13px] text-gray-600 ring-1 ring-gray-100">
            {msg}
          </div>
        )}

        {effectiveRunProgress && (
          <div className="mt-4 rounded-lg border border-gray-100 bg-white p-4 ring-1 ring-gray-50">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="eyebrow mb-1">Live process</div>
                <h4 className="text-base font-black tracking-tight text-gray-900">
                  {effectiveRunProgress.status === 'success' ? 'Fetch complete' : effectiveRunProgress.status === 'failed' ? 'Fetch failed' : 'Fetch running'}
                </h4>
              </div>
              <span className={`rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                effectiveRunProgress.status === 'success' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                : effectiveRunProgress.status === 'failed' ? 'bg-red-50 text-red-700 ring-1 ring-red-100'
                : 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
              }`}>
                {effectiveRunProgress.step || effectiveRunProgress.status}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full transition-all ${effectiveRunProgress.status === 'failed' ? 'bg-red-500' : 'bg-brand-crimson'}`}
                style={{ width: `${Math.max(5, Math.min(100, Number(effectiveRunProgress.percent || 35)))}%` }}
              />
            </div>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
              {(effectiveRunProgress.messages || []).slice(-14).map((item, index) => (
                <div key={`${item.at}-${index}`} className="flex gap-2 rounded-md bg-gray-50 px-3 py-2 ring-1 ring-gray-100">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                    effectiveRunProgress.status === 'failed' && index === (effectiveRunProgress.messages || []).slice(-14).length - 1 ? 'bg-red-500' : 'bg-brand-crimson'
                  }`} />
                  <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">{item.step || 'process'}</div>
                    <div className="text-sm font-medium leading-relaxed text-gray-700">{item.message}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Last log */}
      <div className={`space-y-4 ${embedded ? '' : 'xl:sticky xl:top-4 xl:self-start'}`}>
        <div className={`rounded-[28px] border p-4 shadow-sm sm:p-5 ${embedded ? 'border-gray-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]' : 'border-gray-100 bg-white'}`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="eyebrow mb-1">Last run</div>
            <h3 className="text-lg font-black tracking-tight text-gray-900">{embedded ? 'Latest activity' : 'Latest callback'}</h3>
          </div>
          <Activity size={17} className="text-brand-crimson" />
        </div>
        {!lastLog ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center text-sm font-semibold text-gray-400">
            No logs yet.
          </div>
        ) : (
          <div className="mt-3 space-y-2.5">
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
            <Stat label="Trigger" value={logTriggerLabel(lastLog) || '-'} />
            <Stat label="Fetched" value={lastLog.totalFetched} />
            <Stat label="Matched" value={lastLog.totalMatched ?? lastLog.resultCount ?? 0} />
            <Stat label="Rejected" value={lastLog.totalRejected ?? 0} />
            <Stat label="AI Ignored" value={lastLog.totalAiIgnored ?? 0} />
            <Stat label="Inserted" value={lastLog.totalInserted} highlight />
            <Stat label="Duplicates" value={lastLog.totalDuplicates} />
            <Stat label="Errors" value={lastLog.totalErrors} />
            <Stat label="Duration" value={lastLog.durationMs ? `${Math.round(lastLog.durationMs / 1000)}s` : '-'} />
            <DebugSamples samples={lastLog.debugSamples} />
          </div>
        )}
      </div>
      {user?.access?.canUseSavedSearches === false ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm font-semibold text-gray-400">
          <Search size={24} className="text-gray-300 animate-pulse" />
          <div className="font-black text-gray-700">Saved Searches is Locked</div>
          <div className="text-xs text-gray-400">Saving or loading custom query configurations is not included in your current subscription plan.</div>
        </div>
      ) : (
        <div className={`rounded-[28px] border p-4 shadow-sm sm:p-5 ${embedded ? 'border-gray-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]' : 'border-gray-100 bg-white'}`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="eyebrow mb-1">Saved searches</div>
              <h3 className="text-lg font-black tracking-tight text-gray-900">Load previous details</h3>
            </div>
            <Search size={17} className="text-brand-crimson" />
          </div>
          {savedSearches.length ? (
            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {savedSearches.map((search) => (
                <button key={search._id} type="button" onClick={() => loadSavedSearch(search)} className="w-full rounded-2xl border border-gray-100 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-brand-crimson/20 hover:shadow-sm">
                  <div className="truncate text-sm font-black text-gray-900">{search.name}</div>
                  <div className="mt-1 line-clamp-2 text-xs font-medium text-gray-500">
                    {search.query || `${search.category || 'Any category'} in ${[search.region, search.country].filter(Boolean).join(', ') || 'any market'}`}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm font-semibold text-gray-400">
              No saved searches yet.
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

function FetchField({ label, children, className = '' }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</label>
      {children}
    </div>
  );
}

function CountrySourceSelect({ value, options = [], onChange }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutside = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const selectOption = (nextValue) => {
    onChange?.(nextValue);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="admin-country-select relative">
      <button
        type="button"
        className="admin-country-select-trigger flex min-h-[48px] w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-left text-sm font-black text-slate-950 transition hover:border-slate-300 focus:border-brand-crimson focus:outline-none focus:ring-2 focus:ring-brand-crimson/20"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0 truncate">{value || 'Select country'}</span>
        <ChevronDown size={16} className={`shrink-0 text-brand-crimson transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          className="admin-country-select-menu absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-[360px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_20px_45px_rgba(15,23,42,0.18)]"
          role="listbox"
        >
          {options.map((country) => {
            const selected = country === value;
            return (
              <button
                key={country}
                type="button"
                className={`admin-country-select-option flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-bold transition ${selected ? 'admin-country-select-option-active bg-slate-200 text-slate-950' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'}`}
                onClick={() => selectOption(country)}
                role="option"
                aria-selected={selected}
              >
                <span className="min-w-0 truncate">{country}</span>
              </button>
            );
          })}
          {!options.length && (
            <div className="px-3 py-3 text-sm font-bold text-slate-400">No countries available.</div>
          )}
        </div>
      )}
    </div>
  );
}

function cleanList(value) {
  return String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeSourceDomain(value) {
  const domain = String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split(/[/?#]/)[0]
    .toLowerCase();
  if (!domain || !domain.includes('.') || /\s/.test(domain)) return '';
  if (!/^[a-z0-9.-]+$/.test(domain)) return '';
  return domain;
}

function parseSourceDomains(value) {
  return Array.from(new Set(
    String(value || '')
      .split(/[\n,\s]+/)
      .map(normalizeSourceDomain)
      .filter(Boolean)
  ));
}

function Stat({ label, value, highlight }) {
  return (
    <div className="flex min-h-[38px] items-start justify-between gap-3 rounded-md bg-gray-50 px-3 py-2 ring-1 ring-gray-100">
      <span className="shrink-0 pt-0.5 text-[11px] font-bold uppercase tracking-wider text-gray-400">{label}</span>
      <span className={`min-w-0 flex-1 text-right leading-snug break-words ${highlight ? 'text-brand-crimson text-base font-black' : 'text-gray-700 text-sm font-bold'}`}>
        {value ?? '-'}
      </span>
    </div>
  );
}

function DebugSamples({ samples }) {
  const groups = [
    ['Matched', samples?.matched || []],
    ['AI Ignored', samples?.aiIgnored || []],
    ['Rejected', samples?.rejected || []]
  ].filter(([, items]) => items.length);

  if (!groups.length) return null;

  return (
    <div className="mt-3 space-y-2 rounded-md bg-gray-50 p-3 ring-1 ring-gray-100">
      <div className="text-[11px] font-black uppercase tracking-wider text-gray-400">Debug samples</div>
      {groups.map(([label, items]) => (
        <div key={label} className="space-y-1.5">
          <div className="text-[10px] font-black uppercase tracking-wider text-gray-500">{label}</div>
          {items.slice(0, 3).map((item, index) => (
            <div key={`${label}-${index}`} className="rounded-md bg-white px-2.5 py-2 text-xs ring-1 ring-gray-100">
              <div className="truncate font-black text-gray-800">{item.title || 'Untitled'}</div>
              <div className="mt-1 line-clamp-2 text-gray-500">{item.reason || '-'}</div>
              <div className="mt-1 truncate text-[10px] font-bold uppercase tracking-wider text-gray-400">{item.category || item.topic || item.source || ''}{item.score !== undefined ? ` | Score ${item.score}` : ''}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function LogMetric({ label, value, tone = 'muted' }) {
  const toneClass = {
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    brand: 'bg-brand-pink/40 text-brand-crimson ring-brand-crimson/10',
    danger: 'bg-red-50 text-red-700 ring-red-100',
    muted: 'bg-gray-50 text-gray-700 ring-gray-100'
  }[tone] || 'bg-gray-50 text-gray-700 ring-gray-100';

  return (
    <div className={`rounded-xl px-3 py-3 ring-1 ${toneClass}`}>
      <div className="text-[10px] font-black uppercase tracking-wider opacity-70">{label}</div>
      <div className="mt-1 text-xl font-black">{value ?? 0}</div>
    </div>
  );
}

// =============== LOGS TAB ===============

function LogsTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [logProgress, setLogProgress] = useState({});
  const [cleanupDays, setCleanupDays] = useState(30);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');

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

  const loadLogProgress = useCallback(async (logId) => {
    if (!logId) return;
    try {
      const { data } = await api.get(`/profile-search/runs/${logId}/progress`);
      setLogProgress((prev) => ({ ...prev, [logId]: data }));
    } catch {
      setLogProgress((prev) => ({
        ...prev,
        [logId]: {
          status: 'unavailable',
          step: 'details',
          messages: [{ at: new Date().toISOString(), step: 'details', message: 'Live progress details are not available for this run yet.' }]
        }
      }));
    }
  }, []);

  useEffect(() => {
    const activeLog = items.find((log) => log._id === expanded);
    if (!activeLog || activeLog.status !== 'running') return undefined;
    const id = window.setInterval(() => {
      load();
      loadLogProgress(activeLog._id);
    }, 3000);
    return () => window.clearInterval(id);
  }, [expanded, items, load, loadLogProgress]);

  if (loading) return <Loader />;

  const summary = items.reduce((acc, log) => {
    acc.total += 1;
    acc.inserted += Number(log.totalInserted || 0);
    acc.errors += Number(log.totalErrors || 0);
    acc[log.status] = (acc[log.status] || 0) + 1;
    return acc;
  }, { total: 0, inserted: 0, errors: 0 });

  const cleanupLogs = async () => {
    const days = Math.max(Number(cleanupDays || 0), 1);
    if (!confirm(`Delete logs older than ${days} days?`)) return;
    setDeleting(true);
    setMessage('');
    try {
      const { data } = await api.delete('/admin/logs/cleanup', { data: { days } });
      setMessage(`${data.deleted || 0} logs deleted.`);
      setExpanded(null);
      await load();
    } catch (e) {
      setMessage(e.message || 'Failed to delete logs.');
    } finally {
      setDeleting(false);
    }
  };

  const toggleLog = (log) => {
    const next = expanded === log._id ? null : log._id;
    setExpanded(next);
    if (next) loadLogProgress(log._id);
  };

  return (
    <div className="admin-logs-page space-y-5">
      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="admin-theme-card rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-crimson text-white shadow-sm">
                <Activity size={18} />
              </span>
              <div className="min-w-0">
                <div className="eyebrow mb-1 text-brand-crimson/80">Fetch logs</div>
                <h3 className="text-xl font-black tracking-tight text-gray-900">Recent Runs</h3>
                <p className="mt-1 text-sm font-medium text-gray-500">{items.length} latest fetch logs</p>
              </div>
            </div>
            <button onClick={load} className="admin-logs-refresh-button inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-gray-700 ring-1 ring-gray-200 transition hover:bg-gray-50">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <LogMetric label="Runs" value={summary.total} />
            <LogMetric label="Success" value={summary.success || 0} tone="success" />
            <LogMetric label="Inserted" value={summary.inserted} tone="brand" />
            <LogMetric label="Errors" value={summary.errors} tone={summary.errors ? 'danger' : 'muted'} />
          </div>
        </div>

        <div className="admin-theme-card admin-cleanup-card rounded-2xl border border-red-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <Trash2 size={17} />
            </span>
            <div>
              <div className="eyebrow mb-1 text-red-500">Cleanup</div>
              <h3 className="text-base font-black tracking-tight text-gray-900">Delete old logs</h3>
            </div>
          </div>
          <div className="flex gap-2">
            <select className="select min-h-[44px] min-w-0 flex-1 rounded-xl" value={cleanupDays} onChange={(e) => setCleanupDays(Number(e.target.value))}>
              <option value={7}>Older than 7 days</option>
              <option value={15}>Older than 15 days</option>
              <option value={30}>Older than 30 days</option>
              <option value={60}>Older than 60 days</option>
              <option value={90}>Older than 90 days</option>
            </select>
            <button type="button" onClick={cleanupLogs} disabled={deleting} className="admin-logs-delete-button inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-red-50 px-4 text-sm font-black text-red-600 ring-1 ring-red-100 transition hover:bg-red-100 disabled:opacity-50">
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Delete
            </button>
          </div>
          {message && <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-sm font-bold text-gray-600">{message}</div>}
        </div>
      </div>
      {items.length === 0 && (
        <div className="admin-theme-card rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm font-semibold text-gray-400 shadow-sm">
          No fetch logs yet.
        </div>
      )}
      {items.map((log) => (
        <div key={log._id} className="admin-log-row overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div
            className="flex cursor-pointer flex-col gap-3 px-4 py-4 transition hover:bg-gray-50/70 lg:flex-row lg:items-center lg:justify-between"
            onClick={() => toggleLog(log)}
          >
            <div className="flex flex-wrap items-center gap-3 min-w-0">
              <span className={`tag ${
                log.status === 'success' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                : log.status === 'partial' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'
                : log.status === 'failed' ? 'bg-red-50 text-red-700 ring-1 ring-red-100'
                : 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
              }`}>{log.status}</span>
              <span className="text-sm font-bold text-gray-800">
                {new Date(log.startedAt).toLocaleString()}
              </span>
              {logTriggerLabel(log) ? (
                <span className="text-[11px] font-black uppercase tracking-wider text-gray-400">
                  {logTriggerLabel(log)}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[12px] font-black text-gray-500">
              <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-emerald-700">+{log.totalInserted || 0} new</span>
              <span className="rounded-lg bg-gray-50 px-2.5 py-1">{log.totalDuplicates || 0} dup</span>
              <span className={`rounded-lg px-2.5 py-1 ${log.totalErrors ? 'bg-red-50 text-red-600' : 'bg-gray-50'}`}>{log.totalErrors || 0} err</span>
              <ChevronRight size={14} className={`transition-transform ${expanded === log._id ? 'rotate-90' : ''}`} />
            </div>
          </div>

          {expanded === log._id && (
            <div className="admin-log-expanded border-t border-gray-100 bg-gray-50/50 px-4 py-3">
              <LogRunDetails log={log} progress={logProgress[log._id]} />
              {(log.perSource || []).length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead className="text-[10px] uppercase tracking-wider text-gray-400">
                    <tr className="text-left">
                      <th className="py-2 pr-3">Source</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3 text-right">Fetched</th>
                      <th className="py-2 pr-3 text-right">Errors</th>
                      <th className="py-2 pr-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-600">
                    {(log.perSource || []).map((p, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="py-2 pr-3 font-bold text-gray-800">{p.sourceName}</td>
                        <td className="py-2 pr-3 text-gray-400">{p.type}</td>
                        <td className="py-2 pr-3 text-right">{p.fetched}</td>
                        <td className="py-2 pr-3 text-right">
                          {p.errors > 0
                            ? <span className="text-red-600">{p.errors}</span>
                            : <span className="text-gray-300">0</span>}
                        </td>
                        <td className="max-w-md truncate py-2 pr-3 text-[11px] text-gray-400">
                          {(p.errorMessages || []).join('; ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              ) : null}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function LogRunDetails({ log, progress }) {
  const note = String(log.notes || '').trim();
  const progressMessages = (progress?.messages || []).filter((item) => {
    const message = String(item?.message || '').trim();
    return message && message !== note;
  });
  const messages = progressMessages.length
    ? progressMessages
    : note
      ? [{ step: log.status || 'success', message: note, at: log.finishedAt || log.startedAt }]
      : [];
  const isRunning = log.status === 'running';
  const percent = Math.max(isRunning ? 5 : 100, Math.min(100, Number(progress?.percent || (isRunning ? 45 : 100))));
  const statusTone = log.status === 'failed'
    ? 'bg-red-500'
    : isRunning
      ? 'bg-blue-500'
      : 'bg-emerald-500';
  const started = log.startedAt ? new Date(log.startedAt) : null;
  const finished = log.finishedAt ? new Date(log.finishedAt) : null;
  const statusLabel = progress?.step || log.status || 'unknown';

  return (
    <div className="admin-log-details mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-400">Run details</div>
              <div className="mt-1 text-sm font-black leading-snug text-gray-900">{note || readableRunTitle(log)}</div>
            </div>
            <span className={`tag ${
              log.status === 'failed' ? 'bg-red-50 text-red-600 ring-1 ring-red-100'
              : isRunning ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
              : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
            }`}>
              {statusLabel}
            </span>
          </div>
          <div className={`admin-log-progress-track admin-log-progress-${log.status || 'unknown'} h-2 overflow-hidden rounded-full bg-gray-100`}>
            <div className={`h-full rounded-full transition-all ${statusTone}`} style={{ width: `${percent}%` }} />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <LogDetailPill label="Started" value={formatLogDateTime(started)} subValue={formatRelativeTime(started)} />
            <LogDetailPill label="Finished" value={formatLogDateTime(finished)} subValue={formatRelativeTime(finished)} />
            <LogDetailPill label="Duration" value={formatLogDuration(log.durationMs)} />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <LogDetailPill label="Country" value={log.country || '-'} />
            <LogDetailPill label="Query" value={log.query || 'No custom query'} />
          </div>
        </div>

        <div className="admin-log-messages rounded-xl bg-gray-50 p-3 ring-1 ring-gray-100">
          <div className="mb-2 text-[10px] font-black uppercase tracking-[0.15em] text-gray-400">Progress messages</div>
          <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
            {messages.length ? messages.slice(-30).map((item, index) => (
              <div key={`${item.at || index}-${index}`} className="admin-log-message rounded-lg bg-white px-3 py-2 ring-1 ring-gray-100">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">{item.step || 'process'}</span>
                  <span className="text-[10px] font-semibold text-gray-400">
                    {formatRelativeTime(item.at ? new Date(item.at) : null)}
                  </span>
                </div>
                <div className="mt-1 text-xs font-semibold leading-relaxed text-gray-600">{item.message}</div>
              </div>
            )) : (
              <div className="admin-log-empty-message rounded-lg border border-dashed border-gray-200 bg-white px-3 py-4 text-center text-xs font-semibold text-gray-400">
                Progress will appear while the fetch is running.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function readableRunTitle(log = {}) {
  const trigger = logTriggerLabel(log);
  return trigger ? `${trigger} fetch run` : 'Fetch run';
}

function formatLogDateTime(date) {
  if (!date || Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatRelativeTime(date) {
  if (!date || Number.isNaN(date.getTime())) return '';
  return formatDistanceToNow(date, { addSuffix: true });
}

function formatLogDuration(durationMs) {
  const ms = Number(durationMs || 0);
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 100) / 10}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function LogDetailPill({ label, value, subValue = '' }) {
  return (
    <div className="admin-log-detail-pill min-w-0 rounded-xl bg-gray-50 px-3 py-2 ring-1 ring-gray-100">
      <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">{label}</div>
      <div className="mt-0.5 truncate text-xs font-bold text-gray-700">{value}</div>
      {subValue ? <div className="mt-0.5 truncate text-[10px] font-semibold text-gray-400">{subValue}</div> : null}
    </div>
  );
}

// =============== USERS TAB ===============

function UsersTab({ dbPlans, activeSubTab = 'add' }) {
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const initialUsersCache = isSuperAdmin ? superAdminUsersCache : null;
  const [items, setItems] = useState(() => initialUsersCache?.items || []);
  const [userQuery, setUserQuery] = useState('');
  const [loading, setLoading] = useState(() => !initialUsersCache);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    company: '',
    designation: '',
    role: isSuperAdmin ? '' : 'user',
    isActive: true,
    subscriptionPlan: isSuperAdmin ? '' : 'free',
    memberLimit: 3,
    access: {
      canFetch: true,
      canCreateMembers: false,
      canUseContentRepository: true,
      canUseBlogStudio: false,
      canUseSavedSearches: true,
      canUseScheduler: false
    },
    limits: {
      fetchesPerMonth: 30,
      storageItems: 1000,
      tokenBudgetMonthly: 100000,
      blogGenerationsMonthly: 10,
      socialPostsMonthly: 20
    }
  });

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/admin/users', { params: { limit: 50 } });
      if (isSuperAdmin) superAdminUsersCache = { items: data.items || [] };
      setItems(data.items);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load({ silent: Boolean(isSuperAdmin && superAdminUsersCache) });
    const id = window.setInterval(() => load({ silent: true }), 30 * 1000);
    return () => window.clearInterval(id);
  }, [isSuperAdmin, load]);

  useEffect(() => {
    setForm((prev) => {
      if (isSuperAdmin || prev.role !== 'admin') return prev;
      return { ...prev, role: 'user' };
    });
  }, [isSuperAdmin]);

  const updateForm = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  // When plan changes, auto-populate limits/memberLimit from defaults
  const updatePlan = (plan) => {
    const dbPlan = dbPlans?.find(p => p.planId === plan);
    const defs = dbPlan ? {
      memberLimit: dbPlan.memberLimit,
      fetchesPerMonth: dbPlan.limits?.fetchesPerMonth ?? 0,
      storageItems: dbPlan.limits?.storageItems ?? 0,
      tokenBudgetMonthly: dbPlan.limits?.tokenBudgetMonthly ?? 0,
      blogGenerationsMonthly: dbPlan.limits?.blogGenerationsMonthly ?? 0,
      socialPostsMonthly: dbPlan.limits?.socialPostsMonthly ?? 0
    } : (PLAN_DEFAULTS_UI[plan] || PLAN_DEFAULTS_UI.free);

    setForm((prev) => ({
      ...prev,
      subscriptionPlan: plan,
      memberLimit: defs.memberLimit,
      access: dbPlan?.access ? { ...prev.access, ...dbPlan.access } : prev.access,
      limits: {
        fetchesPerMonth: defs.fetchesPerMonth,
        storageItems: defs.storageItems,
        tokenBudgetMonthly: defs.tokenBudgetMonthly,
        blogGenerationsMonthly: defs.blogGenerationsMonthly,
        socialPostsMonthly: defs.socialPostsMonthly
      }
    }));
  };

  const updateTablePlan = async (u, plan) => {
    try {
      const dbPlan = dbPlans?.find(p => p.planId === plan);
      const fallback = PLAN_DEFAULTS_UI[plan] || PLAN_DEFAULTS_UI.free;
      const defs = dbPlan ? {
        memberLimit: dbPlan.memberLimit,
        limits: dbPlan.limits,
        access: dbPlan.access
      } : {
        memberLimit: fallback.memberLimit,
        limits: {
          fetchesPerMonth: fallback.fetchesPerMonth,
          storageItems: fallback.storageItems,
          tokenBudgetMonthly: fallback.tokenBudgetMonthly,
          blogGenerationsMonthly: fallback.blogGenerationsMonthly,
          socialPostsMonthly: fallback.socialPostsMonthly
        },
        access: {
          canFetch: true,
          canCreateMembers: plan !== 'free',
          canUseContentRepository: true,
          canUseBlogStudio: ['scale', 'premium', 'enterprise'].includes(plan),
          canUseSavedSearches: plan !== 'free',
          canUseScheduler: plan !== 'free'
        }
      };

      await api.patch(`/admin/users/${u._id}`, {
        subscriptionPlan: plan,
        memberLimit: defs.memberLimit,
        limits: defs.limits,
        access: defs.access
      });
      load();
    } catch (e) {
      alert(e.message || 'Failed to update user plan');
    }
  };

  const resetUserUsage = async (u) => {
    if (!isSuperAdmin) return;
    const ok = confirm(`Reset usage counters for ${u.name || u.email}? Articles, blogs, and social posts will stay as they are. Only the usage stats and plan counters will start fresh from zero.`);
    if (!ok) return;
    try {
      await api.post('/admin/usage/reset', {
        scope: 'current_month',
        userId: u._id
      });
      load();
    } catch (e) {
      alert(e.response?.data?.message || e.message || 'Usage reset failed');
    }
  };

  const createUser = async (e) => {
    e.preventDefault();
    setErr('');
    if (isSuperAdmin && !form.role) {
      setErr('Please select a role.');
      return;
    }
    if (isSuperAdmin && !form.subscriptionPlan) {
      setErr('Please select a subscription plan.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/admin/users', form);
      setForm({
        name: '',
        email: '',
        password: '',
        company: '',
        designation: '',
        role: isSuperAdmin ? '' : 'user',
        isActive: true,
        subscriptionPlan: isSuperAdmin ? '' : 'free',
        memberLimit: 3,
        access: {
          canFetch: true,
          canCreateMembers: false,
          canUseContentRepository: true,
          canUseBlogStudio: false,
          canUseSavedSearches: true,
          canUseScheduler: false
        },
        limits: {
          fetchesPerMonth: 30,
          storageItems: 1000,
          tokenBudgetMonthly: 100000,
          blogGenerationsMonthly: 10,
          socialPostsMonthly: 20
        }
      });
      setShowPassword(false);
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
    try {
      await api.patch(`/admin/users/${u._id}`, { role });
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const toggleActive = async (u) => {
    await api.patch(`/admin/users/${u._id}`, { isActive: !u.isActive });
    load();
  };

  const updateUserAccess = async (u, patch) => {
    try {
      await api.patch(`/admin/users/${u._id}`, patch);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const updateFormAccess = (key, value) => {
    setForm((prev) => ({
      ...prev,
      access: { ...(prev.access || {}), [key]: value }
    }));
  };

  const remove = async (u) => {
    if (!confirm(`Delete ${u.email}? Account access will stop immediately and background cleanup will remove related data after the retention window.`)) return;
    try {
      await api.delete(`/admin/users/${u._id}`);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const currentUserId = currentUser?._id || currentUser?.id;
  const currentAccount = items.find((u) => currentUserId && String(u._id) === String(currentUserId));
  const managedUsers = items.filter((u) => !currentUserId || String(u._id) !== String(currentUserId));
  const displayCurrent = currentAccount || currentUser;
  const adminById = new Map(items.filter((u) => u.role === 'admin').map((u) => [String(u._id), u]));
  const sortedUsers = isSuperAdmin
    ? [
        ...managedUsers
          .filter((u) => u.role === 'admin')
          .flatMap((admin) => [
            admin,
            ...managedUsers.filter((u) => u.role === 'user' && String(u.tenantAdminId || '') === String(admin._id))
          ]),
        ...managedUsers.filter((u) => u.role === 'user' && !adminById.has(String(u.tenantAdminId || '')))
      ]
    : managedUsers;
  const normalizedUserQuery = userQuery.trim().toLowerCase();
  const visibleUsers = useMemo(() => {
    if (!normalizedUserQuery) return sortedUsers;
    return sortedUsers.filter((u) => {
      const haystack = [
        u.name,
        u.email,
        u.company,
        u.role,
        !isSuperAdmin
          ? ''
          : u.role === 'admin'
            ? 'Company admin'
            : (adminById.get(String(u.tenantAdminId || ''))
              ? `${adminById.get(String(u.tenantAdminId || ''))?.name || ''} ${adminById.get(String(u.tenantAdminId || ''))?.company || ''}`
              : 'Unassigned')
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      return haystack.includes(normalizedUserQuery);
    });
  }, [sortedUsers, normalizedUserQuery]);

  const teamLabel = (u) => {
    if (!isSuperAdmin) return '';
    if (u.role === 'admin') return 'Company admin';
    const owner = adminById.get(String(u.tenantAdminId || ''));
    return owner ? `${owner.name}${owner.company ? ` · ${owner.company}` : ''}` : 'Unassigned';
  };

  const memberAccessChecked = (u, key) => {
    const defaults = {
      canFetch: true,
      canUseContentRepository: true,
      canUseBlogStudio: false,
      canUseSavedSearches: true,
      canUseScheduler: false
    };
    if (u.access && Object.prototype.hasOwnProperty.call(u.access, key)) return u.access[key] !== false;
    return defaults[key] !== false;
  };

  const planOptions = useMemo(() => (
    (Array.isArray(dbPlans) && dbPlans.length
      ? dbPlans
      : ['premium', 'free', 'growth', 'scale', 'enterprise'].map((planId) => ({ planId })))
      .map((plan) => ({
        value: plan.planId,
        label: formatPlanLabel(plan.planId, dbPlans)
      }))
  ), [dbPlans]);
  const userPanelMode = isSuperAdmin ? (activeSubTab === 'access' ? 'access' : 'add') : 'all';
  const showCreatePanel = userPanelMode === 'add' || userPanelMode === 'all';
  const showAccessPanel = userPanelMode === 'access' || userPanelMode === 'all';

  if (loading) return <Loader />;

  return (
    <div className="admin-users-page space-y-5">
      <div className="admin-theme-card admin-current-session-card overflow-hidden rounded-2xl border border-brand-crimson/10 bg-white shadow-sm">
        <div className="admin-current-session-header border-b border-brand-crimson/10 bg-brand-pink/10 px-4 py-3 sm:px-5">
          <div className="eyebrow mb-1">Current session</div>
          <h3 className="text-lg font-black tracking-tight text-gray-900">Signed-in account</h3>
        </div>
        <div className="grid grid-cols-1 gap-3 p-4 sm:p-5 md:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_180px_180px_180px] 2xl:items-center">
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
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
            <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">Role</div>
            <div className="text-sm font-black text-gray-900">
              {displayCurrent?.role === 'super_admin' ? 'Super Admin' : displayCurrent?.role === 'admin' ? 'Admin' : 'Member'}
            </div>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
            <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">Company</div>
            <div className="truncate text-sm font-black text-gray-900">{displayCurrent?.company || '-'}</div>
          </div>
          <div className={`rounded-xl border px-3 py-2 ${displayCurrent?.isOnline === false ? 'border-gray-100 bg-gray-50' : 'border-emerald-100 bg-emerald-50'}`}>
            <div className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Status</div>
            <div className={`text-sm font-black ${displayCurrent?.isOnline === false ? 'text-gray-600' : 'text-emerald-700'}`}>
              {displayCurrent?.isActive === false ? 'Inactive' : displayCurrent?.isOnline === false ? 'Active' : 'Live now'}
            </div>
          </div>
        </div>
      </div>

      {showCreatePanel && (
      <form onSubmit={createUser} className="admin-theme-card rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="eyebrow mb-1">Create account</div>
            <h3 className="text-xl font-black tracking-tight text-gray-900">Add admin or member</h3>
            <p className="mt-1 text-sm text-gray-500">Create a user and control their role and access state.</p>
          </div>
          <span className="admin-content-icon-tile flex h-10 w-10 items-center justify-center rounded-lg bg-brand-pink/60 text-brand-crimson ring-1 ring-brand-crimson/10">
            <UserPlus size={18} />
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          <input className="input min-h-[44px] rounded-xl" required placeholder="Full name" value={form.name} onChange={(e) => updateForm('name', e.target.value)} />
          <input className="input min-h-[44px] rounded-xl" type="email" required placeholder="Email" value={form.email} onChange={(e) => updateForm('email', e.target.value)} />
          <div className="relative">
            <input
              className="input min-h-[44px] rounded-xl pr-11"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={6}
              placeholder="Password"
              value={form.password}
              onChange={(e) => updateForm('password', e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-brand-crimson"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <input className="input min-h-[44px] rounded-xl" placeholder="Company" value={form.company} onChange={(e) => updateForm('company', e.target.value)} />
          <input className="input min-h-[44px] rounded-xl" placeholder="Designation" value={form.designation} onChange={(e) => updateForm('designation', e.target.value)} />
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="sr-only">Role</label>
              <select className="input min-h-[44px] rounded-xl" value={form.role} onChange={(e) => updateForm('role', e.target.value)}>
                {isSuperAdmin && <option value="" disabled>Select role</option>}
                {isSuperAdmin && <option value="admin">Admin</option>}
                <option value="user">Member</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs text-ink-500 whitespace-nowrap px-2">
              <input type="checkbox" checked={form.isActive} onChange={(e) => updateForm('isActive', e.target.checked)} />
              Active
            </label>
          </div>
          {isSuperAdmin && (
            <>
              <div>
                <label className="label text-gray-500 font-bold tracking-wider">Subscription Plan</label>
                <select className="input" value={form.subscriptionPlan} onChange={(e) => updatePlan(e.target.value)}>
                  <option value="" disabled>Select subscription plan</option>
                  <option value="premium">Premium - $99 / mo</option>
                  <option value="free">Free — $0 / mo</option>
                  <option value="growth">Growth — $29 / mo</option>
                  <option value="scale">Scale — $99 / mo</option>
                  <option value="enterprise">Enterprise — $299+ / mo</option>
                </select>
                <p className="mt-1 text-[10px] font-semibold text-gray-400">Changing plan auto-fills limits below.</p>
              </div>
              <div>
                <label className="label text-gray-500 font-bold tracking-wider">Member Limit</label>
                <input className="input" type="number" min={0} placeholder="Member limit" value={form.memberLimit} onChange={(e) => updateForm('memberLimit', Number(e.target.value))} />
              </div>
              <div>
                <label className="label text-gray-500 font-bold tracking-wider">Monthly Fetch Limit</label>
                <input className="input" type="number" min={0} placeholder="Monthly fetch limit" value={form.limits.fetchesPerMonth} onChange={(e) => updateForm('limits', { ...form.limits, fetchesPerMonth: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label text-gray-500 font-bold tracking-wider">Monthly Blog Limit</label>
                <input className="input" type="number" min={0} placeholder="Monthly blog limit" value={form.limits.blogGenerationsMonthly} onChange={(e) => updateForm('limits', { ...form.limits, blogGenerationsMonthly: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label text-gray-500 font-bold tracking-wider">Monthly Post Limit</label>
                <input className="input" type="number" min={0} placeholder="Monthly post limit" value={form.limits.socialPostsMonthly} onChange={(e) => updateForm('limits', { ...form.limits, socialPostsMonthly: Number(e.target.value) })} />
              </div>
            </>
          )}
        </div>

        {form.role === 'user' && (
          <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50/70 p-3">
            <div className="mb-2 text-[10px] font-black uppercase tracking-wider text-gray-400">Member access</div>
            <div className="flex flex-wrap gap-2">
              {MEMBER_ACCESS_OPTIONS.map((option) => (
                <PermissionToggle
                  key={option.key}
                  label={option.label}
                  checked={form.access?.[option.key] !== false}
                  onChange={(checked) => updateFormAccess(option.key, checked)}
                />
              ))}
            </div>
          </div>
        )}

        {err && (
          <div className="mt-3 text-xs rounded-md px-3 py-2 bg-red-50 text-red-700 ring-1 ring-red-100">
            {err}
          </div>
        )}

        <div className="mt-4">
          <button disabled={saving} className="btn-primary w-full rounded-xl sm:w-auto">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Create account
          </button>
        </div>
      </form>
      )}

      {showAccessPanel && (
      <div className="admin-theme-card overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-100 bg-gray-50/60 px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm font-black text-gray-900">{isSuperAdmin ? 'Access Manager' : 'Members and admins'}</div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
            {visibleUsers.length}{visibleUsers.length !== managedUsers.length ? ` of ${managedUsers.length}` : ''} managed accounts
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-full min-w-0 lg:w-[300px]">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input min-h-[42px] w-full rounded-xl pl-11"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="Search name, email, company..."
            />
          </div>
          <Users size={17} className="hidden shrink-0 text-gray-400 sm:block" />
        </div>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[1180px]">
        <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
          <tr className="text-left">
            <th className="py-3 px-4">User</th>
            <th className="py-3 px-4">Company</th>
            {isSuperAdmin && <th className="py-3 px-4">Managed by</th>}
            <th className="py-3 px-4">Role</th>
            {isSuperAdmin && <th className="py-3 px-4">Plan & limits</th>}
            <th className="py-3 px-4">Permissions</th>
            <th className="py-3 px-4">Status</th>
            <th className="py-3 px-4">Live</th>
            <th className="py-3 px-4">Last login</th>
            <th className="py-3 px-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {visibleUsers.map((u) => (
            <tr key={u._id} className="border-t border-gray-100 hover:bg-gray-50/60">
              <td className="py-3 px-4">
                <div className="flex items-center gap-2">
                  {isSuperAdmin && u.role === 'user' && (
                    <span className="h-5 w-5 rounded border-l-2 border-b-2 border-gray-200" aria-hidden="true" />
                  )}
                  <div className="min-w-0">
                    <div className="font-black text-gray-900">{u.name}</div>
                    <div className="text-xs font-medium text-gray-400">{u.email}</div>
                  </div>
                </div>
              </td>
              <td className="py-3 px-4 text-sm font-medium text-gray-600">{u.company || '-'}</td>
              {isSuperAdmin && (
                <td className="py-3 px-4">
                  <span className={`tag ${
                    u.role === 'admin'
                      ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
                      : teamLabel(u) === 'Unassigned'
                        ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'
                        : 'bg-gray-50 text-gray-600 ring-1 ring-gray-100'
                  }`}>
                    {teamLabel(u)}
                  </span>
                </td>
              )}
              <td className="py-3 px-4">
                <span className={`tag ${
                  u.role === 'super_admin' ? 'bg-brass-100 text-brass-700'
                    : u.role === 'admin' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
                    : 'bg-ink-50 text-ink-500 ring-1 ring-ink-100'
                }`}>
                  {u.role === 'super_admin' ? 'Super Admin' : u.role === 'admin' ? 'Admin' : 'Member'}
                </span>
              </td>
              {isSuperAdmin && (
                <td className="py-3 px-4">
                  {u.role === 'admin' ? (
                    <div className="grid min-w-[240px] grid-cols-2 gap-2">
                      <div className="col-span-2">
                        <select
                          value={u.subscriptionPlan || 'free'}
                          onChange={(e) => updateTablePlan(u, e.target.value)}
                          className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-bold text-gray-600"
                        >
                          {planOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <p className="mt-1 text-[9px] font-medium text-gray-400">Auto-fills limits on save</p>
                      </div>
                      <input
                        type="number"
                        min={0}
                        value={u.memberLimit ?? 3}
                        onChange={(e) => updateUserAccess(u, { memberLimit: Number(e.target.value) })}
                        className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-bold text-gray-600"
                        title="Member limit"
                      />
                      <LimitInput label="Fetch" value={u.limits?.fetchesPerMonth ?? 30} onSave={(value) => updateUserAccess(u, { limits: { ...(u.limits || {}), fetchesPerMonth: value } })} />
                      <LimitInput label="Tokens" value={u.limits?.tokenBudgetMonthly ?? 100000} onSave={(value) => updateUserAccess(u, { limits: { ...(u.limits || {}), tokenBudgetMonthly: value } })} />
                      <LimitInput label="Storage" value={u.limits?.storageItems ?? 1000} onSave={(value) => updateUserAccess(u, { limits: { ...(u.limits || {}), storageItems: value } })} />
                      <LimitInput label="Blogs" value={u.limits?.blogGenerationsMonthly ?? 10} onSave={(value) => updateUserAccess(u, { limits: { ...(u.limits || {}), blogGenerationsMonthly: value } })} />
                      <LimitInput label="Posts" value={u.limits?.socialPostsMonthly ?? 20} onSave={(value) => updateUserAccess(u, { limits: { ...(u.limits || {}), socialPostsMonthly: value } })} />
                    </div>
                  ) : (
                    <div className="min-w-[240px] rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-xs font-semibold text-gray-400">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`tag px-2.5 py-1 ${PLAN_BADGE[adminById.get(String(u.tenantAdminId || ''))?.subscriptionPlan || 'free'] || PLAN_BADGE.free}`}>
                          {formatPlanLabel(adminById.get(String(u.tenantAdminId || ''))?.subscriptionPlan || 'free', dbPlans)}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Inherited</span>
                      </div>
                      <div className="mt-2">Members inherit plan and usage limits from their admin account.</div>
                    </div>
                  )}
                </td>
              )}
              <td className="py-3 px-4">
                {u.role === 'user' || isSuperAdmin ? (
                  <div className="grid min-w-[220px] grid-cols-2 gap-1.5">
                    {MEMBER_ACCESS_OPTIONS.map((option) => (
                      <PermissionToggle
                        key={option.key}
                        label={option.label}
                        checked={memberAccessChecked(u, option.key)}
                        onChange={(checked) => updateUserAccess(u, { access: { ...(u.access || {}), [option.key]: checked } })}
                      />
                    ))}
                    {isSuperAdmin && u.role === 'admin' && (
                      <PermissionToggle
                        label="Members"
                        checked={u.access?.canCreateMembers !== false}
                        onChange={(checked) => updateUserAccess(u, { access: { ...(u.access || {}), canCreateMembers: checked } })}
                      />
                    )}
                  </div>
                ) : (
                  <span className="text-[11px] font-semibold text-gray-400">Managed by super admin</span>
                )}
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
                    {isSuperAdmin && (
                      <button onClick={() => setRole(u, u.role === 'admin' ? 'user' : 'admin')} className="rounded-md px-2 py-1 text-[11px] font-bold text-gray-500 hover:bg-gray-100 hover:text-gray-900">
                        Make {u.role === 'admin' ? 'Member' : 'Admin'}
                      </button>
                    )}
                    <button onClick={() => toggleActive(u)} className="rounded-md px-2 py-1 text-[11px] font-bold text-gray-500 hover:bg-gray-100 hover:text-gray-900">
                      {u.isActive ? 'Disable' : 'Approve'}
                    </button>
                    {isSuperAdmin && (
                      <button onClick={() => resetUserUsage(u)} className="rounded-md px-2 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-50">
                        Reset usage
                      </button>
                    )}
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
              <td colSpan={isSuperAdmin ? 10 : 8} className="px-4 py-8 text-center text-sm font-semibold text-gray-400">
                No other users to manage.
              </td>
            </tr>
          )}
          {managedUsers.length > 0 && visibleUsers.length === 0 && (
            <tr className="border-t border-gray-100">
              <td colSpan={isSuperAdmin ? 10 : 8} className="px-4 py-8 text-center text-sm font-semibold text-gray-400">
                No users match your search.
              </td>
            </tr>
          )}
        </tbody>
      </table>
        </div>
      </div>
      )}
    </div>
  );
}

function logTriggerLabel(log = {}) {
  const notes = String(log?.notes || '').toLowerCase();
  if (log?.triggeredBy === 'cron' || notes.includes('scheduled profile intelligence trigger') || notes.includes('fetch queued from scheduler')) {
    return 'Scheduler';
  }
  if (log?.triggeredByUser?.name) {
    const role = String(log?.triggeredByUser?.role || '').toLowerCase();
    if (role === 'admin' || role === 'super_admin') return `${log.triggeredByUser.name} manual`;
    return log.triggeredByUser.name;
  }
  if (log?.triggeredBy === 'manual') return 'Manual';
  return '';
}

function LimitInput({ label, value, onSave }) {
  const [local, setLocal] = useState(value ?? 0);

  useEffect(() => {
    setLocal(value ?? 0);
  }, [value]);

  return (
    <label className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wider text-gray-400">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onSave?.(Number(local || 0))}
        className="min-w-0 flex-1 bg-transparent text-right text-xs font-bold text-gray-700 outline-none"
      />
    </label>
  );
}

function PermissionToggle({ label, checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange?.(!checked)}
      className={`rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wider ring-1 transition-all ${
        checked
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
          : 'bg-gray-50 text-gray-400 ring-gray-100'
      }`}
    >
      {label}: {checked ? 'On' : 'Off'}
    </button>
  );
}

// =============== STATS TAB ===============

function StatsTab() {
  const [stats, setStats] = useState(null);
  const loadStats = useCallback(() => {
    api.get('/admin/stats').then((r) => setStats(r.data));
  }, []);
  useEffect(() => { loadStats(); }, [loadStats]);

  if (!stats) return <Loader />;

  const fmt = (value) => Number(value || 0).toLocaleString();
  const pct = (used, limit) => {
    const cap = Number(limit || 0);
    if (!cap) return 0;
    return Math.min(100, Math.round((Number(used || 0) / cap) * 100));
  };
  const planName = String(stats.admin?.subscriptionPlan || 'free').replace(/^./, (c) => c.toUpperCase());
  const memberCount = (stats.users || []).filter((user) => user.role === 'user').length;
  const usageCards = [
    {
      label: 'Monthly fetches',
      icon: RefreshCw,
      used: stats.totals?.monthFetches,
      limit: stats.limits?.fetchesPerMonth,
      remaining: stats.remaining?.fetchesPerMonth,
      accent: 'bg-brand-crimson',
      tint: 'bg-brand-pink/40 text-brand-crimson ring-brand-crimson/10'
    },
    {
      label: 'Token budget',
      icon: Gauge,
      used: stats.totals?.estimatedTokens,
      limit: stats.limits?.tokenBudgetMonthly,
      remaining: stats.remaining?.tokenBudgetMonthly,
      accent: 'bg-blue-500',
      tint: 'bg-blue-50 text-blue-700 ring-blue-100'
    },
    {
      label: 'Stored signals',
      icon: Database,
      used: stats.totals?.storageItems,
      limit: stats.limits?.storageItems,
      remaining: stats.remaining?.storageItems,
      accent: 'bg-emerald-500',
      tint: 'bg-emerald-50 text-emerald-700 ring-emerald-100'
    },
    {
      label: 'Blog generation',
      icon: FileText,
      used: stats.totals?.monthBlogs,
      limit: stats.limits?.blogGenerationsMonthly,
      remaining: stats.remaining?.blogGenerationsMonthly,
      accent: 'bg-violet-500',
      tint: 'bg-violet-50 text-violet-700 ring-violet-100'
    },
    {
      label: 'Post generation',
      icon: Sparkles,
      used: stats.totals?.monthSocialPosts,
      limit: stats.limits?.socialPostsMonthly,
      remaining: stats.remaining?.socialPostsMonthly,
      accent: 'bg-fuchsia-500',
      tint: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-100'
    },
    {
      label: 'Member seats',
      icon: Users,
      used: memberCount,
      limit: stats.limits?.memberLimit,
      remaining: stats.remaining?.memberSeats,
      accent: 'bg-amber-500',
      tint: 'bg-amber-50 text-amber-700 ring-amber-100'
    }
  ];
  const sortedUsers = [...(stats.users || [])].sort((a, b) => {
    if (a.role === 'admin' && b.role !== 'admin') return -1;
    if (b.role === 'admin' && a.role !== 'admin') return 1;
    return Number(b.usage?.estimatedTokens || 0) - Number(a.usage?.estimatedTokens || 0);
  });
  const topUser = sortedUsers.find((user) => Number(user.usage?.estimatedTokens || 0) > 0) || sortedUsers[0];

  return (
    <div className="admin-usage-page space-y-5">
      <div className="admin-theme-card overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="grid grid-cols-1 gap-0 2xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="p-5 sm:p-6">
            <div className="eyebrow mb-2 text-brand-crimson/80">Usage & limits</div>
            <h3 className="text-2xl font-black tracking-tight text-gray-900">Team Usage</h3>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-gray-500">
              Current month usage for {stats.admin?.name || 'this admin'} on the {planName} plan, including member activity and remaining limits.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-gray-500 ring-1 ring-gray-100">
                <Clock3 size={14} />
                Since {new Date(stats.monthStart).toLocaleDateString()}
              </span>
              <span className="inline-flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-gray-500 ring-1 ring-gray-100">
                <Users size={14} />
                {fmt(memberCount)} members
              </span>
              <button
                type="button"
                onClick={() => { window.location.href = '/premium?limit=usage'; }}
                className="inline-flex items-center gap-2 rounded-xl border border-brand-crimson/10 bg-brand-pink/40 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-brand-crimson transition hover:bg-brand-pink"
              >
                <Crown size={14} />
                Upgrade
              </button>
            </div>
          </div>
          <div className="border-t border-gray-100 bg-gray-50/70 p-5 lg:border-l lg:border-t-0">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">Highest activity</div>
            <div className="mt-3 rounded-2xl bg-white p-4 ring-1 ring-gray-100">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-crimson text-sm font-black text-white">
                  {(topUser?.name || topUser?.email || 'U').slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-black text-gray-900">{topUser?.name || 'No usage yet'}</div>
                  <div className="truncate text-xs font-semibold text-gray-400">{topUser?.email || 'Team activity will appear here'}</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-gray-50 px-3 py-2">
                  <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">Tokens</div>
                  <div className="text-sm font-black text-gray-900">{fmt(topUser?.usage?.estimatedTokens)}</div>
                </div>
                <div className="rounded-xl bg-gray-50 px-3 py-2">
                  <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">Fetches</div>
                  <div className="text-sm font-black text-gray-900">{fmt(topUser?.usage?.monthFetches)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
        {usageCards.map((card) => {
          const usedPct = pct(card.used, card.limit);
          const Icon = card.icon;
          return (
            <div key={card.label} className="admin-theme-card admin-usage-metric rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-400">{card.label}</div>
                  <div className="mt-2 text-3xl font-black tracking-tight text-gray-900">{fmt(card.used)}</div>
                </div>
                <span className={`admin-metric-icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${card.tint}`}>
                  <Icon size={17} />
                </span>
              </div>
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-xs font-bold">
                  <span className="text-gray-500">{fmt(card.remaining)} left</span>
                  <span className={usedPct >= 90 ? 'text-red-600' : usedPct >= 70 ? 'text-amber-600' : 'text-gray-400'}>
                    {usedPct}% used
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                  <div className={`admin-usage-progress-fill h-full rounded-full ${card.accent}`} style={{ width: `${usedPct}%` }} />
                </div>
                <div className="mt-2 text-[11px] font-semibold text-gray-400">Limit: {fmt(card.limit)}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="admin-theme-card rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="eyebrow mb-1">Team breakdown</div>
              <h3 className="text-lg font-black tracking-tight text-gray-900">Admin and member usage</h3>
            </div>
            <BarChart3 size={17} className="text-gray-400" />
          </div>
          <div className="space-y-3">
            {sortedUsers.map((user) => {
              const userTokenPct = pct(user.usage?.estimatedTokens, stats.limits?.tokenBudgetMonthly);
              return (
                <div key={user._id} className="rounded-2xl border border-gray-100 bg-gray-50/60 p-3">
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(180px,1.2fr)_minmax(0,2fr)] lg:items-center">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-black text-brand-crimson ring-1 ring-gray-100">
                        {(user.name || user.email || 'U').slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-sm font-black text-gray-900">{user.name}</div>
                          <span className={`tag ${user.role === 'admin' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100' : 'bg-white text-gray-500 ring-1 ring-gray-100'}`}>
                            {user.role === 'admin' ? 'Admin' : 'Member'}
                          </span>
                        </div>
                        <div className="truncate text-xs font-medium text-gray-400">{user.email}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
                      <UsageMini label="Fetches" value={fmt(user.usage?.monthFetches)} />
                      <UsageMini label="Stored" value={fmt(user.usage?.storageItems)} sub={`+${fmt(user.usage?.monthArticles)}`} />
                      <UsageMini label="Blogs" value={fmt(user.usage?.blogs)} sub={`+${fmt(user.usage?.monthBlogs)}`} />
                      <UsageMini label="Social" value={fmt(user.usage?.socialPosts)} sub={`+${fmt(user.usage?.monthSocialPosts)}`} />
                      <UsageMini label="Tokens" value={fmt(user.usage?.estimatedTokens)} sub={`${userTokenPct}%`} />
                      <UsageMini label="Errors" value={fmt(user.usage?.monthErrors)} danger={Number(user.usage?.monthErrors || 0) > 0} />
                    </div>
                  </div>
                </div>
              );
            })}
            {!sortedUsers.length && (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm font-semibold text-gray-400">
                No team usage yet.
              </div>
            )}
          </div>
        </div>

        <div className="admin-theme-card rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3">
            <div className="eyebrow mb-1">Recent usage</div>
            <h3 className="text-lg font-black tracking-tight text-gray-900">Latest fetch runs</h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {(stats.recentRuns || []).map((r) => (
              <li key={r._id} className="py-3">
                <div className="flex items-start gap-3">
                  <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${r.status === 'failed' ? 'bg-red-500' : r.status === 'running' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-black text-gray-900">
                        {r.userId?.name || r.triggeredByUser?.name || 'Team run'}
                      </div>
                      <span className="shrink-0 text-[10px] font-semibold text-gray-400">
                        {r.startedAt ? formatDistanceToNow(new Date(r.startedAt), { addSuffix: true }) : ''}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span className={`tag ${r.status === 'failed' ? 'bg-red-50 text-red-600 ring-1 ring-red-100' : r.status === 'running' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-100' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'}`}>
                        {r.status}
                      </span>
                      <span className="tag bg-gray-50 text-gray-500 ring-1 ring-gray-100">{fmt(r.totalInserted)} inserted</span>
                      <span className="tag bg-gray-50 text-gray-500 ring-1 ring-gray-100">{fmt(r.totalErrors)} errors</span>
                    </div>
                  </div>
                </div>
              </li>
            ))}
            {!(stats.recentRuns || []).length && (
              <li className="py-6 text-center text-sm font-semibold text-gray-400">No fetch runs yet.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function UsageMini({ label, value, sub, danger = false }) {
  return (
    <div className={`rounded-xl bg-white px-3 py-2 ring-1 ${danger ? 'ring-red-100' : 'ring-gray-100'}`}>
      <div className="text-[9px] font-black uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`mt-0.5 truncate text-sm font-black ${danger ? 'text-red-600' : 'text-gray-900'}`}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-[10px] font-semibold text-gray-400">{sub}</div>}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent, note, tint }) {
  return (
    <div className="premium-stat-card overflow-hidden p-5">
      <div className={`absolute inset-x-0 top-0 h-1 ${accent}`} />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">{label}</div>
            <div className="mt-3 text-[38px] font-black leading-none tracking-[-0.04em] text-gray-950">{value}</div>
          </div>
          {Icon ? (
            <span className={`admin-metric-icon-tile flex h-11 w-11 items-center justify-center rounded-2xl ${tint || 'bg-gray-50 text-gray-700'} ring-1 ring-black/5`}>
              <Icon size={18} />
            </span>
          ) : null}
        </div>
        {note && <div className="mt-4 text-xs font-semibold text-gray-500">{note}</div>}
      </div>
    </div>
  );
}

// eslint-disable-next-line no-unused-vars
function SuperAdminSessionsPanel({
  items,
  loading,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  onRefresh,
  onRevoke,
  onRevokeAll,
  actionId,
  currentSessionId
}) {
  const q = search.trim().toLowerCase();
  const filteredItems = items.filter((item) => {
    if (!q) return true;
    const haystack = [
      item.userId?.name,
      item.userId?.email,
      item.userId?.company,
      item.deviceLabel,
      item.browser,
      item.os,
      item.ip
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(q);
  });

  const activeCount = items.filter((item) => item.isActive).length;
  const revokedCount = items.filter((item) => item.revokedAt).length;
  const uniqueUsers = new Set(items.map((item) => String(item.userId?._id || ''))).size;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-brand-pink/30 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-brand-crimson">
              <ShieldCheck size={12} />
              Session control
            </div>
            <h3 className="text-2xl font-black tracking-tight text-gray-900">Live account sessions</h3>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-gray-500">
              Super admin can monitor active devices, spot unusual access, and revoke sessions instantly across the platform.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-black text-gray-700 transition hover:bg-gray-50"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          <MiniSessionStat label="Active Sessions" value={activeCount} tone="emerald" note="Currently valid and signed in" />
          <MiniSessionStat label="Tracked Users" value={uniqueUsers} tone="blue" note="Users with visible sessions" />
          <MiniSessionStat label="Revoked Sessions" value={revokedCount} tone="rose" note="Closed by user or admin" />
        </div>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,280px)_auto]">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search by user, company, device or IP"
                className="input min-h-[44px] rounded-xl pl-11"
              />
            </div>
            <div className="inline-grid grid-cols-3 gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-1">
              {[
                { key: 'active', label: 'Active' },
                { key: 'revoked', label: 'Revoked' },
                { key: 'all', label: 'All' }
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onFilterChange(item.key)}
                  className={`min-h-[36px] rounded-xl px-4 text-xs font-black transition ${
                    filter === item.key ? 'bg-brand-crimson text-white shadow-sm' : 'text-gray-500 hover:bg-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="text-xs font-bold text-gray-400">
            {filteredItems.length} sessions shown
          </div>
        </div>

        <div className="mt-5">
          {loading ? (
            <div className="flex min-h-[240px] items-center justify-center">
              <Loader2 size={24} className="animate-spin text-brand-crimson" />
            </div>
          ) : filteredItems.length ? (
            <div className="space-y-3">
              {filteredItems.map((item) => {
                const userLabel = item.userId?.name || item.userId?.email || 'Unknown user';
                const isSelfSession = currentSessionId && item.sessionId === currentSessionId;
                const statusTone = item.isActive ? 'emerald' : item.revokedAt ? 'rose' : 'gray';
                return (
                  <div key={item._id} className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4 transition hover:border-brand-crimson/15 hover:bg-white">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                      <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(120px,1fr))]">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="truncate text-sm font-black text-gray-900">{userLabel}</div>
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.15em] ${
                              statusTone === 'emerald'
                                ? 'bg-emerald-50 text-emerald-700'
                                : statusTone === 'rose'
                                  ? 'bg-rose-50 text-rose-600'
                                  : 'bg-gray-100 text-gray-500'
                            }`}>
                              {item.isActive ? 'Active' : item.revokedAt ? 'Revoked' : 'Expired'}
                            </span>
                            {isSelfSession ? (
                              <span className="rounded-full bg-brand-pink/30 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-brand-crimson">
                                This admin
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 truncate text-xs font-semibold text-gray-400">
                            {item.userId?.email} {item.userId?.company ? `• ${item.userId.company}` : ''}
                          </div>
                        </div>
                        <SessionInfoBlock label="Device" value={item.deviceLabel || `${item.browser || 'Unknown'} on ${item.os || 'Unknown'}`} />
                        <SessionInfoBlock label="IP Address" value={item.ip || 'Unknown'} />
                        <SessionInfoBlock label="Last Active" value={formatSessionDate(item.lastActiveAt)} />
                        <SessionInfoBlock label="Created" value={formatSessionDate(item.createdAt)} />
                        <SessionInfoBlock label="Expires" value={formatSessionDate(item.expiresAt)} />
                      </div>

                      <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                        <button
                          type="button"
                          onClick={() => onRevokeAll(item.userId?._id, userLabel)}
                          disabled={actionId === item.userId?._id}
                          className="inline-flex min-h-[38px] items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-black text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {actionId === item.userId?._id ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                          Revoke user sessions
                        </button>
                        <button
                          type="button"
                          onClick={() => onRevoke(item._id)}
                          disabled={actionId === item._id || !item.isActive}
                          className="inline-flex min-h-[38px] items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 text-sm font-black text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {actionId === item._id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          Revoke session
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-gray-400 ring-1 ring-gray-100">
                <Clock3 size={18} />
              </div>
              <div className="mt-3 text-sm font-black text-gray-700">No sessions found</div>
              <p className="mt-1 text-sm font-medium text-gray-400">Try changing the filter or search to see more results.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// eslint-disable-next-line no-unused-vars
function MiniSessionStat({ label, value, note, tone = 'gray' }) {
  const toneClass = tone === 'emerald'
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
    : tone === 'blue'
      ? 'bg-blue-50 text-blue-700 ring-blue-100'
      : tone === 'rose'
        ? 'bg-rose-50 text-rose-600 ring-rose-100'
        : 'bg-gray-50 text-gray-700 ring-gray-100';

  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">{label}</div>
          <div className="mt-2 text-3xl font-black tracking-tight text-gray-900">{compactNumber(value)}</div>
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] ring-1 ${toneClass}`}>
          Live
        </span>
      </div>
      <div className="mt-3 text-sm font-medium text-gray-500">{note}</div>
    </div>
  );
}

// eslint-disable-next-line no-unused-vars
function SessionInfoBlock({ label, value }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-3 py-2">
      <div className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-400">{label}</div>
      <div className="mt-1 truncate text-xs font-bold text-gray-700">{value}</div>
    </div>
  );
}

// =============== PLAN BUILDER (SUPER ADMIN ONLY) ===============

const PLAN_FEATURES_META = [
  { key: 'canUseScheduler',     label: 'Auto Scheduler',        help: 'Daily/weekly automated fetch runs' },
  { key: 'canUseSavedSearches', label: 'Saved Searches',        help: 'Save and reload fetch presets' },
  { key: 'canUseContentRepository', label: 'Content Repository', help: 'Access published content and saved posts library' },
  { key: 'canUseBlogStudio',    label: 'Blog Studio AI',        help: 'AI blog & social content generation' },
  { key: 'canCreateMembers',    label: 'Team Members Addition', help: 'Add/manage team members under account' },
  { key: 'canFetch',            label: 'Manual Fetching',       help: 'Trigger scraping and fetching manually' }
];

const PLAN_ACCENT = {
  free:       { ring: 'ring-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-800', grad: 'from-emerald-500 to-teal-600' },
  growth:     { ring: 'ring-blue-200',    bg: 'bg-blue-50',    text: 'text-blue-700',    badge: 'bg-blue-100 text-blue-800',    grad: 'from-blue-500 to-indigo-600' },
  scale:      { ring: 'ring-purple-200',  bg: 'bg-purple-50',  text: 'text-purple-700',  badge: 'bg-purple-100 text-purple-800', grad: 'from-purple-500 to-fuchsia-600' },
  premium:    { ring: 'ring-[#F9C416]/40',    bg: 'bg-[#F3FFE5]',    text: 'text-brand-crimson',    badge: 'bg-[#F9C416]/20 text-brand-crimson',    grad: 'from-[#F9C416] to-brand-crimson' },
  enterprise: { ring: 'ring-amber-200',   bg: 'bg-amber-50',   text: 'text-amber-700',   badge: 'bg-amber-100 text-amber-800',  grad: 'from-amber-500 to-orange-600' },
};

const PLAN_KEYS = ['free', 'growth', 'scale', 'premium', 'enterprise'];

const LIMIT_FIELDS = [
  { key: 'memberLimit',         label: 'Team Seats' },
  { key: 'fetchesPerMonth',     label: 'Fetch Runs / month' },
  { key: 'storageItems',        label: 'Stored Signals' },
  { key: 'tokenBudgetMonthly',  label: 'AI Tokens / month' },
  { key: 'blogGenerationsMonthly', label: 'Blog Generations / month' },
  { key: 'socialPostsMonthly',  label: 'Post Generations / month' },
];

function PlanBuilderTab({ dbPlans, loadDbPlans }) {
  const { isDark } = useTheme();
  const getInitialConfigs = useCallback(() => {
    const configObj = {};
    PLAN_KEYS.forEach(k => {
      const dbPlan = dbPlans?.find(p => p.planId === k);
      if (dbPlan) {
        configObj[k] = {
          label: dbPlan.label,
          price: dbPlan.price,
          priceNote: dbPlan.priceNote,
          memberLimit: dbPlan.memberLimit,
          limits: {
            fetchesPerMonth: dbPlan.limits?.fetchesPerMonth ?? 0,
            storageItems: dbPlan.limits?.storageItems ?? 0,
            tokenBudgetMonthly: dbPlan.limits?.tokenBudgetMonthly ?? 0,
            blogGenerationsMonthly: dbPlan.limits?.blogGenerationsMonthly ?? 0,
            socialPostsMonthly: dbPlan.limits?.socialPostsMonthly ?? 0,
          },
          access: {
            canFetch: dbPlan.access?.canFetch ?? true,
            canCreateMembers: dbPlan.access?.canCreateMembers ?? false,
            canUseContentRepository: dbPlan.access?.canUseContentRepository ?? true,
            canUseBlogStudio: dbPlan.access?.canUseBlogStudio ?? false,
            canUseSavedSearches: dbPlan.access?.canUseSavedSearches ?? false,
            canUseScheduler: dbPlan.access?.canUseScheduler ?? false,
          }
        };
      } else {
        const defaults = PLAN_DEFAULTS_UI[k] || PLAN_DEFAULTS_UI.free;
        configObj[k] = {
          label: k.charAt(0).toUpperCase() + k.slice(1),
          price: k === 'free' ? '$0' : k === 'growth' ? '$29' : k === 'scale' || k === 'premium' ? '$99' : '$299',
          priceNote: k === 'free' ? 'Free forever' : 'per month',
          memberLimit: defaults.memberLimit,
          limits: {
            fetchesPerMonth: defaults.fetchesPerMonth,
            storageItems: defaults.storageItems,
            tokenBudgetMonthly: defaults.tokenBudgetMonthly,
            blogGenerationsMonthly: defaults.blogGenerationsMonthly,
            socialPostsMonthly: defaults.socialPostsMonthly,
          },
          access: {
            canFetch: true,
            canCreateMembers: k !== 'free',
            canUseContentRepository: true,
            canUseBlogStudio: k === 'scale' || k === 'premium' || k === 'enterprise',
            canUseSavedSearches: k !== 'free',
            canUseScheduler: k !== 'free',
          }
        };
      }
    });
    return configObj;
  }, [dbPlans]);

  const [configs, setConfigs] = useState(getInitialConfigs);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setConfigs(getInitialConfigs());
  }, [getInitialConfigs]);

  const updateLimit = (plan, key, val) => {
    setConfigs(prev => {
      const next = { ...prev };
      if (['price', 'priceNote', 'label', 'memberLimit'].includes(key)) {
        next[plan] = { ...next[plan], [key]: val };
      } else {
        next[plan] = {
          ...next[plan],
          limits: { ...next[plan].limits, [key]: val }
        };
      }
      return next;
    });
  };

  const toggleFeature = (plan, feat) => {
    setConfigs(prev => {
      const next = { ...prev };
      next[plan] = {
        ...next[plan],
        access: { ...next[plan].access, [feat]: !next[plan].access[feat] }
      };
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/admin/plans', { configs });
      setSaved(true);
      await loadDbPlans();
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      console.error('Failed to save plans:', e.message);
      alert('Failed to save plans: ' + (e.response?.data?.message || e.message));
    } finally {
      setSaving(false);
    }
  };

  const tableRows = [
    { label: 'Team Seats',      get: (pk) => configs[pk]?.memberLimit >= 999 ? 'Unlimited' : `${configs[pk]?.memberLimit ?? 0} seats` },
    { label: 'Fetch Runs / mo', get: (pk) => configs[pk]?.limits?.fetchesPerMonth >= 1000 ? '1,000+' : String(configs[pk]?.limits?.fetchesPerMonth ?? 0) },
    { label: 'Stored Signals',  get: (pk) => configs[pk]?.limits?.storageItems >= 999999 ? 'Unlimited' : (configs[pk]?.limits?.storageItems ?? 0).toLocaleString() },
    { label: 'AI Tokens / mo',  get: (pk) => configs[pk]?.limits?.tokenBudgetMonthly >= 10000000 ? '10M+' : configs[pk]?.limits?.tokenBudgetMonthly >= 1000000 ? `${((configs[pk]?.limits?.tokenBudgetMonthly ?? 0) / 1000000).toFixed(1)}M` : `${Math.round((configs[pk]?.limits?.tokenBudgetMonthly ?? 0) / 1000)}K` },
    { label: 'Blogs / mo',      get: (pk) => String(configs[pk]?.limits?.blogGenerationsMonthly ?? 0) },
    { label: 'Posts / mo',      get: (pk) => String(configs[pk]?.limits?.socialPostsMonthly ?? 0) },
    ...PLAN_FEATURES_META.map(f => ({ label: f.label, get: (pk) => (configs[pk]?.access?.[f.key] ? '✓ Included' : '—') }))
  ];

  return (
    <div className="admin-plan-builder space-y-6">
      {/* Plan Cards */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {PLAN_KEYS.map((pk) => {
          const cfg = configs[pk];
          if (!cfg) return null;
          const ac = PLAN_ACCENT[pk];
          return (
            <div key={pk} className={`admin-plan-card admin-plan-card-${pk} bg-white rounded-2xl ring-2 ${ac.ring} overflow-hidden shadow-sm flex flex-col`}>
              <div className={`admin-plan-card-header bg-gradient-to-br ${ac.grad} p-5`}>
                <div className="text-white/60 text-[10px] font-black uppercase tracking-[0.2em] mb-3">{pk} plan</div>
                <div className="flex items-end gap-2">
                  <input
                    className="bg-transparent text-white text-2xl font-black w-20 outline-none border-b-2 border-white/30 focus:border-white"
                    value={cfg.price}
                    onChange={e => updateLimit(pk, 'price', e.target.value)}
                    title="Click to edit price"
                  />
                  <input
                    className="bg-transparent text-white/70 text-xs font-semibold mb-1 outline-none border-b border-white/20 focus:border-white/50 flex-1"
                    value={cfg.priceNote}
                    onChange={e => updateLimit(pk, 'priceNote', e.target.value)}
                    title="Click to edit price note"
                  />
                </div>
              </div>

              <div className="p-5 space-y-5 flex-1 flex flex-col justify-between">
                {/* Editable Limits */}
                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-400 mb-3">Usage Limits</div>
                    <div className="space-y-2">
                      {LIMIT_FIELDS.map(({ key, label }) => {
                        const isUnlimited = pk === 'enterprise' && ['memberLimit', 'storageItems', 'tokenBudgetMonthly', 'blogGenerationsMonthly', 'socialPostsMonthly'].includes(key);
                        const isTopLevel = ['memberLimit'].includes(key);
                        const value = isTopLevel ? cfg[key] : cfg.limits?.[key];
                        return (
                          <div key={key} className="admin-plan-limit-row flex items-center justify-between rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                            <span className="text-xs font-bold text-gray-500">{label}</span>
                            {isUnlimited ? (
                              <span className={`text-xs font-black ${ac.text}`}>Unlimited</span>
                            ) : (
                              <input
                                type="number"
                                min={0}
                                className={`w-20 text-right text-xs font-black bg-transparent outline-none ${ac.text}`}
                                value={value ?? 0}
                                onChange={e => updateLimit(pk, key, Number(e.target.value))}
                              />
                            )}
                          </div>
                        );
                      })}
                      <div className={`admin-plan-hard-cap text-[10px] font-medium text-gray-400 ${ac.bg} rounded-md px-2.5 py-1.5 leading-relaxed`}>
                        Hard cap: {(cfg.limits?.blogGenerationsMonthly ?? 0).toLocaleString()} blogs &middot; {(cfg.limits?.socialPostsMonthly ?? 0).toLocaleString()} posts
                      </div>
                    </div>
                  </div>

                  {/* Feature Toggles */}
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-400 mb-3">Features</div>
                    <div className="space-y-2">
                      {PLAN_FEATURES_META.map(({ key, label, help }) => {
                        const on = cfg.access?.[key];
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => toggleFeature(pk, key)}
                            className={`admin-plan-feature-row ${on ? 'admin-plan-feature-on' : 'admin-plan-feature-off'} w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-all border`}
                          >
                            <div className="min-w-0">
                              <div className={`text-xs font-black truncate ${on ? 'text-[#163A24]' : 'text-gray-500'}`}>{label}</div>
                              <div className="text-[9px] text-gray-400 truncate">{help}</div>
                            </div>
                            <div
                              className={`admin-plan-toggle ${on ? 'admin-plan-toggle-on' : 'admin-plan-toggle-off'} h-4 w-7 rounded-full flex items-center flex-shrink-0 transition-all`}
                              style={isDark ? {
                                background: on ? '#10b981' : '#111827',
                                backgroundImage: 'none',
                                border: on ? '1px solid rgba(94, 234, 212, 0.72)' : '1px solid rgba(148, 163, 184, 0.34)',
                                boxShadow: on ? '0 0 0 1px rgba(16, 185, 129, 0.24), 0 8px 18px rgba(16, 185, 129, 0.2)' : 'inset 0 0 0 1px rgba(2, 6, 23, 0.25)'
                              } : undefined}
                            >
                              <div className={`admin-plan-toggle-knob h-3 w-3 rounded-full bg-white shadow-sm mx-0.5 transition-transform ${on ? 'translate-x-3' : 'translate-x-0'}`} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Comparison Preview */}
      <div className="admin-plan-preview bg-white rounded-2xl ring-1 ring-gray-200 shadow-sm p-6">
        <div className="mb-5">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-crimson mb-1 flex items-center gap-1.5">
            <BarChart3 size={12} /> Live Preview
          </div>
          <h3 className="text-lg font-black tracking-tight text-gray-900">User-Facing Plan Comparison</h3>
          <p className="mt-1 text-sm text-gray-500">Exactly what users see when comparing plans or when they hit a usage limit.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b-2 border-gray-100">
                <th className="py-3 px-4 text-left text-[10px] font-black uppercase tracking-wider text-gray-400 w-44">Feature</th>
                {PLAN_KEYS.map(pk => (
                  <th key={pk} className="py-3 px-4 text-center">
                    <span className={`inline-block px-3 py-1 rounded-lg text-xs font-black ${PLAN_ACCENT[pk].badge}`}>
                      {configs[pk]?.label} &mdash; {configs[pk]?.price}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tableRows.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-2.5 px-4 text-xs font-bold text-gray-600 border-r border-gray-50">{row.label}</td>
                  {PLAN_KEYS.map(pk => {
                    const val = row.get(pk);
                    const isIncl = val === '\u2713 Included';
                    const isExcl = val === '\u2014';
                    return (
                      <td key={pk} className={`py-2.5 px-4 text-center text-xs font-black ${isIncl ? 'text-emerald-600' : isExcl ? 'text-gray-300' : 'text-gray-700'}`}>
                        {val}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-end gap-4">
        <p className="text-xs text-gray-400 font-medium">Limits auto-fill when assigning plans in Users &amp; Access.</p>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-black text-white shadow-sm transition-all ${saved ? 'bg-emerald-600' : 'bg-brand-crimson hover:bg-brand-crimson/90'}`}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : null}
          {saved ? <><Check size={14} /> Saved!</> : <><Save size={14} /> Save Plan Config</>}
        </button>
      </div>
    </div>
  );
}

// =============== SUPER ADMIN MAIL CENTER ===============

const MAIL_AUDIENCE_OPTIONS_UI = [
  { key: 'all', label: 'All active users', help: 'Sends to every active super admin, admin, and member.' },
  { key: 'admins', label: 'Admins only', help: 'Targets super admins and tenant admins.' },
  { key: 'members', label: 'Members only', help: 'Targets end users and team members.' },
  { key: 'inactive', label: 'Inactive users', help: 'Useful for onboarding nudges or reactivation.' },
  { key: 'custom', label: 'Custom selection', help: 'Pick exact recipients from the user directory.' }
];

function renderInlineMailPreview(text) {
  const parts = String(text || '').split(/(\*\*.+?\*\*)/g).filter(Boolean);
  return parts.map((part, index) => (
    /^\*\*.+\*\*$/.test(part)
      ? <strong key={`${part}-${index}`} className="font-bold text-gray-800">{part.slice(2, -2)}</strong>
      : <span key={`${part}-${index}`}>{part}</span>
  ));
}

function MailPreviewBody({ message }) {
  const lines = String(message || '').split(/\r?\n/).map((line) => line.trimEnd());
  const blocks = [];
  let bullets = [];

  const flushBullets = () => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={`bullets-${blocks.length}`} className="mb-4 list-disc space-y-2 pl-5 text-[15px] leading-7 text-slate-600">
        {bullets.map((item, index) => (
          <li key={`${item}-${index}`}>{renderInlineMailPreview(item)}</li>
        ))}
      </ul>
    );
    bullets = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushBullets();
      blocks.push(<div key={`space-${index}`} className="h-2" />);
      return;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      bullets.push(bulletMatch[1]);
      return;
    }

    flushBullets();

    if (/:\s*$/.test(trimmed) && trimmed.length <= 80) {
      blocks.push(
        <p key={`heading-${index}`} className="mb-3 text-base font-bold leading-6 text-slate-700">
          {renderInlineMailPreview(trimmed)}
        </p>
      );
      return;
    }

    blocks.push(
      <p key={`line-${index}`} className="mb-3 text-[15px] leading-7 text-slate-600">
        {renderInlineMailPreview(trimmed)}
      </p>
    );
  });

  flushBullets();
  return <div>{blocks}</div>;
}

const createMailCenterForm = () => ({
  audience: 'all',
  subject: '',
  heading: '',
  preview: '',
  message: '',
  ctaLabel: '',
  ctaUrl: '',
  footerNote: '',
  userIds: []
});

function SuperAdminMailCenter() {
  const { isDark } = useTheme();
  const [audienceItems, setAudienceItems] = useState([]);
  const [loadingAudience, setLoadingAudience] = useState(true);
  const [sendError, setSendError] = useState('');
  const [sendSuccess, setSendSuccess] = useState('');
  const [sending, setSending] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [senderEmail, setSenderEmail] = useState('');
  const [replyToEmail, setReplyToEmail] = useState('');
  const [recipientQuery, setRecipientQuery] = useState('');
  const [form, setForm] = useState(() => createMailCenterForm());

  const loadAudience = useCallback(async () => {
    setLoadingAudience(true);
    setSendError('');
    try {
      const { data } = await api.get('/admin/email/audience');
      setAudienceItems(data.items || []);
      setConfigured(Boolean(data.configured));
      setSenderEmail(data.sender || '');
      setReplyToEmail(data.replyTo || '');
    } catch (err) {
      setSendError(err.response?.data?.message || err.message || 'Could not load mail audience.');
    } finally {
      setLoadingAudience(false);
    }
  }, []);

  useEffect(() => {
    loadAudience();
  }, [loadAudience]);

  const filteredAudienceItems = useMemo(() => {
    const query = recipientQuery.trim().toLowerCase();
    if (!query) return audienceItems;
    return audienceItems.filter((item) => (
      [item.name, item.email, item.company, item.role]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    ));
  }, [audienceItems, recipientQuery]);

  const selectedRecipients = useMemo(() => {
    if (form.audience === 'custom') {
      const selectedSet = new Set(form.userIds);
      return audienceItems.filter((item) => selectedSet.has(item._id));
    }
    if (form.audience === 'admins') return audienceItems.filter((item) => ['admin', 'super_admin'].includes(item.role) && item.isActive);
    if (form.audience === 'members') return audienceItems.filter((item) => item.role === 'user' && item.isActive);
    if (form.audience === 'inactive') return audienceItems.filter((item) => !item.isActive);
    return audienceItems.filter((item) => item.isActive);
  }, [audienceItems, form.audience, form.userIds]);

  const previewHeading = form.heading.trim() || form.subject.trim() || 'Platform update';
  const previewIntro = form.preview.trim() || 'A new message from the super admin team is ready to go.';
  const previewMessage = form.message.trim() || 'Write your message here. Line breaks will be preserved in the final email.';

  const updateForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleRecipient = (userId) => {
    setForm((prev) => ({
      ...prev,
      userIds: prev.userIds.includes(userId)
        ? prev.userIds.filter((id) => id !== userId)
        : [...prev.userIds, userId]
    }));
  };

  const handleAudienceChange = (audience) => {
    setForm((prev) => ({
      ...prev,
      audience,
      userIds: audience === 'custom' ? prev.userIds : []
    }));
  };

  const handleSend = async () => {
    setSendError('');
    setSendSuccess('');

    if (!configured) {
      setSendError('Email delivery is not configured yet. Add RESEND_API_KEY and EMAIL_FROM to the backend environment first.');
      return;
    }
    if (!form.subject.trim()) {
      setSendError('Subject is required.');
      return;
    }
    if (!form.message.trim()) {
      setSendError('Message is required.');
      return;
    }
    if (form.audience === 'custom' && !form.userIds.length) {
      setSendError('Select at least one recipient for a custom send.');
      return;
    }

    setSending(true);
    try {
      const { data } = await api.post('/admin/email/send', {
        ...form,
        subject: form.subject.trim(),
        heading: form.heading.trim(),
        preview: form.preview.trim(),
        message: form.message,
        ctaLabel: form.ctaLabel.trim(),
        ctaUrl: form.ctaUrl.trim(),
        footerNote: form.footerNote.trim()
      });
      setSendSuccess(data.message || 'Email sent successfully.');
      setForm(createMailCenterForm());
      setRecipientQuery('');
      await loadAudience();
    } catch (err) {
      setSendError(err.response?.data?.message || err.message || 'Could not send email.');
    } finally {
      setSending(false);
    }
  };

  if (loadingAudience) return <Loader />;

  return (
    <div className="admin-mail-center-page space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-brand-crimson">
                <Mail size={12} />
                Super Admin Mail Center
              </div>
              <h3 className="text-xl font-black tracking-tight text-gray-900">Send platform notifications by email</h3>
              <p className="mt-1 text-sm text-gray-500">Compose a branded email, choose the audience, and deliver updates directly from the super admin console.</p>
            </div>
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wider ${configured ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'}`}>
              <span className={`h-2 w-2 rounded-full ${configured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {configured ? 'Mail ready' : 'Mail setup needed'}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-gray-400">Subject</label>
              <input className="input min-h-[46px] rounded-xl" value={form.subject} onChange={(e) => updateForm('subject', e.target.value)} placeholder="Service update, launch note, billing reminder..." />
            </div>
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-gray-400">Hero heading</label>
              <input className="input min-h-[46px] rounded-xl" value={form.heading} onChange={(e) => updateForm('heading', e.target.value)} placeholder="Optional; falls back to subject" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-gray-400">Preview line</label>
              <input className="input min-h-[46px] rounded-xl" value={form.preview} onChange={(e) => updateForm('preview', e.target.value)} placeholder="Short supporting line shown near the top of the email" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-gray-400">Message body</label>
              <textarea className="input min-h-[220px] rounded-2xl py-3" value={form.message} onChange={(e) => updateForm('message', e.target.value)} placeholder={'Write your message here.\n\nYou can use multiple paragraphs.\nEach line break is preserved in the final email.'} />
              <p className="mt-2 text-xs font-medium text-gray-400">Formatting: use `- item` for bullets, blank lines for spacing, and `**text**` for bold.</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-gray-400">CTA label</label>
              <input className="input min-h-[46px] rounded-xl" value={form.ctaLabel} onChange={(e) => updateForm('ctaLabel', e.target.value)} placeholder="Open dashboard" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-gray-400">CTA URL</label>
              <input className="input min-h-[46px] rounded-xl" value={form.ctaUrl} onChange={(e) => updateForm('ctaUrl', e.target.value)} placeholder="https://app.example.com/dashboard" />
            </div>
            <div className="md:col-span-3">
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-gray-400">Footer note</label>
              <input className="input min-h-[46px] rounded-xl" value={form.footerNote} onChange={(e) => updateForm('footerNote', e.target.value)} placeholder="Why the recipient is receiving this email" />
            </div>
          </div>

          <div className="mt-6 border-t border-gray-100 pt-6">
            <div className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Audience</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {MAIL_AUDIENCE_OPTIONS_UI.map((option) => {
                const active = form.audience === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => handleAudienceChange(option.key)}
                    className={`admin-mail-audience-card ${active ? 'admin-mail-audience-card-active' : 'admin-mail-audience-card-idle'} rounded-2xl border px-4 py-4 text-left transition-all ${active ? 'border-brand-crimson bg-brand-pink/30 shadow-sm' : 'border-gray-200 bg-gray-50 hover:border-brand-crimson/20 hover:bg-white'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className={`text-sm font-black ${active ? 'text-brand-crimson' : 'text-gray-800'}`}>{option.label}</div>
                      {active ? <Check size={16} className="text-brand-crimson" /> : null}
                    </div>
                    <div className="mt-1 text-xs font-medium leading-5 text-gray-500">{option.help}</div>
                  </button>
                );
              })}
            </div>

            {form.audience === 'custom' ? (
              <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-black text-gray-900">Choose recipients</div>
                    <div className="text-xs font-medium text-gray-500">{form.userIds.length} selected</div>
                  </div>
                  <input className="input min-h-[42px] rounded-xl sm:w-[240px]" value={recipientQuery} onChange={(e) => setRecipientQuery(e.target.value)} placeholder="Search name, email, company..." />
                </div>
                <div className="grid max-h-[320px] grid-cols-1 gap-2 overflow-y-auto md:grid-cols-2">
                  {filteredAudienceItems.map((item) => {
                    const checked = form.userIds.includes(item._id);
                    return (
                      <button
                        key={item._id}
                        type="button"
                        onClick={() => toggleRecipient(item._id)}
                        className={`admin-mail-recipient-card ${checked ? 'admin-mail-recipient-card-active' : 'admin-mail-recipient-card-idle'} rounded-xl border px-3 py-3 text-left transition-all ${checked ? 'border-brand-crimson bg-white shadow-sm' : 'border-gray-200 bg-white hover:border-brand-crimson/20'}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-black text-gray-900">{item.name || item.email}</div>
                            <div className="truncate text-xs font-medium text-gray-500">{item.email}</div>
                            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                              {item.role === 'super_admin' ? 'Super Admin' : item.role === 'admin' ? 'Admin' : 'Member'}
                              {item.company ? ` • ${item.company}` : ''}
                            </div>
                          </div>
                          <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${checked ? 'border-brand-crimson bg-brand-crimson text-white' : 'border-gray-300 bg-white text-transparent'}`}>
                            <Check size={12} />
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          {(sendError || sendSuccess) ? (
            <div className={`mt-5 rounded-xl border px-4 py-3 text-sm font-bold ${sendError ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
              {sendError || sendSuccess}
            </div>
          ) : null}

          <div className="mt-6 flex flex-col gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-medium text-gray-500">
              {selectedRecipients.length} recipient{selectedRecipients.length === 1 ? '' : 's'} will receive this email.
            </div>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-brand-crimson px-5 text-sm font-black text-white shadow-sm transition-all hover:bg-brand-hoverred disabled:cursor-not-allowed disabled:opacity-70"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Send Email
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-brand-crimson">Delivery setup</div>
            <div className="space-y-3 text-sm">
              <div className="rounded-xl bg-gray-50 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">From</div>
                <div className="mt-1 break-all font-bold text-gray-800">{senderEmail || 'Not configured'}</div>
              </div>
              <div className="rounded-xl bg-gray-50 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">Reply-To</div>
                <div className="mt-1 break-all font-bold text-gray-800">{replyToEmail || 'Uses sender address'}</div>
              </div>
              {!configured ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
                  Add `RESEND_API_KEY` and `EMAIL_FROM` to `backend/.env`, then restart the backend.
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-brand-crimson">Live preview</div>
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-100">
              <div className="h-1.5 bg-gradient-to-r from-brand-pink/80 via-brand-crimson/80 to-brand-hoverred/90" />
              <div className="border-b border-[#efe4e8] bg-gradient-to-b from-white to-[#faf5f7] px-6 py-6">
                <div className="min-w-0">
                  <img src={isDark ? '/logo-white.png' : '/logo.png'} alt="Brand logo" className="h-8 w-auto max-w-[170px] object-contain" />
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <div className="inline-flex items-center rounded-full border border-[#f0d3dd] bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-brand-crimson/80">Admin update</div>
                  </div>
                  <div className="mt-2 text-sm font-medium leading-6 text-gray-500">{previewIntro}</div>
                </div>
                <div className="mt-5 text-[30px] font-black leading-tight tracking-tight text-gray-900">{previewHeading}</div>
              </div>
              <div className="space-y-5 bg-white px-6 py-7">
                <div className="text-base font-medium leading-7 text-gray-600">
                  Hi {selectedRecipients[0]?.name || selectedRecipients[0]?.email || 'recipient'},
                </div>
                <MailPreviewBody message={previewMessage} />
                {form.ctaUrl.trim() ? (
                  <div>
                    <span className="inline-flex items-center rounded-2xl bg-brand-crimson px-5 py-3 text-sm font-black text-white shadow-[0_12px_24px_rgba(22,58,36,0.18)]">
                      {form.ctaLabel.trim() || 'Open link'}
                    </span>
                  </div>
                ) : null}
                <div className="border-t border-[#ece7ea] pt-5 text-xs font-medium leading-6 text-gray-400">
                  {form.footerNote.trim() || 'You received this email because your account is part of the platform workspace.'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============== SYSTEM SETTINGS (SUPER ADMIN ONLY) ===============

const SOURCE_TRUST_LEVELS = [
  { key: 'high', label: 'High Credibility', tone: 'emerald' },
  { key: 'moderate', label: 'Moderate Credibility', tone: 'amber' },
  { key: 'low', label: 'Low Credibility', tone: 'rose' }
];
const SETTINGS_SECTIONS = [
  { key: 'ai', label: 'AI', icon: Sparkles, help: 'Models & rules' },
  { key: 'maintenance', label: 'Access', icon: AlertTriangle, help: 'Mode & controls' }
];
const AI_SETTINGS_TABS = [
  { key: 'feed', label: 'Feed Processing', icon: Sparkles, help: 'Model and article flags' },
  { key: 'studio', label: 'Content Studio', icon: FileText, help: 'Blog and LinkedIn AI' },
  { key: 'safety', label: 'Safety Filters', icon: ShieldCheck, help: 'Strictness and blocked topics' }
];
const AI_MODEL_OPTIONS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini - Fast & cost efficient' },
  { value: 'gpt-4o', label: 'GPT-4o - Higher quality' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo - Extended context' }
];
const DEFAULT_CONTENT_STUDIO_AI = {
  enabled: true,
  blog: {
    model: 'gpt-4o-mini',
    temperature: 0.35,
    maxWords: 1200,
    requireReview: true
  },
  linkedin: {
    model: 'gpt-4o-mini',
    temperature: 0.55,
    maxWords: 250,
    requireReview: false
  },
  filtering: {
    strictness: 'balanced',
    blockUnsafeContent: true,
    humanReviewSensitiveTopics: true,
    blockedTopics: []
  }
};
const RECOMMENDED_SYSTEM_SETTINGS = {
  aiModel: 'gpt-4o-mini',
  aiSummary: false,
  aiCategory: true,
  contentStudioAi: DEFAULT_CONTENT_STUDIO_AI,
  maintenanceMode: false
};

function trustToneClasses(tone) {
  if (tone === 'emerald') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (tone === 'amber') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-rose-200 bg-rose-50 text-rose-800';
}

function buildSourceTrustMappingFromRegistry(items = []) {
  return items.reduce((acc, item) => {
    const bucket = item?.credibility || 'moderate';
    if (!acc[bucket]) acc[bucket] = [];
    if (item?.trustKey) acc[bucket].push(item.trustKey);
    return acc;
  }, { high: [], moderate: [], low: [] });
}

function moveRegistryItem(items = [], trustKey, nextCredibility) {
  return items.map((item) => (
    item.trustKey === trustKey
      ? { ...item, credibility: nextCredibility }
      : item
  ));
}

function getContentStudioAiSettings(settings = {}) {
  const current = settings.contentStudioAi || {};
  return {
    ...DEFAULT_CONTENT_STUDIO_AI,
    ...current,
    blog: { ...DEFAULT_CONTENT_STUDIO_AI.blog, ...(current.blog || {}) },
    linkedin: { ...DEFAULT_CONTENT_STUDIO_AI.linkedin, ...(current.linkedin || {}) },
    filtering: { ...DEFAULT_CONTENT_STUDIO_AI.filtering, ...(current.filtering || {}) }
  };
}

function SourceTrustCard({ item, onDragStart, onMove }) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(item.trustKey)}
      className="admin-source-trust-card rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-black text-gray-900">{item.name}</div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
            {item.sourceType || item.sourceId || 'Source'}
          </div>
        </div>
        <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-1 text-[10px] font-black ${item.isDefault ? 'border-brand-crimson/20 bg-brand-pink/20 text-brand-crimson' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
          {item.isDefault ? 'Default High' : 'Dynamic'}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {item.types?.length ? (
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-600">
            {item.types.join(', ')}
          </span>
        ) : null}
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-600">
          {item.count || 0} items
        </span>
        {item.countries?.length ? (
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-600">
            {item.countries.length} countries
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {SOURCE_TRUST_LEVELS.map((level) => (
          <button
            key={level.key}
            type="button"
            onClick={() => onMove(item.trustKey, level.key)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-black transition-all ${item.credibility === level.key ? trustToneClasses(level.tone) : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}
          >
            {level.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SourceTrustRulesPanel() {
  const [sourceTrustRegistry, setSourceTrustRegistry] = useState([]);
  const [sourceTrustSearch, setSourceTrustSearch] = useState('');
  const [draggedTrustKey, setDraggedTrustKey] = useState('');
  const [loadingTrust, setLoadingTrust] = useState(true);
  const [savingTrust, setSavingTrust] = useState(false);
  const [trustSaved, setTrustSaved] = useState(false);
  const [trustError, setTrustError] = useState('');
  const [trustDirty, setTrustDirty] = useState(false);

  const loadTrustRules = useCallback(async () => {
    setLoadingTrust(true);
    setTrustError('');
    try {
      const { data } = await api.get('/admin/settings');
      setSourceTrustRegistry(Array.isArray(data.sourceTrust?.registry) ? data.sourceTrust.registry : []);
      setTrustDirty(false);
    } catch (e) {
      setTrustError(e.response?.data?.message || e.message || 'Failed to load trust rules');
    } finally {
      setLoadingTrust(false);
    }
  }, []);

  useEffect(() => {
    loadTrustRules();
  }, [loadTrustRules]);

  useEffect(() => {
    if (!trustDirty) return undefined;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [trustDirty]);

  const normalizedTrustSearch = sourceTrustSearch.trim().toLowerCase();
  const sourceTrustGroups = useMemo(() => (
    SOURCE_TRUST_LEVELS.reduce((acc, level) => {
      acc[level.key] = sourceTrustRegistry
        .filter((item) => (
          !normalizedTrustSearch
          || item.name?.toLowerCase().includes(normalizedTrustSearch)
          || item.sourceId?.toLowerCase().includes(normalizedTrustSearch)
          || item.sourceType?.toLowerCase().includes(normalizedTrustSearch)
        ))
        .filter((item) => item.credibility === level.key)
        .sort((a, b) => a.name.localeCompare(b.name));
      return acc;
    }, {})
  ), [sourceTrustRegistry, normalizedTrustSearch]);

  const moveSourceTrustItem = useCallback((trustKey, nextCredibility) => {
    setSourceTrustRegistry((current) => {
      const currentItem = current.find((item) => item.trustKey === trustKey);
      if (!currentItem || currentItem.credibility === nextCredibility) return current;
      setTrustDirty(true);
      setTrustSaved(false);
      return moveRegistryItem(current, trustKey, nextCredibility);
    });
  }, []);

  const saveTrustRules = async () => {
    setSavingTrust(true);
    setTrustError('');
    try {
      const { data } = await api.put('/admin/settings/source-trust', {
        sourceTrustMapping: buildSourceTrustMappingFromRegistry(sourceTrustRegistry)
      });
      setSourceTrustRegistry(Array.isArray(data.sourceTrust?.registry) ? data.sourceTrust.registry : sourceTrustRegistry);
      setTrustDirty(false);
      setTrustSaved(true);
      setTimeout(() => setTrustSaved(false), 2000);
    } catch (e) {
      setTrustError(e.response?.data?.message || e.message || 'Failed to save trust rules');
    } finally {
      setSavingTrust(false);
    }
  };

  const visibleSourceTrustCount = sourceTrustGroups.high.length + sourceTrustGroups.moderate.length + sourceTrustGroups.low.length;

  if (loadingTrust) return <Loader />;

  return (
    <div className="admin-source-trust rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="eyebrow mb-1">Source Trust</div>
          <h3 className="text-xl font-black tracking-tight text-gray-900">Source Credibility Mapping</h3>
          <p className="mt-1 text-sm font-medium text-gray-500">Set source trust levels used during fetch, scoring, and article display.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">Visible</div>
            <div className="mt-1 text-lg font-black text-gray-900">{visibleSourceTrustCount}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">Search</div>
            <div className="mt-1 text-sm font-black text-gray-900">{sourceTrustSearch.trim() ? 'Filtered' : 'All sources'}</div>
          </div>
          <button
            type="button"
            onClick={saveTrustRules}
            disabled={savingTrust || !trustDirty}
            className={`inline-flex min-h-[56px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-black text-white shadow-sm transition-all ${trustSaved ? 'bg-emerald-600' : 'bg-brand-crimson hover:bg-brand-crimson/90'} disabled:cursor-not-allowed disabled:opacity-70`}
          >
            {savingTrust ? <Loader2 size={14} className="animate-spin" /> : trustSaved ? <Check size={14} /> : <Save size={14} />}
            {savingTrust ? 'Saving' : trustSaved ? 'Saved' : trustDirty ? 'Save' : 'Saved'}
          </button>
        </div>
      </div>

      {trustError ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {trustError}
        </div>
      ) : null}

      {trustDirty ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
          You have unsaved source trust changes. Save before leaving this page.
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-md">
          <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input min-h-[46px] rounded-2xl pl-11"
            value={sourceTrustSearch}
            onChange={(e) => setSourceTrustSearch(e.target.value)}
            placeholder="Search source name, domain, or source id"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {SOURCE_TRUST_LEVELS.map((level) => (
            <span key={level.key} className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-black ${trustToneClasses(level.tone)}`}>
              {level.label}: {sourceTrustGroups[level.key]?.length || 0}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {SOURCE_TRUST_LEVELS.map((level) => (
          <div
            key={level.key}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (draggedTrustKey) moveSourceTrustItem(draggedTrustKey, level.key);
              setDraggedTrustKey('');
            }}
            className={`admin-source-trust-column rounded-2xl border p-4 transition-all ${trustToneClasses(level.tone)}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black">{level.label}</div>
                <div className="mt-1 text-xs font-semibold opacity-80">
                  {sourceTrustGroups[level.key]?.length || 0} source{sourceTrustGroups[level.key]?.length === 1 ? '' : 's'}
                </div>
              </div>
              <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-black">
                {level.key === 'high' ? 'High' : level.key === 'moderate' ? 'Moderate' : 'Low'}
              </span>
            </div>

            <div className="mt-4 max-h-[560px] space-y-3 overflow-y-auto pr-1">
              {(sourceTrustGroups[level.key] || []).map((item) => (
                <SourceTrustCard
                  key={item.trustKey}
                  item={item}
                  onDragStart={setDraggedTrustKey}
                  onMove={moveSourceTrustItem}
                />
              ))}
              {!(sourceTrustGroups[level.key] || []).length ? (
                <div className="rounded-2xl border border-dashed border-current/30 bg-white/60 px-4 py-10 text-center text-sm font-semibold text-current/70">
                  {normalizedTrustSearch ? 'No matching sources in this trust level' : 'Drop sources here'}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SystemSettingsTab() {
  const [aiModel, setAiModel] = useState('gpt-4o-mini');
  const [aiSummary, setAiSummary] = useState(false);
  const [aiCategory, setAiCategory] = useState(false);
  const [contentStudioAi, setContentStudioAi] = useState(DEFAULT_CONTENT_STUDIO_AI);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [activeSection, setActiveSection] = useState('ai');
  const [activeAiTab, setActiveAiTab] = useState('feed');
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [resettingSettings, setResettingSettings] = useState(false);
  const [saved, setSaved] = useState(false);
  const [settingsError, setSettingsError] = useState('');

  const loadSettings = useCallback(async () => {
    setLoadingSettings(true);
    setSettingsError('');
    try {
      const { data } = await api.get('/admin/settings');
      const settings = data.settings || {};
      setAiModel(settings.aiModel || 'gpt-4o-mini');
      setAiSummary(Boolean(settings.aiSummary));
      setAiCategory(Boolean(settings.aiCategory));
      setContentStudioAi(getContentStudioAiSettings(settings));
      setMaintenanceMode(Boolean(settings.maintenanceMode));
    } catch (e) {
      setSettingsError(e.response?.data?.message || e.message || 'Failed to load system settings');
    } finally {
      setLoadingSettings(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setSettingsError('');
    try {
      const { data } = await api.put('/admin/settings', {
        aiModel,
        aiSummary,
        aiCategory,
        contentStudioAi,
        maintenanceMode
      });
      const settings = data.settings || {};
      setAiModel(settings.aiModel || aiModel);
      setAiSummary(Boolean(settings.aiSummary));
      setAiCategory(Boolean(settings.aiCategory));
      setContentStudioAi(getContentStudioAiSettings(settings));
      setMaintenanceMode(Boolean(settings.maintenanceMode));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSettingsError(e.response?.data?.message || e.message || 'Failed to save system settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleResetSettings = async () => {
    setResettingSettings(true);
    setSettingsError('');
    try {
      const { data } = await api.put('/admin/settings', RECOMMENDED_SYSTEM_SETTINGS);
      const settings = data.settings || {};
      setAiModel(settings.aiModel || RECOMMENDED_SYSTEM_SETTINGS.aiModel);
      setAiSummary(Boolean(settings.aiSummary));
      setAiCategory(Boolean(settings.aiCategory));
      setContentStudioAi(getContentStudioAiSettings(settings));
      setMaintenanceMode(Boolean(settings.maintenanceMode));
      setActiveSection('ai');
      setActiveAiTab('feed');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSettingsError(e.response?.data?.message || e.message || 'Failed to reset system settings');
    } finally {
      setResettingSettings(false);
    }
  };

  const aiToggles = [
    { label: 'Article Summaries', help: 'Fetched articles', val: aiSummary,  set: setAiSummary },
    { label: 'Category Classification', help: 'Fetched articles', val: aiCategory, set: setAiCategory },
  ];
  const updateStudioAi = useCallback((section, field, value) => {
    setContentStudioAi((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [field]: value
      }
    }));
  }, []);
  const updateStudioFilter = useCallback((field, value) => {
    setContentStudioAi((current) => ({
      ...current,
      filtering: {
        ...current.filtering,
        [field]: value
      }
    }));
  }, []);
  return (
    <div className="admin-system-settings-page space-y-5 font-sans">
      <div className="overflow-hidden rounded-2xl border border-ink-100/70 bg-white shadow-card">
        <div className="border-b border-ink-100/70 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="eyebrow mb-1">Settings</div>
              <h3 className="text-xl font-black leading-tight text-ink-800 sm:text-2xl">Admin Controls</h3>
            </div>
            <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
              <div className="rounded-xl border border-ink-100 bg-[#fbfbfa] px-3 py-3 shadow-card sm:px-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-300">Model</div>
                <div className="mt-1 text-[13px] font-black text-ink-800">{aiModel || 'Not set'}</div>
              </div>
              <div className="rounded-xl border border-ink-100 bg-[#fbfbfa] px-3 py-3 shadow-card sm:px-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-300">AI Flags</div>
                <div className="mt-1 text-[13px] font-black text-ink-800">{[aiSummary, aiCategory].filter(Boolean).length}/2 active</div>
              </div>
              <div className="rounded-xl border border-ink-100 bg-[#fbfbfa] px-3 py-3 shadow-card sm:px-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-300">Mode</div>
                <div className={`mt-1 text-[13px] font-black ${maintenanceMode ? 'text-red-600' : 'text-emerald-600'}`}>{maintenanceMode ? 'Maintenance' : 'Live'}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 sm:px-5">
          <div className="admin-settings-segmented inline-flex w-full max-w-full gap-1.5 overflow-x-auto rounded-2xl border border-ink-100 bg-[#fbfbfa] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] sm:w-auto">
            {SETTINGS_SECTIONS.map((section) => {
              const active = activeSection === section.key;
              const Icon = section.icon;
              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => setActiveSection(section.key)}
                  className={`inline-flex min-h-[38px] min-w-[132px] shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-[11px] font-black transition-all sm:min-h-[40px] sm:min-w-[148px] sm:text-[12px] ${active ? 'bg-brand-crimson text-white shadow-[0_10px_20px_rgba(22,58,36,0.18)]' : 'bg-transparent text-ink-500 hover:bg-white hover:text-ink-800'}`}
                >
                  <Icon size={15} />
                  <span className="truncate">{section.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {settingsError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {settingsError}
        </div>
      )}

      {activeSection === 'ai' && (
        <div className="overflow-hidden rounded-2xl border border-ink-100/80 bg-white shadow-card">
          <div className="flex flex-col gap-3 border-b border-ink-100/80 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-crimson">AI Controls</div>
              <h3 className="mt-1 text-[18px] font-black leading-tight text-ink-800 sm:text-[19px]">Model and Generation Settings</h3>
            </div>
            <span className="w-fit rounded-lg border border-ink-100 bg-[#fbfbfa] px-3 py-2 text-[11px] font-black text-ink-700">
              {[aiSummary, aiCategory].filter(Boolean).length}/2 feed flags
            </span>
          </div>

          <div className="border-b border-ink-100/80 px-4 py-3 sm:px-5">
            <div className="admin-settings-segmented inline-flex w-full max-w-full gap-1.5 overflow-x-auto rounded-2xl border border-ink-100 bg-[#fbfbfa] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] xl:w-auto">
              {AI_SETTINGS_TABS.map((tab) => {
                const active = activeAiTab === tab.key;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveAiTab(tab.key)}
                    className={`inline-flex min-h-[38px] min-w-[150px] shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-[11px] font-black transition-all sm:min-h-[40px] sm:min-w-[170px] sm:text-[12px] ${active ? 'bg-brand-crimson text-white shadow-[0_10px_20px_rgba(22,58,36,0.18)]' : 'bg-transparent text-ink-500 hover:bg-white hover:text-ink-800'}`}
                  >
                    <Icon size={15} />
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-[linear-gradient(180deg,#fbfbfa_0%,#ffffff_100%)] px-4 py-5 sm:px-5">
          {activeAiTab === 'feed' && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.15fr)]">
              <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-[0_16px_36px_rgba(15,23,42,0.06)] sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-crimson">Model</div>
                    <div className="mt-1 text-[15px] font-black text-ink-800 sm:text-[16px]">Feed Processing</div>
                  </div>
                  <span className="rounded-lg border border-brand-crimson/10 bg-brand-pink/30 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-brand-crimson">{aiModel || 'Not set'}</span>
                </div>
                <select
                  className="input min-h-[46px] rounded-xl text-[13px] font-semibold"
                  value={aiModel}
                  onChange={e => setAiModel(e.target.value)}
                >
                  <option value="gpt-4o-mini">GPT-4o Mini &mdash; Fast &amp; Cost Efficient (Recommended)</option>
                  <option value="gpt-4o">GPT-4o &mdash; High Accuracy (Enterprise)</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo &mdash; Extended Context Window</option>
                </select>
              </div>
              <div className="admin-ai-toggle-list overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
                {aiToggles.map(({ label, help, val, set }, i) => (
                  <div key={label} className={`admin-ai-toggle-row flex min-h-[76px] items-center justify-between gap-4 px-5 py-4 transition-colors ${val ? 'admin-ai-toggle-row-on bg-emerald-50/45' : 'admin-ai-toggle-row-off bg-white'} ${i ? 'border-t border-ink-100' : ''}`}>
                    <div className="min-w-0">
                      <div className={`text-[14px] font-black ${val ? 'text-emerald-700' : 'text-ink-700'}`}>{label}</div>
                      <div className="mt-1 text-[12px] font-medium text-ink-300">{help}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => set(!val)}
                      className={`admin-ai-switch flex h-6 w-11 shrink-0 items-center rounded-full transition-all ${val ? 'admin-ai-switch-on bg-emerald-500' : 'admin-ai-switch-off bg-gray-200'}`}
                    >
                      <div className={`h-5 w-5 rounded-full bg-white shadow-sm mx-0.5 transition-transform ${val ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeAiTab === 'studio' && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {[
                { key: 'blog', title: 'Blog Generation', maxMin: 300, maxMax: 3000 },
                { key: 'linkedin', title: 'LinkedIn Post', maxMin: 80, maxMax: 800 }
              ].map((section) => {
                const config = contentStudioAi[section.key] || {};
                return (
                  <div key={section.key} className="rounded-2xl border border-ink-100 bg-white p-5 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-crimson">{section.key}</div>
                        <div className="mt-1 text-[16px] font-black text-ink-800">{section.title}</div>
                      </div>
                      <label className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider ${config.requireReview ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-ink-100 bg-ink-50 text-ink-300'}`}>
                        <input
                          type="checkbox"
                          checked={Boolean(config.requireReview)}
                          onChange={(e) => updateStudioAi(section.key, 'requireReview', e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-brand-crimson focus:ring-brand-crimson"
                        />
                        Require Review
                      </label>
                    </div>
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <label className="lg:col-span-2">
                        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-ink-300">Model</span>
                        <select
                          className="input min-h-[46px] rounded-xl text-[13px] font-semibold"
                          value={config.model || 'gpt-4o-mini'}
                          onChange={(e) => updateStudioAi(section.key, 'model', e.target.value)}
                        >
                          {AI_MODEL_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-ink-300">Temperature: {Number(config.temperature ?? 0).toFixed(2)}</span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={config.temperature ?? 0}
                          onChange={(e) => updateStudioAi(section.key, 'temperature', Number(e.target.value))}
                          className="admin-temperature-range w-full accent-brand-crimson"
                          style={{ '--range-progress': `${Math.max(0, Math.min(100, Number(config.temperature ?? 0) * 100))}%` }}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-ink-300">Max Words</span>
                        <input
                          type="number"
                          min={section.maxMin}
                          max={section.maxMax}
                          className="input min-h-[46px] rounded-xl text-[13px] font-semibold"
                          value={config.maxWords ?? ''}
                          onChange={(e) => updateStudioAi(section.key, 'maxWords', Number(e.target.value))}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeAiTab === 'safety' && (
            <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
              <div className="mb-4">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-crimson">Safety Filters</div>
                <div className="mt-1 text-[16px] font-black text-ink-800">Filtering Rules</div>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-ink-300">Strictness</span>
                  <select
                    className="input min-h-[46px] rounded-xl text-[13px] font-semibold"
                    value={contentStudioAi.filtering?.strictness || 'balanced'}
                    onChange={(e) => updateStudioFilter('strictness', e.target.value)}
                  >
                    <option value="light">Light</option>
                    <option value="balanced">Balanced</option>
                    <option value="strict">Strict</option>
                  </select>
                </label>
                <label className="flex min-h-[46px] items-center gap-3 rounded-xl border border-ink-100 bg-[#fbfbfa] px-3 py-3 text-[13px] font-bold text-ink-600">
                  <input
                    type="checkbox"
                    checked={contentStudioAi.filtering?.blockUnsafeContent !== false}
                    onChange={(e) => updateStudioFilter('blockUnsafeContent', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-brand-crimson focus:ring-brand-crimson"
                  />
                  Block unsafe content
                </label>
                <label className="flex min-h-[46px] items-center gap-3 rounded-xl border border-ink-100 bg-[#fbfbfa] px-3 py-3 text-[13px] font-bold text-ink-600">
                  <input
                    type="checkbox"
                    checked={contentStudioAi.filtering?.humanReviewSensitiveTopics !== false}
                    onChange={(e) => updateStudioFilter('humanReviewSensitiveTopics', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-brand-crimson focus:ring-brand-crimson"
                  />
                  Review sensitive topics
                </label>
              </div>
              <label className="mt-4 block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-ink-300">Blocked Topics</span>
                <textarea
                  className="input min-h-[104px] resize-y rounded-xl text-[13px] font-medium"
                  value={(contentStudioAi.filtering?.blockedTopics || []).join(', ')}
                  onChange={(e) => updateStudioFilter('blockedTopics', e.target.value.split(',').map((item) => item.trim()).filter(Boolean))}
                  placeholder="adult content, political persuasion, financial advice..."
                />
              </label>
            </div>
          )}
          </div>
        </div>
      )}

      {activeSection === 'maintenance' && (
        <div className={`admin-maintenance-card rounded-2xl border bg-white p-5 shadow-sm transition-all sm:p-6 ${maintenanceMode ? 'admin-maintenance-card-active border-red-200' : 'border-gray-100'}`}>
          <div className="flex items-center justify-between gap-6">
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <AlertTriangle size={16} className={maintenanceMode ? 'text-red-500' : 'text-gray-400'} />
                <h3 className={`text-lg font-black ${maintenanceMode ? 'text-red-700' : 'text-gray-900'}`}>Maintenance Mode</h3>
              </div>
              <p className="text-sm font-medium text-gray-500">When enabled, all users except Super Admin see a maintenance screen. Use this during deployments or platform repair work.</p>
            </div>
            <button
              type="button"
              onClick={() => setMaintenanceMode(!maintenanceMode)}
              className={`admin-maintenance-switch flex h-7 w-14 shrink-0 items-center rounded-full transition-all ${maintenanceMode ? 'admin-maintenance-switch-on bg-red-500' : 'admin-maintenance-switch-off bg-gray-300'}`}
            >
              <div className={`h-6 w-6 rounded-full bg-white shadow-sm mx-0.5 transition-transform ${maintenanceMode ? 'translate-x-7' : 'translate-x-0'}`} />
            </button>
          </div>
          {maintenanceMode && (
            <div className="admin-maintenance-alert mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              Maintenance mode is ACTIVE. Regular users cannot access the platform right now.
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 pb-20 sm:flex sm:flex-row sm:items-center sm:justify-end sm:pb-0">
        <button
          type="button"
          onClick={handleResetSettings}
          disabled={savingSettings || resettingSettings || loadingSettings}
          className="admin-reset-defaults-button inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-ink-100 bg-white px-4 text-sm font-black text-ink-700 shadow-sm transition-all hover:border-brand-crimson/20 hover:bg-brand-pink/20 hover:text-brand-crimson disabled:cursor-not-allowed disabled:opacity-60"
          title="Reset AI, theme, and access controls to recommended defaults"
        >
          {resettingSettings ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {resettingSettings ? 'Resetting...' : 'Reset Defaults'}
        </button>
        <button
          type="button"
          onClick={handleSaveSettings}
          disabled={savingSettings || resettingSettings || loadingSettings}
          className={`inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-black text-white shadow-sm transition-all ${saved ? 'bg-emerald-600' : 'bg-brand-crimson hover:bg-brand-crimson/90'}`}
        >
          {savingSettings ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : saved ? <><Check size={14} /> Saved!</> : <><Save size={14} /> Save Settings</>}
        </button>
      </div>
    </div>
  );
}
