import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, LayoutDashboard, Shield, User as UserIcon, Menu, X, BookOpenText, Newspaper } from 'lucide-react';

function Logo() {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-navy-900 flex items-center justify-center shadow-lift">
        <span className="font-display text-brass-400 text-lg sm:text-xl font-semibold leading-none">O</span>
      </div>
      <div>
        <div className="font-display text-[16px] sm:text-[18px] leading-none text-ink-800 tracking-tightest">OpportunityOS AI</div>
        <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.18em] text-brass-600 mt-0.5">Opportunity Radar</div>
      </div>
    </div>
  );
}

function NavItem({ to, children, icon: Icon, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        [
          'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-all',
          isActive
            ? 'bg-navy-900 text-canvas shadow-card'
            : 'text-ink-500 hover:text-ink-800 hover:bg-ink-50'
        ].join(' ')
      }
    >
      {Icon && <Icon size={15} />}
      {children}
    </NavLink>
  );
}

const roleLabel = (role) => {
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'admin') return 'Admin';
  return 'Member';
};

export default function Navbar() {
  const { user, isAdmin, isSuperAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const canUseBlogStudio = isSuperAdmin || user?.access?.canUseBlogStudio === true || (isAdmin && user?.access?.canUseBlogStudio !== false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-30 bg-canvas/90 backdrop-blur-md border-b border-ink-100">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <Logo />

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {isSuperAdmin ? (
            <NavItem to="/admin" icon={Shield}>Owner Console</NavItem>
          ) : (
            <>
              <NavItem to="/dashboard" icon={LayoutDashboard}>Dashboard</NavItem>
              <NavItem to="/intel-desk" icon={Newspaper}>Intel Desk</NavItem>
              <NavItem to="/blogs" icon={BookOpenText}>Blog</NavItem>
              {canUseBlogStudio && <NavItem to="/social-media-studio" icon={BookOpenText}>Social Media Studio</NavItem>}
              <NavItem to="/profile" icon={UserIcon}>Profile</NavItem>
            </>
          )}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:block text-right">
            <div className="text-[13px] font-medium text-ink-700 leading-tight">{user?.name}</div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-ink-400">
              {roleLabel(user?.role)}
            </div>
          </div>
          <button onClick={handleLogout} className="btn-ghost hidden md:flex" title="Sign out">
            <LogOut size={15} />
          </button>
          {/* Mobile hamburger */}
          <button
            className="btn-ghost md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-ink-100 bg-canvas px-4 pb-4 pt-2 space-y-1 shadow-lg">
          {/* User info */}
          <div className="px-3 py-2 mb-2 border-b border-ink-100">
            <div className="text-[13px] font-medium text-ink-800">{user?.name}</div>
            <div className="text-[10px] uppercase tracking-wider text-ink-400">
              {roleLabel(user?.role)}
            </div>
          </div>
          {isSuperAdmin ? (
            <NavItem to="/admin" icon={Shield} onClick={() => setMobileOpen(false)}>Owner Console</NavItem>
          ) : (
            <>
              <NavItem to="/dashboard" icon={LayoutDashboard} onClick={() => setMobileOpen(false)}>Dashboard</NavItem>
              <NavItem to="/intel-desk" icon={Newspaper} onClick={() => setMobileOpen(false)}>Intel Desk</NavItem>
              <NavItem to="/blogs" icon={BookOpenText} onClick={() => setMobileOpen(false)}>Blog</NavItem>
              {canUseBlogStudio && <NavItem to="/social-media-studio" icon={BookOpenText} onClick={() => setMobileOpen(false)}>Social Media Studio</NavItem>}
              <NavItem to="/profile" icon={UserIcon} onClick={() => setMobileOpen(false)}>Profile</NavItem>
            </>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm text-red-600 hover:bg-red-50 transition-all"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      )}
    </header>
  );
}
