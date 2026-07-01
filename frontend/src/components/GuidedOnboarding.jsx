import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Sparkles, X } from 'lucide-react';

const OVERLAY_COLOR = 'rgba(15, 23, 42, 0.62)';
const SPOTLIGHT_PADDING = 12;
const TOOLTIP_GAP = 18;
const MAX_TOOLTIP_WIDTH = 430;
const DESKTOP_PANEL_HEIGHT = 460;
const MOBILE_PANEL_HEIGHT = 430;
const SELECTOR_RETRY_LIMIT = 80;
const SELECTOR_RETRY_DELAY = 120;

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
  const isCompact = window.innerHeight < 760;
  const width = Math.min(isMobile ? 520 : MAX_TOOLTIP_WIDTH, window.innerWidth - 24);
  // Always keep at least 32px from viewport bottom so footer buttons are never clipped
  const safeVh = window.innerHeight - 32;
  const desktopMaxHeight = Math.min(isCompact ? 388 : DESKTOP_PANEL_HEIGHT, safeVh);
  const compactLift = isCompact ? 30 : 0;

  if (!rect) {
    if (isMobile) {
      const mobileHeight = Math.min(MOBILE_PANEL_HEIGHT, window.innerHeight - 16);
      return {
        isMobile,
        isCompact,
        width,
        left: Math.max(12, (window.innerWidth - width) / 2),
        top: Math.max(8, window.innerHeight - mobileHeight),
        arrow: null,
        maxHeight: `${mobileHeight}px`
      };
    }

    return {
      isMobile: false,
      isCompact,
      width,
      left: Math.max(12, (window.innerWidth - width) / 2),
      top: Math.max(16, ((window.innerHeight - desktopMaxHeight) / 2) - compactLift),
      arrow: null,
      maxHeight: `${desktopMaxHeight}px`
    };
  }

  if (isMobile) {
    const mobileHeight = Math.min(MOBILE_PANEL_HEIGHT, window.innerHeight - 16);
    return {
      isMobile,
      isCompact,
      width,
      left: Math.max(12, (window.innerWidth - width) / 2),
      top: Math.max(8, window.innerHeight - mobileHeight),
      arrow: null,
      maxHeight: `${mobileHeight}px`
    };
  }

  const left = clamp(
    rect.left + (rect.width / 2) - (width / 2),
    12,
    window.innerWidth - width - 12
  );

  const belowTop = rect.bottom + TOOLTIP_GAP;
  const aboveTop = rect.top - desktopMaxHeight - TOOLTIP_GAP;
  const preferTop = belowTop + desktopMaxHeight > safeVh && aboveTop >= 16;
  const rawTop = preferTop ? aboveTop - compactLift : belowTop - compactLift;
  const top = clamp(rawTop, 16, safeVh - desktopMaxHeight);

  return {
    isMobile: false,
    isCompact,
    width,
    left,
    top,
    maxHeight: `${desktopMaxHeight}px`,
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
  const canUseContentRepository = user?.role === 'super_admin'
    || user?.access?.canUseContentRepository !== false;
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
      description: 'Each card is a usable signal. Review the summary, open the source, save important items, or drag a signal into the Blog or LinkedIn action area to start generating content from Intel Desk.'
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

export default function GuidedOnboarding({ user, open, onClose, initialStepIndex = 0, onStepChange }) {
  const navigate = useNavigate();
  const location = useLocation();
  const steps = useMemo(() => stepListForUser(user), [user]);
  const [stepIndex, setStepIndex] = useState(() => clamp(initialStepIndex, 0, Math.max(steps.length - 1, 0)));
  const [targetRect, setTargetRect] = useState(null);

  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;
  const progressPercent = ((stepIndex + 1) / steps.length) * 100;
  const showAnimatedFlow = step?.id === 'intel-feed';

  useEffect(() => {
    if (!open) {
      setStepIndex(0);
      setTargetRect(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setStepIndex(clamp(initialStepIndex, 0, Math.max(steps.length - 1, 0)));
  }, [initialStepIndex, open, steps.length]);

  useEffect(() => {
    if (!open || !step?.route) return;
    if (location.pathname !== step.route) {
      navigate(step.route);
    }
  }, [location.pathname, navigate, open, step?.route]);

  useEffect(() => {
    if (!open) return undefined;
    setTargetRect(null);
    if (!step?.selector) {
      return undefined;
    }

    let cancelled = false;
    let attempts = 0;

    const update = () => {
      const element = getVisibleElement(step.selector);
      if (!element) {
        attempts += 1;
        if (!cancelled && attempts < SELECTOR_RETRY_LIMIT) {
          window.setTimeout(update, SELECTOR_RETRY_DELAY);
        }
        if (!cancelled && attempts >= SELECTOR_RETRY_LIMIT) setTargetRect(null);
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
    setStepIndex((value) => {
      const nextValue = Math.min(value + 1, steps.length - 1);
      onStepChange?.(nextValue);
      return nextValue;
    });
  };

  const prevStep = () => {
    setStepIndex((value) => {
      const nextValue = Math.max(value - 1, 0);
      onStepChange?.(nextValue);
      return nextValue;
    });
  };

  const skipTour = () => {
    onClose?.(false);
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
        className={`fixed flex flex-col overflow-hidden border bg-white shadow-[0_24px_80px_rgba(15,23,42,0.24)] ${
          panel.isMobile
            ? 'rounded-t-[30px] rounded-b-none border-white/80 shadow-[0_-16px_50px_rgba(15,23,42,0.22)]'
            : 'rounded-[28px] border-white/30'
        }`}
        style={{
          top: panel.top,
          left: panel.left,
          width: panel.width,
          maxHeight: panel.maxHeight,
          height: panel.maxHeight
        }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_left,_rgba(225,29,72,0.16),_transparent_58%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.12),_transparent_54%)]" />

        {panel.arrow && !panel.isMobile ? (
          <span
            className="absolute h-4 w-4 rotate-45 border border-white/30 bg-white shadow-sm"
            style={{
              left: panel.arrow.left,
              [panel.arrow.side]: -8
            }}
          />
        ) : null}

        <div className={`relative flex h-full min-h-0 flex-1 flex-col overflow-hidden ${panel.isMobile ? 'p-4 pb-5' : panel.isCompact ? 'p-4 pb-4' : 'p-5 sm:p-6'}`}>
          {panel.isMobile ? (
            <div className="mb-3 flex justify-center">
              <span className="h-1.5 w-14 rounded-full bg-slate-200" />
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => onClose?.(false)}
            className={`absolute inline-flex items-center justify-center rounded-full border border-white/80 bg-white/90 text-gray-400 shadow-sm backdrop-blur transition hover:bg-gray-100 hover:text-gray-700 ${
              panel.isMobile ? 'right-4 top-4 h-10 w-10' : 'right-4 top-4 h-8 w-8'
            }`}
          >
            <X size={15} />
          </button>

          <div className="pr-12">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-brand-pink/50 bg-brand-pink/20 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-brand-crimson shadow-[0_8px_20px_rgba(225,29,72,0.08)]">
              <Sparkles size={12} />
              Guided tour
            </div>

            <div className={`flex items-start justify-between gap-3 ${panel.isCompact && !panel.isMobile ? 'mt-3' : 'mt-4'}`}>
              <div className="min-w-0">
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">
                  Step {stepIndex + 1} of {steps.length}
                </div>
                <h2 className={`font-black leading-tight tracking-tight text-slate-900 ${panel.isCompact && !panel.isMobile ? 'mt-1 text-[clamp(1.2rem,1.8vw,1.75rem)]' : 'mt-2 text-[clamp(1.35rem,2vw,2rem)]'}`}>
                  {step.title}
                </h2>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(225,29,72,0.14),rgba(255,255,255,0.96))] text-brand-crimson shadow-[0_10px_24px_rgba(225,29,72,0.12)]">
                <Sparkles size={18} />
              </div>
            </div>
          </div>

          <div className={`${panel.isCompact && !panel.isMobile ? 'mt-3' : 'mt-4'}`}>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#e11d48_0%,#fb7185_55%,#fecdd3_100%)] transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className={`flex gap-1.5 ${panel.isCompact && !panel.isMobile ? 'mt-2' : 'mt-3'}`}>
              {steps.map((item, index) => (
                <span
                  key={item.id}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    index === stepIndex
                      ? 'w-8 bg-brand-crimson'
                      : index < stepIndex
                        ? 'w-3 bg-brand-pink/80'
                        : 'w-3 bg-slate-200'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className={`${panel.isCompact && !panel.isMobile ? 'mt-3' : 'mt-4'} min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1`}>
            <div className={`rounded-[24px] border border-slate-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] ${panel.isCompact && !panel.isMobile ? 'p-3.5' : 'p-4 sm:p-5'}`}>
              <p className={`text-slate-600 ${panel.isCompact && !panel.isMobile ? 'text-[13px] leading-6' : 'text-[14px] leading-7 sm:text-[15px]'}`}>
                {step.description}
              </p>
              {showAnimatedFlow ? (
                <div className={`mt-4 rounded-[20px] border border-brand-pink/20 bg-[linear-gradient(135deg,rgba(255,241,245,0.95),rgba(248,250,252,0.96))] shadow-[0_14px_34px_rgba(225,29,72,0.08)] ${panel.isCompact && !panel.isMobile ? 'p-3' : 'p-3.5'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className={`rounded-2xl border border-emerald-100 bg-white shadow-sm ${panel.isCompact && !panel.isMobile ? 'px-2.5 py-1.5' : 'px-3 py-2'}`}>
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Intel signal</div>
                      <div className={`mt-1 font-black text-slate-800 ${panel.isCompact && !panel.isMobile ? 'text-[13px]' : 'text-sm'}`}>Drag this card</div>
                    </div>
                    <div className="flex items-center gap-2 text-brand-crimson">
                      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-brand-crimson/80" />
                      <span className="text-xs font-black uppercase tracking-[0.16em]">Drop to generate</span>
                    </div>
                  </div>
                  <div className={`flex items-center justify-between gap-3 ${panel.isCompact && !panel.isMobile ? 'mt-2.5' : 'mt-3'}`}>
                    <div className="relative flex flex-1 justify-center">
                      <div className="h-0.5 w-full max-w-[92px] rounded-full bg-gradient-to-r from-brand-crimson/10 via-brand-crimson/60 to-brand-crimson/10" />
                      <div className="absolute -top-1.5 left-[12%] h-3 w-3 animate-[ping_1.8s_ease-in-out_infinite] rounded-full bg-brand-crimson/30" />
                      <div className="absolute -top-1 left-[12%] h-2 w-2 animate-bounce rounded-full bg-brand-crimson" />
                    </div>
                    <div className={`rounded-2xl border border-brand-crimson/15 bg-white text-center shadow-sm ${panel.isCompact && !panel.isMobile ? 'px-2.5 py-1.5' : 'px-3 py-2'}`}>
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-crimson">Blog</div>
                      <div className={`mt-1 font-bold text-slate-500 ${panel.isCompact && !panel.isMobile ? 'text-[11px]' : 'text-xs'}`}>or LinkedIn</div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className={`${panel.isCompact && !panel.isMobile ? 'mt-3 pt-3' : 'mt-4 pt-4'} shrink-0 flex flex-col gap-3 border-t border-slate-100 bg-white sm:flex-row sm:items-center sm:justify-between`}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                {isLast ? 'Tour complete' : 'Keep exploring'}
              </div>
              {!isLast ? (
                <button
                  type="button"
                  onClick={skipTour}
                  className="text-[12px] font-black uppercase tracking-[0.16em] text-slate-400 transition hover:text-slate-700"
                >
                  Skip tour
                </button>
              ) : null}
            </div>
            <div className={`flex items-center gap-2 ${panel.isMobile ? 'flex-col' : 'flex-wrap justify-end'}`}>
              {!isFirst ? (
                <button
                  type="button"
                  onClick={prevStep}
                  className={`rounded-2xl border border-gray-200 bg-white text-sm font-black text-gray-600 shadow-sm transition hover:border-gray-300 hover:text-gray-900 ${
                    panel.isMobile ? 'w-full px-4 py-3' : 'px-4 py-2.5'
                  }`}
                >
                  Back
                </button>
              ) : null}
              <button
                type="button"
                onClick={nextStep}
                className={`inline-flex items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#e11d48_0%,#f43f5e_100%)] text-sm font-black text-white shadow-[0_14px_28px_rgba(225,29,72,0.24)] transition hover:brightness-105 ${
                  panel.isMobile ? 'w-full px-4 py-3.5' : 'px-4 py-2.5'
                }`}
              >
                {isLast ? <Check size={15} /> : <ArrowRight size={15} />}
                {step.cta || (isLast ? 'Finish' : 'Next step')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
