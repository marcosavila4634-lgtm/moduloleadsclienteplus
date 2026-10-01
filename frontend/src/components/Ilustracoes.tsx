// Ilustrações em SVG (sem fotos de terceiros): usadas nos banners.

export function CelularConversa({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 240" className={className} aria-hidden>
      <defs>
        <linearGradient id="il-laranja" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f9a03f" />
          <stop offset="1" stopColor="#f47b20" />
        </linearGradient>
        <linearGradient id="il-tela" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#eef6f7" />
        </linearGradient>
      </defs>
      <circle cx="210" cy="120" r="96" fill="#145f6e" opacity=".12" />
      <circle cx="262" cy="46" r="26" fill="url(#il-laranja)" opacity=".85" />
      <circle cx="120" cy="210" r="14" fill="#f5a524" opacity=".7" />
      <g transform="rotate(-8 205 125)">
        <rect x="150" y="18" width="118" height="214" rx="24" fill="#0b3240" />
        <rect x="158" y="32" width="102" height="188" rx="16" fill="url(#il-tela)" />
        <rect x="190" y="24" width="38" height="5" rx="2.5" fill="#1b5364" />
        <rect x="166" y="44" width="62" height="20" rx="10" fill="#e3eef0" />
        <rect x="190" y="72" width="62" height="26" rx="12" fill="url(#il-laranja)" />
        <rect x="166" y="106" width="70" height="20" rx="10" fill="#e3eef0" />
        <rect x="200" y="134" width="52" height="20" rx="10" fill="#145f6e" />
        <rect x="166" y="162" width="58" height="20" rx="10" fill="#e3eef0" />
        <circle cx="178" cy="200" r="4" fill="#f47b20" />
        <circle cx="190" cy="200" r="4" fill="#f9a03f" />
        <circle cx="202" cy="200" r="4" fill="#f5a524" />
      </g>
      <g transform="translate(70 70)">
        <rect width="96" height="52" rx="16" fill="#fff" stroke="#e9e2d4" />
        <path d="M18 52 l-6 14 l18 -14z" fill="#fff" />
        <circle cx="26" cy="26" r="11" fill="#16a34a" />
        <path d="M21 26 l4 4 l7 -8" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="44" y="17" width="40" height="6" rx="3" fill="#145f6e" />
        <rect x="44" y="29" width="28" height="6" rx="3" fill="#cfdadc" />
      </g>
      <g transform="translate(26 150)">
        <rect width="100" height="44" rx="14" fill="#fff" stroke="#e9e2d4" />
        <text x="14" y="28" fontFamily="Poppins, sans-serif" fontWeight="700" fontSize="15" fill="#f47b20">+ R$ 1.290</text>
      </g>
    </svg>
  );
}
