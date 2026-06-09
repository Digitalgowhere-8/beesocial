import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import Layout from '../components/Layout';
import { Save, Lock, Check, Loader2, Camera } from 'lucide-react';

const roleLabel = (role) => {
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'admin') return 'Admin';
  return 'Member';
};

export default function Profile() {
  const { user, updateProfile } = useAuth();
  const [form, setForm] = useState({
    name: user?.name || '',
    company: user?.company || '',
    designation: user?.designation || '',
    interests: user?.interests || []
  });
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [savedProfile, setSavedProfile] = useState(false);
  const [savedPwd, setSavedPwd] = useState(false);
  const [err, setErr] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingPwd, setLoadingPwd] = useState(false);

  const avatarKey = `profile_avatar_${user?._id || 'default'}`;

  const [avatar, setAvatar] = useState(() => {
    try {
      return localStorage.getItem(avatarKey) || '';
    } catch {
      return '';
    }
  });

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result;
      setAvatar(base64);
      localStorage.setItem(avatarKey, base64);
      window.dispatchEvent(new CustomEvent('profile_avatar_updated', { detail: { avatar: base64, userId: user?._id } }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setAvatar('');
    localStorage.removeItem(avatarKey);
    window.dispatchEvent(new CustomEvent('profile_avatar_updated', { detail: { avatar: '', userId: user?._id } }));
  };

  const update = (k, v) => setForm({ ...form, [k]: v });

  const saveProfile = async (e) => {
    e.preventDefault();
    setErr('');
    setLoadingProfile(true);
    try {
      await updateProfile(form);
      setSavedProfile(true);
      setTimeout(() => setSavedProfile(false), 2000);
    } catch (e) {
      setErr(e.message || 'Save failed');
    } finally {
      setLoadingProfile(false);
    }
  };

  const changePwd = async (e) => {
    e.preventDefault();
    setErr('');
    if (pwd.newPassword !== pwd.confirm) {
      setErr('Passwords do not match');
      return;
    }
    setLoadingPwd(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: pwd.currentPassword,
        newPassword: pwd.newPassword
      });
      setPwd({ currentPassword: '', newPassword: '', confirm: '' });
      setSavedPwd(true);
      setTimeout(() => setSavedPwd(false), 2000);
    } catch (e) {
      setErr(e.message || 'Password change failed');
    } finally {
      setLoadingPwd(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-3xl space-y-6 pb-10">
        <div>
          <div className="eyebrow mb-2">Account Settings</div>
          <h1 className="section-title mb-1 text-2xl sm:text-3xl font-bold">Profile Settings</h1>
          <p className="text-ink-400 text-sm">Update your personal information and security credentials.</p>
        </div>

        {err && (
          <div className="mb-6 text-[13px] text-red-700 bg-red-50 ring-1 ring-red-200 rounded-md px-3 py-2 animate-pulse">
            {err}
          </div>
        )}

        {/* Profile form */}
        <form onSubmit={saveProfile} className="card p-4 sm:p-6 border border-gray-100 hover:border-brand-crimson/20 transition-all">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-6 pb-6 border-b border-gray-100/50">
            <div className="flex items-center gap-4 min-w-0">
              <div className="relative group">
                {avatar ? (
                  <img src={avatar} className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md" alt="Profile" />
                ) : (
                  <div className="w-16 h-16 rounded-full text-white font-display text-2xl font-black flex items-center justify-center shadow-sm"
                    style={{ background: 'linear-gradient(135deg, #D11243, #8F0B2F)' }}>
                    {(user?.name || 'U')[0].toUpperCase()}
                  </div>
                )}
                <label htmlFor="avatar-file" className="absolute inset-0 bg-black/50 rounded-full flex flex-col items-center justify-center text-[10px] text-white opacity-0 group-hover:opacity-100 cursor-pointer transition-all font-semibold">
                  <Camera size={16} className="mb-0.5" />
                  Change
                </label>
                <input type="file" id="avatar-file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-gray-800 text-base truncate">{user?.name || 'User'}</div>
                <div className="text-sm text-gray-400 truncate">{user?.email}</div>
                <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-brand-crimson mt-0.5">
                  {roleLabel(user?.role)}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="avatar-file" className="btn-secondary text-xs px-3 py-2 cursor-pointer font-semibold shadow-sm">
                Upload Photo
              </label>
              {avatar && (
                <button type="button" onClick={handleRemoveImage} className="btn-danger text-xs px-3 py-2 font-semibold">
                  Remove
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Full name</label>
              <input className="input focus:ring-brand-crimson/30" value={form.name} onChange={(e) => update('name', e.target.value)} required />
            </div>
            <div>
              <label className="label">Company</label>
              <input className="input focus:ring-brand-crimson/30" value={form.company} onChange={(e) => update('company', e.target.value)} />
            </div>
            <div>
              <label className="label">Designation</label>
              <input className="input focus:ring-brand-crimson/30" value={form.designation} onChange={(e) => update('designation', e.target.value)} />
            </div>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3">
            <button className="btn-primary px-5" style={{ background: 'linear-gradient(90deg, #D11243, #8F0B2F)' }} disabled={loadingProfile}>
              {loadingProfile ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Save profile
            </button>
            {savedProfile && (
              <span className="text-emerald-600 text-sm flex items-center gap-1 font-bold animate-bounce">
                <Check size={14} /> Saved
              </span>
            )}
          </div>
        </form>

        {/* Password form */}
        <form onSubmit={changePwd} className="card p-4 sm:p-6 border border-gray-100 hover:border-brand-crimson/20 transition-all">
          <div className="flex items-center gap-2 mb-6">
            <Lock size={16} className="text-brand-crimson" />
            <h3 className="font-display text-xl text-ink-800 font-bold">Security</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Current password</label>
              <input type="password" className="input focus:ring-brand-crimson/30" value={pwd.currentPassword} onChange={(e) => setPwd({ ...pwd, currentPassword: e.target.value })} required />
            </div>
            <div>
              <label className="label">New password</label>
              <input type="password" minLength={6} className="input focus:ring-brand-crimson/30" value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} required />
            </div>
            <div>
              <label className="label">Confirm password</label>
              <input type="password" minLength={6} className="input focus:ring-brand-crimson/30" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} required />
            </div>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3">
            <button className="btn-primary px-5" style={{ background: 'linear-gradient(90deg, #D11243, #8F0B2F)' }} disabled={loadingPwd}>
              {loadingPwd ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
              Update password
            </button>
            {savedPwd && (
              <span className="text-emerald-600 text-sm flex items-center gap-1 font-bold animate-bounce">
                <Check size={14} /> Updated
              </span>
            )}
          </div>
        </form>
      </div>
    </Layout>
  );
}
