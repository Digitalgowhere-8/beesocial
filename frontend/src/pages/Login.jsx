import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2, ArrowRight, Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [remember, setRemember] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(state?.message || '');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate(state?.from?.pathname || '/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex overflow-x-hidden" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      {/* ─── LEFT PANEL: crimson gradient ─── */}
      <div
        className="hidden lg:flex lg:w-[55.5%] relative overflow-hidden flex-col justify-between px-12 pt-12 pb-0"
        style={{
          background: 'linear-gradient(135deg, #D11243 0%, #8F0B2F 100%)',
        }}
      >
        {/* Grid pattern overlay */}
        <div className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
            backgroundSize: '40px 40px'
          }}
        />
        {/* Noise overlay */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`
          }}
        />

        {/* Large circles decoration */}
        <div className="absolute -top-20 -right-20 w-96 h-96 rounded-full pointer-events-none"
          style={{ border: '1px solid rgba(255,255,255,0.08)' }}
        />

        {/* Logo top-left: White text on crimson background */}
        <div className="relative z-10 fade-in">
          <img 
            src="/login_logo.png" 
            style={{ filter: 'brightness(0) invert(1)', height: '52px', width: 'auto' }} 
            alt="Login Logo White" 
          />
        </div>

        {/* Main content — vertically centred */}
        <div className="relative z-10 flex-1 flex flex-col justify-center fade-in py-10" style={{ animationDelay: '0.1s' }}>
          {/* Pill badge */}
          <div className="inline-flex items-center gap-1.5 mb-6 w-fit">
            <div
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[12px] font-semibold"
              style={{ background: 'rgba(255,255,255,0.18)', color: 'white', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.25)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-300 inline-block" style={{ boxShadow: '0 0 4px #86efac' }} />
              Singapore Market · Daily Brief
            </div>
          </div>

          <h1 className="text-white font-black leading-[1.05] tracking-[-0.03em] mb-6"
            style={{ fontSize: 'clamp(1.75rem, 3vw, 2.75rem)', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
            Every Signal That<br />
            Moves Corporate<br />
            Services —<br />
            In One Place.
          </h1>

          <p className="text-white/75 text-[14px] leading-relaxed max-w-md mb-8">
            News, regulator updates, competitor moves, and evergreen guidance — automatically aggregated, deduplicated, and curated for Ascentium's service lines.
          </p>

          <div className="flex items-center gap-3 text-white/60 text-[11px] font-semibold uppercase tracking-[0.14em]">
            <span>ACRA · IRAS · MOM · MAS</span>
            <span className="w-px h-3 bg-white/30" />
            <span>BT · CNA · ST · ASEAN Briefing</span>
          </div>
        </div>

        {/* Skyline at bottom */}
        <div className="absolute z-10 left-0 right-0 bottom-0 w-full overflow-hidden flex items-end justify-center pointer-events-none" style={{ animationDelay: '0.2s' }}>
          <img 
            src="/skyline.png" 
            className="w-full h-auto opacity-45 object-cover" 
            style={{ minHeight: '126px', maxHeight: '150px' }}
            alt="Singapore Skyline" 
          />
        </div>
      </div>

      {/* ─── RIGHT PANEL: soft pink background with circles pattern ─── */}
      <div
        className="flex-1 min-h-screen flex items-center justify-center px-4 py-24 sm:p-10 relative overflow-hidden"
        style={{ 
          background: '#FAF0F2',
         
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'bottom -80px right -80px',
          backgroundSize: '360px auto'
        }}
      >
        {/* Mobile logo: Black text on white background */}
        <div className="absolute top-6 left-4 sm:left-6 lg:hidden">
          <img 
            src="/boostup_logo.png" 
            style={{ height: '46px', width: 'auto' }} 
            alt="BoostUp Logo" 
          />
        </div>

        {/* Login card */}
        <div className="relative z-10 w-full max-w-md fade-in" style={{ animationDelay: '0.05s' }}>
          <div
            className="bg-white rounded-2xl p-5 sm:p-8 lg:p-10"
            style={{ 
              boxShadow: '0 12px 40px rgba(209,18,67,0.08), 0 1px 3px rgba(0,0,0,0.04)',
              border: '1px solid rgba(209,18,67,0.05)'
            }}
          >
            <h2 className="text-2xl font-black text-gray-900 mb-1 tracking-tight"
              style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
              Welcome Back!
            </h2>
            <p className="text-gray-400 text-sm mb-6">Use your email and password to continue.</p>

            <form onSubmit={submit} className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">
                  E-mail
                </label>
                <input
                  type="email"
                  required
                  autoFocus
                  placeholder="Enter Your email"
                  className="w-full px-4 py-3 rounded-xl text-sm text-gray-800 border border-gray-200 placeholder:text-gray-300 outline-none transition-all duration-200 shadow-sm"
                  style={{ background: '#FAFAFA' }}
                  onFocus={e => {
                    e.target.style.borderColor = '#D11243';
                    e.target.style.boxShadow = '0 0 0 4px rgba(209,18,67,0.1)';
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = '#e5e7eb';
                    e.target.style.boxShadow = 'none';
                  }}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    placeholder="Enter Your Password"
                    className="w-full px-4 py-3 pr-10 rounded-xl text-sm text-gray-800 border border-gray-200 placeholder:text-gray-300 outline-none transition-all duration-200 shadow-sm"
                    style={{ background: '#FAFAFA' }}
                    onFocus={e => {
                      e.target.style.borderColor = '#D11243';
                      e.target.style.boxShadow = '0 0 0 4px rgba(209,18,67,0.1)';
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = '#e5e7eb';
                      e.target.style.boxShadow = 'none';
                    }}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Remember me + Forgot */}
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={e => setRemember(e.target.checked)}
                      className="sr-only"
                    />
                    <div
                      className="w-4 h-4 rounded border-2 flex items-center justify-center transition-all"
                      style={{
                        borderColor: remember ? '#D11243' : '#d1d5db',
                        background: remember ? '#D11243' : 'white'
                      }}
                    >
                      {remember && (
                        <svg viewBox="0 0 10 8" width="9" height="7">
                          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 font-medium">Remember me</span>
                </label>
                <Link to="/login" className="text-xs font-semibold hover:underline self-end sm:self-auto" style={{ color: '#D11243' }}>
                  Forgot Password?
                </Link>
              </div>

              {/* Error */}
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

              {/* Submit */}
              <button
                type="submit"
                id="login-submit-btn"
                disabled={loading}
                className="w-full py-3.5 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 transition-all duration-300 mt-4"
                style={{ 
                  background: loading ? '#e88' : 'linear-gradient(135deg, #D11243 0%, #8F0B2F 100%)', 
                  boxShadow: '0 4px 14px rgba(209,18,67,0.3)' 
                }}
                onMouseOver={e => { 
                  if (!loading) {
                    e.currentTarget.style.transform = 'translateY(-1.5px)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(209,18,67,0.4)';
                  }
                }}
                onMouseOut={e => { 
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = '0 4px 14px rgba(209,18,67,0.3)';
                }}
              >
                {loading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <>Sign In <ArrowRight size={14} /></>
                )}
              </button>
            </form>

            {/* New here */}
            <p className="text-center text-xs text-gray-400 mt-5">
              New here?{' '}
              <Link to="/register" className="font-bold hover:underline" style={{ color: '#D11243' }}>
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
