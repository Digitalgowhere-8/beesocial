import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Sparkles, X } from 'lucide-react';

const OVERLAY_COLOR = 'rgba(15, 23, 42, 0.62)';
const SPOTLIGHT_PADDING = 12;
const TOOLTIP_GAP = 18;
const MAX_TOOLTIP_WIDTH = 430;

function getVisibleElement(selector) {
  if (!selector || typeof document === 'undefined') return null;
  const nodes = [...document.querySelectorAll(selector)];
  return nodes.find((node) => {
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 0
      && rect.height > 0
      && style.visibility !== 'hidden'
      && style.display !== 'none';
  }) || null;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getPanelMetrics(rect) {
  const isMobile = window.innerWidth < 768;
  const width = Math.min(MAX_TOOLTIP_WIDTH, window.innerWidth - 24);

  if (!rect || isMobile) {
    return {
      isMobile,
      width,
      left: Math.max(12, (window.innerWidth - width) / 2),
      top: Math.max(12, window.innerHeight - 336),
      arrow: null
    };
  }

  const left = clamp(
    rect.left + (rect.width / 2) - (width / 2),
    12,
    window.innerWidth - width - 12
  );

  const belowTop = rect.bottom + TOOLTIP_GAP;
  const aboveTop = rect.top - 286;
  const preferTop = belowTop > window.innerHeight - 36 && aboveTop >= 16;
  const top = preferTop
    ? clamp(aboveTop, 16, window.innerHeight - 320)
    : clamp(belowTop, 16, window.innerHeight - 320);

  return {
    isMobile: false,
    width,
    left,
    top,
    arrow: {
      side: preferTop ? 'bottom' : 'top',
      left: clamp(rect.left + (rect.width / 2) - left - 8, 24, width - 24)
    }
  };
}

function stepListForUser(user) {
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const profileNavSelector = user?.role === 'super_admin' ? '[data-tour="header-profile-menu"]' : '[data-tour="nav-profile"]';
  const canUseFetch = user?.role === 'super_admin'
    || user?.access?.canFetch === true
    || (user?.role === 'admin' && user?.access?.canFetch !== false)
    || user?.access?.canUseScheduler === true;

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
      description: 'Each card is a usable signal. Review the summary, open the source, save important items, or move a signal into your content workflow.'
    },
    {
      id: 'nav-profile',
      route: '/profile',
      selector: profileNavSelector,
      title: 'My Hive Profile',
      description: 'Your profile is where you manage account details, password settings, and the personalization rules behind your intelligence feed.'
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
    description: 'You can now explore signals, apply filters, personalize your setup, and use the admin area when needed. You can reopen this tour anytime from the profile menu.',
    cta: 'Finish'
  });

  return steps;
}

export default function GuidedOnboarding({ user, open, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const steps = useMemo(() => stepListForUser(user), [user]);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState(null);

  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  useEffect(() => {
    if (!open) {
      setStepIndex(0);
      setTargetRect(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !step?.route) return;
    if (location.pathname !== step.route) {
      navigate(step.route);
    }
  }, [location.pathname, navigate, open, step?.route]);

  useEffect(() => {
    if (!open) return undefined;
    if (!step?.selector) {
      setTargetRect(null);
      return undefined;
    }

    let cancelled = false;
    let attempts = 0;

    const update = () => {
      const element = getVisibleElement(step.selector);
      if (!element) {
        attempts += 1;
        if (!cancelled && attempts < 40) window.requestAnimationFrame(update);
        if (!cancelled && attempts >= 40) setTargetRect(null);
        return;
      }

      element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      const rect = element.getBoundingClientRect();
      if (!cancelled) {
        setTargetRect({
          top: rect.top - SPOTLIGHT_PADDING,
          left: rect.left - SPOTLIGHT_PADDING,
          width: rect.width + (SPOTLIGHT_PADDING * 2),
          height: rect.height + (SPOTLIGHT_PADDING * 2)
        });
      }
    };

    const handleViewportChange = () => update();
    update();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      cancelled = true;
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open, step?.selector, step?.route]);

  if (!open || !step) return null;

  const rect = targetRect
    ? {
      top: targetRect.top,
      left: targetRect.left,
      bottom: targetRect.top + targetRect.height,
      width: targetRect.width,
      height: targetRect.height
    }
    : null;
  const panel = getPanelMetrics(rect);

  const nextStep = () => {
    if (isLast) {
      onClose?.(true);
      return;
    }
    setStepIndex((value) => Math.min(value + 1, steps.length - 1));
  };

  const prevStep = () => {
    setStepIndex((value) => Math.max(value - 1, 0));
  };

  return (
    <div className="fixed inset-0 z-[120]">
      <div className="absolute inset-0" style={{ background: OVERLAY_COLOR }} />

      {targetRect ? (
        <div
          className="pointer-events-none fixed rounded-[24px] border border-white/70 shadow-[0_0_0_9999px_rgba(15,23,42,0.62)] transition-all duration-300"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
            background: 'transparent'
          }}
        />
      ) : null}

      <div
        className="fixed rounded-[24px] border border-white/30 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.24)]"
        style={{
          top: panel.top,
          left: panel.left,
          width: panel.width,
          maxHeight: panel.isMobile ? 'calc(100vh - 24px)' : 'min(360px, calc(100vh - 32px))'
        }}
      >
        {panel.arrow && !panel.isMobile ? (
          <span
            className="absolute h-4 w-4 rotate-45 border border-white/30 bg-white"
            style={{
              left: panel.arrow.left,
              [panel.arrow.side]: -8
            }}
          />
        ) : null}

        <div className="relative flex max-h-full flex-col overflow-hidden p-5 sm:p-6">
          <button
            type="button"
            onClick={() => onClose?.(false)}
            className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={15} />
          </button>

          <div className="inline-flex w-fit items-center gap-2 rounded-full bg-brand-pink/25 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-brand-crimson">
            <Sparkles size={12} />
            Product tour
          </div>

          <div className="mt-4 flex-1 overflow-y-auto pr-1">
            <h2 className="pr-10 text-[clamp(1.45rem,2vw,2rem)] font-black tracking-tight text-slate-900">
              {step.title}
            </h2>
            <p className="mt-3 text-[15px] leading-7 text-slate-600">
              {step.description}
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
              Step {stepIndex + 1} of {steps.length}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!isFirst ? (
                <button
                  type="button"
                  onClick={prevStep}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-black text-gray-600 transition hover:border-gray-300 hover:text-gray-900"
                >
                  Back
                </button>
              ) : null}
              <button
                type="button"
                onClick={nextStep}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-crimson px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-brand-hoverred"
              >
                {isLast ? <Check size={15} /> : <ArrowRight size={15} />}
                {step.cta || (isLast ? 'Finish' : 'Next')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
