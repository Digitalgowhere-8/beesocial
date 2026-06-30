import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { APP_EVENT_AUTH_CHANGED, APP_EVENT_CONTENT_CHANGED } from '../utils/appEvents';
import GuidedOnboarding from './GuidedOnboarding';
import {
  LayoutDashboard, Shield, User as UserIcon, LogOut, ChevronLeft, Bell, Newspaper, BookOpenText, Crown, FileText, Globe2, Users, Database, KeyRound, X
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

function SideNavItem({ icon: Icon, label, to, onActiveClick, badge = '', dataTour = '' }) {
  return (
    <NavLink
      to={to}
      data-tour={dataTour || undefined}
      onClick={(event) => {
        if (onActiveClick && window.location.pathname.startsWith(to)) {
          event.preventDefault();
          onActiveClick();
        }
      }}
      className={({ isActive }) =>
        `w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-all duration-150 group ${
          isActive ? 'bg-brand-pink/60 text-brand-crimson font-bold shadow-sm' : 'text-gray-500 hover:bg-brand-pink/20 hover:text-gray-800'
        }`
      }
      style={({ isActive }) => ({
        background: isActive ? 'rgba(209,18,67,0.06)' : undefined,
        color: isActive ? CRIMSON : undefined,
        fontWeight: isActive ? '700' : '500',
        fontSize: '13px',
      })}
    >
      <Icon size={15} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge ? (
        <span className="shrink-0 rounded-full border border-brand-crimson/10 bg-brand-crimson px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-white shadow-sm">
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
    href: '/social-media-studio'
  }));

  return uniqueByKey([...socialItems, ...blogItems, ...articleItems])
    .sort((a, b) => itemTime(b.createdAt) - itemTime(a.createdAt))
    .slice(0, NOTIFICATION_LIMIT);
};

function NotificationsMenu({ items = [], unreadCount = 0, onItemClick, onMarkAllRead, onClearAll, onClose, mobile = false }) {
  return (
    <div className={`${mobile ? 'fixed right-3 top-[76px] z-50 w-[min(340px,calc(100vw-24px))] rounded-[24px] shadow-[0_24px_48px_rgba(15,23,42,0.18)]' : 'absolute right-0 top-12 z-50 w-[min(360px,calc(100vw-24px))] rounded-2xl shadow-xl'} overflow-hidden border border-gray-100 bg-white`}>
      <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-b from-brand-pink/20 to-white">
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
          <div className="rounded-full bg-brand-pink px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-brand-crimson">
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
      <div className={`${mobile ? 'max-h-[min(60vh,480px)]' : 'max-h-[420px]'} overflow-y-auto p-2`}>
        {items.length ? items.map((item) => {
          const unread = item.unread === true;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onItemClick?.(item)}
              className={`w-full px-3 py-3 rounded-xl transition-all text-left border ${unread ? 'border-brand-crimson/10 bg-brand-pink/10 hover:bg-brand-pink/20' : 'border-transparent hover:bg-gray-50'}`}
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
    <div className={`absolute right-0 top-12 z-50 w-[min(300px,calc(100vw-24px))] overflow-hidden rounded-[22px] border border-gray-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,248,250,0.97))] shadow-[0_24px_48px_rgba(15,23,42,0.16)] ${className}`}>
      <div className="border-b border-gray-100 px-4 py-4">
        <div className="text-sm font-black text-gray-900 truncate">{user?.name || 'User'}</div>
        <div className="mt-1 text-[12px] font-medium text-gray-400 truncate">{user?.email || ''}</div>
        <div className="mt-2 text-[10px] uppercase tracking-[0.16em] font-black text-brand-crimson">{role}</div>
      </div>
      <div className="space-y-2 p-3">
        <button onClick={onLogout} className="w-full flex items-center gap-3 rounded-2xl border border-red-100 bg-red-50/80 px-4 py-3 text-left text-sm font-black text-red-600 transition-all hover:bg-red-100">
          <LogOut size={14} />
          Sign off
        </button>
      </div>
    </div>
  );
}

export default function Layout({ children, headerActions = null }) {
  const { user, isAdmin, isSuperAdmin, logout, runProgress } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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
  const canUseContentRepository = isSuperAdmin || user?.access?.canUseContentRepository !== false;
  const canUseBlogStudio = isSuperAdmin || user?.access?.canUseBlogStudio === true || (isAdmin && user?.access?.canUseBlogStudio !== false);
  const currentAdminSection = new URLSearchParams(location.search).get('section') || 'platform';
  const unreadCount = notifications.unreadKeys.length;
  const onboardingSeenKey = `app_onboarding_seen_${user?._id || 'guest'}`;
  const onboardingAutoShownKey = `app_onboarding_auto_shown_${user?._id || 'guest'}`;
  const onboardingSessionKey = `app_onboarding_session_${user?._id || 'guest'}`;
  const userCreatedTime = user?.createdAt ? new Date(user.createdAt).getTime() : 0;
  const isNewUser = Number.isFinite(userCreatedTime) && userCreatedTime > 0
    ? (Date.now() - userCreatedTime) <= ONBOARDING_NEW_USER_WINDOW_MS
    : false;

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', collapsed);
  }, [collapsed]);

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

  const openNotificationItem = useCallback((item) => {
    setShowNotifications(false);
    markAllNotificationsRead();
    if (item?.href) {
      navigate(item.href);
    }
  }, [markAllNotificationsRead, navigate]);

  const pollNotifications = useCallback(async () => {
    if (!user?._id || isSuperAdmin) return;

    try {
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
        const mergedUnreadKeys = [...new Set([...newUnreadKeys, ...currentUnread])];
        const nextKnownKeys = feed.map((item) => item.key);
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

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const openProfile = () => {
    setShowProfileMenu(false);
    navigate('/profile');
  };

  useEffect(() => {
    setShowNotifications(false);
    setShowProfileMenu(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!user?._id || isSuperAdmin) return undefined;

    pollNotifications();

    const handleContentChanged = () => {
      pollNotifications();
    };
    const handleAuthChanged = () => {
      pollNotifications();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') pollNotifications();
    };
    const handleFocus = () => {
      pollNotifications();
    };

    window.addEventListener(APP_EVENT_CONTENT_CHANGED, handleContentChanged);
    window.addEventListener(APP_EVENT_AUTH_CHANGED, handleAuthChanged);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener(APP_EVENT_CONTENT_CHANGED, handleContentChanged);
      window.removeEventListener(APP_EVENT_AUTH_CHANGED, handleAuthChanged);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
    if (isSuperAdmin) return 'Owner Console';
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
    ? []
    : [
        { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, onClick: () => navigate('/dashboard'), active: location.pathname.startsWith('/dashboard'), dataTour: 'nav-dashboard' },
        { key: 'intel', label: 'Intel', icon: Newspaper, onClick: () => navigate('/intel-desk'), active: location.pathname.startsWith('/intel-desk'), dataTour: 'nav-intel' },
        ...(canUseContentRepository ? [
          { key: 'posts', label: 'Posts', icon: BookOpenText, onClick: () => navigate('/blogs'), active: location.pathname.startsWith('/blogs') }
        ] : []),
        { key: 'profile', label: 'Profile', icon: UserIcon, onClick: () => navigate('/profile'), active: location.pathname.startsWith('/profile'), dataTour: 'nav-profile' }
      ];

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 overflow-hidden xl:h-screen xl:flex-row" style={{ fontFamily: '"Roboto", system-ui, sans-serif' }}>
      <header className="sticky top-0 z-40 shrink-0 border-b border-gray-100/70 bg-[radial-gradient(circle_at_top_left,rgba(209,18,67,0.08),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,247,249,0.97)_100%)] px-3 pb-2 pt-3 backdrop-blur xl:hidden">
        <div className="overflow-visible rounded-[24px] border border-gray-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(255,250,251,0.94)_100%)] px-3 py-3 shadow-[0_14px_36px_rgba(15,23,42,0.08)]">
        <div className="pointer-events-none absolute inset-x-6 top-0 h-16 rounded-b-[28px] bg-[linear-gradient(90deg,rgba(209,18,67,0.10),rgba(255,255,255,0),rgba(209,18,67,0.06))] blur-2xl" />
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(255,255,255,1)_0%,rgba(253,242,246,0.98)_100%)] shadow-[0_8px_18px_rgba(209,18,67,0.10)] ring-1 ring-gray-200">
              <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top_left,rgba(209,18,67,0.14),transparent_55%)]" />
              <img src="/logo.png" className="relative h-6 object-contain" alt="OpportunityOS AI Logo" />
            </div>
            <div className="min-w-0">
              <span className="block truncate text-[14px] font-black leading-tight text-gray-900">{getPageTitle()}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
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
              className="relative flex h-10 w-10 items-center justify-center rounded-[16px] border border-white/80 bg-white/95 text-gray-400 shadow-[0_8px_18px_rgba(15,23,42,0.06)] ring-1 ring-gray-100 transition-all hover:border-brand-crimson/10 hover:bg-gray-50 hover:text-gray-600"
            >
              <Bell size={15} />
              {!isSuperAdmin && unreadCount > 0 ? (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-crimson text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
            </button>
            {showNotifications && !isSuperAdmin && (
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
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/80 bg-white/95 shadow-[0_8px_18px_rgba(15,23,42,0.06)] ring-1 ring-gray-100 transition-all hover:opacity-90"
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
          <div className="mt-3 min-w-0 overflow-visible border-t border-gray-100/80 pt-3">
            {headerActions}
          </div>
        ) : null}
        </div>
      </header>

      {/* Sidebar */}
      <aside
        data-tour="layout-sidebar"
        className="hidden xl:flex h-full flex-col bg-white border-r border-gray-100 transition-all duration-300 shrink-0 shadow-sm"
        style={{ width: collapsed ? '60px' : '232px', minWidth: collapsed ? '60px' : '232px' }}
      >
        {/* Collapse toggle / logo */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 shrink-0">
          {!collapsed ? (
            <div className="flex-1 flex justify-start pl-2">
              <img 
                src="/logo.png" 
                className="h-8 cursor-pointer object-contain" 
                onClick={() => navigate('/dashboard')} 
                alt="OpportunityOS AI Logo" 
              />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-xl bg-brand-pink flex items-center justify-center cursor-pointer mx-auto transition-all duration-200 hover:bg-brand-crimson/5 border border-brand-crimson/10" onClick={() => navigate('/dashboard')}>
              <img src="/favicon.png" className="h-6 w-6 object-contain" alt="OpportunityOS AI Logo" />
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-gray-100 text-gray-400"
          >
            <ChevronLeft size={14} style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }} />
          </button>
        </div>

        {/* User profile card */}
        {!collapsed ? (
          <div className="p-3 border-b border-gray-100 shrink-0">
            <div className="p-2.5 rounded-xl cursor-pointer transition-all hover:bg-brand-pink/30 border border-gray-50" 
              style={{ background: 'rgba(209,18,67,0.04)' }}
                onClick={() => navigate(isSuperAdmin ? '/admin' : '/profile')}
            >
              <div className="flex items-center gap-2.5">
                <div className="relative shrink-0">
                  {avatar ? (
                    <img src={avatar} className="w-9 h-9 rounded-full object-cover border-2 border-white shadow-sm" alt="Avatar" />
                  ) : (
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-black"
                      style={{ background: `linear-gradient(135deg, ${CRIMSON}, ${DARK_RED})` }}>
                      {initials}
                    </div>
                  )}
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 border-2 border-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-bold text-gray-800 truncate leading-tight">{user?.name || 'User'}</div>
                  <div className="text-[10px] text-gray-400 truncate leading-tight">{user?.email || ''}</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center py-3 border-b border-gray-100 cursor-pointer shrink-0" onClick={() => navigate('/profile')}>
            <div className="relative">
              {avatar ? (
                <img src={avatar} className="w-8 h-8 rounded-full object-cover border-2 border-white shadow-sm" alt="Avatar" />
              ) : (
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black transition-all hover:opacity-85"
                  style={{ background: `linear-gradient(135deg, ${CRIMSON}, ${DARK_RED})` }}>
                  {initials}
                </div>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border border-white" />
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
          {isSuperAdmin ? (
            collapsed ? (
              <div className="space-y-2">
                {SUPER_ADMIN_SECTIONS.map(({ key, icon: Icon, label }) => (
                  <button
                    key={key}
                    onClick={() => navigate(`/admin?section=${key}`)}
                    title={label}
                    className={`w-10 h-10 flex justify-center items-center rounded-lg transition-all mx-auto ${location.pathname.startsWith('/admin') && currentAdminSection === key ? 'bg-brand-pink/30 text-brand-crimson font-bold' : 'text-gray-500 hover:bg-gray-100'}`}
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
                      onClick={() => navigate(`/admin?section=${key}`)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-all duration-150 group ${active ? 'bg-brand-pink/60 text-brand-crimson font-bold shadow-sm' : 'text-gray-500 hover:bg-brand-pink/20 hover:text-gray-800'}`}
                      style={{
                        background: active ? 'rgba(209,18,67,0.06)' : undefined,
                        color: active ? CRIMSON : undefined,
                        fontWeight: active ? '700' : '500',
                        fontSize: '13px',
                      }}
                    >
                      <Icon size={15} />
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
            )
          ) : (
          <>
          {collapsed ? (
            <>
              <button onClick={() => navigate('/dashboard')} title="Dashboard" data-tour="nav-dashboard"
                className={`w-10 h-10 flex justify-center items-center rounded-lg transition-all mx-auto ${location.pathname.startsWith('/dashboard') ? 'bg-brand-pink/30 text-brand-crimson font-bold' : 'text-gray-500 hover:bg-gray-100'}`}>
                <LayoutDashboard size={16} />
              </button>
              <button onClick={() => navigate('/intel-desk')} title="Intel Desk" data-tour="nav-intel"
                className={`w-10 h-10 flex justify-center items-center rounded-lg transition-all mx-auto ${location.pathname.startsWith('/intel-desk') ? 'bg-brand-pink/30 text-brand-crimson font-bold' : 'text-gray-500 hover:bg-gray-100'}`}>
                <Newspaper size={16} />
              </button>
              {canUseContentRepository && (
                <button onClick={() => navigate('/blogs')} title="Content Repository" data-tour="nav-content-repository"
                  className={`w-10 h-10 flex justify-center items-center rounded-lg transition-all mx-auto ${location.pathname.startsWith('/blogs') ? 'bg-brand-pink/30 text-brand-crimson font-bold' : 'text-gray-500 hover:bg-gray-100'}`}>
                  <BookOpenText size={16} />
                </button>
              )}
              {canUseBlogStudio && (
                <button onClick={() => navigate('/social-media-studio')} title="Content Studio Beta" data-tour="nav-content-studio"
                  className={`w-10 h-10 flex justify-center items-center rounded-lg transition-all mx-auto ${location.pathname.startsWith('/social-media-studio') || location.pathname.startsWith('/content-studio') || location.pathname.startsWith('/blog-studio') ? 'bg-brand-pink/30 text-brand-crimson font-bold' : 'text-gray-500 hover:bg-gray-100'}`}>
                  <BookOpenText size={16} />
                </button>
              )}
              <button onClick={() => navigate('/profile')} title="My Hive Profile" data-tour="nav-profile"
                className={`w-10 h-10 flex justify-center items-center rounded-lg transition-all mx-auto ${location.pathname.startsWith('/profile') ? 'bg-brand-pink/30 text-brand-crimson font-bold' : 'text-gray-500 hover:bg-gray-100'}`}>
                <UserIcon size={16} />
              </button>
            </>
          ) : (
            <>
              <SideNavItem icon={LayoutDashboard} label="The Hive" to="/dashboard" dataTour="nav-dashboard" />
              <SideNavItem icon={Newspaper} label="Intel Desk" to="/intel-desk" dataTour="nav-intel" />
              {canUseContentRepository && <SideNavItem icon={BookOpenText} label="Content Repository" to="/blogs" dataTour="nav-content-repository" />}
              {canUseBlogStudio && (
                <SideNavItem icon={BookOpenText} label="Content Studio" to="/social-media-studio" badge="Beta" dataTour="nav-content-studio" />
              )}
              <SideNavItem icon={UserIcon} label="My Hive Profile" to="/profile" dataTour="nav-profile" />
            </>
          )}
          </>
          )}
        </nav>

        {/* Footer logout */}
        <div className="shrink-0 border-t border-gray-100 px-2 pb-5 pt-3">
          {collapsed ? (
            <button onClick={handleLogout} title="Sign out"
              className="w-10 h-10 flex justify-center items-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all mx-auto">
              <LogOut size={15} />
            </button>
          ) : (
            <button onClick={handleLogout}
              className="flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-gray-400 transition-all hover:bg-red-50 hover:text-red-600">
              <LogOut size={15} />
              <span>Sign out</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Header */}
        <header className="hidden xl:flex shrink-0 bg-white border-b border-gray-100 items-center justify-between gap-4 px-4 py-3 xl:px-6"
          style={{ boxShadow: '0 1px 0 rgba(209,18,67,0.06)' }}>
          <div className="min-w-0 flex items-center gap-3">
            <span className="truncate text-base font-bold text-gray-800">{getPageTitle()}</span>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            {headerActions ? <div className="mr-2 flex min-w-0 max-w-[min(62vw,920px)] items-center overflow-hidden">{headerActions}</div> : null}
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
                {!isSuperAdmin && unreadCount > 0 ? (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-crimson text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
                ) : (
                  !isSuperAdmin && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-brand-crimson animate-ping" />
                )}
              </button>
              {showNotifications && !isSuperAdmin && (
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
        <main className="flex-1 min-h-0 overflow-y-auto bg-canvas px-3 pt-3 pb-20 sm:px-5 sm:pt-4 xl:px-6 xl:pt-4 xl:pb-5 transition-all duration-300 relative">
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
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {isSuperAdmin ? (
        <nav className="xl:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-gray-100 px-2 py-2 grid grid-cols-1 gap-1">
          <button onClick={() => navigate('/admin')} className={`flex flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-bold ${location.pathname.startsWith('/admin') ? 'text-brand-crimson bg-brand-pink/30' : 'text-gray-500'}`}>
            <Shield size={16} />
            Owner Console
          </button>
        </nav>
      ) : (
      <nav
        className="xl:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-gray-100 px-2 py-2 gap-1 grid"
        style={{ gridTemplateColumns: `repeat(${Math.max(mobileNavItems.length, 1)}, minmax(0, 1fr))` }}
      >
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={item.onClick}
              {...(item.dataTour ? { 'data-tour': item.dataTour } : {})}
              className={`flex flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-bold ${item.active ? 'text-brand-crimson bg-brand-pink/30' : 'text-gray-500'}`}
            >
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
      </nav>
      )}
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
