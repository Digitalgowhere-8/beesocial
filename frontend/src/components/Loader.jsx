export function Skeleton({ className = '' }) {
  return <div className={`skeleton rounded ${className}`} />;
}

export default function Loader({ label = 'Loading' }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#FAF0F2' }}>
      {/* Animated crimson spinner */}
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-2 border-transparent"
          style={{ borderTopColor: '#D11243', animation: 'spin 0.8s linear infinite' }} />
        <div className="absolute inset-2 rounded-full border-2 border-transparent"
          style={{ borderTopColor: 'rgba(209,18,67,0.3)', animation: 'spin 1.2s linear infinite reverse' }} />
      </div>
      <span className="text-[11px] uppercase tracking-[0.18em] font-bold" style={{ color: '#D11243' }}>
        {label}
      </span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
