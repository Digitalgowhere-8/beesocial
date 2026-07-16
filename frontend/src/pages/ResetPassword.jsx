import { useMemo, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { useTheme } from '../context/ThemeContext';

const robotoFont = '"Roboto", system-ui, sans-serif';

export default function ResetPassword() {
  const { isDark } = useTheme();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';
  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' });
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const hasToken = useMemo(() => token.trim().length > 0, [token]);

  const inputFocus = (e) => {
    e.target.style.borderColor = isDark ? '#D11243' : '#163A24';
    e.target.style.boxShadow = isDark
      ? 'none'
      : '0 0 0 4px rgba(22,58,36,0.1)';
  };

  const inputBlur = (e) => {
    e.target.style.borderColor = isDark ? 'rgba(148,163,184,0.18)' : '#e5e7eb';
    e.target.style.boxShadow = 'none';
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!hasToken) {
      setError('This reset link is missing a token. Please request a new password reset email.');
      return;
    }
    if (form.newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/auth/reset-password', {
        token,
        newPassword: form.newPassword
      });
      setNotice(data.message || 'Password reset successful.');
      window.setTimeout(() => {
        navigate('/login', {
          replace: true,
          state: { message: 'Password reset successful. Please sign in with your new password.' }
        });
      }, 1200);
    } catch (err) {
      setError(err.message || 'Could not reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-14 sm:p-10 transition-colors duration-300"
      style={{ background: isDark ? '#070d17' : '#FAF0F2', fontFamily: robotoFont }}
    >
      <div className="w-full max-w-[480px]">
        <div
          className="rounded-2xl p-5 transition-colors duration-300 sm:p-8 lg:p-9"
          style={{
            background: isDark ? '#111827' : '#ffffff',
            boxShadow: isDark ? 'none' : '0 12px 40px rgba(22,58,36,0.08), 0 1px 3px rgba(0,0,0,0.04)',
            border: isDark ? '1px solid rgba(148,163,184,0.16)' : '1px solid rgba(22,58,36,0.05)'
          }}
        >
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-white" style={{ background: isDark ? 'linear-gradient(135deg, #D11243 0%, #8F0B2F 100%)' : 'linear-gradient(135deg, #163A24 0%, #07180E 100%)' }}>
              <KeyRound size={18} />
            </span>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: isDark ? '#D11243' : '#163A24' }}>Security</div>
              <h1 className={`text-[1.45rem] font-black leading-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>Create New Password</h1>
            </div>
          </div>

          <p className={`mb-5 text-sm leading-6 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            {email ? `Resetting password for ${email}.` : 'Choose a new password for your account.'}
          </p>

          {!hasToken ? (
            <div className="rounded-lg px-3 py-3 text-sm font-medium" style={{ background: '#FFF0F3', color: '#163A24', border: '1px solid rgba(22,58,36,0.15)' }}>
              This reset link is incomplete or expired. Request a new one to continue.
            </div>
          ) : null}

          <form onSubmit={submit} className="mt-4 space-y-4">
            <PasswordField
              label="New Password"
              value={form.newPassword}
              visible={showNewPassword}
              onToggle={() => setShowNewPassword((value) => !value)}
              onChange={(e) => setForm((prev) => ({ ...prev, newPassword: e.target.value }))}
              onFocus={inputFocus}
              onBlur={inputBlur}
              isDark={isDark}
            />

            <PasswordField
              label="Confirm Password"
              value={form.confirmPassword}
              visible={showConfirmPassword}
              onToggle={() => setShowConfirmPassword((value) => !value)}
              onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              onFocus={inputFocus}
              onBlur={inputBlur}
              isDark={isDark}
            />

            {notice && (
              <div className="rounded-lg px-3 py-2 text-xs font-medium" style={{ background: '#F0FDF4', color: '#047857', border: '1px solid rgba(4,120,87,0.15)' }}>
                {notice}
              </div>
            )}

            {error && (
              <div className="rounded-lg px-3 py-2 text-xs font-medium" style={{ background: '#FFF0F3', color: '#163A24', border: '1px solid rgba(22,58,36,0.15)' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !hasToken}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white transition-all duration-300"
              style={{
                background: loading || !hasToken ? '#e88' : (isDark ? 'linear-gradient(135deg, #D11243 0%, #8F0B2F 100%)' : 'linear-gradient(135deg, #163A24 0%, #07180E 100%)'),
                boxShadow: isDark ? 'none' : '0 4px 14px rgba(22,58,36,0.3)',
                fontFamily: robotoFont
              }}
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : 'Update Password'}
            </button>
          </form>

          <div className="mt-5 text-center">
            <Link to="/login" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider hover:underline" style={{ color: isDark ? '#D11243' : '#163A24', fontFamily: robotoFont }}>
              <ArrowLeft size={14} />
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function PasswordField({ label, value, visible, onToggle, onChange, onFocus, onBlur, isDark }) {
  return (
    <div>
      <label className={`mb-2 block text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{label}</label>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          required
          minLength={6}
          placeholder="Enter your new password"
          className="w-full rounded-xl border px-4 py-3 pr-10 text-sm shadow-sm outline-none transition-all duration-200 placeholder:text-gray-400"
          style={{
            background: isDark ? '#0b1220' : '#FAFAFA',
            borderColor: isDark ? 'rgba(148,163,184,0.18)' : '#e5e7eb',
            color: isDark ? '#f8fafc' : '#1f2937',
            fontFamily: robotoFont
          }}
          value={value}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <button type="button" onClick={onToggle} className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-400 hover:text-white' : 'text-gray-400 hover:text-gray-600'}`}>
          {visible ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );
}
