import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2, ArrowRight, Eye, EyeOff, UserPlus, KeyRound, ArrowLeft } from 'lucide-react';
import { isValidEmail, getEmailValidationError } from '../utils/emailValidator';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
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
    background: '#FAFAFA',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '12px 14px',
    fontSize: '14px',
    color: '#111',
    width: '100%',
    outline: 'none',
    transition: 'all 0.2s',
    boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
  };

  const handleFocus = (e) => {
    e.target.style.borderColor = '#D11243';
    e.target.style.boxShadow = '0 0 0 4px rgba(209,18,67,0.1)';
  };

  const handleBlur = (e) => {
    e.target.style.borderColor = '#e5e7eb';
    e.target.style.boxShadow = 'none';
  };

  return (
    <div className="min-h-screen flex overflow-x-hidden" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
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
          <img src="/logo-white.png" style={{ height: '52px', width: 'auto' }} alt="OpportunityOS AI Logo" />
        </div>

        <div className="relative z-10 flex-1 flex flex-col justify-start fade-in pt-40 xl:pt-44 ml-6 xl:ml-10" style={{ animationDelay: '0.1s' }}>
          <div
            className="inline-flex items-center gap-2 mb-8 w-fit px-3.5 py-1.5 rounded-full text-[12px] font-semibold"
            style={{ background: 'rgba(255,255,255,0.18)', color: 'white', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.25)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-300 inline-block" style={{ boxShadow: '0 0 4px #86efac' }} />
            Live Market Signal
          </div>

          <h1
            className="max-w-[800px] text-white font-black leading-[1.08] mb-8"
            style={{ fontSize: 'clamp(2.15rem, 3.55vw, 3.55rem)', fontFamily: '"DM Sans", system-ui, sans-serif' }}
          >
           The Market Intelligence<br />
            that Runs Your Content<br />
            Pipeline, On Autopilot.
          </h1>

          <div className="max-w-[720px] text-white/70 text-[11px] font-semibold uppercase tracking-[0.14em] leading-[1.9]">
            100+ TRUSTED SOURCES &nbsp;&middot;&nbsp; GOVERNMENT PORTALS &nbsp;&middot;&nbsp; INDUSTRY PUBLICATIONS &nbsp;&middot;&nbsp;  MARKET BRIEFINGS 
          </div>
        </div>

        <div className="absolute z-10 left-0 right-0 bottom-0 w-full overflow-hidden flex items-end justify-center pointer-events-none" style={{ animationDelay: '0.2s' }}>
          <img src="/skyline.png" className="w-full h-auto opacity-45 object-cover" style={{ minHeight: '126px', maxHeight: '150px' }} alt="Opportunity skyline" />
        </div>
      </div>

      <div className="flex-1 min-h-screen flex items-center justify-center px-4 py-24 sm:p-10 relative overflow-hidden" style={{ background: '#FAF0F2' }}>
        <div className="absolute top-6 left-4 sm:left-6 lg:hidden">
          <img src="/logo.png" style={{ height: '38px', width: 'auto' }} alt="OpportunityOS AI Logo" />
        </div>

        <div className="relative z-10 w-full max-w-md fade-in mt-12 lg:mt-0">
          <div
            className="bg-white rounded-2xl p-5 sm:p-8 lg:p-10"
            style={{
              boxShadow: '0 12px 40px rgba(209,18,67,0.08), 0 1px 3px rgba(0,0,0,0.04)',
              border: '1px solid rgba(209,18,67,0.05)'
            }}
          >
            {stage === 'select' ? (
              <>
                <h2 className="text-2xl font-black text-gray-900 mb-2 tracking-tight" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
                  Welcome to Ascentium
                </h2>
                <p className="text-gray-400 text-sm mb-6">Please choose how you would like to proceed:</p>

                <div className="space-y-4">
                  {/* Option 1: New User */}
                  <button
                    type="button"
                    onClick={() => setStage('form')}
                    className="w-full text-left p-5 rounded-2xl border border-gray-100 hover:border-[#D11243]/20 bg-gray-50/50 hover:bg-[#D11243]/5 transition-all duration-300 group flex items-start gap-4"
                    style={{ transition: 'all 0.25s ease' }}
                  >
                    <div className="p-3 rounded-xl bg-[#D11243]/10 text-[#D11243] group-hover:scale-105 transition-transform duration-200">
                      <UserPlus size={20} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-800 text-sm group-hover:text-[#D11243] transition-colors">I am a new user</h3>
                      <p className="text-xs text-gray-400 mt-1 leading-normal">Request a new admin dashboard account. Super admin approval is required before access is granted.</p>
                    </div>
                  </button>

                  {/* Option 2: Existing User */}
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="w-full text-left p-5 rounded-2xl border border-gray-100 hover:border-[#D11243]/20 bg-gray-50/50 hover:bg-[#D11243]/5 transition-all duration-300 group flex items-start gap-4"
                    style={{ transition: 'all 0.25s ease' }}
                  >
                    <div className="p-3 rounded-xl bg-[#D11243]/10 text-[#D11243] group-hover:scale-105 transition-transform duration-200">
                      <KeyRound size={20} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-800 text-sm group-hover:text-[#D11243] transition-colors">I already have an account</h3>
                      <p className="text-xs text-gray-400 mt-1 leading-normal">Sign in securely using your credentials and jump straight to the console.</p>
                    </div>
                  </button>
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setStage('select')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-[#D11243] transition-colors mb-4 group"
                >
                  <ArrowLeft size={13} className="group-hover:-translate-x-0.5 transition-transform duration-200" /> Back
                </button>

                <h2 className="text-2xl font-black text-gray-900 mb-1 tracking-tight">Request an account</h2>
                <p className="text-gray-400 text-sm mb-6">Your admin account will be reviewed by the super admin before dashboard access is enabled.</p>

                <form onSubmit={submit} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1 uppercase tracking-wider">Full Name</label>
                      <input required style={inputStyle} onFocus={handleFocus} onBlur={handleBlur} value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Full name" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1 uppercase tracking-wider">Email</label>
                      <input type="email" required style={inputStyle} onFocus={handleFocus} onBlur={handleBlur} value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="name@company.com" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1 uppercase tracking-wider">Company</label>
                      <input style={inputStyle} onFocus={handleFocus} onBlur={handleBlur} value={form.company} onChange={(e) => update('company', e.target.value)} placeholder="Company name" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1 uppercase tracking-wider">Designation</label>
                      <input style={inputStyle} onFocus={handleFocus} onBlur={handleBlur} value={form.designation} onChange={(e) => update('designation', e.target.value)} placeholder="Role or title" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1 uppercase tracking-wider">Password</label>
                    <div className="relative">
                      <input type={showPass ? 'text' : 'password'} required minLength={6} style={inputStyle} onFocus={handleFocus} onBlur={handleBlur} value={form.password} onChange={(e) => update('password', e.target.value)} placeholder="At least 6 characters" />
                      <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="text-xs rounded-lg px-3 py-2 font-medium" style={{ background: '#FFF0F3', color: '#D11243', border: '1px solid rgba(209,18,67,0.15)' }}>
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-lg text-white text-sm font-bold flex items-center justify-center gap-2 transition-all mt-2"
                    style={{ background: 'linear-gradient(90deg, #D11243, #a50d33)', boxShadow: '0 4px 14px rgba(209,18,67,0.35)' }}
                  >
                    {loading ? <Loader2 size={15} className="animate-spin" /> : <>Submit Request <ArrowRight size={14} /></>}
                  </button>
                </form>

                <p className="text-center text-xs text-gray-400 mt-5">
                  Already have an account?{' '}
                  <button type="button" onClick={() => navigate('/login')} className="font-bold hover:underline" style={{ color: '#D11243' }}>
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
