import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Shield, User as UserIcon, LogOut, ChevronLeft, Bell, Menu
} from 'lucide-react';

const CRIMSON = '#D11243';
const DARK_RED = '#8F0B2F';

function BoostUpRocketIcon({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 40 40" className={className} xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(6, 6)">
        {/* Flame / trailing pixels */}
        <rect x="-8" y="14" width="4" height="4" fill="#FBBF24" />
        <rect x="-13" y="10" width="3" height="3" fill="#F59E0B" />
        <rect x="-4" y="10" width="4" height="4" fill="#EF4444" />
        <rect x="-9" y="6" width="4" height="4" fill="#D11243" />
        <rect x="-5" y="5" width="3" height="3" fill="#F59E0B" />

        {/* Rocket Body tilted 45 deg */}
        <g transform="rotate(45, 12, 12)">
          {/* Fins */}
          <path d="M4,18 L0,22 L4,24 Z" fill={CRIMSON} />
          <path d="M18,4 L22,0 L24,4 Z" fill={CRIMSON} />
          <path d="M4,4 L1,10 L10,1 Z" fill={CRIMSON} />
          {/* Main body */}
          <path d="M6,6 L18,6 C22,6 24,8 24,12 L24,18 L6,18 Z" fill={CRIMSON} />
          {/* Nosecone */}
          <path d="M24,6 L32,12 L24,18 Z" fill={CRIMSON} />
          {/* Window */}
          <circle cx="16" cy="12" r="3.5" fill="white" />
        </g>
      </g>
    </svg>
  );
}

function SideNavItem({ icon: Icon, label, to }) {
  return (
    <NavLink
      to={to}
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

function NotificationsMenu({ isAdmin }) {
  return (
    <div className="absolute right-0 top-12 z-50 w-[min(320px,calc(100vw-24px))] rounded-xl bg-white border border-gray-100 shadow-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="text-sm font-bold text-gray-800">Notifications</div>
        <div className="text-[11px] text-gray-400">Latest activity and alerts</div>
      </div>
      <div className="p-2">
        <div className="px-3 py-2.5 rounded-lg hover:bg-brand-pink/20 transition-all">
          <div className="flex items-start gap-2">
            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-brand-crimson shrink-0" />
            <div className="min-w-0">
              <div className="text-[12px] font-bold text-gray-700">Latest signals are ready</div>
              <div className="text-[11px] text-gray-400 leading-snug">Open Intel Desk to review the newest ranked updates.</div>
            </div>
          </div>
        </div>
        {isAdmin && (
          <div className="px-3 py-2.5 rounded-lg hover:bg-brand-pink/20 transition-all">
            <div className="flex items-start gap-2">
              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <div className="min-w-0">
                <div className="text-[12px] font-bold text-gray-700">Admin actions available</div>
                <div className="text-[11px] text-gray-400 leading-snug">Approve pending users or run a fresh content fetch.</div>
              </div>
            </div>
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

export default function Layout({ children }) {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const avatarKey = `profile_avatar_${user?._id || 'default'}`;

  const [avatar, setAvatar] = useState(() => {
    try {
      return localStorage.getItem(avatarKey) || '';
    } catch {
      return '';
    }
  });
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', collapsed);
  }, [collapsed]);

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

  const getPageTitle = () => {
    const path = location.pathname;
    if (path.startsWith('/admin')) return 'Admin Panel';
    if (path.startsWith('/profile')) return 'Profile Settings';
    return 'Dashboard';
  };

  const initials = user?.name 
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) 
    : 'U';

  return (
    <div className="h-screen flex flex-col md:flex-row bg-gray-50 overflow-hidden" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <header className="md:hidden shrink-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <img src="/boostup_logo.png" className="h-7 object-contain shrink-0" alt="BoostUp Logo" />
          <span className="text-sm font-bold text-gray-800 truncate">{getPageTitle()}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
          <button
            onClick={() => {
              setShowNotifications((v) => !v);
              setShowProfileMenu(false);
            }}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-50"
          >
            <Bell size={15} />
          </button>
          {showNotifications && <NotificationsMenu isAdmin={isAdmin} />}
          </div>
          <button onClick={handleLogout} className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50">
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className="hidden md:flex h-full flex-col bg-white border-r border-gray-100 transition-all duration-300 shrink-0 shadow-sm"
        style={{ width: collapsed ? '56px' : '220px', minWidth: collapsed ? '56px' : '220px' }}
      >
        {/* Collapse toggle / logo */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 shrink-0">
          {!collapsed ? (
            <div className="flex-1 flex justify-start pl-2">
              <img 
                src="/boostup_logo.png" 
                className="h-8 cursor-pointer object-contain" 
                onClick={() => navigate('/dashboard')} 
                alt="BoostUp Logo" 
              />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-xl bg-brand-pink flex items-center justify-center cursor-pointer mx-auto transition-all duration-200 hover:bg-brand-crimson/5 border border-brand-crimson/10" onClick={() => navigate('/dashboard')}>
              <BoostUpRocketIcon className="w-5 h-5" />
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
              onClick={() => navigate('/profile')}
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
          {collapsed ? (
            <>
              <button onClick={() => navigate('/dashboard')} title="Dashboard"
                className={`w-10 h-10 flex justify-center items-center rounded-lg transition-all mx-auto ${location.pathname.startsWith('/dashboard') ? 'bg-brand-pink/30 text-brand-crimson font-bold' : 'text-gray-500 hover:bg-gray-100'}`}>
                <LayoutDashboard size={16} />
              </button>
              <button onClick={() => navigate('/profile')} title="Profile"
                className={`w-10 h-10 flex justify-center items-center rounded-lg transition-all mx-auto ${location.pathname.startsWith('/profile') ? 'bg-brand-pink/30 text-brand-crimson font-bold' : 'text-gray-500 hover:bg-gray-100'}`}>
                <UserIcon size={16} />
              </button>
              {isAdmin && (
                <button onClick={() => navigate('/admin')} title="Admin"
                  className={`w-10 h-10 flex justify-center items-center rounded-lg transition-all mx-auto ${location.pathname.startsWith('/admin') ? 'bg-brand-pink/30 text-brand-crimson font-bold' : 'text-gray-500 hover:bg-gray-100'}`}>
                  <Shield size={16} />
                </button>
              )}
            </>
          ) : (
            <>
              <SideNavItem icon={LayoutDashboard} label="Dashboard" to="/dashboard" />
              <SideNavItem icon={UserIcon} label="Profile" to="/profile" />
              {isAdmin && (
                <SideNavItem icon={Shield} label="Admin" to="/admin" />
              )}
            </>
          )}
        </nav>

        {/* Footer logout */}
        <div className="px-2 py-3 border-t border-gray-100 shrink-0">
          {collapsed ? (
            <button onClick={handleLogout} title="Sign out"
              className="w-10 h-10 flex justify-center items-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all mx-auto">
              <LogOut size={15} />
            </button>
          ) : (
            <button onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all font-medium">
              <LogOut size={15} />
              <span>Sign out</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Header */}
        <header className="hidden md:flex shrink-0 bg-white border-b border-gray-100 items-center justify-between px-8 py-4"
          style={{ boxShadow: '0 1px 0 rgba(209,18,67,0.06)' }}>
          <div className="flex items-center gap-3">
            <span className="text-base font-bold text-gray-800">{getPageTitle()}</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => {
                  setShowNotifications((v) => !v);
                  setShowProfileMenu(false);
                }}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all"
              >
                <Bell size={15} />
              </button>
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-brand-crimson animate-ping" />
              {showNotifications && <NotificationsMenu isAdmin={isAdmin} />}
            </div>

            <div className="relative">
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
              <ProfileMenu user={user} role={roleLabel(user?.role)} onProfile={openProfile} onLogout={handleLogout} />
            )}
            </div>
          </div>
        </header>

        {/* Content Body: added padding so it doesn't touch the screen edges */}
        <main className="flex-1 min-h-0 overflow-y-auto bg-canvas p-3 sm:p-5 lg:p-8 pb-20 md:pb-8 transition-all duration-300">
          <div className="max-w-[1400px] mx-auto w-full h-full">
            {children}
          </div>
        </main>
      </div>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-gray-100 px-2 py-2 grid grid-cols-3 gap-1">
        <button onClick={() => navigate('/dashboard')} className={`flex flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-bold ${location.pathname.startsWith('/dashboard') ? 'text-brand-crimson bg-brand-pink/30' : 'text-gray-500'}`}>
          <LayoutDashboard size={16} />
          Dashboard
        </button>
        <button onClick={() => navigate('/profile')} className={`flex flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-bold ${location.pathname.startsWith('/profile') ? 'text-brand-crimson bg-brand-pink/30' : 'text-gray-500'}`}>
          <UserIcon size={16} />
          Profile
        </button>
        {isAdmin ? (
          <button onClick={() => navigate('/admin')} className={`flex flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-bold ${location.pathname.startsWith('/admin') ? 'text-brand-crimson bg-brand-pink/30' : 'text-gray-500'}`}>
            <Shield size={16} />
            Admin
          </button>
        ) : (
          <button onClick={() => navigate('/dashboard')} className="flex flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-bold text-gray-400">
            <Menu size={16} />
            Menu
          </button>
        )}
      </nav>
    </div>
  );
}
