import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { FetchTab as ProfileFetchTab } from './AdminPanel';
import Layout from '../components/Layout';
import {
  Building2,
  Camera,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  MoreHorizontal,
  RefreshCw,
  Save,
  Trash2,
  User,
  X
} from 'lucide-react';

const roleLabel = (role) => {
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'admin') return 'Admin';
  return 'Member';
};

const planLabel = (plan) => {
  const value = String(plan || '').trim();
  if (!value) return 'Not assigned';
  if (value === 'free') return 'Free';
  if (value === 'premium') return 'Premium';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const initialFormFromUser = (user) => ({
  name: user?.name || '',
  company: user?.company || '',
  designation: user?.designation || ''
});

const canAccessFetchControls = (user) => {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  if (user.role === 'admin') {
    return user?.access?.canFetch !== false || user?.access?.canUseScheduler !== false;
  }
  return user?.access?.canFetch === true || user?.access?.canUseScheduler === true;
};

const PROFILE_TABS = [
  { key: 'profile', label: 'My Hive Profile' },
  { key: 'fetch', label: 'My Personalisation' }
];

export default function Profile() {
  const { user, updateProfile, setAuthState } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const canManageIntelligence = user?.role === 'admin' || user?.role === 'super_admin';
  const canSeeFetchSection = canAccessFetchControls(user);
  const [activeTab, setActiveTab] = useState(() => (
    location.state?.tab === 'fetch' ? 'fetch' : 'profile'
  ));
  const [form, setForm] = useState(() => initialFormFromUser(user));
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwdVisibility, setPwdVisibility] = useState({
    currentPassword: false,
    newPassword: false,
    confirm: false
  });
  const [savedProfile, setSavedProfile] = useState(false);
  const [savedPwd, setSavedPwd] = useState(false);
  const [err, setErr] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingPwd, setLoadingPwd] = useState(false);
  const [mobileProfileMenuOpen, setMobileProfileMenuOpen] = useState(false);

  const [avatar, setAvatar] = useState(user?.avatar || '');

  const initials = useMemo(() => {
    const name = user?.name || form.name || 'User';
    return name.split(' ').map((part) => part[0]).join('').toUpperCase().slice(0, 2);
  }, [form.name, user?.name]);

  useEffect(() => {
    if (user) setForm(initialFormFromUser(user));
  }, [user]);

  useEffect(() => {
    setAvatar(user?.avatar || '');
  }, [user?.avatar]);

  useEffect(() => {
    if (!canSeeFetchSection && activeTab === 'fetch') {
      setActiveTab('profile');
    }
  }, [activeTab, canSeeFetchSection]);

  useEffect(() => {
    if (location.state?.tab === 'fetch' && canSeeFetchSection) {
      setActiveTab('fetch');
      navigate(location.pathname, { replace: true, state: {} });
      return;
    }
    if (location.state?.tab === 'profile') {
      setActiveTab('profile');
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [canSeeFetchSection, location.pathname, location.state, navigate]);

  useEffect(() => {
    setMobileProfileMenuOpen(false);
  }, [activeTab, canSeeFetchSection, canManageIntelligence]);

  const update = (key, value) => setForm((prev) => ({
    ...prev,
    [key]: value
  }));

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result;
      setAvatar(base64);
      try {
        await updateProfile({ avatar: base64 });
        window.dispatchEvent(new CustomEvent('profile_avatar_updated', { detail: { avatar: base64, userId: user?._id } }));
      } catch (error) {
        setAvatar(user?.avatar || '');
        setErr(error.message || 'Avatar upload failed');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = async () => {
    setErr('');
    setAvatar('');
    try {
      await updateProfile({ avatar: '' });
      window.dispatchEvent(new CustomEvent('profile_avatar_updated', { detail: { avatar: '', userId: user?._id } }));
    } catch (error) {
      setAvatar(user?.avatar || '');
      setErr(error.message || 'Avatar remove failed');
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setErr('');
    setLoadingProfile(true);
    try {
      const payload = {
        name: form.name,
        company: form.company,
        designation: form.designation,
        avatar
      };

      await updateProfile(payload);
      setSavedProfile(true);
      window.setTimeout(() => setSavedProfile(false), 2200);
    } catch (error) {
      setErr(error.message || 'Save failed');
    } finally {
      setLoadingProfile(false);
    }
  };

  const changePwd = async (event) => {
    event.preventDefault();
    setErr('');
    if (pwd.newPassword !== pwd.confirm) {
      setErr('Passwords do not match');
      return;
    }

    setLoadingPwd(true);
    try {
      const { data } = await api.post('/auth/change-password', {
        currentPassword: pwd.currentPassword,
        newPassword: pwd.newPassword
      });
      setAuthState(data);
      setPwd({ currentPassword: '', newPassword: '', confirm: '' });
      setPwdVisibility({ currentPassword: false, newPassword: false, confirm: false });
      setSavedPwd(true);
      window.setTimeout(() => setSavedPwd(false), 2200);
    } catch (error) {
      setErr(error.message || 'Password change failed');
    } finally {
      setLoadingPwd(false);
    }
  };

  const headerActions = (
    <>
      <div className="flex min-w-0 items-center justify-between gap-3 sm:flex-row sm:items-center">
        <div data-tour="profile-tabs" className="flex items-center gap-2 sm:hidden">
          <div className="inline-flex min-h-[42px] items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-[13px] font-black text-gray-900 shadow-sm">
            {activeTab === 'profile' ? 'My Hive Profile' : 'My Personalisation'}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 sm:hidden">
          <button
            type="button"
            onClick={() => setMobileProfileMenuOpen((value) => !value)}
            className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-600 shadow-sm transition-all hover:border-brand-crimson/20 hover:text-brand-crimson"
            aria-label="Open profile menu"
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
        <div className="hidden min-w-0 flex-1 gap-2 sm:flex sm:flex-row sm:items-center">
          <div data-tour="profile-tabs" className={`grid min-w-0 flex-1 gap-2 rounded-2xl border border-gray-200 bg-white p-1 shadow-sm ${canSeeFetchSection ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {PROFILE_TABS.filter((tab) => tab.key !== 'fetch' || canSeeFetchSection).map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex min-h-[40px] min-w-0 items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-black transition-all sm:px-5 ${
                    active ? 'bg-brand-crimson text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
          {canManageIntelligence ? (
            <button
              type="button"
              onClick={() => navigate('/admin')}
              data-tour="profile-admin-controls"
              className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white px-5 text-[13px] font-black text-gray-900 shadow-sm transition-all hover:border-brand-crimson/20 hover:bg-gray-50"
            >
              Admin Controls
            </button>
          ) : null}
        </div>
      </div>
      {mobileProfileMenuOpen ? (
        <>
          <button
            type="button"
            aria-label="Close profile menu"
            onClick={() => setMobileProfileMenuOpen(false)}
            className="fixed inset-0 z-40 bg-gray-950/20 backdrop-blur-[1px] sm:hidden"
          />
          <div className="fixed right-3 top-[76px] z-50 w-[min(290px,calc(100vw-24px))] overflow-hidden rounded-[24px] border border-gray-200 bg-white shadow-[0_24px_48px_rgba(15,23,42,0.18)] sm:hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Profile</div>
                <div className="mt-1 text-sm font-black text-gray-900">Quick Actions</div>
              </div>
              <button
                type="button"
                onClick={() => setMobileProfileMenuOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500"
                aria-label="Close profile menu"
              >
                <X size={15} />
              </button>
            </div>
            <div className="space-y-2 p-3">
              {PROFILE_TABS.filter((tab) => tab.key !== 'fetch' || canSeeFetchSection).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.key);
                    setMobileProfileMenuOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition-all ${activeTab === tab.key ? 'border border-brand-crimson/15 bg-brand-pink/20 text-brand-crimson' : 'border border-gray-200 bg-gray-50 text-gray-700'}`}
                >
                  <span className="text-sm font-black">{tab.label}</span>
                  {activeTab === tab.key ? <Check size={15} /> : null}
                </button>
              ))}
              {canManageIntelligence ? (
                <button
                  type="button"
                  onClick={() => {
                    navigate('/admin');
                    setMobileProfileMenuOpen(false);
                  }}
                  data-tour="profile-admin-controls"
                  className="flex w-full items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm font-black text-gray-700 transition-all hover:border-brand-crimson/20 hover:text-brand-crimson"
                >
                  <span>Admin Controls</span>
                </button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </>
  );

  return (
    <Layout headerActions={headerActions}>
      <div className="-m-3 min-h-[calc(100vh-64px)] p-3 mesh-bg sm:-m-5 sm:p-5 lg:-m-6 lg:p-6">
        <div className="w-full">
          {err && (
            <div className="mb-6 rounded-xl bg-red-50/80 backdrop-blur-md px-5 py-4 text-sm font-semibold text-red-700 border border-red-200/50 shadow-sm animate-fade-in-up stagger-2">
              {err}
            </div>
          )}

          {activeTab === 'profile' ? (
          <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-[320px_minmax(0,1fr)_340px] 2xl:items-stretch">
          <aside className="animate-fade-in-up stagger-2 md:order-1 2xl:order-none">
            <section className="flex h-full min-h-0 flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-sm 2xl:min-h-[420px]">
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <div className="relative mb-4 h-24 w-24 shrink-0">
                  {avatar ? (
                    <img src={avatar} className="h-24 w-24 rounded-3xl object-cover shadow-sm ring-4 ring-gray-50" alt="Profile" />
                  ) : (
                    <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-crimson to-brand-hoverred text-3xl font-black text-white shadow-sm ring-4 ring-gray-50">
                      {initials}
                    </div>
                  )}
                  <label htmlFor="avatar-file" className="absolute -bottom-2 -right-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white text-brand-crimson shadow-md ring-1 ring-gray-100 transition hover:bg-brand-pink">
                    <Camera size={15} />
                  </label>
                  <input type="file" id="avatar-file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xl font-black text-gray-900">{user?.name || 'User'}</div>
                  <div className="mt-1 truncate text-sm font-semibold text-gray-500">{user?.email}</div>
                  <div className="mt-3 inline-flex rounded-full bg-gray-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-gray-500">{roleLabel(user?.role)}</div>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <InfoTile icon={Building2} label="Organization" value={form.company || 'Not set'} />
                <InfoTile icon={RefreshCw} label="Subscription Plan" value={planLabel(user?.subscriptionPlan)} />
              </div>

              {avatar ? (
                <button type="button" onClick={handleRemoveImage} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-black text-red-600 transition hover:bg-red-100">
                  <Trash2 size={14} />
                  Remove avatar
                </button>
              ) : null}
            </section>
          </aside>

          <form onSubmit={saveProfile} data-tour="profile-account" className="animate-fade-in-up stagger-2 md:order-3 md:col-span-2 2xl:order-none 2xl:col-span-1">
            <Section icon={User} eyebrow="Identity" title="Account Details" className="flex h-full min-h-0 flex-col 2xl:min-h-[420px]" bodyClassName="flex flex-1 flex-col justify-between">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-1">
                <Field label="Full name">
                  <input className="input min-h-[44px] rounded-xl transition-colors hover:border-gray-300 focus:border-brand-crimson" value={form.name} onChange={(e) => update('name', e.target.value)} required />
                </Field>
                <Field label="Email address">
                  <ReadOnly icon={Mail} value={user?.email || ''} />
                </Field>
                <Field label="Company">
                  <input className="input min-h-[44px] rounded-xl transition-colors hover:border-gray-300 focus:border-brand-crimson" value={form.company} onChange={(e) => update('company', e.target.value)} placeholder="Company or organization" />
                </Field>
                <Field label="Designation">
                  <input className="input min-h-[44px] rounded-xl transition-colors hover:border-gray-300 focus:border-brand-crimson" value={form.designation} onChange={(e) => update('designation', e.target.value)} placeholder="Founder, student, consultant..." />
                </Field>
              </div>

              <div className="mt-6 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-bold text-gray-600">
                  {savedProfile ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-emerald-600"><Check size={16} /> Profile saved</span>
                  ) : (
                    'Save your latest profile details.'
                  )}
                </div>
                <button className="btn-primary rounded-xl px-6 py-2.5 text-base" disabled={loadingProfile}>
                  {loadingProfile ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  Save Changes
                </button>
              </div>
            </Section>
          </form>

          <form onSubmit={changePwd} className="animate-fade-in-up stagger-2 md:order-2 2xl:order-none">
            <Section icon={Lock} eyebrow="Security" title="Password" compact className="flex h-full min-h-0 flex-col 2xl:min-h-[420px]" bodyClassName="flex flex-1 flex-col justify-between">
              <div className="space-y-4">
                <Field label="Current password">
                  <PasswordInput
                    value={pwd.currentPassword}
                    visible={pwdVisibility.currentPassword}
                    onToggle={() => setPwdVisibility((prev) => ({ ...prev, currentPassword: !prev.currentPassword }))}
                    onChange={(e) => setPwd({ ...pwd, currentPassword: e.target.value })}
                  />
                </Field>
                <Field label="New password">
                  <PasswordInput
                    value={pwd.newPassword}
                    visible={pwdVisibility.newPassword}
                    minLength={6}
                    onToggle={() => setPwdVisibility((prev) => ({ ...prev, newPassword: !prev.newPassword }))}
                    onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })}
                  />
                </Field>
                <Field label="Confirm password">
                  <PasswordInput
                    value={pwd.confirm}
                    visible={pwdVisibility.confirm}
                    minLength={6}
                    onToggle={() => setPwdVisibility((prev) => ({ ...prev, confirm: !prev.confirm }))}
                    onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })}
                  />
                </Field>
              </div>
              <div className="mt-6">
                <button className="btn-secondary mt-2 w-full rounded-xl bg-white py-2.5" disabled={loadingPwd}>
                  {loadingPwd ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                  Update Password
                </button>
                {savedPwd && <div className="mt-3 rounded-lg bg-emerald-50 py-2 text-center text-sm font-bold text-emerald-600">Password updated</div>}
              </div>
            </Section>
          </form>
          </div>
          </div>
          ) : null}

        {activeTab === 'fetch' && canSeeFetchSection ? (
          <section data-tour="profile-personalization" className="mt-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm animate-fade-in-up stagger-3">
            <div className="mb-5 flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="mb-1 inline-flex items-center gap-2 rounded-full bg-brand-pink/30 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-brand-crimson">
                  <RefreshCw size={12} />
                  Fetch controls
                </div>
                <h2 className="text-xl font-black tracking-tight text-gray-900">My Personalisation</h2>
                <p className="mt-1 text-sm font-medium text-gray-500">
                  Manage your fetch settings, scheduling, and latest run status from your profile.
                </p>
              </div>
            </div>
            <ProfileFetchTab embedded />
          </section>
        ) : null}
        </div>
      </div>
    </Layout>
  );
}

function Section({ icon: Icon, eyebrow, title, children, compact = false, className = '', bodyClassName = '' }) {
  return (
    <section className={`rounded-2xl border border-gray-100 bg-white shadow-sm ${compact ? 'p-4' : 'p-5'} ${className}`}>
      <div className="mb-4 flex items-center gap-3 border-b border-gray-200/50 pb-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-crimson text-white shadow-sm">
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <div className="eyebrow mb-0.5 text-brand-crimson/80">{eyebrow}</div>
          <h2 className="truncate text-xl font-black tracking-tight text-gray-900">{title}</h2>
        </div>
      </div>
      <div className={`space-y-4 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

function Field({ label, children, tight = false }) {
  return (
    <div className={tight ? '' : 'min-w-0'}>
      <label className="label text-gray-500 font-bold tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function PasswordInput({ value, onChange, visible, onToggle, minLength }) {
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        minLength={minLength}
        className="input min-h-[44px] rounded-xl pr-11"
        value={value}
        onChange={onChange}
        required
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-brand-crimson"
        aria-label={visible ? 'Hide password' : 'Show password'}
        title={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function ReadOnly({ icon: Icon, value }) {
  return (
    <div className="flex min-h-[44px] items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/70 px-4 text-sm font-semibold text-gray-600">
      <Icon size={16} className="shrink-0 text-gray-400" />
      <span className="truncate">{value}</span>
    </div>
  );
}

function InfoTile({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 transition-colors hover:bg-white">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-gray-500 shadow-sm">
        <Icon size={14} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-0.5">{label}</div>
        <div className="truncate text-sm font-bold text-gray-800">{value}</div>
      </div>
    </div>
  );
}
