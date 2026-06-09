import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2, ArrowRight, Eye, EyeOff } from 'lucide-react';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', company: '', designation: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form);
      navigate('/login', {
        replace: true,
        state: { message: 'Registration submitted. Please wait for admin approval before signing in.' }
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
    boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
  };

  const handleFocus = e => {
    e.target.style.borderColor = '#D11243';
    e.target.style.boxShadow = '0 0 0 4px rgba(209,18,67,0.1)';
  };
  const handleBlur = e => {
    e.target.style.borderColor = '#e5e7eb';
    e.target.style.boxShadow = 'none';
  };

  return (
    <div className="min-h-screen flex overflow-x-hidden" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      {/* LEFT PANEL */}
      <div
        className="hidden lg:flex lg:w-[45%] relative overflow-hidden flex-col justify-between p-12"
        style={{ background: 'linear-gradient(135deg, #D11243 0%, #8F0B2F 100%)' }}
      >
        <div className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
            backgroundSize: '40px 40px'
          }}
        />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full pointer-events-none"
          style={{ border: '1px solid rgba(255,255,255,0.08)' }} />

        {/* Logo top-left: White text on crimson background */}
        <div className="relative z-10 fade-in">
          <img 
            src="/login_logo.png" 
            style={{ filter: 'brightness(0) invert(1)', height: '42px', width: 'auto' }} 
            alt="Login Logo White" 
          />
        </div>

        <div className="relative z-10 flex-1 flex flex-col justify-center fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="inline-flex items-center gap-2 mb-6 w-fit px-3 py-1.5 rounded-full text-[11px] font-semibold"
            style={{ background: 'rgba(255,255,255,0.18)', color: 'white', border: '1px solid rgba(255,255,255,0.25)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-300 inline-block" style={{ boxShadow: '0 0 4px #86efac' }} />
            Join the Desk
          </div>

          <h1 className="text-white font-black leading-[1.05] tracking-[-0.03em] mb-6"
            style={{ fontSize: 'clamp(1.8rem, 3vw, 2.6rem)', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
            One subscription.<br />
            <span className="italic opacity-90">Nine</span> service lines.<br />
            Every update.
          </h1>

          <p className="text-white/75 text-sm leading-relaxed mb-8">
            Filter by Corporate, Tax, HR, Fund, Fiduciary, Risk, Cross-Border, Private Client, or Advisory — receive curated intelligence the moment it lands.
          </p>

          <div className="text-white/60 text-[11px] font-semibold uppercase tracking-[0.14em]">
            38 sub-categories · 8 competitors · 5 regulators
          </div>
        </div>

        {/* Skyline at bottom */}
        <div className="relative z-10 mt-auto w-full overflow-hidden flex items-end justify-center" style={{ animationDelay: '0.2s' }}>
          <img 
            src="/skyline.png" 
            className="w-full h-auto opacity-55 object-contain" 
            style={{ maxHeight: '110px' }}
            alt="Singapore Skyline" 
          />
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div 
        className="flex-1 min-h-screen flex items-center justify-center px-4 py-24 sm:p-10 relative overflow-hidden" 
        style={{ 
          background: '#FAF0F2',
          backgroundImage: 'url("/media__1780983329574.png")',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'bottom -80px right -80px',
          backgroundSize: '360px auto'
        }}
      >
        {/* Mobile Logo: Black text on white background */}
        <div className="absolute top-6 left-4 sm:left-6 lg:hidden">
          <img 
            src="/login_logo.png" 
            style={{ height: '38px', width: 'auto' }} 
            alt="Login Logo" 
          />
        </div>

        <div className="relative z-10 w-full max-w-md fade-in mt-12 lg:mt-0">
          <div className="bg-white rounded-2xl p-5 sm:p-8 lg:p-10"
            style={{ 
              boxShadow: '0 12px 40px rgba(209,18,67,0.08), 0 1px 3px rgba(0,0,0,0.04)',
              border: '1px solid rgba(209,18,67,0.05)'
            }}>
            <h2 className="text-2xl font-black text-gray-900 mb-1 tracking-tight">Create Account</h2>
            <p className="text-gray-400 text-sm mb-6">Takes 30 seconds. No credit card required.</p>

            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1 uppercase tracking-wider">Full Name</label>
                  <input required style={inputStyle} onFocus={handleFocus} onBlur={handleBlur}
                    value={form.name} onChange={e => update('name', e.target.value)} placeholder="Jane Doe" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1 uppercase tracking-wider">Email</label>
                  <input type="email" required style={inputStyle} onFocus={handleFocus} onBlur={handleBlur}
                    value={form.email} onChange={e => update('email', e.target.value)} placeholder="jane@company.com" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1 uppercase tracking-wider">Company</label>
                  <input style={inputStyle} onFocus={handleFocus} onBlur={handleBlur}
                    value={form.company} onChange={e => update('company', e.target.value)} placeholder="Acme Corp" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1 uppercase tracking-wider">Designation</label>
                  <input style={inputStyle} onFocus={handleFocus} onBlur={handleBlur}
                    value={form.designation} onChange={e => update('designation', e.target.value)} placeholder="Director" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1 uppercase tracking-wider">Password</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} required minLength={6} style={inputStyle} onFocus={handleFocus} onBlur={handleBlur}
                    value={form.password} onChange={e => update('password', e.target.value)} placeholder="At least 6 characters" />
                  <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="text-xs rounded-lg px-3 py-2 font-medium" style={{ background: '#FFF0F3', color: '#D11243', border: '1px solid rgba(209,18,67,0.15)' }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full py-3 rounded-lg text-white text-sm font-bold flex items-center justify-center gap-2 transition-all mt-2"
                style={{ background: 'linear-gradient(90deg, #D11243, #a50d33)', boxShadow: '0 4px 14px rgba(209,18,67,0.35)' }}>
                {loading ? <Loader2 size={15} className="animate-spin" /> : <>Sign Up <ArrowRight size={14} /></>}
              </button>
            </form>

            <p className="text-center text-xs text-gray-400 mt-5">
              Already have an account?{' '}
              <Link to="/login" className="font-bold hover:underline" style={{ color: '#D11243' }}>
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
