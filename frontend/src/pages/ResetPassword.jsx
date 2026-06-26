import { useMemo, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/axios';

const robotoFont = '"Roboto", system-ui, sans-serif';

export default function ResetPassword() {
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
    e.target.style.borderColor = '#D11243';
    e.target.style.boxShadow = '0 0 0 4px rgba(209,18,67,0.1)';
  };

  const inputBlur = (e) => {
    e.target.style.borderColor = '#e5e7eb';
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
    <div className="min-h-screen flex items-center justify-center px-4 py-14 sm:p-10" style={{ background: '#FAF0F2', fontFamily: robotoFont }}>
      <div className="w-full max-w-[480px]">
        <div
          className="rounded-2xl bg-white p-5 sm:p-8 lg:p-9"
          style={{
            boxShadow: '0 12px 40px rgba(209,18,67,0.08), 0 1px 3px rgba(0,0,0,0.04)',
            border: '1px solid rgba(209,18,67,0.05)'
          }}
        >
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-white" style={{ background: 'linear-gradient(135deg, #D11243 0%, #8F0B2F 100%)' }}>
              <KeyRound size={18} />
            </span>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#D11243' }}>Security</div>
              <h1 className="text-[1.45rem] font-black leading-tight text-gray-900">Create New Password</h1>
            </div>
          </div>

          <p className="mb-5 text-sm leading-6 text-gray-500">
            {email ? `Resetting password for ${email}.` : 'Choose a new password for your account.'}
          </p>

          {!hasToken ? (
            <div className="rounded-lg px-3 py-3 text-sm font-medium" style={{ background: '#FFF0F3', color: '#D11243', border: '1px solid rgba(209,18,67,0.15)' }}>
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
            />

            <PasswordField
              label="Confirm Password"
              value={form.confirmPassword}
              visible={showConfirmPassword}
              onToggle={() => setShowConfirmPassword((value) => !value)}
              onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              onFocus={inputFocus}
              onBlur={inputBlur}
            />

            {notice && (
              <div className="rounded-lg px-3 py-2 text-xs font-medium" style={{ background: '#F0FDF4', color: '#047857', border: '1px solid rgba(4,120,87,0.15)' }}>
                {notice}
              </div>
            )}

            {error && (
              <div className="rounded-lg px-3 py-2 text-xs font-medium" style={{ background: '#FFF0F3', color: '#D11243', border: '1px solid rgba(209,18,67,0.15)' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !hasToken}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white transition-all duration-300"
              style={{
                background: loading || !hasToken ? '#e88' : 'linear-gradient(135deg, #D11243 0%, #8F0B2F 100%)',
                boxShadow: '0 4px 14px rgba(209,18,67,0.3)',
                fontFamily: robotoFont
              }}
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : 'Update Password'}
            </button>
          </form>

          <div className="mt-5 text-center">
            <Link to="/login" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider hover:underline" style={{ color: '#D11243', fontFamily: robotoFont }}>
              <ArrowLeft size={14} />
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function PasswordField({ label, value, visible, onToggle, onChange, onFocus, onBlur }) {
  return (
    <div>
      <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</label>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          required
          minLength={6}
          placeholder="Enter your new password"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-10 text-sm text-gray-800 shadow-sm outline-none transition-all duration-200 placeholder:text-gray-300"
          style={{ background: '#FAFAFA', fontFamily: robotoFont }}
          value={value}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          {visible ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );
}
