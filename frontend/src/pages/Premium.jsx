import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Crown, Gauge, Loader2, Mail, Sparkles } from 'lucide-react';
import api from '../api/axios';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';

const PLAN_ORDER = ['free', 'growth', 'scale', 'premium', 'enterprise'];

const LIMIT_LABELS = {
  fetchesPerMonth: 'Monthly fetch runs',
  storageItems: 'Stored signals',
  tokenBudgetMonthly: 'AI token budget',
  blogGenerationsMonthly: 'Blog generations',
  socialPostsMonthly: 'Post generations',
  memberSeats: 'Member seats',
  usage: 'Usage'
};

const FEATURE_LABELS = {
  canFetch: 'Intelligence fetches',
  canCreateMembers: 'Team members',
  canUseBlogStudio: 'Blog and post studio',
  canUseSavedSearches: 'Saved searches',
  canUseScheduler: 'Scheduled fetches'
};

function fmt(value) {
  const number = Number(value || 0);
  if (number >= 10000000) return `${Math.round(number / 1000000)}M+`;
  if (number >= 1000000) return `${(number / 1000000).toFixed(1)}M`;
  return number.toLocaleString();
}

export default function Premium() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [plans, setPlans] = useState([]);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('limit_reached_notice');
      if (raw) setNotice(JSON.parse(raw));
    } catch {
      setNotice(null);
    }
  }, [location.search]);

  useEffect(() => {
    let mounted = true;
    api.get('/auth/plans')
      .then(({ data }) => {
        if (mounted) setPlans(data.items || []);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const sortedPlans = useMemo(() => {
    const byId = new Map(plans.map((plan) => [plan.planId, plan]));
    return PLAN_ORDER.map((id) => byId.get(id)).filter(Boolean);
  }, [plans]);

  const limitType = notice?.limitType || new URLSearchParams(location.search).get('limit') || 'usage';
  const currentPlan = String(user?.subscriptionPlan || 'free');

  return (
    <Layout>
      <div className="-m-3 min-h-[calc(100vh-64px)] p-3 mesh-bg sm:-m-5 sm:p-5 lg:-m-6 lg:p-6">
        <div className="mx-auto max-w-7xl space-y-5">
          <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="grid grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="p-6 sm:p-8">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand-pink/50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-brand-crimson">
                  <Crown size={13} />
                  Premium required
                </div>
                <h1 className="text-3xl font-black tracking-tight text-gray-900">Upgrade to keep working without limits</h1>
                <p className="mt-3 max-w-3xl text-sm font-medium leading-relaxed text-gray-500">
                  Your plan is controlled by the super admin plan builder. When limits are changed there, the same limits appear here and apply to fetches, stored signals, blogs, posts, tokens, and team seats.
                </p>
                {notice ? (
                  <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">
                    {notice.message || `${LIMIT_LABELS[limitType] || 'Usage'} limit reached.`}
                  </div>
                ) : null}
              </div>
              <div className="border-t border-gray-100 bg-gray-50/70 p-6 lg:border-l lg:border-t-0">
                <div className="rounded-2xl bg-white p-5 ring-1 ring-gray-100">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-crimson text-white">
                      <Gauge size={18} />
                    </span>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">Limit hit</div>
                      <div className="text-base font-black text-gray-900">{LIMIT_LABELS[limitType] || LIMIT_LABELS.usage}</div>
                    </div>
                  </div>
                  <button type="button" onClick={() => navigate(-1)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-black text-gray-600 transition hover:border-brand-crimson/30 hover:text-brand-crimson">
                    <ArrowLeft size={16} />
                    Go back
                  </button>
                </div>
              </div>
            </div>
          </section>

          {loading ? (
            <div className="flex min-h-[260px] items-center justify-center rounded-2xl bg-white shadow-sm">
              <Loader2 className="animate-spin text-brand-crimson" size={24} />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              {sortedPlans.map((plan) => {
                const active = plan.planId === currentPlan;
                const highlighted = plan.planId !== 'free' && !active;
                return (
                  <section key={plan.planId} className={`flex flex-col rounded-2xl border bg-white p-5 shadow-sm ${highlighted ? 'border-brand-crimson/20 ring-1 ring-brand-crimson/10' : 'border-gray-100'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">{active ? 'Current plan' : 'Available plan'}</div>
                        <h2 className="mt-1 text-xl font-black text-gray-900">{plan.label || plan.planId}</h2>
                      </div>
                      {active ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700">Active</span> : null}
                    </div>
                    <div className="mt-4 flex items-end gap-2">
                      <span className="text-3xl font-black text-gray-900">{plan.price || '-'}</span>
                      <span className="pb-1 text-xs font-bold text-gray-400">{plan.priceNote || ''}</span>
                    </div>
                    <div className="mt-5 space-y-2">
                      <LimitLine label="Fetches" value={fmt(plan.limits?.fetchesPerMonth)} />
                      <LimitLine label="Storage" value={fmt(plan.limits?.storageItems)} />
                      <LimitLine label="Blogs" value={fmt(plan.limits?.blogGenerationsMonthly)} />
                      <LimitLine label="Posts" value={fmt(plan.limits?.socialPostsMonthly)} />
                      <LimitLine label="Tokens" value={fmt(plan.limits?.tokenBudgetMonthly)} />
                    </div>
                    <div className="mt-5 space-y-2 border-t border-gray-100 pt-4">
                      {Object.entries(FEATURE_LABELS).map(([key, label]) => (
                        <div key={key} className="flex items-center gap-2 text-xs font-bold text-gray-600">
                          <Check size={14} className={plan.access?.[key] ? 'text-emerald-600' : 'text-gray-300'} />
                          {label}
                        </div>
                      ))}
                    </div>
                    <a href={`mailto:${user?.email || ''}?subject=Plan upgrade request`} className={`mt-5 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black ${active ? 'border border-gray-200 bg-white text-gray-500' : 'bg-brand-crimson text-white hover:bg-brand-hoverred'}`}>
                      {active ? <Sparkles size={16} /> : <Mail size={16} />}
                      {active ? 'Current plan' : 'Request upgrade'}
                    </a>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function LimitLine({ label, value }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
      <span className="text-xs font-bold text-gray-500">{label}</span>
      <span className="text-xs font-black text-gray-900">{value}</span>
    </div>
  );
}
