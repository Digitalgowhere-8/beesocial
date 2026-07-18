export function Skeleton({ className = '' }) {
  return <div className={`skeleton rounded ${className}`} />;
}

export default function Loader({ label = 'Loading' }) {
  return (
    <div className="app-loader min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#F7F8F3' }}>
      {/* Animated brand spinner */}
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-2 border-transparent"
          style={{ borderTopColor: '#163A24', animation: 'spin 0.8s linear infinite' }} />
        <div className="absolute inset-2 rounded-full border-2 border-transparent"
          style={{ borderTopColor: 'rgba(22,58,36,0.3)', animation: 'spin 1.2s linear infinite reverse' }} />
      </div>
      <span className="app-loader-label text-[11px] uppercase tracking-[0.18em] font-bold" style={{ color: '#163A24' }}>
        {label}
      </span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
