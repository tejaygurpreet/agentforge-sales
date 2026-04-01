/**
 * Prompt 136 — Energetic workspace illustration: sage + terracotta + coral (no stock art).
 */
export function AuthHeroIllustration({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 560 480"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="ahg1" x1="80" y1="40" x2="480" y2="420" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8F9E7E" stopOpacity="0.38" />
          <stop offset="0.35" stopColor="#FF9A8B" stopOpacity="0.22" />
          <stop offset="0.65" stopColor="#D4A373" stopOpacity="0.28" />
          <stop offset="1" stopColor="#8F9E7E" stopOpacity="0.16" />
        </linearGradient>
        <linearGradient id="ahg2" x1="200" y1="120" x2="400" y2="360" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF9A8B" stopOpacity="0.35" />
          <stop offset="0.5" stopColor="#D4A373" stopOpacity="0.38" />
          <stop offset="1" stopColor="#8F9E7E" stopOpacity="0.22" />
        </linearGradient>
        <filter id="ahblur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
      </defs>
      <circle cx="120" cy="100" r="72" fill="url(#ahg1)" filter="url(#ahblur)" />
      <circle cx="420" cy="380" r="96" fill="url(#ahg2)" filter="url(#ahblur)" opacity="0.85" />
      <path
        d="M140 280c48-72 120-108 200-96 80 12 132 68 156 148"
        stroke="#8F9E7E"
        strokeWidth="3"
        strokeLinecap="round"
        strokeOpacity="0.45"
        fill="none"
      />
      <path
        d="M100 200c32 48 88 76 152 72 64-4 120-40 152-96"
        stroke="#D4A373"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeOpacity="0.4"
        fill="none"
      />
      <rect
        x="180"
        y="160"
        width="200"
        height="140"
        rx="16"
        fill="#FAF7F2"
        fillOpacity="0.85"
        stroke="#8F9E7E"
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />
      <rect x="200" y="188" width="120" height="10" rx="4" fill="#8F9E7E" fillOpacity="0.35" />
      <rect x="200" y="210" width="160" height="8" rx="3" fill="#D4A373" fillOpacity="0.3" />
      <rect x="200" y="228" width="140" height="8" rx="3" fill="#8F9E7E" fillOpacity="0.2" />
      <rect x="200" y="252" width="80" height="28" rx="8" fill="#8F9E7E" fillOpacity="0.45" />
      <circle cx="400" cy="120" r="36" fill="#FF9A8B" fillOpacity="0.28" />
      <circle cx="320" cy="96" r="14" fill="#FF9A8B" fillOpacity="0.4" />
      <path
        d="M388 120l8 8 16-20"
        stroke="#8F9E7E"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.7"
      />
      <g opacity="0.5">
        <rect x="60" y="320" width="64" height="48" rx="8" fill="#8F9E7E" fillOpacity="0.2" />
        <rect x="440" y="80" width="56" height="56" rx="12" fill="#D4A373" fillOpacity="0.18" />
      </g>
    </svg>
  );
}
