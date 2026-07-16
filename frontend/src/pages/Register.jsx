import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Loader2, ArrowRight, Eye, EyeOff, UserPlus, KeyRound, ArrowLeft } from 'lucide-react';
import { isValidEmail, getEmailValidationError } from '../utils/emailValidator';

export default function Register() {
  const { register } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const robotoFont = '"Roboto", system-ui, sans-serif';
  const [stage, setStage] = useState('select'); // 'select' or 'form'
  const [form, setForm] = useState({ name: '', email: '', password: '', company: '', designation: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    const emailError = getEmailValidationError(form.email);
    if (emailError) {
      setError(emailError);
      setLoading(false);
      return;
    }
    
    try {
      await register(form);
      navigate('/login', {
        replace: true,
        state: { message: 'Registration submitted. Please wait for super admin approval before signing in as an admin.' }
      });
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const update = (k, v) => setForm({ ...form, [k]: v });

  const inputStyle = {
    background: isDark ? 'rgba(7,14,25,0.96)' : '#FAFAFA',
    border: isDark ? '1px solid rgba(148,163,184,0.18)' : '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '12px 14px',
    fontSize: '14px',
    color: isDark ? '#f8fafc' : '#111',
    width: '100%',
    outline: 'none',
    transition: 'all 0.2s',
    boxShadow: isDark ? 'none' : '0 1px 2px rgba(0,0,0,0.02)',
    fontFamily: robotoFont
  };

  const handleFocus = (e) => {
    e.target.style.borderColor = isDark ? '#D11243' : '#163A24';
    e.target.style.boxShadow = isDark
      ? 'none'
      : '0 0 0 4px rgba(22,58,36,0.1)';
  };

  const handleBlur = (e) => {
    e.target.style.borderColor = isDark ? 'rgba(148,163,184,0.18)' : '#e5e7eb';
    e.target.style.boxShadow = 'none';
  };

  const shellStyle = {
    fontFamily: robotoFont,
    background: isDark ? '#070d17' : '#F3FFE5',
    color: isDark ? '#f8fafc' : '#111827'
  };
  const formPanelStyle = {
    background: isDark
      ? '#070d17'
      : '#F3FFE5'
  };
  const cardStyle = {
    background: isDark ? 'rgba(12, 20, 33, 0.96)' : '#ffffff',
    boxShadow: isDark
      ? 'none'
      : '0 12px 40px rgba(22,58,36,0.10), 0 1px 3px rgba(0,0,0,0.04)',
    border: isDark ? '1px solid rgba(148,163,184,0.16)' : '1px solid rgba(22,58,36,0.08)'
  };
  const optionButtonClass = [
    'group flex w-full items-start gap-4 rounded-2xl border p-5 text-left transition-all duration-300',
    isDark
      ? 'border-slate-700/40 bg-slate-950/45 hover:border-[#D11243] hover:bg-[#D11243]/10'
      : 'border-gray-100 bg-gray-50/50 hover:border-[#163A24]/45 hover:bg-[#F3FFE5]'
  ].join(' ');
  const titleColor = isDark ? 'text-white' : 'text-gray-900';
  const bodyTextColor = isDark ? 'text-slate-400' : 'text-gray-400';
  const labelColor = isDark ? 'text-slate-400' : 'text-gray-500';
  const logoSrc = isDark ? '/logo-white.png' : '/logo.png';

  return (
    <div className="min-h-screen lg:h-screen flex overflow-x-hidden" style={shellStyle}>
      <div
        className="hidden lg:flex lg:w-[55.5%] relative overflow-hidden flex-col justify-between px-10 xl:px-12 pt-10 xl:pt-12 pb-0"
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
          <img src="/logo-white.png" style={{ height: '68px', width: 'auto' }} alt=" Logo- White" />
        </div>

        <div className="relative z-10 flex-1 flex flex-col justify-center gap-3 xl:gap-4 fade-in max-w-[720px] pl-4 pr-6 xl:pl-8 xl:pr-8 pb-8 pt-0 -mt-8" style={{ animationDelay: '0.1s' }}>
            <h1
            className="max-w-[640px] text-white font-black leading-[1.06] mb-0"
            style={{ fontSize: 'clamp(1.95rem, 3vw, 3.2rem)', fontFamily: robotoFont }}
          >
            The smarter way to
            <br />
            track, rank, and create <br />
            around what matters
          </h1>

          <div className="max-w-[520px] text-white/75 text-[12px] xl:text-[13px] font-semibold uppercase tracking-[0.14em] leading-[1.8]">
            An AI-powered system that runs your content pipeline on autopilot.
          </div>
        </div>

        <div className="absolute z-10 left-0 right-0 bottom-0 w-full overflow-hidden flex items-end justify-center pointer-events-none" style={{ animationDelay: '0.2s' }}>
          <img src="/skyline.png" className="w-full h-auto opacity-100 object-cover" style={{ minHeight: '92px', maxHeight: '122px' }} alt="BeeSocial skyline" />
        </div>
      </div>

      <div className="flex-1 min-h-screen lg:h-screen flex items-center justify-center px-4 py-12 sm:p-10 lg:px-8 xl:px-12 relative overflow-hidden transition-colors duration-300" style={formPanelStyle}>
        <div className="absolute top-6 left-4 sm:left-6 lg:hidden">
          <img src={logoSrc} style={{ height: '75px', width: 'auto' }} alt=" Logo" />
        </div>

        <div className="relative z-10 w-full max-w-[430px] xl:max-w-md fade-in mt-12 lg:-mt-4">
          <div
            className="rounded-2xl p-5 transition-colors duration-300 sm:p-8 lg:p-7 xl:p-9"
            style={cardStyle}
          >
            {stage === 'select' ? (
              <>
                <h2 className={`mb-2 text-3xl font-black tracking-tight ${titleColor}`} style={{ fontFamily: robotoFont }}>
                  Welcome to BeeSocial
                </h2>
                <p className={`${bodyTextColor} mb-6 text-sm`}>Select your access pathway to the BeeSocial console. 
                </p>

                <div className="space-y-4">
                  {/* Option 1: New User */}
                  <button
                    type="button"
                    onClick={() => setStage('form')}
                    className={optionButtonClass}
                    style={{ transition: 'all 0.25s ease', fontFamily: robotoFont }}
                  >
                    <div className="auth-choice-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white transition-colors duration-200" style={{ background: isDark ? '#D11243' : '#163A24' }}>
                      <UserPlus size={20} />
                    </div>
                    <div className="flex-1">
                      <h3 className={`text-sm font-bold transition-colors ${isDark ? 'text-slate-100 group-hover:text-[#D11243]' : 'text-gray-800 group-hover:text-[#163A24]'}`}>I am a new user</h3>
                      <p className={`${bodyTextColor} mt-1 text-xs leading-normal`}>Request a new admin dashboard account. Super admin approval is required before access is granted.</p>
                    </div>
                  </button>

                  {/* Option 2: Existing User */}
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className={optionButtonClass}
                    style={{ transition: 'all 0.25s ease', fontFamily: robotoFont }}
                  >
                    <div className="auth-choice-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white transition-colors duration-200" style={{ background: isDark ? '#D11243' : '#163A24' }}>
                      <KeyRound size={20} />
                    </div>
                    <div className="flex-1">
                      <h3 className={`text-sm font-bold transition-colors ${isDark ? 'text-slate-100 group-hover:text-[#D11243]' : 'text-gray-800 group-hover:text-[#163A24]'}`}>I already have an account</h3>
                      <p className={`${bodyTextColor} mt-1 text-xs leading-normal`}>Sign in securely using your credentials and jump straight to the console.</p>
                    </div>
                  </button>
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setStage('select')}
                  className={`group mb-4 inline-flex items-center gap-1.5 text-xs font-semibold transition-colors ${isDark ? 'hover:text-[#D11243]' : 'hover:text-[#163A24]'} ${bodyTextColor}`}
                  style={{ fontFamily: robotoFont }}
                >
                  <ArrowLeft size={13} className="group-hover:-translate-x-0.5 transition-transform duration-200" /> Back
                </button>

                <h2 className={`mb-1 text-2xl font-black tracking-tight ${titleColor}`}>Request an account</h2>
                <p className={`${bodyTextColor} mb-6 text-sm`}>Your admin account will be reviewed by the super admin before dashboard access is enabled.</p>

                <form onSubmit={submit} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={`mb-1 block text-[11px] font-semibold uppercase tracking-wider ${labelColor}`}>Full Name</label>
                      <input required style={inputStyle} onFocus={handleFocus} onBlur={handleBlur} value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Full name" />
                    </div>
                    <div>
                      <label className={`mb-1 block text-[11px] font-semibold uppercase tracking-wider ${labelColor}`}>Email</label>
                      <input type="email" required style={inputStyle} onFocus={handleFocus} onBlur={handleBlur} value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="name@company.com" />
                    </div>
                    <div>
                      <label className={`mb-1 block text-[11px] font-semibold uppercase tracking-wider ${labelColor}`}>Company</label>
                      <input style={inputStyle} onFocus={handleFocus} onBlur={handleBlur} value={form.company} onChange={(e) => update('company', e.target.value)} placeholder="Company name" />
                    </div>
                    <div>
                      <label className={`mb-1 block text-[11px] font-semibold uppercase tracking-wider ${labelColor}`}>Designation</label>
                      <input style={inputStyle} onFocus={handleFocus} onBlur={handleBlur} value={form.designation} onChange={(e) => update('designation', e.target.value)} placeholder="Role or title" />
                    </div>
                  </div>

                  <div>
                    <label className={`mb-1 block text-[11px] font-semibold uppercase tracking-wider ${labelColor}`}>Password</label>
                    <div className="relative">
                      <input type={showPass ? 'text' : 'password'} required minLength={6} style={inputStyle} onFocus={handleFocus} onBlur={handleBlur} value={form.password} onChange={(e) => update('password', e.target.value)} placeholder="At least 6 characters" />
                      <button type="button" onClick={() => setShowPass((v) => !v)} className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${isDark ? 'text-slate-400 hover:text-white' : 'text-gray-400 hover:text-gray-600'}`} style={{ fontFamily: robotoFont }}>
                        {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="rounded-lg px-3 py-2 text-xs font-medium" style={{ background: isDark ? 'rgba(127,29,29,0.35)' : '#FFF0F3', color: isDark ? '#fecdd3' : '#b91c1c', border: isDark ? '1px solid rgba(244,63,94,0.28)' : '1px solid rgba(185,28,28,0.15)' }}>
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="auth-primary-button mt-2 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-70"
                    style={{ fontFamily: robotoFont }}
                  >
                    {loading ? <Loader2 size={15} className="animate-spin" /> : <>Submit Request <ArrowRight size={14} /></>}
                  </button>
                </form>

                <p className={`mt-5 text-center text-xs ${bodyTextColor}`}>
                  Already have an account?{' '}
                  <button type="button" onClick={() => navigate('/login')} className="font-bold hover:underline" style={{ color: isDark ? '#D11243' : '#163A24', fontFamily: robotoFont }}>
                    Sign in
                  </button>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
