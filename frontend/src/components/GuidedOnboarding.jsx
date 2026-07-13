import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, ChevronLeft, Sparkles, X } from 'lucide-react';

const SPOTLIGHT_PADDING = 10;
const SELECTOR_RETRY_LIMIT = 80;
const SELECTOR_RETRY_DELAY = 120;

function getVisibleElement(selector) {
  if (!selector || typeof document === 'undefined') return null;
  const nodes = [...document.querySelectorAll(selector)];
  return nodes.find((node) => {
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }) || null;
}

function stepListForUser(user) {
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const profileNavSelector = user?.role === 'super_admin' ? '[data-tour="header-profile-menu"]' : '[data-tour="nav-profile"]';
  const canUseFetch = user?.role === 'super_admin'
    || user?.access?.canFetch === true
    || (user?.role === 'admin' && user?.access?.canFetch !== false)
    || user?.access?.canUseScheduler === true;
  const canUseContentRepository = user?.role === 'super_admin' || user?.access?.canUseContentRepository !== false;
  const canUseBlogStudio = user?.role === 'super_admin'
    || user?.access?.canUseBlogStudio === true
    || (user?.role === 'admin' && user?.access?.canUseBlogStudio !== false);

  const steps = [
    {
      id: 'welcome',
      title: 'Welcome to your workspace',
      description: 'This quick tour explains what each area does, where to click first, and how a new user can move through the platform with confidence.',
      cta: 'Start tour'
    },
    {
      id: 'nav-dashboard',
      route: '/dashboard',
      selector: '[data-tour="nav-dashboard"]',
      title: 'The Hive',
      description: 'Start here for the high-level view. This area gives you a fast picture of signal activity, trends, and overall intelligence movement.'
    },
    {
      id: 'dashboard-analytics',
      route: '/dashboard',
      selector: '[data-tour="dashboard-analytics"]',
      title: 'Analytics dashboard',
      description: 'Use these charts and summaries to understand which signal types are active and how activity changes across time.'
    },
    {
      id: 'nav-intel',
      route: '/intel-desk',
      selector: '[data-tour="nav-intel"]',
      title: 'Intel Desk',
      description: 'This is your live working feed. It combines news, government updates, evergreen topics, and competitor signals in one place.'
    },
    {
      id: 'intel-filters',
      route: '/intel-desk',
      selector: '[data-tour="intel-filters"]',
      title: 'Filters',
      description: 'Use filters to narrow the feed by market, category, signal type, and date range so you only see what matters.'
    },
    {
      id: 'intel-feed',
      route: '/intel-desk',
      selector: '[data-tour="intel-feed"]',
      title: 'Signal cards',
      description: 'Each card is a usable signal. Review the summary, open the source, save important items, then use Blog or LinkedIn on mobile, or drag a signal on desktop, to start content from Intel Desk.'
    },
    ...(canUseContentRepository ? [{
      id: 'nav-content-repository',
      route: '/blogs',
      selector: '[data-tour="nav-content-repository"]',
      title: 'Content Repository',
      description: 'This is your library for published content and saved outputs. Use it to search, review, and reopen blog or social content when you need it again.'
    }] : []),
    ...(canUseBlogStudio ? [{
      id: 'nav-content-studio',
      route: '/social-media-studio',
      selector: '[data-tour="nav-content-studio"]',
      title: 'Content Studio',
      description: 'Open Content Studio to turn signals into blogs or LinkedIn posts. You can build content directly here or use Intel Desk signals to start faster.'
    }] : []),
    {
      id: 'nav-profile',
      route: '/profile',
      selector: profileNavSelector,
      title: 'My Hive Profile',
      description: 'Your profile is where you manage account details, password settings, and the personalisation rules behind your intelligence feed.'
    },
    {
      id: 'profile-tabs',
      route: '/profile',
      selector: '[data-tour="profile-tabs"]',
      title: 'Profile tabs',
      description: 'These tabs switch between account management and intelligence setup, keeping everything easy to find.'
    },
    {
      id: 'profile-account',
      route: '/profile',
      selector: '[data-tour="profile-account"]',
      title: 'Account details',
      description: 'Keep your name, company, role, and avatar up to date here. These details help with identity and content context.'
    }
  ];

  if (canUseFetch) {
    steps.push({
      id: 'profile-personalization',
      route: '/profile',
      selector: '[data-tour="profile-personalization"]',
      title: 'My Personalisation',
      description: 'Set your market, categories, topics, competitors, source preferences, and schedule here. Future fetch runs will use this setup.'
    });
  }

  if (isAdmin) {
    steps.push(
      {
        id: 'profile-admin-controls',
        route: '/profile',
        selector: '[data-tour="profile-admin-controls"]',
        title: 'Admin controls',
        description: 'If you are an admin, this button opens the control area for fetch operations, users, and broader workspace management.'
      },
      {
        id: 'admin-shell',
        route: '/admin',
        selector: '[data-tour="admin-shell"]',
        title: 'Admin workspace',
        description: 'This workspace is built for operations. Run fetch jobs, review logs, manage users, and control platform-level settings from here.'
      }
    );
  }

  steps.push({
    id: 'done',
    title: 'You are ready',
    description: 'You can now explore signals, apply filters, personalise your setup, and use the admin area when needed. You can reopen this tour anytime from the profile menu.',
    cta: 'Finish'
  });

  return steps;
}

export default function GuidedOnboarding({ user, open, onClose, initialStepIndex = 0, onStepChange }) {
  const navigate = useNavigate();
  const location = useLocation();
  const steps = useMemo(() => stepListForUser(user), [user]);
  const [stepIndex, setStepIndex] = useState(() => Math.min(Math.max(initialStepIndex, 0), Math.max(steps.length - 1, 0)));
  const [spotlightRect, setSpotlightRect] = useState(null);

  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;
  const showAnimatedFlow = step?.id === 'intel-feed';

  useEffect(() => {
    if (!open) {
      setStepIndex(0);
      setSpotlightRect(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setStepIndex(Math.min(Math.max(initialStepIndex, 0), Math.max(steps.length - 1, 0)));
  }, [initialStepIndex, open, steps.length]);

  useEffect(() => {
    if (!open || !step?.route) return;
    if (location.pathname !== step.route) navigate(step.route);
  }, [location.pathname, navigate, open, step?.route]);

  useEffect(() => {
    if (!open) return undefined;
    setSpotlightRect(null);
    if (!step?.selector) return undefined;

    let cancelled = false;
    let attempts = 0;

    const update = () => {
      const el = getVisibleElement(step.selector);
      if (!el) {
        attempts += 1;
        if (!cancelled && attempts < SELECTOR_RETRY_LIMIT) window.setTimeout(update, SELECTOR_RETRY_DELAY);
        if (!cancelled && attempts >= SELECTOR_RETRY_LIMIT) setSpotlightRect(null);
        return;
      }
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      const r = el.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const rawTop = r.top - SPOTLIGHT_PADDING;
      const rawLeft = r.left - SPOTLIGHT_PADDING;
      const rawWidth = r.width + SPOTLIGHT_PADDING * 2;
      const rawHeight = r.height + SPOTLIGHT_PADDING * 2;
      if (!cancelled) {
        setSpotlightRect({
          top: Math.max(8, Math.min(rawTop, Math.max(8, viewportHeight - rawHeight - 8))),
          left: Math.max(8, Math.min(rawLeft, Math.max(8, viewportWidth - rawWidth - 8))),
          width: Math.min(rawWidth, Math.max(0, viewportWidth - 16)),
          height: Math.min(rawHeight, Math.max(0, viewportHeight - 16))
        });
      }
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, step?.selector, step?.route]);

  if (!open || !step) return null;

  const nextStep = () => {
    if (isLast) { onClose?.(true); return; }
    setStepIndex((v) => { const n = Math.min(v + 1, steps.length - 1); onStepChange?.(n); return n; });
  };
  const prevStep = () => {
    setStepIndex((v) => { const n = Math.max(v - 1, 0); onStepChange?.(n); return n; });
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]"
        onClick={() => onClose?.(false)}
      />

      {/* Spotlight ring around target element */}
      {spotlightRect ? (
        <div
          className="pointer-events-none fixed rounded-2xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(15,23,42,0.55)] transition-all duration-300"
          style={{
            top: spotlightRect.top,
            left: spotlightRect.left,
            width: spotlightRect.width,
            height: spotlightRect.height
          }}
        />
      ) : null}

      {/* Modal card — always centered, never clips */}
      <div className="relative z-10 flex w-full max-w-[420px] flex-col rounded-[24px] border border-white/20 bg-white shadow-[0_32px_80px_rgba(15,23,42,0.28)] sm:max-w-[440px] sm:rounded-3xl"
        style={{ maxHeight: 'calc(100dvh - 24px)' }}>

        {/* Gradient top decoration */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 rounded-t-[24px] bg-[radial-gradient(circle_at_20%_0%,rgba(225,29,72,0.13),transparent_55%),radial-gradient(circle_at_80%_0%,rgba(99,102,241,0.10),transparent_50%)] sm:rounded-t-3xl" />

        {/* Close button */}
        <button
          type="button"
          onClick={() => onClose?.(false)}
          className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white/90 text-gray-400 shadow-sm transition hover:bg-gray-100 hover:text-gray-700"
        >
          <X size={14} />
        </button>

        {/* ── Scrollable content ── */}
        <div className="relative flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-2 sm:px-6 sm:pt-6">

          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-rose-600">
            <Sparkles size={11} />
            Guided tour
          </div>

          {/* Step number + title + icon */}
          <div className="mt-4 flex items-start justify-between gap-3 pr-6">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                Step {stepIndex + 1} of {steps.length}
              </p>
              <h2 className="mt-1.5 text-xl font-black leading-tight tracking-tight text-slate-900 sm:text-[1.7rem]">
                {step.title}
              </h2>
            </div>
            <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
              <Sparkles size={18} />
            </div>
          </div>

          {/* Progress bar + dots */}
          <div className="mt-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-rose-600 via-rose-400 to-rose-200 transition-all duration-500"
                style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
              />
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1">
              {steps.map((s, i) => (
                <span
                  key={s.id}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === stepIndex ? 'w-7 bg-rose-600' : i < stepIndex ? 'w-2.5 bg-rose-300' : 'w-2.5 bg-slate-200'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Description card */}
          <div className="mt-4 rounded-2xl border border-slate-100 bg-gradient-to-b from-white to-slate-50 p-4 shadow-sm sm:p-5">
            <p className="text-[14px] leading-7 text-slate-600 sm:text-[15px]">
              {step.description}
            </p>

            {/* Animated drag-to-generate flow (intel-feed step) */}
            {showAnimatedFlow ? (
              <div className="mt-4 rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50/80 to-slate-50/80 p-3.5">
                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="rounded-xl border border-emerald-100 bg-white px-3 py-2 shadow-sm">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Intel signal</div>
                    <div className="mt-0.5 text-sm font-black text-slate-800">Use this signal</div>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-rose-600">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
                    <span className="text-[11px] font-black uppercase tracking-widest">Tap or drop to generate</span>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="relative flex flex-1 items-center">
                    <div className="h-px w-full bg-gradient-to-r from-rose-200 via-rose-500 to-rose-200" />
                    <div className="absolute left-[15%] h-2.5 w-2.5 animate-bounce rounded-full bg-rose-600" />
                  </div>
                  <div className="rounded-xl border border-rose-100 bg-white px-3 py-2 text-center shadow-sm">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-600">Blog</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">or LinkedIn</div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* ── Sticky footer — always visible ── */}
        <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Left: back or label */}
            <div className="flex items-center gap-3">
              {!isFirst ? (
                <button
                  type="button"
                  onClick={prevStep}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-[13px] font-black text-gray-600 shadow-sm transition hover:border-gray-300 hover:text-gray-900 sm:w-auto"
                >
                  <ChevronLeft size={14} />
                  Back
                </button>
              ) : (
                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                  {isLast ? 'Tour complete' : 'Keep exploring'}
                </span>
              )}
            </div>

            {/* Right: skip + next */}
            <div className={isLast ? 'grid items-center gap-2 sm:flex' : 'grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-center gap-2 sm:flex'}>
              {!isLast ? (
                <button
                  type="button"
                  onClick={() => onClose?.(false)}
                  className="inline-flex min-h-[40px] items-center justify-center rounded-2xl px-2 text-[12px] font-black uppercase tracking-[0.12em] text-slate-400 transition hover:text-slate-700"
                >
                  Skip tour
                </button>
              ) : null}
              <button
                type="button"
                onClick={nextStep}
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-600 to-rose-500 px-4 py-2.5 text-[13px] font-black text-white shadow-[0_8px_24px_rgba(225,29,72,0.28)] transition hover:brightness-105 active:scale-[0.98] sm:px-5"
              >
                {isLast ? <Check size={14} /> : <ArrowRight size={14} />}
                {step.cta || (isLast ? 'Finish' : 'Next step')}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
