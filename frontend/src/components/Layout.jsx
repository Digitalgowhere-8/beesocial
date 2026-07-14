import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { APP_EVENT_AUTH_CHANGED, APP_EVENT_CONTENT_CHANGED } from '../utils/appEvents';
import GuidedOnboarding from './GuidedOnboarding';
import ThemeToggle from './ThemeToggle';
import {
  LayoutDashboard, User as UserIcon, LogOut, ChevronLeft, Bell, Newspaper, BookOpenText, Crown, FileText, Globe2, Users, Database, KeyRound, X, Ban
} from 'lucide-react';

const CRIMSON = '#D11243';
const DARK_RED = '#8F0B2F';
const SUPER_ADMIN_SECTIONS = [
  { key: 'platform', label: 'Overview', icon: Crown },
  { key: 'articles', label: 'Articles', icon: FileText },
  { key: 'fetch', label: 'Fetch', icon: Globe2 },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'plans', label: 'Plans', icon: Database },
  { key: 'settings', label: 'Settings', icon: KeyRound }
];

function SideNavItem({
  icon: Icon,
  label,
  to,
  onActiveClick,
  badge = '',
  dataTour = '',
  navigationLocked = false,
  onNavigationBlocked,
  onNavigate,
}) {
  return (
    <NavLink
      to={to}
      data-tour={dataTour || undefined}
      onClick={(event) => {
        const isCurrentPath = window.location.pathname.startsWith(to);
        if (navigationLocked && !isCurrentPath) {
          event.preventDefault();
          onNavigationBlocked?.();
          return;
        }
        if (isCurrentPath) {
          event.preventDefault();
          onActiveClick?.();
          onNavigate?.();
          return;
        }
        onNavigate?.();
      }}
      className={({ isActive }) =>
        `side-nav-item grid h-11 w-full grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2 rounded-xl px-3 text-left transition-all duration-150 group ${
          isActive ? 'side-nav-item-active bg-brand-pink/60 text-brand-crimson font-bold shadow-sm' : 'side-nav-item-idle text-gray-500 hover:bg-brand-pink/20 hover:text-gray-800'
        }`
      }
      style={({ isActive }) => ({
        background: isActive ? 'rgba(209,18,67,0.06)' : undefined,
        color: isActive ? CRIMSON : undefined,
        fontWeight: isActive ? '700' : '500',
        fontSize: '13px',
      })}
    >
      <span className="flex h-6 w-6 items-center justify-center">
        <Icon size={15} />
      </span>
      <span className="min-w-0 truncate leading-none">{label}</span>
      {badge ? (
        <span className="justify-self-end rounded-full border border-brand-crimson/10 bg-brand-crimson px-1.5 py-0.5 text-[9px] font-black uppercase leading-none tracking-[0.1em] text-white shadow-sm">
          {badge}
        </span>
      ) : null}
    </NavLink>
  );
}

const roleLabel = (role) => {
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'admin') return 'Admin';
  return 'Member';
};

const NOTIFICATION_LIMIT = 20;
const ONBOARDING_NEW_USER_WINDOW_MS = 1000 * 60 * 60 * 24 * 7;
const GENERATION_NAV_LOCK_MESSAGE = 'Generation is running. Please wait until it finishes before moving away.';

const readOnboardingSession = (userId) => {
  try {
    const raw = sessionStorage.getItem(`app_onboarding_session_${userId || 'guest'}`);
    if (!raw) return { active: false, stepIndex: 0 };
    const parsed = JSON.parse(raw);
    return {
      active: parsed?.active === true,
      stepIndex: Number.isInteger(parsed?.stepIndex) ? parsed.stepIndex : 0
    };
  } catch {
    return { active: false, stepIndex: 0 };
  }
};

const writeOnboardingSession = (userId, payload) => {
  try {
    sessionStorage.setItem(`app_onboarding_session_${userId || 'guest'}`, JSON.stringify({
      active: payload?.active === true,
      stepIndex: Number.isInteger(payload?.stepIndex) ? payload.stepIndex : 0
    }));
  } catch {
    // Ignore session storage failures.
  }
};

const notificationStorageKey = (userId) => `app_notifications_${userId || 'guest'}`;

const readNotificationState = (userId) => {
  try {
    const raw = localStorage.getItem(notificationStorageKey(userId));
    if (!raw) {
      return { items: [], unreadKeys: [], knownKeys: [], dismissedKeys: [], initialized: false };
    }
    const parsed = JSON.parse(raw);
    return {
      items: Array.isArray(parsed?.items) ? parsed.items : [],
      unreadKeys: Array.isArray(parsed?.unreadKeys) ? parsed.unreadKeys : [],
      knownKeys: Array.isArray(parsed?.knownKeys) ? parsed.knownKeys : [],
      dismissedKeys: Array.isArray(parsed?.dismissedKeys) ? parsed.dismissedKeys : [],
      initialized: parsed?.initialized === true
    };
  } catch {
    return { items: [], unreadKeys: [], knownKeys: [], dismissedKeys: [], initialized: false };
  }
};

const writeNotificationState = (userId, state) => {
  try {
    localStorage.setItem(notificationStorageKey(userId), JSON.stringify(state));
  } catch {
    // Ignore storage failures and keep in-memory state working.
  }
};

const uniqueByKey = (items) => {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.key || seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
};

const itemTime = (value) => {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

const relativeTime = (value) => {
  if (!value) return 'Just now';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'Just now';

  const diffMs = Date.now() - time;
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(value).toLocaleDateString();
};

const articleTypeLabel = (type) => {
  if (type === 'govt') return 'Government update';
  if (type === 'competitor') return 'Competitor update';
  if (type === 'evergreen') return 'Market insight';
  return 'News update';
};

const compactBadgeCount = (count) => {
  const value = Number(count || 0);
  if (!Number.isFinite(value) || value <= 0) return '';
  return value > 99 ? '99+' : String(value);
};

const isContentRepositoryNotificationKey = (key) => (
  String(key || '').startsWith('blog:') || String(key || '').startsWith('linkedin:')
);

const normalizeNotificationFeed = ({ articles = [], blogs = [], socialPosts = [] }) => {
  const articleItems = articles.map((article) => ({
    key: `article:${article._id}`,
    title: article.title || 'New article added',
    description: articleTypeLabel(article.sourceType),
    createdAt: article.publishedAt || article.createdAt || article.updatedAt,
    href: '/intel-desk'
  }));

  const blogItems = blogs.map((blog) => ({
    key: `blog:${blog._id}`,
    title: blog.title || 'New blog created',
    description: 'Blog content is ready',
    createdAt: blog.publishedAt || blog.createdAt || blog.updatedAt,
    href: '/blogs'
  }));

  const socialItems = socialPosts.map((post) => ({
    key: `linkedin:${post._id}`,
    title: post.title || post.blogTitle || 'New LinkedIn post created',
    description: 'LinkedIn post is ready',
    createdAt: post.createdAt || post.updatedAt || post.publishedAt,
    href: '/blogs'
  }));

  return uniqueByKey([...socialItems, ...blogItems, ...articleItems])
    .sort((a, b) => itemTime(b.createdAt) - itemTime(a.createdAt))
    .slice(0, NOTIFICATION_LIMIT);
};

const normalizeSuperAdminNotificationFeed = ({ admins = [], overview = {}, fetchStatus = {}, dbHealth = {} }) => {
  const now = new Date().toISOString();
  const inactiveAdmins = admins
    .filter((admin) => admin?.role === 'admin' && admin.isActive === false)
    .map((admin) => ({
      key: `super-admin:pending-admin:${admin._id}`,
      title: admin.company ? `${admin.company} admin pending approval` : 'Admin pending approval',
      description: admin.email || admin.name || 'New admin account needs super admin review',
      createdAt: admin.createdAt || admin.updatedAt || now,
      href: '/admin?section=users'
    }));

  const recentRuns = Array.isArray(overview?.recentRuns) ? overview.recentRuns : [];
  const latestRun = recentRuns[0];
  const latestRunTime = latestRun?.finishedAt || latestRun?.startedAt || latestRun?.createdAt || null;
  const latestRunItem = latestRun ? [{
    key: `super-admin:latest-run:${latestRun._id || latestRun.status || latestRunTime}`,
    title: latestRun.status === 'failed' ? 'Latest platform fetch failed' : 'Latest platform fetch completed',
    description: `${latestRun.status || 'unknown'} • ${Number(latestRun.totalInserted || 0)} inserted • ${Number(latestRun.totalErrors || 0)} errors`,
    createdAt: latestRunTime || now,
    href: '/admin?section=fetch'
  }] : [];

  const runningFetchItem = fetchStatus?.running ? [{
    key: `super-admin:platform-fetch-running:${fetchStatus.logId || fetchStatus.startedAt || 'active'}`,
    title: 'Platform fetch is running',
    description: fetchStatus.step || 'Super admin platform intelligence fetch is in progress',
    createdAt: fetchStatus.startedAt || now,
    href: '/admin?section=fetch'
  }] : [];

  const usage = overview?.usage || {};
  const failedRuns = Number(usage.monthFailedRuns || 0);
  const failureItem = failedRuns > 0 ? [{
    key: `super-admin:failed-runs:${failedRuns}:${overview?.monthStart || ''}`,
    title: `${failedRuns} failed fetch${failedRuns === 1 ? '' : 'es'} this month`,
    description: `${Number(usage.failureRateThisMonth || 0)}% failure rate across platform runs`,
    createdAt: latestRunTime || now,
    href: '/admin?section=platform'
  }] : [];

  const pendingCleanup = Number(dbHealth?.analytics?.pendingCleanup || 0);
  const cleanupItem = pendingCleanup > 0 ? [{
    key: `super-admin:analytics-cleanup:${pendingCleanup}`,
    title: 'Analytics cleanup recommended',
    description: `${pendingCleanup} old analytics event${pendingCleanup === 1 ? '' : 's'} can be cleaned`,
    createdAt: dbHealth.checkedAt || now,
    href: '/admin?section=platform'
  }] : [];

  return uniqueByKey([
    ...inactiveAdmins,
    ...runningFetchItem,
    ...latestRunItem,
    ...failureItem,
    ...cleanupItem
  ])
    .sort((a, b) => itemTime(b.createdAt) - itemTime(a.createdAt))
    .slice(0, NOTIFICATION_LIMIT);
};

function NotificationsMenu({ items = [], unreadCount = 0, onItemClick, onMarkAllRead, onClearAll, onClose, mobile = false }) {
  return (
    <div className={`notifications-menu ${mobile ? 'fixed right-3 top-[76px] z-50 w-[min(340px,calc(100vw-24px))] rounded-[24px] shadow-[0_24px_48px_rgba(15,23,42,0.18)]' : 'absolute right-0 top-12 z-50 w-[min(360px,calc(100vw-24px))] rounded-2xl shadow-xl'} overflow-hidden border border-gray-100 bg-white`}>
      <div className="notifications-menu-header px-4 py-3 border-b border-gray-100 bg-gradient-to-b from-brand-pink/20 to-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-gray-800">Notifications</div>
            <div className="text-[11px] text-gray-400">Latest activity and alerts</div>
          </div>
          <div className="flex items-center gap-2">
            {items.length > 0 ? (
              <button
                type="button"
                onClick={onClearAll}
                className="text-[11px] font-bold text-gray-500 hover:text-brand-crimson transition-colors"
              >
                Clear all
              </button>
            ) : null}
            {mobile ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500"
                aria-label="Close notifications"
              >
                <X size={15} />
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-[12px] font-bold text-gray-600">Recent updates</div>
          <div className="notifications-menu-status rounded-full bg-brand-pink px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-brand-crimson">
            {unreadCount > 0 ? `${unreadCount} new` : 'Up to date'}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-end">
          <button
            type="button"
            onClick={onMarkAllRead}
            className="text-[11px] font-bold text-brand-crimson hover:opacity-80 transition-opacity"
          >
            {unreadCount > 0 ? `Mark all read (${unreadCount})` : 'All caught up'}
          </button>
        </div>
      </div>
      <div className={`notifications-menu-body ${mobile ? 'max-h-[min(60vh,480px)]' : 'max-h-[420px]'} overflow-y-auto p-2`}>
        {items.length ? items.map((item) => {
          const unread = item.unread === true;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onItemClick?.(item)}
              className={`notifications-menu-item w-full px-3 py-3 rounded-xl transition-all text-left border ${unread ? 'border-brand-crimson/10 bg-brand-pink/10 hover:bg-brand-pink/20' : 'border-transparent hover:bg-gray-50'}`}
            >
              <div className="flex items-start gap-2">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${unread ? 'bg-brand-crimson' : 'bg-gray-300'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-[12px] font-bold text-gray-700 truncate pr-2">{item.title}</div>
                    <div className="text-[10px] text-gray-400 shrink-0">{relativeTime(item.createdAt)}</div>
                  </div>
                  <div className="mt-1 text-[11px] text-gray-400 leading-snug">{item.description}</div>
                </div>
              </div>
            </button>
          );
        }) : (
          <div className="px-3 py-5 text-center">
            <div className="text-[12px] font-bold text-gray-600">No new notifications</div>
            <div className="text-[11px] text-gray-400 mt-1">New articles, blogs, and posts will appear here.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileMenu({ user, role, onProfile, onLogout, onStartTour, className = '' }) {
  return (
    <div className={`profile-menu-surface absolute right-0 top-12 z-50 w-[min(300px,calc(100vw-24px))] overflow-hidden rounded-[22px] border border-gray-200 bg-white shadow-[0_24px_48px_rgba(15,23,42,0.16)] ${className}`}>
      <div className="border-b border-gray-100 px-4 py-4">
        <div className="text-sm font-black text-gray-900 truncate">{user?.name || 'User'}</div>
        <div className="mt-1 text-[12px] font-medium text-gray-400 truncate">{user?.email || ''}</div>
        <div className="mt-2 text-[10px] uppercase tracking-[0.16em] font-black text-brand-crimson">{role}</div>
      </div>
      <div className="space-y-2 p-3">
        <button onClick={onLogout} className="profile-menu-signout w-full flex items-center gap-3 rounded-2xl border border-red-200 bg-white px-4 py-3 text-left text-sm font-black text-red-600 transition-all hover:bg-red-50">
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function Layout({ children, headerActions = null }) {
  const { user, isAdmin, isSuperAdmin, logout, runProgress, setRunProgress, genProgress, setGenProgress } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const logoSrc = isDark ? '/logo-white.png' : '/logo.png';

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [notifications, setNotifications] = useState(() => readNotificationState(user?._id));
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const notificationsRef = useRef(null);
  const mobileNotificationsRef = useRef(null);
  const mobileProfileMenuRef = useRef(null);
  const desktopProfileMenuRef = useRef(null);
  const mainScrollRef = useRef(null);
  const canUseContentRepository = isSuperAdmin || user?.access?.canUseContentRepository !== false;
  const canUseBlogStudio = isSuperAdmin || user?.access?.canUseBlogStudio === true || (isAdmin && user?.access?.canUseBlogStudio !== false);
  const currentAdminSection = new URLSearchParams(location.search).get('section') || 'platform';
  const unreadCount = notifications.unreadKeys.length;
  const contentRepositoryUnreadCount = notifications.unreadKeys.filter(isContentRepositoryNotificationKey).length;
  const contentRepositoryBadge = compactBadgeCount(contentRepositoryUnreadCount);
  const onboardingSeenKey = `app_onboarding_seen_${user?._id || 'guest'}`;
  const onboardingAutoShownKey = `app_onboarding_auto_shown_${user?._id || 'guest'}`;
  const onboardingSessionKey = `app_onboarding_session_${user?._id || 'guest'}`;
  const userCreatedTime = user?.createdAt ? new Date(user.createdAt).getTime() : 0;
  const isNewUser = Number.isFinite(userCreatedTime) && userCreatedTime > 0
    ? (Date.now() - userCreatedTime) <= ONBOARDING_NEW_USER_WINDOW_MS
    : false;
  const generationLocked = genProgress?.status === 'running';
  const showGenerationLockMessage = useCallback(() => {
    window.alert(GENERATION_NAV_LOCK_MESSAGE);
  }, []);
  const cancelActiveFetch = useCallback(async () => {
    const logId = runProgress?.runId || runProgress?.logId;
    try {
      if (isSuperAdmin) {
        await api.post('/admin/super/fetch/cancel');
      }
      if (logId) {
        await api.post(`/profile-search/runs/${logId}/cancel`);
      }
    } catch (_e) {
      // The run may have finished before the cancellation request arrived.
    } finally {
      setRunProgress(null);
      localStorage.removeItem('beesocial_run_progress');
    }
  }, [isSuperAdmin, runProgress?.logId, runProgress?.runId, setRunProgress]);

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', collapsed);
  }, [collapsed]);

  useEffect(() => {
    if (!generationLocked) return undefined;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [generationLocked]);

  useEffect(() => {
    setAvatar(user?.avatar || '');
  }, [user?.avatar]);

  const saveNotifications = useCallback((nextStateOrUpdater) => {
    setNotifications((current) => {
      const nextState = typeof nextStateOrUpdater === 'function' ? nextStateOrUpdater(current) : nextStateOrUpdater;
      writeNotificationState(user?._id, nextState);
      return nextState;
    });
  }, [user?._id]);

  const markAllNotificationsRead = useCallback(() => {
    saveNotifications((current) => ({
      ...current,
      unreadKeys: [],
      items: current.items.map((item) => ({ ...item, unread: false }))
    }));
  }, [saveNotifications]);

  const clearAllNotifications = useCallback(() => {
    saveNotifications((current) => ({
      ...current,
      items: [],
      unreadKeys: [],
      knownKeys: Array.isArray(current.items) ? current.items.map((item) => item.key) : current.knownKeys,
      dismissedKeys: [
        ...new Set([
          ...(Array.isArray(current.dismissedKeys) ? current.dismissedKeys : []),
          ...(Array.isArray(current.items) ? current.items.map((item) => item.key) : [])
        ])
      ]
    }));
  }, [saveNotifications]);

  const markContentRepositoryNotificationsRead = useCallback(() => {
    saveNotifications((current) => {
      const unreadKeys = (Array.isArray(current.unreadKeys) ? current.unreadKeys : [])
        .filter((key) => !isContentRepositoryNotificationKey(key));

      return {
        ...current,
        unreadKeys,
        items: (Array.isArray(current.items) ? current.items : []).map((item) => (
          isContentRepositoryNotificationKey(item.key) ? { ...item, unread: false } : item
        ))
      };
    });
  }, [saveNotifications]);

  const openNotificationItem = useCallback((item) => {
    if (item?.href && generationLocked) {
      showGenerationLockMessage();
      return;
    }
    setShowNotifications(false);
    markAllNotificationsRead();
    if (item?.href) {
      navigate(item.href);
    }
  }, [generationLocked, markAllNotificationsRead, navigate, showGenerationLockMessage]);

  const pollNotifications = useCallback(async () => {
    if (!user?._id) return;

    try {
      if (isSuperAdmin) {
        const [adminsResponse, overviewResponse, fetchStatusResponse, dbHealthResponse] = await Promise.all([
          api.get('/admin/users', { params: { role: 'admin', limit: 50 } }),
          api.get('/admin/super/overview'),
          api.get('/admin/super/fetch/status'),
          api.get('/admin/super/database-health')
        ]);
        const feed = normalizeSuperAdminNotificationFeed({
          admins: adminsResponse?.data?.items || [],
          overview: overviewResponse?.data || {},
          fetchStatus: fetchStatusResponse?.data || {},
          dbHealth: dbHealthResponse?.data || {}
        });

        saveNotifications((current) => {
          const initialized = current?.initialized === true;
          const knownKeys = new Set(Array.isArray(current?.knownKeys) ? current.knownKeys : []);
          const currentUnread = new Set(Array.isArray(current?.unreadKeys) ? current.unreadKeys : []);
          const dismissedKeys = new Set(Array.isArray(current?.dismissedKeys) ? current.dismissedKeys : []);
          const newUnreadKeys = initialized
            ? feed.filter((item) => !knownKeys.has(item.key) && !dismissedKeys.has(item.key)).map((item) => item.key)
            : [];
          const nextKnownKeys = feed.map((item) => item.key);
          const mergedUnreadKeys = [...new Set([...newUnreadKeys, ...currentUnread])]
            .filter((key) => nextKnownKeys.includes(key));
          const visibleFeed = feed.filter((item) => !dismissedKeys.has(item.key));

          return {
            initialized: true,
            knownKeys: nextKnownKeys,
            dismissedKeys: Array.from(dismissedKeys).filter((key) => nextKnownKeys.includes(key)),
            unreadKeys: mergedUnreadKeys,
            items: visibleFeed.map((item) => ({
              ...item,
              unread: mergedUnreadKeys.includes(item.key)
            }))
          };
        });
        return;
      }

      const requests = [
        api.get('/articles/dashboard', { params: { limit: 8, sharedOnly: true } }),
        api.get('/articles/dashboard', { params: { limit: 8, personalOnly: true } })
      ];

      if (canUseContentRepository) {
        requests.push(api.get('/blogs', { params: { status: 'published', limit: 8 } }));
      }

      if (canUseBlogStudio) {
        requests.push(api.get('/blogs/social-posts', { params: { platform: 'linkedin', limit: 8 } }));
      }

      const responses = await Promise.all(requests);
      const [sharedArticlesResponse, personalArticlesResponse, blogsResponse, socialResponse] = responses;
      const sharedArticleBuckets = sharedArticlesResponse?.data || {};
      const personalArticleBuckets = personalArticlesResponse?.data || {};
      const articles = [
        ...(Array.isArray(sharedArticleBuckets.news) ? sharedArticleBuckets.news : []),
        ...(Array.isArray(sharedArticleBuckets.govt) ? sharedArticleBuckets.govt : []),
        ...(Array.isArray(sharedArticleBuckets.competitor) ? sharedArticleBuckets.competitor : []),
        ...(Array.isArray(sharedArticleBuckets.evergreen) ? sharedArticleBuckets.evergreen : []),
        ...(Array.isArray(personalArticleBuckets.news) ? personalArticleBuckets.news : []),
        ...(Array.isArray(personalArticleBuckets.govt) ? personalArticleBuckets.govt : []),
        ...(Array.isArray(personalArticleBuckets.competitor) ? personalArticleBuckets.competitor : []),
        ...(Array.isArray(personalArticleBuckets.evergreen) ? personalArticleBuckets.evergreen : [])
      ];
      const rawSocialPosts = Array.isArray(socialResponse?.data?.posts)
        ? socialResponse.data.posts
        : Array.isArray(socialResponse?.data?.items)
          ? socialResponse.data.items
          : [];
      const socialPosts = rawSocialPosts.filter((post) => String(post?.createdBy || '') === String(user._id));
      const rawBlogs = Array.isArray(blogsResponse?.data?.blogs)
        ? blogsResponse.data.blogs
        : Array.isArray(blogsResponse?.data?.items)
          ? blogsResponse.data.items
          : [];
      const personalBlogs = rawBlogs.filter((blog) => String(blog?.createdBy || '') === String(user._id));
      const feed = normalizeNotificationFeed({ articles, blogs: personalBlogs, socialPosts });

      saveNotifications((current) => {
        const initialized = current?.initialized === true;
        const knownKeys = new Set(Array.isArray(current?.knownKeys) ? current.knownKeys : []);
        const currentUnread = new Set(Array.isArray(current?.unreadKeys) ? current.unreadKeys : []);
        const dismissedKeys = new Set(Array.isArray(current?.dismissedKeys) ? current.dismissedKeys : []);
        const newUnreadKeys = initialized
          ? feed.filter((item) => !knownKeys.has(item.key) && !dismissedKeys.has(item.key)).map((item) => item.key)
          : [];
        const nextKnownKeys = feed.map((item) => item.key);
        const mergedUnreadKeys = [...new Set([...newUnreadKeys, ...currentUnread])]
          .filter((key) => nextKnownKeys.includes(key));
        const visibleFeed = feed.filter((item) => !dismissedKeys.has(item.key));

        return {
          initialized: true,
          knownKeys: nextKnownKeys,
          dismissedKeys: Array.from(dismissedKeys).filter((key) => nextKnownKeys.includes(key)),
          unreadKeys: mergedUnreadKeys,
          items: visibleFeed.map((item) => ({
            ...item,
            unread: mergedUnreadKeys.includes(item.key)
          }))
        };
      });
    } catch {
      // Skip notification updates on transient API failures.
    }
  }, [canUseBlogStudio, canUseContentRepository, isSuperAdmin, saveNotifications, user?._id]);

  useEffect(() => {
    setNotifications(readNotificationState(user?._id));
  }, [user?._id]);

  useEffect(() => {
    if (!user?._id) return;
    try {
      const activeSession = readOnboardingSession(user?._id);
      if (activeSession.active) {
        setTourStepIndex(activeSession.stepIndex || 0);
        setTourOpen(true);
        return;
      }
      const seen = localStorage.getItem(onboardingSeenKey) === 'true';
      const autoShown = localStorage.getItem(onboardingAutoShownKey) === 'true';
      if (!seen && !autoShown && isNewUser) {
        localStorage.setItem(onboardingAutoShownKey, 'true');
        writeOnboardingSession(user?._id, { active: true, stepIndex: 0 });
        setTourStepIndex(0);
        setTourOpen(true);
      }
    } catch {
      if (isNewUser) setTourOpen(true);
    }
  }, [isNewUser, onboardingAutoShownKey, onboardingSeenKey, onboardingSessionKey, user?._id]);

  useEffect(() => {
    const handleStartTour = () => {
      setTourStepIndex(0);
      writeOnboardingSession(user?._id, { active: true, stepIndex: 0 });
      setTourOpen(true);
    };
    window.addEventListener('app:start-tour', handleStartTour);
    return () => window.removeEventListener('app:start-tour', handleStartTour);
  }, [user?._id]);

  useEffect(() => {
    if (!user?._id) return;
    const params = new URLSearchParams(location.search);
    if (!['1', 'true', 'yes'].includes(String(params.get('tour') || '').toLowerCase())) return;
    setTourStepIndex(0);
    writeOnboardingSession(user?._id, { active: true, stepIndex: 0 });
    setTourOpen(true);
  }, [location.search, user?._id]);

  const closeTour = useCallback(() => {
    setTourOpen(false);
    setTourStepIndex(0);
    try {
      localStorage.setItem(onboardingSeenKey, 'true');
    } catch {
      // Ignore storage failures.
    }
    writeOnboardingSession(user?._id, { active: false, stepIndex: 0 });
  }, [onboardingSeenKey, user?._id]);

  const startTour = useCallback(() => {
    setShowProfileMenu(false);
    setShowNotifications(false);
    setTourStepIndex(0);
    writeOnboardingSession(user?._id, { active: true, stepIndex: 0 });
    setTourOpen(true);
  }, [user?._id]);

  const handleTourStepChange = useCallback((stepIndex) => {
    setTourStepIndex(stepIndex);
    writeOnboardingSession(user?._id, { active: true, stepIndex });
  }, [user?._id]);

  useEffect(() => {
    const handleAvatarUpdate = (e) => {
      const detail = e.detail;
      // Support both old format (string) and new format ({avatar, userId})
      if (typeof detail === 'object' && detail !== null) {
        if (!detail.userId || detail.userId === user?._id) {
          setAvatar(detail.avatar || '');
        }
      } else {
        setAvatar(detail || '');
      }
    };
    window.addEventListener('profile_avatar_updated', handleAvatarUpdate);
    return () => window.removeEventListener('profile_avatar_updated', handleAvatarUpdate);
  }, [user?._id]);

  const handleLogout = useCallback(() => {
    if (generationLocked) {
      showGenerationLockMessage();
      return;
    }
    logout();
    navigate('/login');
  }, [generationLocked, logout, navigate, showGenerationLockMessage]);

  const openProfile = useCallback(() => {
    if (generationLocked && !location.pathname.startsWith('/profile')) {
      showGenerationLockMessage();
      return;
    }
    setShowProfileMenu(false);
    navigate('/profile');
  }, [generationLocked, location.pathname, navigate, showGenerationLockMessage]);

  const navigateIfNeeded = useCallback((path) => {
    const currentPath = `${location.pathname}${location.search || ''}`;
    const isSameTarget = path.includes('?')
      ? currentPath === path
      : location.pathname.startsWith(path);
    if (isSameTarget) return true;
    if (generationLocked) {
      showGenerationLockMessage();
      return false;
    }
    navigate(path);
    return true;
  }, [generationLocked, location.pathname, location.search, navigate, showGenerationLockMessage]);

  const navigateAndCollapseSidebar = useCallback((path) => {
    if (navigateIfNeeded(path)) setCollapsed(true);
  }, [navigateIfNeeded]);

  const collapseSidebarPanel = useCallback(() => {
    setCollapsed(true);
  }, []);

  useEffect(() => {
    setShowNotifications(false);
    setShowProfileMenu(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!user?._id) return undefined;

    pollNotifications();

    const handleContentChanged = () => {
      pollNotifications();
    };
    const handleAuthChanged = () => {
      pollNotifications();
    };

    window.addEventListener(APP_EVENT_CONTENT_CHANGED, handleContentChanged);
    window.addEventListener(APP_EVENT_AUTH_CHANGED, handleAuthChanged);
    const refreshTimer = isSuperAdmin
      ? window.setInterval(() => {
          pollNotifications();
        }, 60000)
      : null;

    return () => {
      window.removeEventListener(APP_EVENT_CONTENT_CHANGED, handleContentChanged);
      window.removeEventListener(APP_EVENT_AUTH_CHANGED, handleAuthChanged);
      if (refreshTimer) window.clearInterval(refreshTimer);
    };
  }, [isSuperAdmin, pollNotifications, user?._id]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      const target = event.target;
      const clickedNotifications = notificationsRef.current?.contains(target) || mobileNotificationsRef.current?.contains(target);
      const clickedProfile =
        mobileProfileMenuRef.current?.contains(target) ||
        desktopProfileMenuRef.current?.contains(target);

      if (!clickedNotifications) setShowNotifications(false);
      if (!clickedProfile) setShowProfileMenu(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, []);

  const getPageTitle = () => {
    const path = location.pathname;
    if (isSuperAdmin) {
      if (path.startsWith('/profile')) return 'My Hive Profile';
      const activeOwnerSection = SUPER_ADMIN_SECTIONS.find((section) => section.key === currentAdminSection);
      return activeOwnerSection ? activeOwnerSection.label : 'Owner Console';
    }
    if (path.startsWith('/admin')) return 'Admin Panel';
    if (path.startsWith('/profile')) return 'My Hive Profile';
    if (path.startsWith('/social-media-studio') || path.startsWith('/content-studio') || path.startsWith('/blog-studio')) return 'Content Studio';
    if (path.startsWith('/blogs')) return 'Content Repository';
    if (path.startsWith('/intel-desk')) return 'Intel Desk';
    return 'Daily Intelligence Briefing';
  };

  const initials = user?.name 
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) 
    : 'U';
  const mobileNavItems = isSuperAdmin
    ? [
        {
          key: 'platform',
          label: 'Overview',
          icon: Crown,
          onClick: () => navigateIfNeeded('/admin?section=platform'),
          active: location.pathname.startsWith('/admin') && currentAdminSection === 'platform'
        },
        {
          key: 'articles',
          label: 'Articles',
          icon: FileText,
          onClick: () => navigateIfNeeded('/admin?section=articles'),
          active: location.pathname.startsWith('/admin') && currentAdminSection === 'articles'
        },
        {
          key: 'fetch',
          label: 'Fetch',
          icon: Globe2,
          onClick: () => navigateIfNeeded('/admin?section=fetch'),
          active: location.pathname.startsWith('/admin') && currentAdminSection === 'fetch'
        },
        {
          key: 'users',
          label: 'Users',
          icon: Users,
          onClick: () => navigateIfNeeded('/admin?section=users'),
          active: location.pathname.startsWith('/admin') && currentAdminSection === 'users'
        },
        {
          key: 'plans',
          label: 'Plans',
          icon: Database,
          onClick: () => navigateIfNeeded('/admin?section=plans'),
          active: location.pathname.startsWith('/admin') && currentAdminSection === 'plans'
        },
        {
          key: 'settings',
          label: 'Settings',
          icon: KeyRound,
          onClick: () => navigateIfNeeded('/admin?section=settings'),
          active: location.pathname.startsWith('/admin') && currentAdminSection === 'settings'
        },
      ]
    : [
        { key: 'dashboard', label: 'The Hive', icon: LayoutDashboard, onClick: () => navigateIfNeeded('/dashboard'), active: location.pathname.startsWith('/dashboard'), dataTour: 'nav-dashboard' },
        { key: 'intel', label: 'Intel', icon: Newspaper, onClick: () => navigateIfNeeded('/intel-desk'), active: location.pathname.startsWith('/intel-desk'), dataTour: 'nav-intel' },
        ...(canUseContentRepository ? [
          { key: 'posts', label: 'Posts', icon: BookOpenText, badge: contentRepositoryBadge, onClick: () => navigateIfNeeded('/blogs'), active: location.pathname.startsWith('/blogs') }
        ] : []),
        { key: 'profile', label: 'Profile', icon: UserIcon, onClick: () => navigateIfNeeded('/profile'), active: location.pathname.startsWith('/profile'), dataTour: 'nav-profile' }
      ];

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 overflow-hidden xl:h-screen xl:flex-row" style={{ fontFamily: '"Roboto", system-ui, sans-serif' }}>
      <header className="mobile-app-header sticky top-0 z-40 shrink-0 border-b border-gray-100/70 bg-[radial-gradient(circle_at_top_left,rgba(209,18,67,0.08),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,247,249,0.97)_100%)] px-3 pb-2 pt-3 backdrop-blur xl:hidden">
        <div className="mobile-app-header-card overflow-visible rounded-[24px] border border-gray-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(255,250,251,0.94)_100%)] px-3 py-3 shadow-[0_14px_36px_rgba(15,23,42,0.08)]">
        <div className="mobile-app-header-glow pointer-events-none absolute inset-x-6 top-0 h-16 rounded-b-[28px] bg-[linear-gradient(90deg,rgba(209,18,67,0.10),rgba(255,255,255,0),rgba(209,18,67,0.06))] blur-2xl" />
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="mobile-app-logo-tile relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(255,255,255,1)_0%,rgba(253,242,246,0.98)_100%)] shadow-[0_8px_18px_rgba(209,18,67,0.10)] ring-1 ring-gray-200">
              <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top_left,rgba(209,18,67,0.14),transparent_55%)]" />
              <img src={logoSrc} className="relative h-6 object-contain" alt="BeeSocial Logo" />
            </div>
            <div className="min-w-0">
              <span className="block truncate text-[14px] font-black leading-tight text-gray-900">{getPageTitle()}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ThemeToggle compact iconOnly className="mobile-top-theme-toggle inline-flex" />
            <div className="relative" ref={mobileNotificationsRef}>
            <button
              onClick={() => {
                setShowNotifications((v) => {
                  const next = !v;
                  if (next) markAllNotificationsRead();
                  return next;
                });
                setShowProfileMenu(false);
              }}
              className="mobile-header-icon-button relative flex h-10 w-10 items-center justify-center rounded-[16px] border border-white/80 bg-white/95 text-gray-400 shadow-[0_8px_18px_rgba(15,23,42,0.06)] ring-1 ring-gray-100 transition-all hover:border-brand-crimson/10 hover:bg-gray-50 hover:text-gray-600"
            >
              <Bell size={15} />
              {unreadCount > 0 ? (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-crimson text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
            </button>
            {showNotifications && (
              <>
              <button
                type="button"
                aria-label="Close notifications"
                onClick={() => setShowNotifications(false)}
                className="fixed inset-0 z-40 bg-gray-950/10 backdrop-blur-[1px] xl:hidden"
              />
              <NotificationsMenu
                items={notifications.items}
                unreadCount={unreadCount}
                onItemClick={openNotificationItem}
                onMarkAllRead={markAllNotificationsRead}
                onClearAll={clearAllNotifications}
                onClose={() => setShowNotifications(false)}
                mobile
              />
              </>
            )}
            </div>
            <div className="relative" ref={mobileProfileMenuRef}>
              <button
                data-tour="header-profile-menu"
                onClick={() => {
                  setShowProfileMenu((v) => !v);
                  setShowNotifications(false);
                }}
                className="mobile-header-avatar-button flex h-10 w-10 items-center justify-center rounded-full border border-white/80 bg-white/95 shadow-[0_8px_18px_rgba(15,23,42,0.06)] ring-1 ring-gray-100 transition-all hover:opacity-90"
              >
                {avatar ? (
                  <img src={avatar} className="h-10 w-10 rounded-full object-cover border-2 border-white shadow-sm" alt="Avatar" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full text-[12px] font-black text-white" style={{ background: `linear-gradient(135deg, ${CRIMSON}, ${DARK_RED})` }}>
                    {initials}
                  </div>
                )}
              </button>
              {showProfileMenu && (
                <ProfileMenu
                  user={user}
                  role={roleLabel(user?.role)}
                  onProfile={openProfile}
                  onLogout={handleLogout}
                  onStartTour={startTour}
                  className="top-12 right-0"
                />
              )}
            </div>
          </div>
        </div>
        {headerActions ? (
          <div className="mobile-header-actions mt-3 min-w-0 overflow-visible border-t border-gray-100/80 pt-3">
            {headerActions}
          </div>
        ) : null}
        <div className="mobile-theme-row mt-3 hidden justify-end">
          <ThemeToggle compact iconOnly />
        </div>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        data-tour="layout-sidebar"
        className="hidden xl:flex h-full flex-col bg-white border-r border-gray-100 transition-[width,min-width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] shrink-0 shadow-sm"
        style={{ width: collapsed ? '64px' : '240px', minWidth: collapsed ? '64px' : '240px' }}
      >
        {/* Collapse toggle / logo */}
        <div className={`${collapsed ? 'relative justify-center px-2' : 'justify-between px-4'} flex h-[72px] items-center border-b border-gray-100 shrink-0 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]`}>
          {!collapsed ? (
            <div className="flex-1 flex justify-start pl-2">
              <img 
                src={logoSrc} 
                className="h-10 cursor-pointer object-contain" 
                onClick={() => navigateIfNeeded(isSuperAdmin ? '/admin' : '/dashboard')} 
                alt="BeeSocial Logo" 
              />
            </div>
          ) : (
            <button
              type="button"
              title="Open sidebar"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-brand-crimson/10 bg-white shadow-[0_10px_24px_rgba(209,18,67,0.14)] ring-4 ring-brand-pink/40 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-crimson/20 hover:shadow-[0_14px_28px_rgba(209,18,67,0.18)]"
              onClick={() => setCollapsed(false)}
            >
              <img src="/favicon.png" className="h-8 w-8 object-contain" alt="BeeSocial Logo" />
            </button>
          )}
          {!collapsed ? (
            <button
              onClick={() => setCollapsed(true)}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-gray-100 text-gray-400"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft size={14} />
            </button>
          ) : null}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-2 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]">
          {isSuperAdmin ? (
            collapsed ? (
              <div className="space-y-2">
                {SUPER_ADMIN_SECTIONS.map(({ key, icon: Icon, label }) => (
                  <button
                    key={key}
                    onClick={() => navigateIfNeeded(`/admin?section=${key}`)}
                    title={label}
                    className={`collapsed-nav-icon-button w-10 h-10 flex justify-center items-center rounded-lg transition-all mx-auto ${location.pathname.startsWith('/admin') && currentAdminSection === key ? 'collapsed-nav-icon-button-active bg-brand-pink/30 text-brand-crimson font-bold' : 'text-gray-500 hover:bg-brand-pink/20 hover:text-brand-crimson'}`}
                  >
                    <Icon size={16} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {SUPER_ADMIN_SECTIONS.map(({ key, icon: Icon, label }) => {
                  const active = location.pathname.startsWith('/admin') && currentAdminSection === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => navigateAndCollapseSidebar(`/admin?section=${key}`)}
                      className={`side-nav-item grid h-11 w-full grid-cols-[22px_minmax(0,1fr)] items-center gap-2 rounded-xl px-3 text-left transition-all duration-150 group ${active ? 'side-nav-item-active bg-brand-pink/60 text-brand-crimson font-bold shadow-sm' : 'side-nav-item-idle text-gray-500 hover:bg-brand-pink/20 hover:text-gray-800'}`}
                      style={{
                        background: active ? 'rgba(209,18,67,0.06)' : undefined,
                        color: active ? CRIMSON : undefined,
                        fontWeight: active ? '700' : '500',
                        fontSize: '13px',
                      }}
                    >
                      <span className="flex h-6 w-6 items-center justify-center">
                        <Icon size={15} />
                      </span>
                      <span className="min-w-0 truncate leading-none">{label}</span>
                    </button>
                  );
                })}
              </div>
            )
          ) : (
          <>
          {collapsed ? (
            <>
              <button onClick={() => navigateIfNeeded('/dashboard')} title="The Hive" data-tour="nav-dashboard"
                className={`collapsed-nav-icon-button w-10 h-10 flex justify-center items-center rounded-lg transition-all mx-auto ${location.pathname.startsWith('/dashboard') ? 'collapsed-nav-icon-button-active bg-brand-pink/30 text-brand-crimson font-bold' : 'text-gray-500 hover:bg-brand-pink/20 hover:text-brand-crimson'}`}>
                <LayoutDashboard size={16} />
              </button>
              <button onClick={() => navigateIfNeeded('/intel-desk')} title="Intel Desk" data-tour="nav-intel"
                className={`collapsed-nav-icon-button w-10 h-10 flex justify-center items-center rounded-lg transition-all mx-auto ${location.pathname.startsWith('/intel-desk') ? 'collapsed-nav-icon-button-active bg-brand-pink/30 text-brand-crimson font-bold' : 'text-gray-500 hover:bg-brand-pink/20 hover:text-brand-crimson'}`}>
                <Newspaper size={16} />
              </button>
              {canUseContentRepository && (
                <button onClick={() => navigateIfNeeded('/blogs')} title="Content Repository" data-tour="nav-content-repository"
                  className={`collapsed-nav-icon-button relative w-10 h-10 flex justify-center items-center rounded-lg transition-all mx-auto ${location.pathname.startsWith('/blogs') ? 'collapsed-nav-icon-button-active bg-brand-pink/30 text-brand-crimson font-bold' : 'text-gray-500 hover:bg-brand-pink/20 hover:text-brand-crimson'}`}>
                  <BookOpenText size={16} />
                  {contentRepositoryBadge ? (
                    <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-brand-crimson px-1.5 py-0.5 text-[9px] font-black leading-none text-white shadow-sm ring-2 ring-white">
                      {contentRepositoryBadge}
                    </span>
                  ) : null}
                </button>
              )}
              {canUseBlogStudio && (
                <button onClick={() => navigateIfNeeded('/social-media-studio')} title="Content Studio Beta" data-tour="nav-content-studio"
                  className={`collapsed-nav-icon-button w-10 h-10 flex justify-center items-center rounded-lg transition-all mx-auto ${location.pathname.startsWith('/social-media-studio') || location.pathname.startsWith('/content-studio') || location.pathname.startsWith('/blog-studio') ? 'collapsed-nav-icon-button-active bg-brand-pink/30 text-brand-crimson font-bold' : 'text-gray-500 hover:bg-brand-pink/20 hover:text-brand-crimson'}`}>
                  <BookOpenText size={16} />
                </button>
              )}
              <button onClick={() => navigateIfNeeded('/profile')} title="My Hive Profile" data-tour="nav-profile"
                className={`collapsed-nav-icon-button w-10 h-10 flex justify-center items-center rounded-lg transition-all mx-auto ${location.pathname.startsWith('/profile') ? 'collapsed-nav-icon-button-active bg-brand-pink/30 text-brand-crimson font-bold' : 'text-gray-500 hover:bg-brand-pink/20 hover:text-brand-crimson'}`}>
                <UserIcon size={16} />
              </button>
            </>
          ) : (
            <>
              <SideNavItem icon={LayoutDashboard} label="The Hive" to="/dashboard" dataTour="nav-dashboard" navigationLocked={generationLocked} onNavigationBlocked={showGenerationLockMessage} onNavigate={collapseSidebarPanel} />
              <SideNavItem icon={Newspaper} label="Intel Desk" to="/intel-desk" dataTour="nav-intel" navigationLocked={generationLocked} onNavigationBlocked={showGenerationLockMessage} onNavigate={collapseSidebarPanel} />
              {canUseContentRepository && <SideNavItem icon={BookOpenText} label="Content Repository" to="/blogs" badge={contentRepositoryBadge} dataTour="nav-content-repository" navigationLocked={generationLocked} onNavigationBlocked={showGenerationLockMessage} onNavigate={collapseSidebarPanel} />}
              {canUseBlogStudio && (
                <SideNavItem icon={BookOpenText} label="Content Studio" to="/social-media-studio" badge="Beta" dataTour="nav-content-studio" navigationLocked={generationLocked} onNavigationBlocked={showGenerationLockMessage} onNavigate={collapseSidebarPanel} />
              )}
              <SideNavItem icon={UserIcon} label="My Hive Profile" to="/profile" dataTour="nav-profile" navigationLocked={generationLocked} onNavigationBlocked={showGenerationLockMessage} onNavigate={collapseSidebarPanel} />
            </>
          )}
          </>
          )}
        </nav>

        {/* Footer logout */}
        <div className="shrink-0 border-t border-gray-100 px-2 pb-5 pt-3">
          {collapsed ? (
            <button onClick={handleLogout} title="Sign out"
              className="sidebar-signout-button w-10 h-10 flex justify-center items-center rounded-lg text-gray-400 hover:bg-brand-pink/20 hover:text-brand-crimson transition-all mx-auto">
              <LogOut size={15} />
            </button>
          ) : (
            <button onClick={handleLogout}
              className="sidebar-signout-button flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-gray-400 transition-all hover:bg-brand-pink/20 hover:text-brand-crimson">
              <LogOut size={15} />
              <span>Sign out</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Header */}
        <header className="hidden h-[72px] shrink-0 bg-white border-b border-gray-100 items-center justify-between gap-4 px-4 xl:flex xl:px-6"
          style={{ boxShadow: '0 1px 0 rgba(209,18,67,0.06)' }}>
          <div className="min-w-0 flex items-center gap-3">
            <span className="truncate text-base font-bold text-gray-800">{getPageTitle()}</span>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            {headerActions ? <div className="mr-2 flex min-w-0 max-w-[min(62vw,920px)] items-center overflow-visible">{headerActions}</div> : null}
            <ThemeToggle compact className="mr-1" />
            <div className="relative" ref={notificationsRef}>
              <button
                data-tour="header-notifications"
                onClick={() => {
                  setShowNotifications((v) => {
                    const next = !v;
                    if (next) markAllNotificationsRead();
                    return next;
                  });
                  setShowProfileMenu(false);
                }}
                className="relative p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all"
              >
                <Bell size={15} />
                {unreadCount > 0 ? (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-crimson text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
                ) : null}
              </button>
              {showNotifications && (
                <NotificationsMenu
                items={notifications.items}
                unreadCount={unreadCount}
                onItemClick={openNotificationItem}
                onMarkAllRead={markAllNotificationsRead}
                onClearAll={clearAllNotifications}
                onClose={() => setShowNotifications(false)}
              />
            )}
            </div>

            <div className="relative" ref={desktopProfileMenuRef}>
            <button
              data-tour="header-profile-menu"
              className="flex items-center gap-2.5 pl-2 border-l border-gray-100 cursor-pointer hover:opacity-85"
              onClick={() => {
                setShowProfileMenu((v) => !v);
                setShowNotifications(false);
              }}
            >
              {avatar ? (
                <img src={avatar} className="w-7 h-7 rounded-full object-cover border border-gray-100" alt="Avatar" />
              ) : (
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-black"
                  style={{ background: `linear-gradient(135deg, ${CRIMSON}, ${DARK_RED})` }}>
                  {initials}
                </div>
              )}
              <div className="hidden sm:block text-right">
                <div className="text-[12px] font-bold text-gray-700 leading-tight">{user?.name}</div>
                <div className="text-[10px] text-gray-400 leading-tight uppercase tracking-wider">{roleLabel(user?.role)}</div>
              </div>
            </button>
            {showProfileMenu && (
              <ProfileMenu user={user} role={roleLabel(user?.role)} onProfile={openProfile} onLogout={handleLogout} onStartTour={startTour} ownerMode={isSuperAdmin} />
            )}
            </div>
          </div>
        </header>

        {/* Content Body: added padding so it doesn't touch the screen edges */}
        <main
          ref={mainScrollRef}
          className="flex-1 min-h-0 overflow-y-auto bg-canvas px-3 pt-3 pb-20 sm:px-5 sm:pt-4 xl:px-6 xl:pt-4 xl:pb-5 transition-all duration-300 relative"
        >
          <div className="w-full h-full relative">
            {children}
            
            {runProgress && ['queued', 'running'].includes(runProgress.status) && (
              <div className="fixed bottom-20 right-4 sm:right-6 z-50 animate-fade-in-up md:bottom-6">
                <div className="rounded-xl border border-blue-200 bg-white p-3 shadow-lg flex items-center gap-3">
                  <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-20"></span>
                    <div className="h-4 w-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[12px] font-black text-gray-800 truncate">Fetching Intelligence</span>
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider truncate">{runProgress.step || 'Processing...'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={cancelActiveFetch}
                    className="ml-1 rounded-lg border border-red-200 bg-red-50 p-2 text-red-500 transition-all hover:bg-red-100 hover:text-red-600"
                    title="Stop"
                  >
                    <Ban size={14} />
                  </button>
                </div>
              </div>
            )}

            {genProgress && genProgress.status === 'running' && (
              <div className={`fixed ${runProgress && ['queued', 'running'].includes(runProgress.status) ? 'bottom-36 md:bottom-20' : 'bottom-20 md:bottom-6'} right-4 sm:right-6 z-50 animate-fade-in-up`}>
                <div className="rounded-xl border border-purple-200 bg-white p-3 shadow-lg flex items-center gap-3">
                  <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-50">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-400 opacity-20"></span>
                    <div className="h-4 w-4 rounded-full border-2 border-purple-500 border-t-transparent animate-spin"></div>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[12px] font-black text-gray-800 truncate">
                      {genProgress.type === 'linkedin' ? 'Generating LinkedIn Post' : 'Generating Blog'}
                    </span>
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider truncate">AI is writing…</span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try { await api.post('/blogs/cancel'); } catch { /* ignore */ }
                      setGenProgress(null);
                    }}
                    className="ml-1 rounded-lg border border-red-200 bg-red-50 p-2 text-red-500 transition-all hover:bg-red-100 hover:text-red-600"
                    title="Stop generation"
                  >
                    <Ban size={14} />
                  </button>
                </div>
              </div>
            )}

          </div>
        </main>
      </div>

      <nav
        className="mobile-bottom-nav xl:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-gray-100 px-2 py-2 gap-1 grid"
        style={{ gridTemplateColumns: `repeat(${Math.max(mobileNavItems.length, 1)}, minmax(0, 1fr))` }}
      >
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={item.onClick}
              {...(item.dataTour ? { 'data-tour': item.dataTour } : {})}
              className={`mobile-bottom-nav-item flex min-w-0 flex-col items-center gap-1 rounded-lg px-0.5 py-2 text-[9px] font-bold leading-tight sm:text-[10px] ${item.active ? 'mobile-bottom-nav-item-active text-brand-crimson bg-brand-pink/30' : 'mobile-bottom-nav-item-idle text-gray-500'}`}
            >
              <span className="relative inline-flex">
                <Icon size={16} />
                {item.badge ? (
                  <span className="absolute -right-2.5 -top-2 flex min-w-[16px] items-center justify-center rounded-full bg-brand-crimson px-1 text-[9px] font-black leading-[16px] text-white">
                    {item.badge}
                  </span>
                ) : null}
              </span>
              <span className="max-w-full truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>
      <GuidedOnboarding
        user={user}
        open={tourOpen}
        onClose={closeTour}
        initialStepIndex={tourStepIndex}
        onStepChange={handleTourStepChange}
      />
    </div>
  );
}
