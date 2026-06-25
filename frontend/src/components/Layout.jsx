import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { APP_EVENT_AUTH_CHANGED, APP_EVENT_CONTENT_CHANGED } from '../utils/appEvents';
import {
  LayoutDashboard, Shield, User as UserIcon, LogOut, ChevronLeft, Bell, Newspaper, BookOpenText, Crown, FileText, Globe2, Users, Database, KeyRound
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

function SideNavItem({ icon: Icon, label, to, onActiveClick }) {
  return (
    <NavLink
      to={to}
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
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

const roleLabel = (role) => {
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'admin') return 'Admin';
  return 'Member';
};

const NOTIFICATION_LIMIT = 20;

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

function NotificationsMenu({ items = [], unreadCount = 0, onItemClick, onMarkAllRead, onClearAll }) {
  return (
    <div className="absolute right-0 top-12 z-50 w-[min(360px,calc(100vw-24px))] rounded-2xl bg-white border border-gray-100 shadow-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-b from-brand-pink/20 to-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-gray-800">Notifications</div>
            <div className="text-[11px] text-gray-400">Latest activity and alerts</div>
          </div>
          {items.length > 0 ? (
            <button
              type="button"
              onClick={onClearAll}
              className="text-[11px] font-bold text-gray-500 hover:text-brand-crimson transition-colors"
            >
              Clear all
            </button>
          ) : null}
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
      <div className="max-h-[420px] overflow-y-auto p-2">
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

function ProfileMenu({ user, role, onProfile, onLogout }) {
  return (
    <div className="absolute right-0 top-12 z-50 w-[min(280px,calc(100vw-24px))] rounded-xl bg-white border border-gray-100 shadow-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="text-sm font-bold text-gray-800 truncate">{user?.name || 'User'}</div>
        <div className="text-[11px] text-gray-400 truncate">{user?.email || ''}</div>
        <div className="mt-1 text-[10px] uppercase tracking-wider font-bold text-brand-crimson">{role}</div>
      </div>
      <div className="p-2">
        <button onClick={onProfile} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-brand-pink/30 hover:text-brand-crimson transition-all">
          <UserIcon size={14} />
          Profile settings
        </button>
        <button onClick={onLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-all">
          <LogOut size={14} />
          Sign out
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
  const notificationsRef = useRef(null);
  const mobileNotificationsRef = useRef(null);
  const profileMenuRef = useRef(null);
  const canUseBlogStudio = isSuperAdmin || user?.access?.canUseBlogStudio === true || (isAdmin && user?.access?.canUseBlogStudio !== false);
  const currentAdminSection = new URLSearchParams(location.search).get('section') || 'platform';
  const unreadCount = notifications.unreadKeys.length;

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
        api.get('/articles/dashboard', { params: { limit: 8, personalized: true } }),
        api.get('/blogs', { params: { status: 'published', limit: 8 } })
      ];

      if (canUseBlogStudio) {
        requests.push(api.get('/blogs/social-posts', { params: { platform: 'linkedin', limit: 8 } }));
      }

      const [articlesResponse, blogsResponse, socialResponse] = await Promise.all(requests);
      const articleBuckets = articlesResponse?.data || {};
      const articles = [
        ...(Array.isArray(articleBuckets.news) ? articleBuckets.news : []),
        ...(Array.isArray(articleBuckets.govt) ? articleBuckets.govt : []),
        ...(Array.isArray(articleBuckets.competitor) ? articleBuckets.competitor : []),
        ...(Array.isArray(articleBuckets.evergreen) ? articleBuckets.evergreen : [])
      ];
      const socialPosts = Array.isArray(socialResponse?.data?.posts)
        ? socialResponse.data.posts
        : Array.isArray(socialResponse?.data?.items)
          ? socialResponse.data.items
          : [];
      const rawBlogs = Array.isArray(blogsResponse?.data?.blogs)
        ? blogsResponse.data.blogs
        : Array.isArray(blogsResponse?.data?.items)
          ? blogsResponse.data.items
          : [];
      const feed = normalizeNotificationFeed({ articles, blogs: rawBlogs, socialPosts });

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
  }, [canUseBlogStudio, isSuperAdmin, saveNotifications, user?._id]);

  useEffect(() => {
    setNotifications(readNotificationState(user?._id));
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
      const clickedProfile = profileMenuRef.current?.contains(target);

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
    if (path.startsWith('/profile')) return 'Profile Settings';
    if (path.startsWith('/social-media-studio') || path.startsWith('/content-studio') || path.startsWith('/blog-studio')) return 'Social Media Studio';
    if (path.startsWith('/blogs')) return 'Social Media Posts';
    if (path.startsWith('/intel-desk')) return 'Intel Desk';
    return 'Dashboard';
  };

  const initials = user?.name 
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) 
    : 'U';

  return (
    <div className="min-h-screen flex flex-col md:h-screen md:flex-row bg-gray-50 overflow-hidden" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <header className="md:hidden shrink-0 bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <img src="/logo.png" className="h-7 object-contain shrink-0" alt="OpportunityOS AI Logo" />
            <span className="text-sm font-bold text-gray-800 truncate">{getPageTitle()}</span>
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
              className="relative w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-50"
            >
              <Bell size={15} />
              {!isSuperAdmin && unreadCount > 0 ? (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-crimson text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
            </button>
            {showNotifications && !isSuperAdmin && (
              <NotificationsMenu
                items={notifications.items}
                unreadCount={unreadCount}
                onItemClick={openNotificationItem}
                onMarkAllRead={markAllNotificationsRead}
                onClearAll={clearAllNotifications}
              />
            )}
            </div>
            <button onClick={handleLogout} className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50">
              <LogOut size={15} />
            </button>
          </div>
        </div>
        {headerActions ? (
          <div className="mt-3 min-w-0 overflow-hidden">
            {headerActions}
          </div>
        ) : null}
      </header>

      {/* Sidebar */}
      <aside
        className="hidden md:flex h-full flex-col bg-white border-r border-gray-100 transition-all duration-300 shrink-0 shadow-sm"
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
              <button onClick={() => navigate('/dashboard')} title="Dashboard"
                className={`w-10 h-10 flex justify-center items-center rounded-lg transition-all mx-auto ${location.pathname.startsWith('/dashboard') ? 'bg-brand-pink/30 text-brand-crimson font-bold' : 'text-gray-500 hover:bg-gray-100'}`}>
                <LayoutDashboard size={16} />
              </button>
              <button onClick={() => navigate('/intel-desk')} title="Intel Desk"
                className={`w-10 h-10 flex justify-center items-center rounded-lg transition-all mx-auto ${location.pathname.startsWith('/intel-desk') ? 'bg-brand-pink/30 text-brand-crimson font-bold' : 'text-gray-500 hover:bg-gray-100'}`}>
                <Newspaper size={16} />
              </button>
              <button onClick={() => navigate('/blogs')} title="Social Media Posts"
                className={`w-10 h-10 flex justify-center items-center rounded-lg transition-all mx-auto ${location.pathname.startsWith('/blogs') ? 'bg-brand-pink/30 text-brand-crimson font-bold' : 'text-gray-500 hover:bg-gray-100'}`}>
                <BookOpenText size={16} />
              </button>
              {canUseBlogStudio && (
                <button onClick={() => navigate('/social-media-studio')} title="Social Media Studio"
                  className={`w-10 h-10 flex justify-center items-center rounded-lg transition-all mx-auto ${location.pathname.startsWith('/social-media-studio') || location.pathname.startsWith('/content-studio') || location.pathname.startsWith('/blog-studio') ? 'bg-brand-pink/30 text-brand-crimson font-bold' : 'text-gray-500 hover:bg-gray-100'}`}>
                  <BookOpenText size={16} />
                </button>
              )}
              <button onClick={() => navigate('/profile')} title="Profile"
                className={`w-10 h-10 flex justify-center items-center rounded-lg transition-all mx-auto ${location.pathname.startsWith('/profile') ? 'bg-brand-pink/30 text-brand-crimson font-bold' : 'text-gray-500 hover:bg-gray-100'}`}>
                <UserIcon size={16} />
              </button>
            </>
          ) : (
            <>
              <SideNavItem icon={LayoutDashboard} label="Dashboard" to="/dashboard" />
              <SideNavItem icon={Newspaper} label="Intel Desk" to="/intel-desk" />
              <SideNavItem icon={BookOpenText} label="Social Media Posts" to="/blogs" />
              {canUseBlogStudio && (
                <SideNavItem icon={BookOpenText} label="Social Media Studio" to="/social-media-studio" />
              )}
              <SideNavItem icon={UserIcon} label="Profile" to="/profile" />
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
        <header className="hidden md:flex shrink-0 bg-white border-b border-gray-100 items-center justify-between gap-4 px-4 py-3 lg:px-6"
          style={{ boxShadow: '0 1px 0 rgba(209,18,67,0.06)' }}>
          <div className="min-w-0 flex items-center gap-3">
            <span className="truncate text-base font-bold text-gray-800">{getPageTitle()}</span>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            {headerActions ? <div className="mr-2 flex min-w-0 max-w-[min(62vw,920px)] items-center overflow-hidden">{headerActions}</div> : null}
            <div className="relative" ref={notificationsRef}>
              <button
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
              />
            )}
            </div>

            <div className="relative" ref={profileMenuRef}>
            <button
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
              <ProfileMenu user={user} role={roleLabel(user?.role)} onProfile={openProfile} onLogout={handleLogout} ownerMode={isSuperAdmin} />
            )}
            </div>
          </div>
        </header>

        {/* Content Body: added padding so it doesn't touch the screen edges */}
        <main className="flex-1 min-h-0 overflow-y-auto bg-canvas px-3 pt-3 pb-20 sm:px-5 sm:pt-4 md:pb-5 lg:px-6 lg:pt-4 transition-all duration-300 relative">
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
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-gray-100 px-2 py-2 grid grid-cols-1 gap-1">
          <button onClick={() => navigate('/admin')} className={`flex flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-bold ${location.pathname.startsWith('/admin') ? 'text-brand-crimson bg-brand-pink/30' : 'text-gray-500'}`}>
            <Shield size={16} />
            Owner Console
          </button>
        </nav>
      ) : (
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-gray-100 px-2 py-2 grid grid-cols-4 gap-1">
        <button onClick={() => navigate('/dashboard')} className={`flex flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-bold ${location.pathname.startsWith('/dashboard') ? 'text-brand-crimson bg-brand-pink/30' : 'text-gray-500'}`}>
          <LayoutDashboard size={16} />
          Dashboard
        </button>
        <button onClick={() => navigate('/intel-desk')} className={`flex flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-bold ${location.pathname.startsWith('/intel-desk') ? 'text-brand-crimson bg-brand-pink/30' : 'text-gray-500'}`}>
          <Newspaper size={16} />
          Intel
        </button>
        <button onClick={() => navigate('/blogs')} className={`flex flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-bold ${location.pathname.startsWith('/blogs') ? 'text-brand-crimson bg-brand-pink/30' : 'text-gray-500'}`}>
          <BookOpenText size={16} />
          Posts
        </button>
        <button onClick={() => navigate('/profile')} className={`flex flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-bold ${location.pathname.startsWith('/profile') ? 'text-brand-crimson bg-brand-pink/30' : 'text-gray-500'}`}>
          <UserIcon size={16} />
          Profile
        </button>
      </nav>
      )}
    </div>
  );
}
