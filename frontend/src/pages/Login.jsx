import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { isValidEmail, getEmailValidationError } from '../utils/emailValidator';

export default function Login() {
  const { login } = useAuth();
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
      navigate(auth?.isFirstLogin && auth?.user?.role !== 'super_admin' ? '/profile' : defaultPath, { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const inputFocus = (e) => {
    e.target.style.borderColor = '#D11243';
    e.target.style.boxShadow = '0 0 0 4px rgba(209,18,67,0.1)';
  };

  const inputBlur = (e) => {
    e.target.style.borderColor = '#e5e7eb';
    e.target.style.boxShadow = 'none';
  };

  return (
    <div className="min-h-screen lg:h-screen flex overflow-x-hidden" style={{ fontFamily: robotoFont }}>
      <div
        className="hidden lg:flex lg:w-[55.5%] relative overflow-hidden flex-col justify-between px-12 pt-12 pb-0"
        style={{ background: 'linear-gradient(135deg, #D11243 0%, #8F0B2F 100%)' }}
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
          <img src="/skyline.png" className="w-full h-auto opacity-100 object-cover" style={{ minHeight: '126px', maxHeight: '150px' }} alt="Opportunity skyline" />
        </div>
      </div>

      <div className="flex-1 min-h-screen lg:h-screen flex items-center justify-center px-4 py-14 sm:p-10 lg:px-10 xl:px-14 relative overflow-hidden" style={{ background: '#FAF0F2' }}>
        <div className="absolute top-6 left-4 sm:left-6 lg:hidden">
          <img src="/logo.png" style={{ height: '75px', width: 'auto' }} alt="OpportunityOS AI Logo" />
        </div>

        <div className="relative z-10 w-full max-w-[460px] fade-in lg:-mt-4" style={{ animationDelay: '0.05s' }}>
          <div
            className="bg-white rounded-2xl p-5 sm:p-8 lg:p-9"
            style={{
              boxShadow: '0 12px 40px rgba(209,18,67,0.08), 0 1px 3px rgba(0,0,0,0.04)',
              border: '1px solid rgba(209,18,67,0.05)'
            }}
          >
            <h1 className="text-[1.4rem] xl:text-[1.55rem] font-black text-gray-900 mb-5 tracking-tight leading-[1.2]" style={{ fontFamily: robotoFont }}>
              Secure sign-in to your
              <br />
              content intelligence dashboard.
            </h1>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Email</label>
                <input
                  type="email"
                  required
                  autoFocus
                  placeholder="name@company.com"
                  className="w-full px-4 py-3 rounded-xl text-sm text-gray-800 border border-gray-200 placeholder:text-gray-300 outline-none transition-all duration-200 shadow-sm"
                  style={{ background: '#FAFAFA', fontFamily: robotoFont }}
                  onFocus={inputFocus}
                  onBlur={inputBlur}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">Password</label>
                  <Link to="/forgot-password" className="text-[11px] font-bold uppercase tracking-wider hover:underline" style={{ color: '#D11243', fontFamily: robotoFont }}>
                    Forgot Password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    placeholder="Enter your password"
                    className="w-full px-4 py-3 pr-10 rounded-xl text-sm text-gray-800 border border-gray-200 placeholder:text-gray-300 outline-none transition-all duration-200 shadow-sm"
                    style={{ background: '#FAFAFA', fontFamily: robotoFont }}
                    onFocus={inputFocus}
                    onBlur={inputBlur}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                  <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" style={{ fontFamily: robotoFont }}>
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {notice && (
                <div className="text-xs rounded-lg px-3 py-2 font-medium" style={{ background: '#F0FDF4', color: '#047857', border: '1px solid rgba(4,120,87,0.15)' }}>
                  {notice}
                </div>
              )}

              {error && (
                <div className="text-xs rounded-lg px-3 py-2 font-medium" style={{ background: '#FFF0F3', color: '#D11243', border: '1px solid rgba(209,18,67,0.15)' }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                id="login-submit-btn"
                disabled={loading}
                className="w-full py-3.5 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 transition-all duration-300 mt-4"
                style={{
                  background: loading ? '#e88' : 'linear-gradient(135deg, #D11243 0%, #8F0B2F 100%)',
                  boxShadow: '0 4px 14px rgba(209,18,67,0.3)',
                  fontFamily: robotoFont
                }}
                onMouseOver={(e) => {
                  if (!loading) {
                    e.currentTarget.style.transform = 'translateY(-1.5px)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(209,18,67,0.4)';
                  }
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = '0 4px 14px rgba(209,18,67,0.3)';
                }}
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <>Sign In <ArrowRight size={14} /></>}
              </button>
            </form>

            <p className="text-center text-xs text-gray-400 mt-5">
              Need access?{' '}
              <Link to="/register" className="font-bold hover:underline" style={{ color: '#D11243', fontFamily: robotoFont }}>
                Request an account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
