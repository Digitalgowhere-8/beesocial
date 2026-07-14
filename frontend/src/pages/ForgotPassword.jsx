import { useState } from 'react';
import { ArrowLeft, Loader2, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { useTheme } from '../context/ThemeContext';
import { getEmailValidationError } from '../utils/emailValidator';

const robotoFont = '"Roboto", system-ui, sans-serif';

export default function ForgotPassword() {
  const { isDark } = useTheme();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const inputFocus = (e) => {
    e.target.style.borderColor = '#D11243';
    e.target.style.boxShadow = isDark
      ? '0 0 0 4px rgba(209,18,67,0.18)'
      : '0 0 0 4px rgba(209,18,67,0.1)';
  };

  const inputBlur = (e) => {
    e.target.style.borderColor = isDark ? 'rgba(148,163,184,0.18)' : '#e5e7eb';
    e.target.style.boxShadow = 'none';
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');

    const emailError = getEmailValidationError(email);
    if (emailError) {
      setError(emailError);
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setNotice(data.message || 'If this email exists in our system, we have sent a password reset link.');
    } catch (err) {
      setError(err.message || 'Could not start password reset.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-14 sm:p-10 transition-colors duration-300"
      style={{ background: isDark ? '#070d17' : '#FAF0F2', fontFamily: robotoFont }}
    >
      <div className="w-full max-w-[460px]">
        <div
          className="rounded-2xl p-5 transition-colors duration-300 sm:p-8 lg:p-9"
          style={{
            background: isDark ? '#111827' : '#ffffff',
            boxShadow: isDark ? '0 24px 54px rgba(2,6,23,0.44)' : '0 12px 40px rgba(209,18,67,0.08), 0 1px 3px rgba(0,0,0,0.04)',
            border: isDark ? '1px solid rgba(148,163,184,0.16)' : '1px solid rgba(209,18,67,0.05)'
          }}
        >
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-white" style={{ background: 'linear-gradient(135deg, #D11243 0%, #8F0B2F 100%)' }}>
              <Mail size={18} />
            </span>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#D11243' }}>Security</div>
              <h1 className={`text-[1.45rem] font-black leading-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>Forgot Password</h1>
            </div>
          </div>

          <p className={`mb-5 text-sm leading-6 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            Enter your account email and we will send you a secure reset link.
          </p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className={`mb-2 block text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Email</label>
              <input
                type="email"
                required
                autoFocus
                placeholder="name@company.com"
                className="w-full rounded-xl border px-4 py-3 text-sm shadow-sm outline-none transition-all duration-200 placeholder:text-gray-400"
                style={{
                  background: isDark ? '#0b1220' : '#FAFAFA',
                  borderColor: isDark ? 'rgba(148,163,184,0.18)' : '#e5e7eb',
                  color: isDark ? '#f8fafc' : '#1f2937',
                  fontFamily: robotoFont
                }}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={inputFocus}
                onBlur={inputBlur}
              />
            </div>

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
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white transition-all duration-300"
              style={{
                background: loading ? '#e88' : 'linear-gradient(135deg, #D11243 0%, #8F0B2F 100%)',
                boxShadow: '0 4px 14px rgba(209,18,67,0.3)',
                fontFamily: robotoFont
              }}
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : 'Send Reset Link'}
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
