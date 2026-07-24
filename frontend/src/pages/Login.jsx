import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Loader2, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { isValidEmail, getEmailValidationError } from '../utils/emailValidator';

export default function Login() {
  const { login } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const { state } = useLocation();
  const robotoFont = '"Roboto", system-ui, sans-serif';
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(() => {
    try {
      const stored = sessionStorage.getItem('auth_redirect_notice');
      if (stored) {
        sessionStorage.removeItem('auth_redirect_notice');
        return stored;
      }
    } catch {
      // Ignore storage failures and fall back to route state.
    }
    return state?.message || '';
  });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    
    const emailError = getEmailValidationError(form.email);
    if (emailError) {
      setError(emailError);
      return;
    }
    
    setLoading(true);
    try {
      const auth = await login(form.email, form.password);
      const defaultPath = auth?.user?.role === 'super_admin' ? '/admin' : '/dashboard';
      navigate(defaultPath, { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const inputFocus = (e) => {
    e.target.style.borderColor = isDark ? '#D11243' : '#CBD5E1';
    e.target.style.boxShadow = isDark
      ? 'none'
      : '0 0 0 3px rgba(148,163,184,0.18)';
  };

  const inputBlur = (e) => {
    e.target.style.borderColor = isDark ? 'rgba(148,163,184,0.18)' : '#D8DED2';
    e.target.style.boxShadow = 'none';
  };

  const shellStyle = {
    fontFamily: robotoFont,
    background: isDark ? '#070d17' : '#FAFBF7',
    color: isDark ? '#f8fafc' : '#111827'
  };
  const formPanelStyle = {
    background: isDark
      ? '#070d17'
      : '#FAFBF7'
  };
  const cardStyle = {
    background: isDark ? 'rgba(12, 20, 33, 0.96)' : '#ffffff',
    boxShadow: isDark
      ? 'none'
      : '0 1px 2px rgba(15,23,42,0.04)',
    border: isDark ? '1px solid rgba(148,163,184,0.16)' : '1px solid #D8DED2'
  };
  const inputStyle = {
    background: isDark ? 'rgba(7,14,25,0.96)' : '#ffffff',
    color: isDark ? '#f8fafc' : '#1f2937',
    borderColor: isDark ? 'rgba(148,163,184,0.18)' : '#D8DED2',
    boxShadow: 'none',
    fontFamily: robotoFont
  };
  const logoSrc = isDark ? '/logo-white.png' : '/logo.png';

  return (
    <div className="min-h-screen lg:h-screen flex overflow-hidden" style={shellStyle}>
      <div
        className="hidden lg:flex lg:w-[55.5%] relative overflow-hidden flex-col justify-between px-12 pt-12 pb-0"
        style={{ background: isDark ? 'linear-gradient(135deg, #D11243 0%, #8F0B2F 100%)' : 'linear-gradient(135deg, #163A24 0%, #07180E 100%)' }}
      >
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
            backgroundSize: '40px 40px'
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`
          }}
        />
        <div className="absolute -top-20 -right-20 w-96 h-96 rounded-full pointer-events-none" style={{ border: '1px solid rgba(255,255,255,0.08)' }} />

        <div className="relative z-10 fade-in">
          <img src="/logo-white.png" style={{ height: '75px', width: 'auto' }} alt="Logo-white" />
        </div>

        <div className="relative z-10 flex-1 flex flex-col justify-center gap-4 fade-in max-w-[760px] pl-6 pr-8 xl:pl-10 xl:pr-10 pb-10 pt-0 -mt-14" style={{ animationDelay: '0.1s' }}>
            <h1
              className="max-w-[700px] text-white font-black leading-[1.08] mb-0"
              style={{ fontSize: 'clamp(2.15rem, 3.55vw, 3.55rem)', fontFamily: robotoFont }}
          >
            The smarter way to
            <br />
            track, rank, and create
            <br />
            around what matters
          </h1>

          <div className="max-w-[560px] text-white/75 text-[12px] font-semibold uppercase tracking-[0.14em] leading-[1.9]">
            An AI-powered system that runs your content pipeline on autopilot.
          </div>
        </div>

        <div className="absolute z-10 left-0 right-0 bottom-0 w-full overflow-hidden flex items-end justify-center pointer-events-none" style={{ animationDelay: '0.2s' }}>
          <img src="/skyline.png" className="w-full h-auto opacity-100 object-cover" style={{ minHeight: '126px', maxHeight: '150px' }} alt="BeeSocial skyline" />
        </div>
      </div>

      <div className="flex-1 min-h-screen lg:h-screen flex items-center justify-center px-4 py-6 sm:p-10 lg:px-10 xl:px-14 relative overflow-hidden transition-colors duration-300" style={formPanelStyle}>
        <div className="absolute left-4 top-6 sm:left-6 sm:top-8 lg:hidden">
          <img src={logoSrc} className="h-[75px] w-auto" alt="BeeSocial Logo" />
        </div>

        <div className="relative z-10 w-full max-w-[460px] fade-in pt-12 sm:pt-0 lg:-mt-4" style={{ animationDelay: '0.05s' }}>
          <div
            className="rounded-2xl p-4 transition-colors duration-300 sm:p-8 lg:p-9"
            style={cardStyle}
          >
            <h1 className={`mb-4 text-[1.22rem] font-black leading-[1.2] tracking-tight sm:mb-5 sm:text-[1.4rem] xl:text-[1.55rem] ${isDark ? 'text-white' : 'text-gray-900'}`} style={{ fontFamily: robotoFont }}>
              Secure sign-in to your
              <br />
              content intelligence dashboard.
            </h1>

            <form onSubmit={submit} className="space-y-3 sm:space-y-4">
              <div>
                <label className={`mb-2 block text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Email</label>
                <input
                  type="email"
                  required
                  autoFocus
                  placeholder="name@company.com"
                  className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-all duration-200 placeholder:text-gray-300 sm:py-3"
                  style={inputStyle}
                  onFocus={inputFocus}
                  onBlur={inputBlur}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className={`block text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Password</label>
                  <Link to="/forgot-password" className="text-[11px] font-bold uppercase tracking-wider hover:underline" style={{ color: isDark ? '#D11243' : '#163A24', fontFamily: robotoFont }}>
                    Forgot Password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    placeholder="Enter your password"
                    className="w-full rounded-xl border px-4 py-2.5 pr-10 text-sm outline-none transition-all duration-200 placeholder:text-gray-300 sm:py-3"
                    style={inputStyle}
                    onFocus={inputFocus}
                    onBlur={inputBlur}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                  <button type="button" onClick={() => setShowPass((v) => !v)} className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${isDark ? 'text-slate-400 hover:text-white' : 'text-gray-400 hover:text-gray-600'}`} style={{ fontFamily: robotoFont }}>
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {notice && (
                <div className="rounded-lg px-3 py-2 text-xs font-medium" style={{ background: isDark ? 'rgba(6,78,59,0.32)' : '#F0FDF4', color: isDark ? '#a7f3d0' : '#047857', border: isDark ? '1px solid rgba(16,185,129,0.24)' : '1px solid rgba(4,120,87,0.15)' }}>
                  {notice}
                </div>
              )}

              {error && (
                <div className="rounded-lg px-3 py-2 text-xs font-medium" style={{ background: isDark ? 'rgba(127,29,29,0.35)' : '#FFF0F3', color: isDark ? '#fecdd3' : '#b91c1c', border: isDark ? '1px solid rgba(244,63,94,0.28)' : '1px solid rgba(185,28,28,0.15)' }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                id="login-submit-btn"
                disabled={loading}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition-all duration-300 sm:mt-4 sm:py-3.5"
                style={{
                  background: loading ? (isDark ? '#e88' : '#CBD5C5') : (isDark ? 'linear-gradient(135deg, #D11243 0%, #8F0B2F 100%)' : '#163A24'),
                  color: '#ffffff',
                  boxShadow: 'none',
                  fontFamily: robotoFont
                }}
                onMouseOver={(e) => {
                  if (!loading) {
                    e.currentTarget.style.transform = 'translateY(-1.5px)';
                    e.currentTarget.style.boxShadow = 'none';
                  }
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <>Sign In <ArrowRight size={14} /></>}
              </button>
            </form>

            <p className={`mt-4 text-center text-xs sm:mt-5 ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>
              Need access?{' '}
              <Link to="/register" className="font-bold hover:underline" style={{ color: isDark ? '#D11243' : '#163A24', fontFamily: robotoFont }}>
                Request an account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
