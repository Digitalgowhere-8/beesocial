export default function BoostUpLogo({ variant = 'dark', className = '' }) {
  return (
    <img
      src="/logo.png"
      className={`h-12 w-auto select-none object-contain ${className}`}
      style={variant === 'light' ? { filter: 'brightness(0) invert(1)' } : undefined}
      alt="Bee Social Logo"
    />
  );
}
