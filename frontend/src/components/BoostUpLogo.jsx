export default function BoostUpLogo({ variant = 'dark', className = '' }) {
  const textColorMain = variant === 'light' ? 'text-white' : 'text-black';
  const textColorSub = variant === 'light' ? 'text-white/95' : 'text-[#D11243]';
  const textColorBy = variant === 'light' ? 'text-white/80' : 'text-black';
  const crimsonColor = '#D11243';

  return (
    <svg 
      viewBox="0 0 320 90" 
      className={`h-12 w-auto select-none ${className}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Main text BOOSTUP */}
      <g>
        {/* BOOST */}
        <text 
          x="10" 
          y="42" 
          fontFamily="system-ui, -apple-system, sans-serif" 
          fontWeight="900" 
          fontSize="36" 
          className={`fill-current ${textColorMain}`}
          letterSpacing="-0.03em"
        >
          BOOST
        </text>
        
        {/* U with Arrow and P */}
        {/* We draw U and P using paths to make it look EXACTLY like the logo */}
        <path 
          d="M142,20 L142,35 C142,40 146,44 151.5,44 C157,44 161,40 161,35 L161,8" 
          fill="none" 
          stroke={crimsonColor} 
          strokeWidth="7" 
          strokeLinecap="square"
        />
        {/* Arrow head for U */}
        <polygon 
          points="155,9 161,1 167,9" 
          fill={crimsonColor}
        />
        {/* P character: starts at x=172, y=20, down to y=44. Round loop from y=20 to y=32 */}
        <path 
          d="M172,44 L172,20 C172,20 188,20 188,29 C188,38 172,38 172,38" 
          fill="none" 
          stroke={crimsonColor} 
          strokeWidth="7" 
          strokeLinejoin="miter" 
          strokeLinecap="square"
        />
      </g>

      {/* Subtext: BY [Rocket] DIGITAL GO WHERE */}
      <g transform="translate(0, 52)">
        {/* BY */}
        <text 
          x="10" 
          y="24" 
          fontFamily="system-ui, -apple-system, sans-serif" 
          fontWeight="800" 
          fontSize="15" 
          className={`fill-current ${textColorBy}`}
        >
          BY
        </text>

        {/* Rocket Icon Group at x=36, y=4 */}
        <g transform="translate(36, 4)">
          {/* Flame / trailing pixels */}
          {/* Yellow pixel */}
          <rect x="-8" y="14" width="4" height="4" fill="#FBBF24" />
          <rect x="-13" y="10" width="3" height="3" fill="#F59E0B" />
          {/* Orange/Red pixels */}
          <rect x="-4" y="10" width="4" height="4" fill="#EF4444" />
          <rect x="-9" y="6" width="4" height="4" fill="#D11243" />
          <rect x="-5" y="5" width="3" height="3" fill="#F59E0B" />

          {/* Rocket Body tilted 45 deg */}
          <g transform="rotate(45, 12, 12)">
            {/* Fins */}
            <path d="M4,18 L0,22 L4,24 Z" fill={crimsonColor} />
            <path d="M18,4 L22,0 L24,4 Z" fill={crimsonColor} />
            <path d="M4,4 L1,10 L10,1 Z" fill={crimsonColor} />
            {/* Main body */}
            <path d="M6,6 L18,6 C22,6 24,8 24,12 L24,18 L6,18 Z" fill={crimsonColor} />
            {/* Nosecone */}
            <path d="M24,6 L32,12 L24,18 Z" fill={crimsonColor} />
            {/* Window */}
            <circle cx="16" cy="12" r="3.5" fill="white" />
          </g>
        </g>

        {/* DIGITAL GO WHERE */}
        <text 
          x="75" 
          y="24" 
          fontFamily="system-ui, -apple-system, sans-serif" 
          fontWeight="800" 
          fontSize="14.5" 
          className={`fill-current ${textColorSub}`}
          letterSpacing="0.04em"
        >
          DIGITAL GO WHERE
        </text>

        {/* TM */}
        <text 
          x="245" 
          y="16" 
          fontFamily="system-ui, -apple-system, sans-serif" 
          fontWeight="bold" 
          fontSize="7" 
          className={`fill-current ${textColorSub}`}
        >
          TM
        </text>
      </g>
    </svg>
  );
}
