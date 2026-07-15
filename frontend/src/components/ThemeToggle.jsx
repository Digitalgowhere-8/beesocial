import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle({ compact = false, iconOnly = false, className = '' }) {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const label = nextTheme === 'dark' ? 'Dark' : 'Light';
  const Icon = nextTheme === 'dark' ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={[
        'theme-toggle theme-toggle-single inline-flex items-center justify-center gap-2 rounded-2xl border px-3.5 py-1.5 shadow-sm backdrop-blur-md transition-all',
        compact ? 'min-h-[40px] text-[10px]' : 'min-h-[44px] text-[11px]',
        className
      ].join(' ')}
      aria-label={`Switch to ${label} theme`}
      title={`Switch to ${label} theme`}
    >
      <span className="theme-toggle-thumb flex items-center justify-center rounded-full">
        <Icon size={compact ? 14 : 15} strokeWidth={2.6} />
      </span>
      {!iconOnly ? <span className="font-black uppercase tracking-[0.12em]">{label}</span> : null}
    </button>
  );
}
